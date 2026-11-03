package com.amplify.api

import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.*

@Singleton
class VenuePresence(private val db: Db) {
    companion object {
        const val RADIUS_METERS = 100.0
        // Location is a client claim, not proof of physical presence. NEARBY also
        // requires the current server-issued QR secret distributed by the venue.
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
        "SELECT latitude,longitude,request_access_mode,join_token FROM venue WHERE id=?", venueId
    ) ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")

    fun policy(venueId: UUID): Map<String, Any?> {
        val v = venue(venueId)
        return metadata(v["request_access_mode"]?.toString() ?: "NEARBY")
    }

    fun status(venueId: UUID, customerId: UUID): Map<String, Any?> {
        // A single snapshot checks policy, expiry and token generation together.
        // Rotating a QR immediately invalidates all grants issued with the old QR.
        val row = db.one("""SELECT v.request_access_mode,v.join_token,p.qr_token_hash,
            (p.expires_at>now()) AS presence_current
            FROM venue v LEFT JOIN venue_customer_presence p
                ON p.venue_id=v.id AND p.customer_id=?
            WHERE v.id=?""", customerId,venueId)
            ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        val mode = row["request_access_mode"]?.toString() ?: "NEARBY"
        val currentHash = row["qr_token_hash"] as? String
        val token = row["join_token"] as? String
        val allowed = mode == "ANYWHERE" || (row["presence_current"] == true &&
            currentHash != null && token != null && sameSecret(currentHash,hashToken(token)))
        return metadata(mode) + mapOf("allowed" to allowed)
    }

    private fun metadata(mode: String): Map<String, Any?> = mapOf(
        "mode" to mode,"radiusMeters" to RADIUS_METERS.toInt(),
        "requiresQr" to (mode != "ANYWHERE"),"locationProof" to false,
        "checkInMinutes" to CHECK_IN_MINUTES
    )

    private fun sameSecret(provided: String, expected: String): Boolean =
        provided.isNotEmpty() && provided.length <= 100 && expected.isNotEmpty() &&
            MessageDigest.isEqual(provided.toByteArray(Charsets.UTF_8),expected.toByteArray(Charsets.UTF_8))

    fun checkIn(venueId: UUID, customerId: UUID, body: Map<String, Any?>,
                qrToken: String = ""): Map<String, Any?> = db.transaction { connection ->
        // Coordinate with QR rotation and policy/session updates. GPS alone must
        // never create a grant, including for accounts with a pre-upgrade grant.
        val v = connection.prepareStatement("""SELECT latitude,longitude,request_access_mode,join_token
            FROM venue WHERE id=? FOR UPDATE""").use { statement ->
            statement.setObject(1,venueId)
            statement.executeQuery().use { rs ->
                if (!rs.next()) fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
                mapOf("latitude" to rs.getDouble("latitude"),"longitude" to rs.getDouble("longitude"),
                    "mode" to rs.getString("request_access_mode"),"token" to rs.getString("join_token"))
            }
        }
        if (v["mode"] == "ANYWHERE") return@transaction status(venueId,customerId)
        val token = if (qrToken.isNotBlank()) qrToken else (body["joinToken"] as? String).orEmpty()
        if (!sameSecret(token,v["token"] as String))
            fail(HttpStatus.FORBIDDEN,"Escaneá el QR vigente del bar para habilitar tus pedidos")
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
            VALUES(?,?,now() + interval '20 minutes',now(),?)
            ON CONFLICT (venue_id,customer_id) DO UPDATE
                SET expires_at=EXCLUDED.expires_at,verified_at=now(),qr_token_hash=EXCLUDED.qr_token_hash""",
            venueId,customerId,hashToken(token))
        status(venueId,customerId)
    }

    fun requireAllowed(venueId: UUID, customerId: UUID) {
        if (status(venueId,customerId)["allowed"] != true)
            fail(HttpStatus.FORBIDDEN,"Escaneá el QR vigente y habilitá el acceso al bar antes de pedir canciones")
    }
}
