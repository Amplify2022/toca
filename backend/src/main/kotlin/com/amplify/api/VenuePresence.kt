package com.amplify.api

import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.util.UUID
import kotlin.math.*

@Singleton
class VenuePresence(private val db: Db) {
    companion object {
        const val RADIUS_METERS = 100.0
        // Browser location supplies the distance check; QR is not an access requirement.
        const val MAX_ACCURACY_METERS = 100.0
        const val CHECK_IN_MINUTES = 20

        fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val dLat = Math.toRadians(lat2-lat1)
            val dLon = Math.toRadians(lon2-lon1)
            val a = sin(dLat/2).pow(2.0) + cos(Math.toRadians(lat1)) *
                cos(Math.toRadians(lat2)) * sin(dLon/2).pow(2.0)
            return 6371000.0 * 2.0 * atan2(sqrt(a.coerceIn(0.0,1.0)),sqrt((1.0-a).coerceIn(0.0,1.0)))
        }
    }

    private fun venue(venueId: UUID) = db.one(
        "SELECT latitude,longitude,request_access_mode FROM venue WHERE id=?", venueId
    ) ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")

    fun policy(venueId: UUID): Map<String, Any?> {
        val v = venue(venueId)
        return metadata(v["request_access_mode"]?.toString() ?: "NEARBY")
    }

    fun status(venueId: UUID, customerId: UUID): Map<String, Any?> {
        val row = db.one("""SELECT v.request_access_mode,(p.expires_at>now()
            AND p.verified_at>=COALESCE(v.queue_started_at,'epoch'::timestamptz)) AS presence_current
            FROM venue v LEFT JOIN venue_customer_presence p
                ON p.venue_id=v.id AND p.customer_id=? WHERE v.id=?""",customerId,venueId)
            ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        val mode=row["request_access_mode"]?.toString()?:"NEARBY"
        val allowed=mode=="ANYWHERE" || row["presence_current"]==true
        return metadata(mode) + mapOf("allowed" to allowed)
    }

    private fun metadata(mode: String): Map<String, Any?> = mapOf(
        "mode" to mode,"radiusMeters" to RADIUS_METERS.toInt(),
        "requiresQr" to false,"locationProof" to false,
        "checkInMinutes" to CHECK_IN_MINUTES
    )

    fun checkIn(venueId: UUID, customerId: UUID, body: Map<String, Any?>): Map<String, Any?> = db.transaction { connection ->
        // Serialize distance checks with changes to the venue policy/session.
        val v = connection.prepareStatement("""SELECT latitude,longitude,request_access_mode
            FROM venue WHERE id=? FOR UPDATE""").use { statement ->
            statement.setObject(1,venueId)
            statement.executeQuery().use { rs ->
                if (!rs.next()) fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
                mapOf("latitude" to rs.getDouble("latitude"),"longitude" to rs.getDouble("longitude"),
                    "mode" to rs.getString("request_access_mode"))
            }
        }
        if (v["mode"] == "ANYWHERE") return@transaction status(venueId,customerId)
        val lat = (body["latitude"] as? Number)?.toDouble()
            ?: fail(HttpStatus.BAD_REQUEST,"Latitud requerida")
        val lon = (body["longitude"] as? Number)?.toDouble()
            ?: fail(HttpStatus.BAD_REQUEST,"Longitud requerida")
        val accuracy = (body["accuracy"] as? Number)?.toDouble()
            ?: fail(HttpStatus.BAD_REQUEST,"Precisión GPS requerida")
        if (!lat.isFinite() || !lon.isFinite() || lat !in -90.0..90.0 || lon !in -180.0..180.0 ||
            !accuracy.isFinite() || accuracy < 0.0 || accuracy > MAX_ACCURACY_METERS)
            fail(HttpStatus.FORBIDDEN,"Ubicación insuficientemente precisa. Activá ubicación precisa e intentá nuevamente")
        val distance = distanceMeters(lat,lon,
            v["latitude"] as Double,v["longitude"] as Double)
        if (distance > RADIUS_METERS)
            fail(HttpStatus.FORBIDDEN,"Tenés que estar dentro de los 100 metros del bar para pedir canciones")
        db.exec("""INSERT INTO venue_customer_presence(venue_id,customer_id,expires_at,verified_at,qr_token_hash)
            VALUES(?,?,now() + interval '20 minutes',now(),NULL)
            ON CONFLICT (venue_id,customer_id) DO UPDATE
                SET expires_at=EXCLUDED.expires_at,verified_at=now(),qr_token_hash=EXCLUDED.qr_token_hash""",
            venueId,customerId)
        status(venueId,customerId)
    }

    fun requireAllowed(venueId: UUID, customerId: UUID) {
        if (status(venueId,customerId)["allowed"] != true)
            fail(HttpStatus.FORBIDDEN,"Compartí tu ubicación dentro de los 100 metros del bar para pedir canciones")
    }
}
