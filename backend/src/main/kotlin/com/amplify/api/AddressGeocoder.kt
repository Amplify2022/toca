package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * Search is performed by the authenticated Micronaut backend to avoid browser
 * CORS restrictions. Photon is a best-effort public demo, not a production SLA.
 */
@Singleton
class AddressGeocoder(private val mapper: ObjectMapper) {
    @io.micronaut.scheduling.annotation.Scheduled(fixedDelay="1h",initialDelay="1h")
    fun expireCache(){cache.clear()}

    private val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
    private val cache = ConcurrentHashMap<String, List<Map<String, Any>>>()
    private val nominatimLock = Any()
    private var lastNominatimRequestAt = 0L
    private fun enc(s: String) = URLEncoder.encode(s, StandardCharsets.UTF_8)

    fun search(address: String, city: String): List<Map<String, Any>> {
        val street = address.trim()
        val town = city.trim()
        if (street.length !in 4..240 || town.length !in 2..120)
            fail(HttpStatus.BAD_REQUEST,"Indicá una dirección y ciudad válidas")
        val key = "$street|$town".lowercase()
        cache[key]?.let { return it }
        val queries = listOf(
            "${street}, ${town}, Uruguay",
            "${street} ${town}",
            street
        ).distinct()
        var unavailable = false
        for (q in queries) {
            try {
                val url = "https://photon.komoot.io/api/?q=${enc(q)}&limit=8&lang=es&countrycode=UY"
                val request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(9))
                    .header("Accept", "application/json")
                    .header("User-Agent", "TOCA-local-development/1.6")
                    .GET().build()
                val response = client.send(request, HttpResponse.BodyHandlers.ofString())
                if (response.statusCode() !in 200..299) {
                    unavailable = true
                    continue
                }
                val found = parseFeatures(mapper.readTree(response.body()))
                if (found.isNotEmpty()) {
                    if(cache.size>=1000)cache.clear()
                    cache[key] = found
                    return found
                }
            } catch (_: Exception) {
                unavailable = true
            }
        }
        // Public Nominatim is used only as an on-demand fallback (never autocomplete),
        // respecting its global 1 request/second policy for this single-container prototype.
        try {
            val found = searchNominatim(street, town)
            if (found.isNotEmpty()) {
                if(cache.size>=1000)cache.clear()
                    cache[key] = found
                return found
            }
            return emptyList()
        } catch (_: Exception) {
            unavailable = true
        }
        if (unavailable) fail(HttpStatus.BAD_GATEWAY,
            "Los servicios de búsqueda no respondieron. Revisá la conexión a Internet de la API o marcá el pin manualmente.")
        return emptyList()
    }

    private fun searchNominatim(street: String, city: String): List<Map<String, Any>> {
        synchronized(nominatimLock) {
            val now = System.currentTimeMillis()
            val remaining = 1100 - (now - lastNominatimRequestAt)
            if (remaining > 0) Thread.sleep(remaining)
            lastNominatimRequestAt = System.currentTimeMillis()
            val q = enc("$street, $city, Uruguay")
            val url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=uy&q=$q"
            val request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(9))
                .header("Accept", "application/json")
                .header("User-Agent", "TOCA-Local-Development/1.6 (interactive bar address lookup)")
                .GET().build()
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() !in 200..299) error("Nominatim HTTP ${response.statusCode()}")
            return parseNominatim(mapper.readTree(response.body()))
        }
    }

    internal fun parseNominatim(json: JsonNode): List<Map<String, Any>> {
        val result = mutableListOf<Map<String, Any>>()
        if (!json.isArray) return result
        for (entry in json) {
            val lat = entry.path("lat").asText("").toDoubleOrNull() ?: continue
            val lon = entry.path("lon").asText("").toDoubleOrNull() ?: continue
            if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0) continue
            result.add(mapOf("lat" to lat, "lon" to lon, "name" to entry.path("display_name").asText("Ubicación encontrada")))
        }
        return result.take(6)
    }

    internal fun parseFeatures(json: JsonNode): List<Map<String, Any>> {
        val found = mutableListOf<Map<String, Any>>()
        val seen = mutableSetOf<String>()
        for (feature in json.path("features")) {
            val point = feature.path("geometry").path("coordinates")
            if (!point.isArray || point.size() < 2) continue
            val lon = point[0].asDouble(Double.NaN)
            val lat = point[1].asDouble(Double.NaN)
            if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0) continue
            val props = feature.path("properties")
            val parts = listOf("name", "street", "housenumber", "city", "state", "country")
                .map { props.path(it).asText("").trim() }.filter(String::isNotBlank)
            val name = parts.distinct().joinToString(", ").ifEmpty { "Ubicación encontrada" }
            val id = "${"%.5f".format(java.util.Locale.ROOT,lat)},${"%.5f".format(java.util.Locale.ROOT,lon)}"
            if (seen.add(id)) found.add(mapOf("lat" to lat,"lon" to lon,"name" to name))
        }
        return found.take(6)
    }
}
