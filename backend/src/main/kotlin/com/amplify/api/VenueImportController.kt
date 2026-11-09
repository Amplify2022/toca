package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/** Converts provider data into an editable draft; never writes venue information. */
object VenueImportData {
    fun instagramHandle(raw: String): String {
        val value = raw.trim()
        val handle = if (value.startsWith("https://")) {
            val uri = runCatching { URI(value) }.getOrElse { fail(HttpStatus.BAD_REQUEST,"Perfil de Instagram inválido") }
            if (uri.host !in setOf("instagram.com","www.instagram.com") || uri.userInfo!=null || uri.port!=-1)
                fail(HttpStatus.BAD_REQUEST,"Ingresá un perfil de Instagram")
            uri.path.trim('/')
        } else value.removePrefix("@")
        if (!handle.matches(Regex("[A-Za-z0-9_][A-Za-z0-9._]{0,29}")) || handle.endsWith('.') || handle.contains(".."))
            fail(HttpStatus.BAD_REQUEST,"Ingresá el usuario o enlace del perfil, no una publicación")
        return handle.lowercase()
    }

    fun google(place: JsonNode): Map<String,Any?> {
        val fields = mutableMapOf<String,Any?>()
        fun copy(key:String,value:String,max:Int) { if(value.isNotBlank())fields[key]=value.take(max) }
        copy("name",place.path("displayName").path("text").asText(""),160)
        copy("address",place.path("formattedAddress").asText(""),240)
        val components=place.path("addressComponents")
        val city=listOf("locality","postal_town","administrative_area_level_2").firstNotNullOfOrNull { type ->
            components.firstOrNull { c -> c.path("types").any { it.asText()==type } }?.path("longText")?.asText()
        }
        copy("city",city.orEmpty(),120)
        val location=place.path("location")
        if(location.path("latitude").isNumber && location.path("longitude").isNumber) {
            fields["latitude"]=location.path("latitude").asDouble();fields["longitude"]=location.path("longitude").asDouble()
        }
        val warnings=mutableListOf<String>()
        val hours=place.path("regularOpeningHours")
        val periods=hours.path("periods")
        if(periods.isArray && periods.size()>0) {
            val days=MutableList(7){"-"};var supported=true
            for(period in periods) {
                val open=period.path("open");val close=period.path("close")
                val day=open.path("day").asInt(-1);val end=close.path("day").asInt(-1)
                if(day !in 0..6 || end !in 0..6 || end !in setOf(day,(day+1)%7)) {supported=false;continue}
                val index=(day+6)%7
                if(days[index]!="-") {supported=false;continue}
                val startHour=open.path("hour").asInt(-1);val endHour=close.path("hour").asInt(-1)
                val startMinute=open.path("minute").asInt(0);val endMinute=close.path("minute").asInt(0)
                if(startHour !in 0..23 || endHour !in 0..23 || startMinute !in 0..59 || endMinute !in 0..59) {supported=false;continue}
                days[index]="%02d:%02d-%02d:%02d".format(startHour,startMinute,endHour,endMinute)
            }
            if(supported)fields["openingHours"]="W2|"+days.joinToString("|")
            else warnings.add("Google informa horarios partidos o apertura continua. Revisalos y completalos manualmente.")
        }
        return mapOf("source" to "Google Maps","fields" to fields,"warnings" to warnings,
            "details" to mapOf("website" to place.path("websiteUri").asText(""),"phone" to place.path("internationalPhoneNumber").asText(""),
                "hours" to hours.path("weekdayDescriptions").map { it.asText() }),
            "sourceUrl" to place.path("googleMapsUri").asText(""),"attributions" to place.path("attributions").map { it.path("provider").asText("") })
    }

    fun instagram(profile:JsonNode,handle:String):Map<String,Any?> = mapOf(
        "source" to "Instagram","sourceUrl" to "https://www.instagram.com/$handle/",
        "fields" to buildMap<String,Any?> {
            put("instagramHandle",handle)
            profile.path("name").asText("").takeIf { it.isNotBlank() }?.let { put("name",it.take(160)) }
            profile.path("biography").asText("").takeIf { it.isNotBlank() }?.let { put("description",it.take(2000)) }
        },"details" to mapOf("website" to profile.path("website").asText("")),
        "warnings" to listOf("Instagram no publica dirección ni horarios estructurados mediante esta API. Revisá la biografía y completá los campos faltantes."))
}

