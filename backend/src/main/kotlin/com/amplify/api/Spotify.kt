package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private fun enc(s:String)=URLEncoder.encode(s,StandardCharsets.UTF_8)

@Singleton
class Spotify(
    private val db:Db,
    private val json:ObjectMapper,
    @Value("\${amplify.spotify.client-id:}") private val clientId:String,
    @Value("\${amplify.spotify.redirect-uri}") private val redirectUri:String,
    @Value("\${amplify.spotify.encryption-key:}") private val encryptionKey:String,
    @Value("\${amplify.spotify.control-enabled:false}") val controlEnabled:Boolean,
    @Value("\${amplify.spotify.playlist-write-enabled:false}") val playlistWriteEnabled:Boolean,
    @Value("\${amplify.frontend-origin}") private val frontendOrigin:String
) {
    private val http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(7)).build()
    private val cache=ConcurrentHashMap<String,Pair<Instant,Map<String,String>?>>()
    private val musicCache=ConcurrentHashMap<UUID,Pair<Instant,Map<String,Any?>>>()
    private val requestDeadline=ThreadLocal<Long>()

    // A provider phase must finish well before the durable command's lease.
    // Individual HTTP calls also retain their existing 12/15 second timeouts.
    private fun <T> withRequestBudget(block:()->T):T {
        val previous=requestDeadline.get()
        val deadline=System.nanoTime()+Duration.ofMinutes(2).toNanos()
        requestDeadline.set(if(previous==null)deadline else minOf(previous,deadline))
        return try {block()} finally {
            if(previous==null)requestDeadline.remove() else requestDeadline.set(previous)
        }
    }
    private fun key():SecretKeySpec {
        val decoded=try{Base64.getDecoder().decode(encryptionKey)}catch (_:Exception){ByteArray(0)}
        if(decoded.size!=32) fail(HttpStatus.SERVICE_UNAVAILABLE,"Falta clave AES-256 para tokens Spotify")
        return SecretKeySpec(decoded,"AES")
    }
    private fun seal(value:String):String {
        val iv=ByteArray(12);SecureRandom().nextBytes(iv)
        val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key(),GCMParameterSpec(128,iv))
        return Base64.getEncoder().encodeToString(iv+c.doFinal(value.toByteArray(StandardCharsets.UTF_8)))
    }
    private fun unseal(value:String):String {
        val b=Base64.getDecoder().decode(value)
        if(b.size<29)fail(HttpStatus.SERVICE_UNAVAILABLE,"Token cifrado inválido")
        val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,b.copyOfRange(0,12)))
        return String(c.doFinal(b.copyOfRange(12,b.size)),StandardCharsets.UTF_8)
    }
    private fun execute(req:HttpRequest):Pair<Int,String> {
        requestDeadline.get()?.let {
            if(System.nanoTime()-it>=0)fail(HttpStatus.BAD_GATEWAY,"Se agotó el tiempo de sincronización; verificá el resultado del pedido")
        }
        val res=try{http.send(req,HttpResponse.BodyHandlers.ofString())}catch(e:Exception){fail(HttpStatus.BAD_GATEWAY,"Spotify no responde: ${e.javaClass.simpleName}")}
        if(res.statusCode()>=400) {
            // Endpoint path only: never log Authorization, query parameters, refresh tokens or OAuth codes.
            val reason=runCatching {
                val node=json.readTree(res.body()).path("error")
                if(node.isTextual)node.asText() else node.path("message").asText("")
            }.getOrDefault("").replace(Regex("[\r\n\t]")," ").take(180)
            System.err.println("SPOTIFY_ERROR: ${req.method()} ${req.uri().path} HTTP ${res.statusCode()} $reason")
            if(res.statusCode()==429)fail(HttpStatus.TOO_MANY_REQUESTS,"Spotify está limitando las solicitudes; reintentá más tarde")
            if(res.statusCode()==401)fail(HttpStatus.BAD_GATEWAY,"Spotify rechazó la autorización")
            if(res.statusCode()==403)fail(HttpStatus.FORBIDDEN,"Spotify no permite esta operación o falta Premium")
            if(res.statusCode()==404 && req.uri().path.startsWith("/v1/me/player"))
                fail(HttpStatus.PRECONDITION_FAILED,"No hay un dispositivo de reproducción activo. Elegí una salida de audio en la cabina.")
            fail(HttpStatus.BAD_GATEWAY,"Spotify devolvió HTTP ${res.statusCode()}")
        }
        return Pair(res.statusCode(),res.body())
    }
    private fun form(url:String,fields:Map<String,String>):JsonNode {
        val body=fields.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }
        val req=HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(12)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body)).build()
        return json.readTree(execute(req).second)
    }
    private fun apiGet(path:String,token:String):JsonNode? {
        val req=HttpRequest.newBuilder(URI("https://api.spotify.com/v1$path")).timeout(Duration.ofSeconds(12)).header("Authorization","Bearer $token").GET().build()
        val (status,body)=execute(req)
        return if(status==204 || body.isBlank())null else json.readTree(body)
    }
    private fun apiPost(path:String,token:String) {
        val req=HttpRequest.newBuilder(URI("https://api.spotify.com/v1$path")).timeout(Duration.ofSeconds(12)).header("Authorization","Bearer $token").POST(HttpRequest.BodyPublishers.noBody()).build()
        execute(req)
    }
    private fun apiPutEmpty(path:String,token:String) {
        val req=HttpRequest.newBuilder(URI("https://api.spotify.com/v1$path"))
            .timeout(Duration.ofSeconds(12))
            .header("Authorization","Bearer $token")
            .PUT(HttpRequest.BodyPublishers.noBody()).build()
        execute(req)
    }
    private fun apiJson(method:String,path:String,token:String,body:Map<String,Any>):JsonNode? {
        val requestBody=json.writeValueAsString(body)
        val req=HttpRequest.newBuilder(URI("https://api.spotify.com/v1$path"))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization","Bearer $token")
            .header("Content-Type","application/json")
            .method(method,HttpRequest.BodyPublishers.ofString(requestBody)).build()
        val (_,response)=execute(req)
        return if(response.isBlank())null else json.readTree(response)
    }

    data class PlaylistChange(val action:String,val position:Int,val warning:String?,val outsideContext:Boolean=false)

    /** Acquire/refresh outside database transactions. Playlist synchronization
     * never promises a position in Spotify's separately preloaded player queue. */
    fun playlistMutationToken(venueId:UUID):String=access(venueId)

    /** Prepare without mutating Spotify. The caller MUST durably save this JSON
     * before invoking applyRequestPlan; it contains no OAuth credentials. */
    fun prepareRequestPlan(venueId:UUID, trackId:String, token:String,
                           orderedQueue:List<String>, expectedPlaylistId:String):String = withRequestBudget {
        requirePlaylistWrites()
        if(!trackId.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"ID de canción inválido")
        if(orderedQueue.isEmpty() || trackId !in orderedQueue)
            fail(HttpStatus.BAD_REQUEST,"La solicitud no está en la cola de TOCÁ")
        if(orderedQueue.size>100)fail(HttpStatus.CONFLICT,"Máximo 100 solicitudes en la cola de pruebas")
        requireSelectedPlaylist(venueId,expectedPlaylistId)
        val before=readRequestSnapshot(expectedPlaylistId,token)
        val playback=apiGet("/me/player",token)
        val context=playback?.path("context")?.path("uri")?.asText("") ?: ""
        val currentTrack=playback?.path("item")?.path("id")?.asText("") ?: ""
        val samePlaylist=context=="spotify:playlist:$expectedPlaylistId"
        val calculated=PlaylistPlanner.reconcile(before.ids,currentTrack,samePlaylist,orderedQueue,trackId)
        if(calculated.expected.size>1000)
            fail(HttpStatus.CONFLICT,"La playlist superaría el máximo de 1000 canciones de las pruebas")
        val plan=RequestPlaylistPlan(expectedPlaylistId,trackId,before.ids,
            calculated.steps.filter {it.action!="ALREADY_IN_ORDER"},
            calculated.protectedPrefix+calculated.activeQueue.indexOf(trackId),!samePlaylist)
        check(plan.states().last()==calculated.expected) { "Saved Spotify plan does not match calculated result" }
        json.writeValueAsString(mapOf(
            "version" to 1,"playlistId" to plan.playlistId,"requestedTrack" to plan.requestedTrack,
            "initialIds" to plan.initialIds,"position" to plan.position,"outsideContext" to plan.outsideContext,
            "steps" to plan.steps.map {mapOf("trackId" to it.trackId,"desiredIndex" to it.desiredIndex,
                "existingIndex" to it.existingIndex,"action" to it.action)}))
    }

    /** Executes a saved command, never a newly calculated insertion point. No
     * player-queue endpoint is called: that operation has no idempotency key.
     * The outbox owner handles ambiguous failures and exclusive ownership. */
    fun applyRequestPlan(venueId:UUID, token:String, planJson:String):PlaylistChange =
        applyRequestPlan(venueId,token,planJson) {}

    fun applyRequestPlan(venueId:UUID, token:String, planJson:String,
                         beforeMutation:()->Unit):PlaylistChange = withRequestBudget {
        requirePlaylistWrites()
        val plan=savedRequestPlan(planJson)
        requireSelectedPlaylist(venueId,plan.playlistId)
        val changed=try {
            RequestPlaylistReplay.apply(plan,{
                beforeMutation() // Also fence the initial/final verification reads.
                readRequestSnapshot(plan.playlistId,token)
            }) { step,snapshot ->
                // Durable ownership may have expired while reading provider
                // state. Renew/check it immediately before issuing each write.
                beforeMutation()
                when(step.action) {
                    "INSERTED" -> apiJson("POST","/playlists/${plan.playlistId}/items",token,
                        mapOf("uris" to listOf("spotify:track:${step.trackId}"),"position" to step.desiredIndex))
                    "REORDERED" -> {
                        if(snapshot.isBlank())fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió snapshot de playlist")
                        apiJson("PUT","/playlists/${plan.playlistId}/items",token,
                            mapOf("range_start" to step.existingIndex!!,"insert_before" to step.desiredIndex,
                                "range_length" to 1,"snapshot_id" to snapshot))
                    }
                }
                Unit
            }
        } catch (_:RequestPlaylistReplay.Drift) {
            fail(HttpStatus.CONFLICT,"La playlist cambió fuera del pedido; revisá su sincronización")
        }
        beforeMutation() // Fence the successful result before its SQL commit.
        musicCache.remove(venueId)
        requestPlanResult(plan,changed)
    }

    /** Read-only recovery: a lost response/DB commit may leave the complete
     * desired result on Spotify. Partial or unrelated state is not success. */
    fun verifyRequestPlan(venueId:UUID, token:String, planJson:String):PlaylistChange? = withRequestBudget {
        val plan=savedRequestPlan(planJson)
        requireSelectedPlaylist(venueId,plan.playlistId)
        if(readRequestSnapshot(plan.playlistId,token).ids!=plan.states().last())return@withRequestBudget null
        musicCache.remove(venueId)
        requestPlanResult(plan,false)
    }

    private fun requirePlaylistWrites() {
        if(!playlistWriteEnabled)
            fail(HttpStatus.PRECONDITION_FAILED,
                "Activá SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true solo en pruebas privadas autorizadas")
    }

    private fun requireSelectedPlaylist(venueId:UUID, playlistId:String) {
        if(!playlistId.matches(Regex("[A-Za-z0-9]{15,40}")))
            fail(HttpStatus.PRECONDITION_FAILED,"Seleccioná la playlist del bar en el panel Spotify")
        val current=db.one("SELECT playlist_id FROM venue WHERE id=?",venueId)
            ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        if(current["playlist_id"]!=playlistId)
            fail(HttpStatus.CONFLICT,"La playlist del bar cambió antes de sincronizar el pedido")
    }

    private fun readRequestSnapshot(playlistId:String, token:String):RequestPlaylistSnapshot {
        val path="/playlists/$playlistId?fields=snapshot_id,items(total)"
        val metadata=apiGet(path,token) ?: fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió datos de la playlist")
        val total=metadata.path("items").path("total").asInt(-1)
        val snapshot=metadata.path("snapshot_id").asText("")
        if(total<0 || snapshot.isBlank())fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió tamaño y snapshot de la playlist")
        if(total>1000)fail(HttpStatus.CONFLICT,"Playlist de más de 1000 canciones: usá una más corta")
        val ids=mutableListOf<String?>()
        for(offset in 0 until total step 50) {
            val page=apiGet("/playlists/$playlistId/items?limit=50&offset=$offset",token)
                ?: fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió los elementos de la playlist")
            val items=page.path("items")
            if(!items.isArray)fail(HttpStatus.BAD_GATEWAY,"Formato de playlist inesperado")
            for(entry in items) {
                val item=entry.path("item").takeUnless {it.isNull||it.isMissingNode} ?: entry.path("track")
                ids.add(item.path("id").takeIf {it.isTextual}?.asText())
            }
        }
        // Pagination is not atomic. A snapshot must cover both ends of this read.
        val after=apiGet(path,token) ?: fail(HttpStatus.BAD_GATEWAY,"Spotify no confirmó el snapshot")
        if(ids.size!=total || after.path("snapshot_id").asText("")!=snapshot)
            fail(HttpStatus.CONFLICT,"La playlist cambió mientras se consultaba")
        return RequestPlaylistSnapshot(ids,snapshot)
    }

    private fun savedRequestPlan(planJson:String):RequestPlaylistPlan = try {
        require(planJson.length<=200_000)
        val node=json.readTree(planJson)
        require(node.path("version").asInt(-1)==1 && node.path("initialIds").isArray && node.path("steps").isArray)
        require(node.path("position").isInt && node.path("outsideContext").isBoolean)
        val initial=node.path("initialIds").map {
            require(it.isNull || (it.isTextual && it.asText().length<=128))
            if(it.isNull)null else it.asText()
        }
        val steps=node.path("steps").map {
            require(it.path("desiredIndex").isInt && (it.path("existingIndex").isNull || it.path("existingIndex").isInt))
            PlaylistPlanner.OrderStep(it.path("trackId").asText(),it.path("desiredIndex").asInt(),
                if(it.path("existingIndex").isNull)null else it.path("existingIndex").asInt(),it.path("action").asText())
        }
        RequestPlaylistPlan(node.path("playlistId").asText(),node.path("requestedTrack").asText(),initial,steps,
            node.path("position").asInt(),node.path("outsideContext").asBoolean()).also {it.states()}
    } catch (_:Exception) {
        fail(HttpStatus.CONFLICT,"El plan guardado del pedido no es válido; revisá su sincronización")
    }

    private fun requestPlanResult(plan:RequestPlaylistPlan, changed:Boolean):PlaylistChange {
        val note=if(plan.outsideContext)
            "Playlist sincronizada. No está activa en el reproductor; retomála desde Spotify o el control del administrador."
        else "Playlist sincronizada; Spotify puede conservar una cola de reproducción precargada."
        return PlaylistChange(if(changed)"FIFO_VERIFIED" else "ALREADY_QUEUED",plan.position,note,plan.outsideContext)
    }

    fun authorize(venue:Map<String,Any?>,owner:Map<String,Any?>):String {
        if(clientId.isBlank()) fail(HttpStatus.SERVICE_UNAVAILABLE,"SPOTIFY_CLIENT_ID no configurado")
        key() // fail before redirect if encryption not configured
        val state=randomString(32);val verifier=randomString(72)
        val challenge=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        db.exec("INSERT INTO spotify_oauth_state(state,venue_id,owner_id,verifier,expires_at) VALUES(?,?,?,?,?)",
            state,venue["id"],owner["id"],verifier,java.sql.Timestamp.from(Instant.now().plusSeconds(600)))
        val args=mapOf("response_type" to "code","client_id" to clientId,"redirect_uri" to redirectUri,"scope" to SpotifyScopes.requested,"show_dialog" to "true","state" to state,"code_challenge_method" to "S256","code_challenge" to challenge)
        return "https://accounts.spotify.com/authorize?"+args.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }
    }
    fun callback(code:String,state:String):String {
        val st=db.one("SELECT state,venue_id,owner_id,verifier FROM spotify_oauth_state WHERE state=? AND expires_at>now()",state)
            ?: fail(HttpStatus.BAD_REQUEST,"Estado OAuth inválido o expirado")
        // One-time state prevents replay. No user token is required on the callback.
        db.exec("DELETE FROM spotify_oauth_state WHERE state=?",state)
        val token=form("https://accounts.spotify.com/api/token",mapOf("grant_type" to "authorization_code","code" to code,"redirect_uri" to redirectUri,"client_id" to clientId,"code_verifier" to (st["verifier"] as String)))
        val scopes=token.get("scope")?.takeIf { it.isTextual }?.asText()?.let(SpotifyScopes::normalize)
        val access=token.path("access_token").asText()
        val refresh=token.path("refresh_token").asText()
        if(access.isBlank()||refresh.isBlank())fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió tokens")
        val me=apiGet("/me",access) ?: fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió perfil")
        val reportedProduct=me.path("product").asText("")
        if(reportedProduct.isNotBlank() && reportedProduct!="premium")
            fail(HttpStatus.FORBIDDEN,"Se requiere una cuenta Spotify Premium")
        val account=me.path("account_id").asText("").ifEmpty { me.path("id").asText("") }
        val venueId=st["venue_id"] as UUID
        val saveConnection = {
            db.exec("""UPDATE venue SET spotify_account_id=?,spotify_name=?,spotify_premium=true,
                  spotify_access_encrypted=?,spotify_refresh_encrypted=?,spotify_expires_at=?,spotify_scopes=?,updated_at=now() WHERE id=?""",
                account,me.path("display_name").asText("Spotify Premium"),seal(access),seal(refresh),
                java.sql.Timestamp.from(Instant.now().plusSeconds(token.path("expires_in").asLong(3600))),scopes,venueId)
        }
        db.transaction {
            val existing=db.one("SELECT spotify_account_id FROM venue WHERE id=? FOR UPDATE",venueId)
                ?:fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            // Reauthorizing the SAME account must remain possible to recover a
            // lost edit after token revocation; changing accounts still fences edits.
            if(account.isNotBlank() && existing["spotify_account_id"]==account)saveConnection()
            else changeVenueWithoutRequest(venueId) { saveConnection() }
        }
        return "$frontendOrigin/#/admin/spotify"
    }
    @Synchronized
    private fun access(venueId:UUID,forBrowser:Boolean=false):String {
        val v=db.one("SELECT spotify_access_encrypted,spotify_refresh_encrypted,spotify_expires_at,spotify_premium,spotify_scopes FROM venue WHERE id=?",venueId)
            ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        if(v["spotify_access_encrypted"]==null||v["spotify_premium"]!=true)fail(HttpStatus.PRECONDITION_FAILED,"El bar debe conectar Spotify Premium")
        if(forBrowser)SpotifyScopes.requireBrowser(v["spotify_scopes"] as? String)
        val expires=(v["spotify_expires_at"] as java.sql.Timestamp).toInstant()
        if(expires.isAfter(Instant.now().plusSeconds(60)))return unseal(v["spotify_access_encrypted"] as String)
        val refresh=unseal(v["spotify_refresh_encrypted"] as String)
        val token=form("https://accounts.spotify.com/api/token",mapOf("grant_type" to "refresh_token","refresh_token" to refresh,"client_id" to clientId))
        val freshAccess=token.path("access_token").asText()
        if(freshAccess.isBlank())fail(HttpStatus.BAD_GATEWAY,"No se pudo renovar token Spotify")
        val freshRefresh=token.path("refresh_token").asText().ifBlank {refresh}
        // Refresh cannot add permissions. An omitted scope retains the previous
        // grant; an explicit scope (including empty) replaces it.
        val scopes=token.get("scope")?.takeIf { it.isTextual }?.asText()?.let(SpotifyScopes::normalize)
        db.exec("UPDATE venue SET spotify_access_encrypted=?,spotify_refresh_encrypted=?,spotify_expires_at=?,spotify_scopes=COALESCE(?::text,spotify_scopes),updated_at=now() WHERE id=?",
            seal(freshAccess),seal(freshRefresh),java.sql.Timestamp.from(Instant.now().plusSeconds(token.path("expires_in").asLong(3600))),scopes,venueId)
        if(forBrowser)SpotifyScopes.requireBrowser(scopes ?: v["spotify_scopes"] as? String)
        return freshAccess
    }
    fun status(v:Map<String,Any?>):Map<String,Any?> = mapOf(
        "connected" to (v["spotify_premium"]==true && v["spotify_access_encrypted"]!=null),
        // API /me no longer reports the product for some development apps.
        // "premium" remains the legacy connection state, not proof of plan tier.
        "premium" to (v["spotify_premium"]==true),
        "premiumVerification" to "not_available_via_me",
        "profile" to (v["spotify_name"] ?: ""),
        "browserMissingScopes" to SpotifyScopes.missingBrowser(v["spotify_scopes"] as? String),
        "playlistId" to (v["playlist_id"] ?: ""),
        "deviceId" to (v["spotify_device_id"] ?: ""),
        "controlEnabled" to controlEnabled, "playlistWriteEnabled" to playlistWriteEnabled
    )
    fun disconnect(id:UUID) {
        changeVenueWithoutRequest(id) { connection ->
            connection.prepareStatement("""UPDATE venue SET spotify_account_id=NULL,spotify_name=NULL,spotify_premium=false,
                  spotify_access_encrypted=NULL,spotify_refresh_encrypted=NULL,spotify_expires_at=NULL,spotify_scopes=NULL,playlist_id=NULL,spotify_device_id=NULL,active=false,
                  updated_at=now() WHERE id=?""").use { statement ->
                statement.setObject(1,id);statement.executeUpdate()
            }
        }
        musicCache.remove(id);cache.remove(id.toString())
    }
    fun playlists(venueId:UUID):List<Map<String,String>> {
        val token=access(venueId);val result=mutableListOf<Map<String,String>>();var offset=0
        while(true){
            val root=apiGet("/me/playlists?limit=50&offset=$offset",token)?:break
            val items=root.path("items");result+=items.map{mapOf("id" to it.path("id").asText(),"name" to it.path("name").asText())}
            if(items.size()<50||root.path("next").isNull)break
            offset+=50;if(offset>=10000)fail(HttpStatus.CONFLICT,"Demasiadas playlists; refiná la cuenta vinculada")
        };return result
    }
    fun devices(venueId:UUID):List<Map<String,Any?>> {
        val root=apiGet("/me/player/devices",access(venueId))?:return emptyList()
        return root.path("devices").map { mapOf(
            "id" to it.path("id").asText(),"name" to it.path("name").asText(),
            "type" to it.path("type").asText(),"active" to it.path("is_active").asBoolean(false),
            "restricted" to it.path("is_restricted").asBoolean(false)
        ) }
    }
    fun selectDevice(venueId:UUID,deviceId:String) {
        if(deviceId.length>150 || deviceId.isBlank())fail(HttpStatus.BAD_REQUEST,"Dispositivo inválido")
        if(devices(venueId).none{it["id"]==deviceId && it["restricted"]!=true})fail(HttpStatus.BAD_REQUEST,"Dispositivo no disponible")
        db.exec("UPDATE venue SET spotify_device_id=?,updated_at=now() WHERE id=?",deviceId,venueId)
    }
    fun selectPlaylist(venueId:UUID,playlistId:String) {
        if(!playlistId.matches(Regex("[A-Za-z0-9]{15,40}")))fail(HttpStatus.BAD_REQUEST,"Playlist inválida")
        if(playlists(venueId).none {it["id"]==playlistId})fail(HttpStatus.BAD_REQUEST,"Playlist no encontrada en la cuenta")
        // Provider validation happens before acquiring the venue lock. Once a
        // command is accepted its selected playlist must remain immutable.
        changeVenueWithoutRequest(venueId) { connection ->
            connection.prepareStatement("UPDATE venue SET playlist_id=?,queue_started_at=now(),updated_at=now() WHERE id=?").use { statement ->
                statement.setString(1,playlistId);statement.setObject(2,venueId);statement.executeUpdate()
            }
        }
        musicCache.remove(venueId)
    }

    private fun changeVenueWithoutRequest(venueId:UUID, change:(Connection)->Unit) {
        db.transaction { connection ->
            connection.prepareStatement("SELECT id FROM venue WHERE id=? FOR UPDATE").use { statement ->
                statement.setObject(1,venueId)
                statement.executeQuery().use { if(!it.next())fail(HttpStatus.NOT_FOUND,"Bar no encontrado") }
            }
            val pending=connection.prepareStatement("""SELECT 1 FROM request_command WHERE venue_id=?
                AND status IN ('PENDING','PREPARING','APPLYING','UNCERTAIN') LIMIT 1""").use { statement ->
                statement.setObject(1,venueId);statement.executeQuery().use {it.next()}
            }
            if(pending)fail(HttpStatus.CONFLICT,"Hay un pedido pendiente de sincronizar; resolvelo antes de cambiar Spotify")
            if(db.one("SELECT id FROM venue_music_operation WHERE venue_id=? AND status IN ('PREPARING','APPLYING','UNCERTAIN') LIMIT 1",venueId)!=null)
                fail(HttpStatus.CONFLICT,"Hay una edición de playlist pendiente de revisión")
            change(connection)
        }
    }
    /** All playlist items for the public view (50 per Spotify request).
     * musicStatus uses maxItems=50 to keep frequent polling lightweight.
     */
    fun playlist(venueId:UUID,playlistId:String?,maxItems:Int=Int.MAX_VALUE):List<Map<String,Any?>> {
        if(playlistId.isNullOrBlank() || maxItems<=0)return emptyList()
        val token=access(venueId)
        val tracks=mutableListOf<Map<String,Any?>>()
        var offset=0
        while(offset<maxItems) {
            val batchSize=minOf(50,maxItems-offset)
            val root=apiGet("/playlists/${enc(playlistId)}/items?limit=$batchSize&offset=$offset",token)
            if(root==null) {
                if(offset==0)return emptyList()
                fail(HttpStatus.BAD_GATEWAY,"No se pudo cargar toda la playlist de Spotify")
            }
            val items=root.path("items")
            if(!items.isArray)fail(HttpStatus.BAD_GATEWAY,"Spotify devolvió elementos de playlist inválidos")
            for(entry in items) {
                val item=entry.path("item").takeIf{!it.isMissingNode&&!it.isNull}?:entry.path("track")
                if(!item.isMissingNode&&!item.isNull&&item.path("type").asText()=="track")tracks.add(track(item))
            }
            val fetched=items.size()
            if(fetched==0)break
            offset+=fetched
            if(offset>=root.path("total").asInt(offset))break
        }
        return tracks
    }
    private fun track(t:JsonNode):Map<String,Any?> = SpotifyTrack.from(t)
    fun search(venueId:UUID,q:String):List<Map<String,Any?>> {
        if(q.trim().length<2)return emptyList()
        val root=apiGet("/search?q=${enc(q.trim())}&type=track&limit=10",access(venueId))?:return emptyList()
        return root.path("tracks").path("items").map { track(it) }
    }
    fun getTrack(venueId:UUID,trackId:String):Map<String,Any?> {
        if(!trackId.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"Track ID Spotify inválido")
        val root=apiGet("/tracks/$trackId",access(venueId))?:fail(HttpStatus.NOT_FOUND,"Canción no encontrada")
        if(root.path("is_playable").isBoolean && !root.path("is_playable").asBoolean())fail(HttpStatus.BAD_REQUEST,"Esta canción no se puede reproducir")
        return track(root)
    }
    fun nowPlaying(venueId:UUID):Map<String,String>? {
        val k=venueId.toString();val old=cache[k]
        if(old!=null&&old.first.isAfter(Instant.now().minusSeconds(25)))return old.second
        val node=apiGet("/me/player/currently-playing",access(venueId))
        val item=node?.path("item")
        val now=if(item==null || item.isMissingNode||item.isNull) null else mapOf(
            "title" to item.path("name").asText(),"artist" to item.path("artists").joinToString(", "){it.path("name").asText()})
        if(cache.size>=1000)cache.clear()
        cache[k]=Instant.now() to now
        return now
    }
    /** Current Spotify playback + configured playlist. "next" is an estimate from
     * playlist order, not a promise about Spotify's preloaded player queue.
     * Public only while the venue session is active (checked by controller).
     */
    fun musicStatus(venueId:UUID,playlistId:String?):Map<String,Any?> {
        val old=musicCache[venueId]
        if(old!=null && old.first.isAfter(Instant.now().minusSeconds(12)))return old.second
        val token=access(venueId)
        val playback=apiGet("/me/player",token)
        val playing=playback?.path("is_playing")?.asBoolean(false) ?: false
        val context=playback?.path("context")?.path("uri")?.asText("") ?: ""
        val current=playback?.path("item")
        val currentTrack=if(current==null||current.isNull||current.isMissingNode||current.path("type").asText("")!="track") null else track(current)
        val rows=if(playlistId.isNullOrBlank())emptyList() else playlist(venueId,playlistId,50)
        val samePlaylist=!playlistId.isNullOrBlank() && context=="spotify:playlist:$playlistId"
        val currentIndex=if(samePlaylist && currentTrack!=null) rows.indexOfFirst { it["id"]==currentTrack["id"] } else -1
        val next=if(currentIndex>=0 && currentIndex+1<rows.size) rows[currentIndex+1] else null
        val note=when {
            currentTrack==null -> "Spotify no informó una canción actual."
            !samePlaylist -> "El reproductor no está utilizando la playlist vinculada al bar."
            currentIndex<0 -> "La canción actual no se encontró entre los primeros 50 temas de la playlist."
            next==null -> "No hay una siguiente canción identificable entre los primeros 50 temas."
            else -> "Siguiente según la playlist; Spotify puede mantener otra cola de reproducción precargada."
        }
        val result: Map<String, Any?> = mapOf(
            "active" to true,"isPlaying" to playing,"now" to currentTrack,
            "next" to next,"nextVerified" to false,"samePlaylist" to samePlaylist,
            "playlist" to rows,"note" to note,
            "shuffle" to (playback?.path("shuffle_state")?.asBoolean(false) ?: false),
            "repeat" to (playback?.path("repeat_state")?.asText("off") ?: "off"),
            "updatedAt" to Instant.now().toString()
        )
        if(musicCache.size>=1000)musicCache.clear()
        musicCache[venueId]=Instant.now() to result
        return result
    }

    /** Explicit, administrator-triggered playback restart. Never call on guest requests. */
    fun resumeVenuePlaylistPrivateTest(venueId:UUID):Map<String,Any?> {
        if(!controlEnabled)
            fail(HttpStatus.PRECONDITION_FAILED,
                "Habilitá SPOTIFY_PRIVATE_TEST_CONTROL=true únicamente en pruebas privadas autorizadas")
        val venue=db.one("SELECT playlist_id, spotify_device_id FROM venue WHERE id=?",venueId)
            ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        val playlistId=(venue["playlist_id"] as? String)?.takeIf { it.isNotBlank() }
            ?: fail(HttpStatus.PRECONDITION_FAILED,"Seleccioná primero la playlist del bar")
        val token=access(venueId)
        val player=apiGet("/me/player",token)
        val currentContext=player?.path("context")?.path("uri")?.asText("") ?: ""
        if(currentContext=="spotify:playlist:$playlistId" && player?.path("is_playing")?.asBoolean(false)==true)
            return mapOf("started" to false,"alreadyPlaying" to true,
                "message" to "Spotify ya está reproduciendo la playlist del bar")
        val device=(venue["spotify_device_id"] as? String)?.takeIf{it.isNotBlank()}
        val path="/me/player/play"+(if(device==null)"" else "?device_id=${enc(device)}")
        apiJson("PUT",path,token,mapOf(
            "context_uri" to "spotify:playlist:$playlistId",
            "offset" to mapOf("position" to 0),"position_ms" to 0))
        // Explicit restart: prevent Spotify from switching to recommendations
        // when it reaches the end. Each API operation may fail independently.
        val suffix=if(device==null)"" else "&device_id=${enc(device)}"
        val repeatEnabled=runCatching {
            apiPutEmpty("/me/player/repeat?state=context$suffix",token);true
        }.getOrDefault(false)
        val shuffleDisabled=runCatching {
            apiPutEmpty("/me/player/shuffle?state=false$suffix",token);true
        }.getOrDefault(false)
        musicCache.remove(venueId);cache.remove(venueId.toString())
        return mapOf("started" to true,"alreadyPlaying" to false,
            "repeatEnabled" to repeatEnabled,"shuffleDisabled" to shuffleDisabled,
            "message" to "Se solicitó reiniciar la playlist desde el primer tema. Repetición: ${if(repeatEnabled) "activada" else "no confirmada"}; aleatorio: ${if(shuffleDisabled) "desactivado" else "no confirmado"}.")
    }

    fun enqueuePrivateTest(venueId:UUID,trackId:String) {
        if(!controlEnabled) return
        if(!trackId.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"Track ID Spotify inválido")
        val venue=db.one("SELECT spotify_device_id FROM venue WHERE id=?",venueId)
        val deviceId=venue?.get("spotify_device_id") as? String
        val path="/me/player/queue?uri=${enc("spotify:track:$trackId")}" + (if(deviceId.isNullOrBlank())"" else "&device_id=${enc(deviceId)}")
        apiPost(path,access(venueId))
    }

    fun adminPlaylistRevision(venue:UUID,playlist:String):MusicPlaylistRevision {
        val metadata=apiGet("/playlists/${enc(playlist)}?fields=name,snapshot_id",access(venue))
            ?:fail(HttpStatus.BAD_GATEWAY,"Playlist no disponible")
        val snapshot=metadata.path("snapshot_id").asText("")
        if(snapshot.isBlank())fail(HttpStatus.BAD_GATEWAY,"Spotify no devolvió la versión de la playlist")
        return MusicPlaylistRevision(playlist,metadata.path("name").asText("Playlist"),snapshot)
    }
    fun adminPlaylist(venue:UUID,playlist:String):MusicPlaylist = withRequestBudget {
        val token=access(venue)
        val metadata=apiGet("/playlists/${enc(playlist)}",token)?:fail(HttpStatus.BAD_GATEWAY,"Playlist no disponible")
        val snapshot=metadata.path("snapshot_id").asText("")
        val total=metadata.path("items").path("total").asInt(-1)
        if(snapshot.isBlank() || total !in 0..1000)fail(HttpStatus.CONFLICT,"La playlist debe tener hasta 1000 canciones y un snapshot válido")
        val tracks=mutableListOf<Map<String,Any?>>()
        for(offset in 0 until total step 50) {
            val page=apiGet("/playlists/${enc(playlist)}/items?limit=50&offset=$offset",token)?:fail(HttpStatus.BAD_GATEWAY,"Playlist incompleta")
            for(entry in page.path("items")) {
                val item=entry.path("item").takeUnless {it.isNull||it.isMissingNode}?:entry.path("track")
                tracks.add(if(item.path("type").asText()=="track")track(item) else mapOf("id" to null,"title" to "Elemento no disponible","artist" to ""))
            }
        }
        val after=apiGet("/playlists/${enc(playlist)}?fields=snapshot_id",token)
        if(tracks.size!=total || after?.path("snapshot_id")?.asText()!=snapshot)fail(HttpStatus.CONFLICT,"La playlist cambió mientras se cargaba. Actualizá.")
        return@withRequestBudget MusicPlaylist(playlist,metadata.path("name").asText("Playlist"),snapshot,tracks)
    }
    fun createAdminPlaylist(venue:UUID,name:String,marker:String):String {
        requirePlaylistWrites()
        val response=apiJson("POST","/me/playlists",access(venue),mapOf("name" to name,"public" to false,"description" to "Creada desde TOCÁ [$marker]"))
        return response?.path("id")?.asText()?.takeIf {it.matches(Regex("[A-Za-z0-9]{15,40}"))}
            ?:fail(HttpStatus.BAD_GATEWAY,"Spotify no confirmó el ID de la playlist")
    }
    fun findAdminPlaylist(venue:UUID,marker:String):String? = withRequestBudget {
        val token=access(venue)
        for(offset in 0 until 10000 step 50) {
            val page=apiGet("/me/playlists?limit=50&offset=$offset",token)?:break
            val items=page.path("items")
            items.firstOrNull {it.path("description").asText("").contains("[$marker]") }?.let {return@withRequestBudget it.path("id").asText()}
            if(items.size()<50)return@withRequestBudget null
        }
        fail(HttpStatus.CONFLICT,"La cuenta tiene demasiadas playlists para verificar la creación")
    }
    fun editAdminPlaylist(venue:UUID,plan:Map<String,Any?>) {
        requirePlaylistWrites()
        val playlist=plan["playlistId"] as String
        // Recheck immediately before the single write; snapshot-aware edits are fenced remotely too.
        if(adminPlaylist(venue,playlist).snapshot!=plan["snapshot"])fail(HttpStatus.CONFLICT,"La playlist cambió antes de editar")
        val token=access(venue);val path="/playlists/${enc(playlist)}"
        when(plan["action"]) {
            "rename" -> apiJson("PUT",path,token,mapOf("name" to plan["name"]!!))
            "add" -> apiJson("POST","$path/items",token,mapOf("uris" to listOf("spotify:track:${plan["trackId"]}")))
            "remove" -> apiJson("DELETE","$path/items",token,mapOf("items" to listOf(mapOf("uri" to "spotify:track:${plan["trackId"]}","positions" to listOf(plan["position"]))),"snapshot_id" to plan["snapshot"]!!))
            "move" -> {
                val from=(plan["from"] as Number).toInt();val to=(plan["to"] as Number).toInt()
                apiJson("PUT","$path/items",token,mapOf("range_start" to from,"range_length" to 1,"insert_before" to if(to>from)to+1 else to,"snapshot_id" to plan["snapshot"]!!))
            }
        }
        musicCache.remove(venue)
    }
    fun browserToken(venue:UUID):Map<String,Any> {
        requirePlayerControl()
        return mapOf("accessToken" to access(venue,forBrowser=true),"expiresIn" to 60)
    }
    private fun requirePlayerControl() {
        if(!controlEnabled)fail(HttpStatus.PRECONDITION_FAILED,"El control de reproducción está desactivado en este entorno")
    }
    fun adminPlayer(venue:UUID):Map<String,Any?> {
        val player=apiGet("/me/player",access(venue))
        val item=player?.path("item")
        return mapOf("isPlaying" to (player?.path("is_playing")?.asBoolean()?:false),
            "contextUri" to player?.path("context")?.path("uri")?.asText(""),
            "now" to item?.takeIf {it.path("type").asText()=="track"}?.let(::track),
            "progressMs" to (player?.path("progress_ms")?.asLong()?:0),
            "device" to player?.path("device")?.let {mapOf("id" to it.path("id").asText(),"name" to it.path("name").asText(),"volume" to it.path("volume_percent").asInt())},
            "shuffle" to (player?.path("shuffle_state")?.asBoolean()?:false),"repeat" to (player?.path("repeat_state")?.asText()?:"off"))
    }
    fun playerCommand(venue:UUID,body:Map<String,Any?>):Map<String,Boolean> {
        requirePlayerControl()
        val token=access(venue)
        val v=db.one("SELECT playlist_id,spotify_device_id FROM venue WHERE id=?",venue)?:fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        val device=(v["spotify_device_id"] as? String).orEmpty()
        val suffix=if(device.isBlank())"" else "?device_id=${enc(device)}"
        val action=required(body,"action",20)
        fun bounded(key:String,max:Int):Int {
            val n=body[key] as? Number?:fail(HttpStatus.BAD_REQUEST,"Valor requerido")
            val i=n.toInt();if(n.toDouble()!=i.toDouble() || i !in 0..max)fail(HttpStatus.BAD_REQUEST,"Valor fuera de rango")
            return i
        }
        when(action) {
            "transfer" -> {
                if(device.isBlank())fail(HttpStatus.PRECONDITION_FAILED,"Seleccioná un dispositivo")
                apiJson("PUT","/me/player",token,mapOf("device_ids" to listOf(device),"play" to false))
            }
            "start" -> {
                val playlist=(v["playlist_id"] as? String)?.takeIf {it.isNotBlank()}?:fail(HttpStatus.PRECONDITION_FAILED,"Creá o seleccioná una playlist")
                val start=MusicPlaybackStart.body(adminPlaylist(venue,playlist),body)
                apiJson("PUT","/me/player/play$suffix",token,start)
            }
            "resume" -> apiPutEmpty("/me/player/play$suffix",token)
            "pause" -> apiPutEmpty("/me/player/pause$suffix",token)
            "next","previous" -> apiPost("/me/player/$action$suffix",token)
            "seek","volume" -> {
                val param=if(action=="seek")"position_ms=${bounded("positionMs",86_400_000)}" else "volume_percent=${bounded("volume",100)}"
                apiPutEmpty("/me/player/$action?$param"+(if(device.isBlank())"" else "&device_id=${enc(device)}"),token)
            }
            "shuffle" -> {
                val value=body["enabled"] as? Boolean?:fail(HttpStatus.BAD_REQUEST,"Estado requerido")
                apiPutEmpty("/me/player/shuffle?state=$value"+(if(device.isBlank())"" else "&device_id=${enc(device)}"),token)
            }
            "repeat" -> {
                val value=body["state"] as? String
                if(value !in listOf("off","track","context"))fail(HttpStatus.BAD_REQUEST,"Repetición inválida")
                apiPutEmpty("/me/player/repeat?state=$value"+(if(device.isBlank())"" else "&device_id=${enc(device)}"),token)
            }
            else -> fail(HttpStatus.BAD_REQUEST,"Control inválido")
        }
        cache.remove(venue.toString());musicCache.remove(venue)
        return mapOf("accepted" to true)
    }
}
