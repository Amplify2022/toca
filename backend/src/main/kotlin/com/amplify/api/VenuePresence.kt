package com.amplify.api

import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.util.UUID
import kotlin.math.*

@Singleton
class VenuePresence(private val db: Db) {
    companion object {
        const val RADIUS_METERS = 100.0
        // An imprecise position cannot establish presence within 100 m.
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
        return mapOf("mode" to v["request_access_mode"],"radiusMeters" to RADIUS_METERS.toInt())
    }

    fun status(venueId: UUID, customerId: UUID): Map<String, Any?> {
        val v = venue(venueId)
        val mode = v["request_access_mode"]?.toString() ?: "NEARBY"
        val active = mode == "ANYWHERE" || db.one("""SELECT 1 FROM venue_customer_presence
            WHERE venue_id=? AND customer_id=? AND expires_at>now()""", venueId,customerId)!=null
        return mapOf("mode" to mode,"allowed" to active,"radiusMeters" to RADIUS_METERS.toInt())
    }

    fun checkIn(venueId: UUID, customerId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val v = venue(venueId)
        if (v["request_access_mode"]?.toString() == "ANYWHERE") return status(venueId,customerId)
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
            (v["latitude"] as Number).toDouble(),(v["longitude"] as Number).toDouble())
        if (distance > RADIUS_METERS)
            fail(HttpStatus.FORBIDDEN,"Tenés que estar dentro de los 100 metros del bar para pedir canciones")
        db.exec("""INSERT INTO venue_customer_presence(venue_id,customer_id,expires_at,verified_at)
            VALUES(?,?,now() + interval '20 minutes',now())
            ON CONFLICT (venue_id,customer_id) DO UPDATE
                SET expires_at=EXCLUDED.expires_at,verified_at=now()""", venueId,customerId)
        return status(venueId,customerId)
    }

    fun requireAllowed(venueId: UUID, customerId: UUID) {
        if (status(venueId,customerId)["allowed"] != true)
            fail(HttpStatus.FORBIDDEN,"Necesitás verificar tu ubicación dentro de los 100 metros del bar")
    }
}
