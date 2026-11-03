package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.http.annotation.Header
import io.micronaut.http.annotation.QueryValue
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.*

/**
 * Geocoding used only while an authenticated bar owner is editing an address.
 * Uses Photon /api for autocomplete and /reverse for manually selected pins.
 * Photon public demo is best-effort; production should use a contracted provider
 * or self-hosted Photon, with usage limits and monitoring.
 * No public Nominatim requests are used for autocomplete.
 */
@Controller("/api/admin/geocode")
@ExecuteOn(TaskExecutors.BLOCKING)
class VenueGeocodingController(private val auth: Auth, private val mapper: ObjectMapper) {
    private val http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
    private val suggestionsCache = ConcurrentHashMap<String, Pair<Long, List<Map<String, Any>>>>()
    private val reverseCache = ConcurrentHashMap<String, Pair<Long, Map<String, Any>>>()
    private val providerLock = Any()
    private var lastProviderAt = 0L
    private val cacheTtlMillis = 30L * 60L * 1000L
    private fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8)
    private fun field(node: JsonNode, key: String): String = node.path(key).asText("").trim()
    private fun now() = System.currentTimeMillis()

    // The IDE candidates endpoint searches all of Uruguay. Reordering is NOT
    // enough: results in a different city must be excluded, even if they match
    // the street/number text. Never use a different city's point for a venue.
    private fun normalize(value: String): String = java.text.Normalizer
        .normalize(value.trim().uppercase(Locale.ROOT), java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .replace(Regex("\\s+"), " ")

    private fun departmentFor(city: String): String? = when (normalize(city)) {
        "MONTEVIDEO" -> "Montevideo"
        "PUNTA DEL ESTE", "MALDONADO", "PIRIAPOLIS" -> "Maldonado"
        "CIUDAD DE LA COSTA", "CANELONES", "ATLANTIDA" -> "Canelones"
        else -> null
    }

    // For Montevideo we can safely use a broad municipality bounding envelope
    // as a second signal: providers sometimes return barrio as 'localidad'.
    // These bounds include metropolitan Montevideo, but exclude Punta del Este.
    private fun inRequestedCity(place: Place, city: String): Boolean =
        if (normalize(city) == "MONTEVIDEO")
            place.lat in -35.06..-34.64 && place.lon in -56.54..-55.99
        else normalize(place.city) == normalize(city)

    private fun matchingStreetAndNumber(place: Place, text: String): Boolean {
        val parts = text.trim().split(Regex("\\s+"))
        val number = parts.lastOrNull()?.takeIf { it.matches(Regex("[0-9]{1,6}[A-Za-z]?")) }
        val normalizedAddress = normalize(place.address)
        if (number != null && !Regex("(?<![0-9])${number.uppercase(Locale.ROOT)}(?![0-9A-Z])")
                .containsMatchIn(normalizedAddress)) return false
        val street = if (number != null) parts.dropLast(1).joinToString(" ") else text
        val tokens = normalize(street).split(Regex("[^A-Z0-9]+"))
            .filter { it.length >= 3 && it !in setOf("CALLE", "AVENIDA", "RUTA") }
        return tokens.all { token -> normalizedAddress.contains(token) }
    }

    private fun photon(url: String): JsonNode {
        // Avoid bursts against the free demo service, even from concurrent users.
        synchronized(providerLock) {
            val waitMs = 500L - (now() - lastProviderAt)
            if (waitMs > 0) Thread.sleep(waitMs)
            lastProviderAt = now()
            try {
                val request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(9))
                    .header("Accept", "application/json")
                    .header("User-Agent", "TOCA-Local-Development/1.8.3 (bar address selection)")
                    .GET().build()
                val response = http.send(request, HttpResponse.BodyHandlers.ofString())
                if (response.statusCode() !in 200..299)
                    fail(HttpStatus.BAD_GATEWAY, "El servicio de direcciones no respondió (${response.statusCode()})")
                return mapper.readTree(response.body())
            } catch (e: io.micronaut.http.exceptions.HttpStatusException) {
                throw e
            } catch (_: Exception) {
                fail(HttpStatus.BAD_GATEWAY, "El servicio de direcciones no está disponible. Podés escribirla manualmente.")
            }
        }
    }

    private data class Place(
        val lat: Double,
        val lon: Double,
        val address: String,
        val city: String,
        val label: String,
        val hasStreet: Boolean,
        val hasNumber: Boolean
    )

    private fun features(root: JsonNode): List<Place> {
        val out = mutableListOf<Place>()
        val unique = mutableSetOf<String>()
        for (feature in root.path("features")) {
            val coords = feature.path("geometry").path("coordinates")
            if (!coords.isArray || coords.size() < 2) continue
            val lon = coords[0].asDouble(Double.NaN)
            val lat = coords[1].asDouble(Double.NaN)
            if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0) continue
            val p = feature.path("properties")
            val street = field(p, "street")
            val number = field(p, "housenumber")
            val city = listOf("city", "town", "village", "municipality", "county", "state")
                .map { field(p, it) }.firstOrNull { it.isNotBlank() }.orEmpty()
            val placeName = field(p, "name")
            val streetLine = listOf(street, number).filter { it.isNotBlank() }.joinToString(" ")
            val address = streetLine.ifBlank { placeName }
            if (address.isBlank()) continue
            val labelParts = mutableListOf<String>()
            if (placeName.isNotBlank() && placeName != street && placeName != streetLine) labelParts += placeName
            labelParts += address
            if (city.isNotBlank()) labelParts += city
            val label = labelParts.distinct().joinToString(" · ")
            val key = "${"%.5f".format(Locale.ROOT, lat)}:${"%.5f".format(Locale.ROOT, lon)}:$address"
            if (unique.add(key)) out += Place(lat, lon, address, city, label, street.isNotBlank(), number.isNotBlank())
        }
        return out
    }

    private fun asMap(place: Place): Map<String, Any> = mapOf(
        "lat" to place.lat, "lon" to place.lon, "address" to place.address,
        "city" to place.city, "name" to place.label,
        "precise" to (place.hasStreet && place.hasNumber)
    )

    @Get("/suggest")
    fun suggest(
        @Header(value = "Authorization", defaultValue = "") authorization: String,
        @QueryValue address: String,
        @QueryValue(defaultValue = "Montevideo") city: String
    ): Map<String, Any> {
        auth.user(authorization)
        val q = address.trim().take(160)
        val cityValue = city.trim().take(120).ifBlank { "Montevideo" }
        if (q.length < 3) return mapOf("results" to emptyList<Any>())
        val cacheKey = "$q|$cityValue".lowercase(Locale.ROOT)
        val cached = suggestionsCache[cacheKey]
        if (cached != null && cached.first > now()) return mapOf("results" to cached.second)

        val issues = mutableListOf<String>()
        var results: List<Map<String, Any>> = emptyList()
        val hasNumber = q.trim().split(Regex("\\s+")).lastOrNull()
            ?.matches(Regex("[0-9]{1,6}[A-Za-z]?")) == true
        // With house numbers, query the address service with locality AND
        // department first. IDE /candidates is countrywide and can otherwise
        // return a Punta del Este POI for a Montevideo address.
        if (hasNumber) {
            results = try {
                ideAddressLookup(q, cityValue).filter { inRequestedCity(it, cityValue) &&
                    matchingStreetAndNumber(it, q) }.take(6).map(::asMap)
            } catch (e: Exception) { issues.add("IDE dirección: ${e.message}"); emptyList() }
        }
        if (results.isEmpty() && !hasNumber) {
            results = try { ideStreets(q, cityValue) }
                catch (e: Exception) { issues.add("IDE calles: ${e.message}"); emptyList() }
        }
        if (results.isEmpty()) {
            results = try {
                ideCandidates(q, cityValue).filter {
                    inRequestedCity(it, cityValue) && matchingStreetAndNumber(it, q)
                }.take(6).map(::asMap)
            } catch (e: Exception) { issues.add("IDE candidatos: ${e.message}"); emptyList() }
        }
        if (results.isEmpty() && hasNumber) {
            // An official street-only suggestion is preferable to a wrong pin.
            val streetQuery = q.replace(Regex("\\s+[0-9]{1,6}[A-Za-z]?$"), "").trim()
            results = try { ideStreets(streetQuery, cityValue) }
                catch (e: Exception) { issues.add("IDE calles: ${e.message}"); emptyList() }
        }
        if (results.isEmpty()) {
            results = try {
                val geoBias = if (normalize(cityValue) == "MONTEVIDEO") "&lat=-34.9&lon=-56.17" else ""
                val url = "https://photon.komoot.io/api/?q=${encode(q)}&limit=12&lang=es&countrycode=UY$geoBias"
                features(photon(url)).filter {
                    inRequestedCity(it, cityValue) && matchingStreetAndNumber(it, q)
                }.take(6).map(::asMap)
            } catch (e: Exception) { issues.add("Photon: ${e.message}"); emptyList() }
        }
        if (results.isEmpty() && issues.isNotEmpty()) {
            // Un resultado vacío válido no es una caída. Exigir que todos los proveedores
            // consultados hayan fallado antes de devolver 502.
            val required = if (hasNumber) listOf("IDE candidatos:", "IDE dirección:", "IDE calles:", "Photon:")
                           else listOf("IDE calles:", "IDE candidatos:", "Photon:")
            if (required.all { prefix -> issues.any { it.startsWith(prefix) } })
                fail(HttpStatus.BAD_GATEWAY,
                    "Los proveedores de direcciones no respondieron. Probá de nuevo o marcá el pin manualmente.")
        }
        if (suggestionsCache.size > 500) suggestionsCache.clear()
        if (results.isNotEmpty()) suggestionsCache[cacheKey] = Pair(now() + cacheTtlMillis, results)
        return mapOf("results" to results)
    }

    /**
     * Este endpoint (v0) está documentado explícitamente para calles incompletas,
     * por ejemplo "Buenos Air". No exige lat/lng, a diferencia de /candidates.
     * No inventamos un pin con (0,0) o el centroide de la ciudad.
     */
    private fun ideStreets(query: String, city: String): List<Map<String, Any>> {
        // La API v0 históricamente podía devolver HTML si no se solicitaba JSON explícito.
        val url = "https://direcciones.ide.uy/api/v0/geocode/SugerenciaCalleCompleta?entrada=${encode(query)}&todos=true&tipoRespuesta=json"
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(8))
            .header("Accept", "application/json")
            .header("User-Agent", "TOCA-Local-Development/1.8.7 (street autocomplete)")
            .GET().build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) throw IllegalStateException("IDE calles HTTP ${response.statusCode()}")
        val root = mapper.readTree(response.body())
        val entries = responseArray(root) ?: throw IllegalStateException("IDE calles: JSON sin listado")
        val seen = mutableSetOf<String>()
        val streets = mutableListOf<Map<String, Any>>()
        for (item in entries) {
            val name = field(item, "calle")
            if (name.isBlank()) continue
            val locality = field(item, "localidad").ifBlank { field(item, "departamento") }
            val dept = field(item, "departamento")
            // Street autocompletion also searches the entire country.
            // For Montevideo require locality or department Montevideo.
            val requested = normalize(city)
            val matching = normalize(locality) == requested || normalize(dept) == requested
            if (!matching) continue
            val key = "$name|$locality".lowercase(Locale.ROOT)
            if (!seen.add(key)) continue
            // Streets have no exact location. The UI must not treat them as a pin.
            streets.add(mapOf(
                "kind" to "street", "address" to name, "city" to city,
                "name" to listOf(name, locality, dept).filter { it.isNotBlank() }.distinct().joinToString(" · "),
                "needsNumber" to !query.any(Char::isDigit)
            ))
        }
        return streets.take(8)
    }

    // Formatos conocidos: array directo (Swagger IDE), o array dentro de un envoltorio.
    // Nunca confundir un error JSON del proveedor con una dirección vacía válida.
    private fun responseArray(root: JsonNode): JsonNode? {
        if (root.isArray) return root
        for (fieldName in listOf("results", "data", "candidates", "suggestions")) {
            val value = root.path(fieldName)
            if (value.isArray) return value
        }
        return null
    }

    /** Búsqueda de portal con número, usando el servicio v0 independiente de /candidates. */
    private fun ideAddressLookup(query: String, city: String): List<Place> {
        val department = departmentFor(city)?.let { "&departamento=${encode(it)}" } ?: ""
        val url = "https://direcciones.ide.uy/api/v0/geocode/BusquedaDireccion?calle=${encode(query)}&localidad=${encode(city)}$department&tipoRespuesta=json"
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(8))
            .header("Accept", "application/json")
            .header("User-Agent", "TOCA-Local-Development/1.8.8 (house number lookup)")
            .GET().build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299)
            throw IllegalStateException("IDE dirección HTTP ${response.statusCode()}")
        val entries = responseArray(mapper.readTree(response.body()))
            ?: throw IllegalStateException("IDE dirección: JSON sin listado")
        val unique = mutableSetOf<String>()
        val places = mutableListOf<Place>()
        for (node in entries) {
            val lat = node.path("puntoY").asDouble(Double.NaN)
            val lon = node.path("puntoX").asDouble(Double.NaN)
            if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0 || (lat == 0.0 && lon == 0.0)) continue
            val normalized = node.path("direccion")
            val street = field(normalized.path("calle"), "nombre_normalizado")
            val number = field(normalized.path("numero"), "nro_puerta")
            val locality = field(normalized.path("localidad"), "nombre_normalizado")
            val error = field(node, "error")
            if (error.contains("PUNTO NO ENCONTRADO", ignoreCase = true)) continue
            val address = listOf(street, number).filter(String::isNotBlank).joinToString(" ").ifBlank { query }
            val label = listOf(address, locality).distinct().joinToString(" · ")
            val key = "${"%.5f".format(Locale.ROOT, lat)}:${"%.5f".format(Locale.ROOT, lon)}:$address"
            if (unique.add(key)) places += Place(lat, lon, address, locality, label,
                street.isNotBlank(), number.isNotBlank() && error.isBlank())
        }
        return places.sortedWith(compareByDescending<Place> { it.city.equals(city, ignoreCase = true) }).take(8)
    }

    /** Autocompletado oficial de Uruguay (IDE). No requiere clave desde TOCÁ. */
    private fun ideCandidates(query: String, city: String): List<Place> {
        val url = "https://direcciones.ide.uy/api/v1/geocode/candidates?q=${encode(query)}&limit=12&soloLocalidad=false"
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(8))
            .header("Accept", "application/json")
            .header("User-Agent", "TOCA-Local-Development/1.8.6 (address autocomplete)")
            .GET().build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299)
            throw IllegalStateException("IDE HTTP ${response.statusCode()}")
        val root = mapper.readTree(response.body())
        val entries = responseArray(root) ?: throw IllegalStateException("IDE candidatos: JSON sin listado")
        val places = mutableListOf<Place>()
        val unique = mutableSetOf<String>()
        for (node in entries) {
            // Los resultados de IDE usan `lng`, no `lon` (Photon usa coordenadas GeoJSON).
            val lat = node.path("lat").asDouble(Double.NaN)
            val lon = node.path("lng").asDouble(Double.NaN)
            if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0 || (lat == 0.0 && lon == 0.0)) continue
            val locality = field(node, "localidad").ifBlank { field(node, "departamento") }
            val street = field(node, "nomVia")
            val number = field(node, "portalNumber")
            val address = field(node, "address").ifBlank {
                (street + if (number.isNotBlank() && number != "0") " $number" else "").trim()
            }
            if (address.isBlank()) continue
            val label = listOf(address, locality).filter { it.isNotBlank() }.distinct().joinToString(" · ")
            val key = "${"%.5f".format(Locale.ROOT, lat)}:${"%.5f".format(Locale.ROOT, lon)}:$address"
            if (!unique.add(key)) continue
            val hasNumber = number.isNotBlank() && number != "0"
            places.add(Place(lat, lon, address, locality, label, street.isNotBlank(), hasNumber))
        }
        // Preferencia por la localidad indicada, sin inventar geocodificaciones.
        return places.sortedWith(compareByDescending<Place> { it.city.equals(city, ignoreCase = true) }).take(8)
    }

    private fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 6371000.0 * 2 * atan2(sqrt(a), sqrt(max(0.0, 1 - a)))
    }

    @Get("/reverse")
    fun reverse(
        @Header(value = "Authorization", defaultValue = "") authorization: String,
        @QueryValue lat: Double,
        @QueryValue lon: Double
    ): Map<String, Any> {
        auth.user(authorization)
        if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0)
            fail(HttpStatus.BAD_REQUEST, "Coordenadas inválidas")
        val cacheKey = "${"%.5f".format(Locale.ROOT, lat)}:${"%.5f".format(Locale.ROOT, lon)}"
        val cached = reverseCache[cacheKey]
        if (cached != null && cached.first > now()) return cached.second
        val url = "https://photon.komoot.io/reverse?lat=$lat&lon=$lon&limit=8&lang=es&radius=1"
        val matches = features(photon(url))
            .map { p -> p to distanceMeters(lat, lon, p.lat, p.lon) }
            .sortedBy { it.second }
        // Do not pass off a distant POI as the street address of the selected pin.
        val best = matches.firstOrNull { (place, meters) -> place.hasStreet && meters <= 90.0 }
        val result: Map<String, Any> = if (best == null) mapOf(
            "found" to false, "message" to "No encontramos una dirección de calle confiable para ese pin. Ingresala manualmente."
        ) else mapOf(
            "found" to true, "address" to best.first.address, "city" to best.first.city,
            "name" to best.first.label,
            "precise" to (best.first.hasNumber && best.second <= 25.0),
            "distanceMeters" to best.second.toInt()
        )
        if (reverseCache.size > 1000) reverseCache.clear()
        reverseCache[cacheKey] = Pair(now() + cacheTtlMillis, result)
        return result
    }
}
