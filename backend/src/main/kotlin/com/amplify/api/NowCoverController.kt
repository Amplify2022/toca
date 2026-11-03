package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.text.Normalizer
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Resuelve el ID exacto de la reproducción actual cuando el API público solo trae título/artista.
 *  La respuesta no contiene credenciales ni permite modificar Spotify.
 *  Reutiliza el cliente Spotify ya autenticado del bar. Caché breve por bar para evitar abusos.
 */
@Controller("/api")
@ExecuteOn(TaskExecutors.BLOCKING)
class NowCoverController(private val db: Db, private val spotify: Spotify) {
    private data class Cached(val at: Long, val data: Map<String, Any?>)
    private val cache = ConcurrentHashMap<UUID, Cached>()
    private val trackIdPattern = Regex("[A-Za-z0-9]{22}")
    private fun normalized(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKD)
        .replace(Regex("\\p{M}+"), "").lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9]+"), " ").trim()

    @Get("/venues/{id}/now-cover")
    @Synchronized
    fun current(id: String): Map<String, Any?> {
        val uuid = safeUuid(id)
        val venue = db.one("SELECT active, spotify_premium FROM venue WHERE id=?", uuid)
            ?: fail(HttpStatus.NOT_FOUND, "Bar no encontrado")
        if(venue["active"] != true || venue["spotify_premium"] != true)
            return mapOf("title" to "", "artist" to "", "trackId" to "")
        val stored = cache[uuid]
        if(stored != null && System.currentTimeMillis()-stored.at < 30000L) return stored.data
        val now = spotify.nowPlaying(uuid)
        val title = now?.get("title")?.toString()?.trim().orEmpty()
        val artist = now?.get("artist")?.toString()?.trim().orEmpty()
        var idValue = now?.get("trackId")?.toString().orEmpty()
        if(!trackIdPattern.matches(idValue))idValue = now?.get("id")?.toString().orEmpty()
        if(!trackIdPattern.matches(idValue) && title.isNotBlank() && artist.isNotBlank()) {
            // No aceptar una portada de una grabación distinta si existen coincidencias ambiguas.
            val found = try { spotify.search(uuid, "$title $artist") } catch (_: Exception) { emptyList() }
            val matches = found.filter { track ->
                normalized(track["title"]?.toString().orEmpty()) == normalized(title) &&
                normalized(track["artist"]?.toString().orEmpty()) == normalized(artist)
            }.mapNotNull { it["id"]?.toString() }
                .filter {trackIdPattern.matches(it)}.distinct()
            idValue = matches.singleOrNull().orEmpty()
        }
        val response = mapOf<String, Any?>("title" to title, "artist" to artist,
            "trackId" to if(trackIdPattern.matches(idValue)) idValue else "")
        cache[uuid] = Cached(System.currentTimeMillis(), response)
        return response
    }
}
