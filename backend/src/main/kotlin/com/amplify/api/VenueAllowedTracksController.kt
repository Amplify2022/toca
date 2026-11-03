package com.amplify.api

import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get

/**
 * Public, read-only list of songs the bar explicitly allows when whitelist mode
 * is enabled. Does not return private rules, OAuth tokens, or admin data.
 * Actual request authorization remains in ApiController (customer session,
 * location policy, blacklist and whitelist checks).
 */
@Controller("/api")
class VenueAllowedTracksController(private val db: Db) {
    @Get("/venues/{id}/allowed-tracks")
    fun allowedTracks(id: String): List<Map<String, Any?>> {
        val venueId = safeUuid(id)
        val venue = db.one("SELECT curated_only FROM venue WHERE id=?", venueId)
            ?: fail(io.micronaut.http.HttpStatus.NOT_FOUND, "Bar no encontrado")
        if (venue["curated_only"] != true) return emptyList()

        return db.list(
            """SELECT allow_rule.track_id AS id,
                      COALESCE(allow_rule.title, '') AS title,
                      COALESCE(allow_rule.artist, '') AS artist
               FROM venue_track_rule allow_rule
               WHERE allow_rule.venue_id=? AND allow_rule.mode='ALLOW'
                 AND NOT EXISTS (
                   SELECT 1 FROM venue_track_rule blocked
                   WHERE blocked.venue_id=allow_rule.venue_id
                     AND blocked.track_id=allow_rule.track_id
                     AND blocked.mode='BLOCK'
                 )
               ORDER BY LOWER(allow_rule.title), LOWER(allow_rule.artist), allow_rule.track_id""",
            venueId
        )
    }
}