@Controller("/api/admin/venue-import")
@ExecuteOn(TaskExecutors.BLOCKING)
class VenueImportController(private val auth:Auth,private val limiter:AuthRateLimiter,private val json:ObjectMapper,
    @Value("\${GOOGLE_PLACES_API_KEY:}") private val googleKey:String,
    @Value("\${INSTAGRAM_DISCOVERY_TOKEN:}") private val instagramToken:String,
    @Value("\${INSTAGRAM_DISCOVERY_ACCOUNT_ID:}") private val instagramAccount:String,
    @Value("\${META_GRAPH_VERSION:v23.0}") private val graphVersion:String) {
    private val http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private fun encode(s:String)=URLEncoder.encode(s,StandardCharsets.UTF_8)
    private fun admit(authorization:String) {
        val user=auth.user(authorization)
        if(!limiter.consume(AuthRateRule("venue-import",user["id"].toString(),30,60)))
            fail(HttpStatus.TOO_MANY_REQUESTS,"Demasiadas consultas. Esperá un minuto.")
    }
    private fun read(request:HttpRequest):JsonNode {
        val response=try { http.send(request,HttpResponse.BodyHandlers.ofString()) } catch (_:Exception) {
            fail(HttpStatus.BAD_GATEWAY,"El proveedor no respondió. Los datos del bar siguen sin cambios.")
        }
        if(response.statusCode() !in 200..299)fail(HttpStatus.BAD_GATEWAY,"No se pudo consultar el perfil. Revisá el acceso de la integración y el nombre del local.")
        return json.readTree(response.body())
    }
    private fun google(path:String,mask:String,body:Map<String,Any>?=null):JsonNode {
        if(googleKey.isBlank())fail(HttpStatus.PRECONDITION_FAILED,"La importación de Google aún no está configurada. Podés completar el formulario manualmente.")
        val request=HttpRequest.newBuilder(URI("https://places.googleapis.com/v1/$path")).timeout(Duration.ofSeconds(12))
            .header("X-Goog-Api-Key",googleKey).header("X-Goog-FieldMask",mask).header("Content-Type","application/json")
        return read(if(body==null)request.GET().build() else request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build())
    }
    @Get("/status") fun status(@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean> {
        auth.user(authorization)
        return mapOf("google" to googleKey.isNotBlank(),"instagram" to (instagramToken.isNotBlank()&&instagramAccount.matches(Regex("[0-9]+"))))
    }
    @Get("/google/search") fun search(@Header(value="Authorization",defaultValue="") authorization:String,@QueryValue q:String):List<Map<String,String>> {
        admit(authorization)
        if(q.trim().length !in 3..180)fail(HttpStatus.BAD_REQUEST,"Buscá por nombre del bar y ciudad")
        return google("places:searchText","places.id,places.displayName,places.formattedAddress",
            mapOf("textQuery" to q.trim(),"languageCode" to "es","pageSize" to 5)).path("places").map {
                mapOf("id" to it.path("id").asText(),"name" to it.path("displayName").path("text").asText(),"address" to it.path("formattedAddress").asText())
            }
    }
    @Get("/google/preview") fun preview(@Header(value="Authorization",defaultValue="") authorization:String,@QueryValue placeId:String):Map<String,Any?> {
        admit(authorization)
        if(!placeId.matches(Regex("[A-Za-z0-9_-]{5,250}")))fail(HttpStatus.BAD_REQUEST,"Lugar inválido")
        return VenueImportData.google(google("places/$placeId?languageCode=es","id,displayName,formattedAddress,addressComponents,location,regularOpeningHours,websiteUri,internationalPhoneNumber,googleMapsUri,attributions"))
    }
    @Get("/instagram/preview") fun instagram(@Header(value="Authorization",defaultValue="") authorization:String,@QueryValue profile:String):Map<String,Any?> {
        admit(authorization)
        val handle=VenueImportData.instagramHandle(profile)
        if(instagramToken.isBlank() || !instagramAccount.matches(Regex("[0-9]+")) || !graphVersion.matches(Regex("v[0-9]+\\.[0-9]+")))
            fail(HttpStatus.PRECONDITION_FAILED,"La importación de Instagram aún no está configurada. Podés completar el formulario manualmente.")
        val fields="business_discovery.username($handle){name,username,biography,website}"
        val root=read(HttpRequest.newBuilder(URI("https://graph.facebook.com/$graphVersion/$instagramAccount?fields=${encode(fields)}"))
            .timeout(Duration.ofSeconds(12)).header("Authorization","Bearer $instagramToken").GET().build()).path("business_discovery")
        if(root.isMissingNode || root.isNull)fail(HttpStatus.NOT_FOUND,"No se encontró un perfil profesional de Instagram accesible")
        return VenueImportData.instagram(root,handle)
    }
}
