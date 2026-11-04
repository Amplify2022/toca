package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn

@Controller("/api")
@ExecuteOn(TaskExecutors.BLOCKING)
class VenueAccessController(
    private val db: Db,
    private val auth: Auth,
    private val customerAuth: CustomerAuth,
    private val presence: VenuePresence,
    private val requestCommands: RequestCommands
) {
    @Get("/venues/{id}/request-access")
    fun publicPolicy(id: String): Map<String, Any?> = presence.policy(safeUuid(id))

    @Get("/venues/{id}/presence")
    fun currentPresence(id: String,
        @Header(value="X-TOCA-Customer",defaultValue="") customerAuthorization: String
    ): Map<String, Any?> {
        val customerId = customerAuth.user(customerAuthorization)["id"] as java.util.UUID
        return presence.status(safeUuid(id),customerId)
    }

    @Post("/venues/{id}/presence")
    fun checkIn(id: String,
        @Header(value="X-TOCA-Customer",defaultValue="") customerAuthorization: String,
        @Body body: Map<String, Any?>
    ): Map<String, Any?> {
        val customerId = customerAuth.user(customerAuthorization)["id"] as java.util.UUID
        return presence.checkIn(safeUuid(id),customerId,body)
    }

    @Put("/admin/venues/{id}/request-access")
    fun updatePolicy(id: String,
        @Header(value="Authorization",defaultValue="") authorization: String,
        @Body body: Map<String, Any?>
    ): Map<String, Any?> {
        auth.ownVenue(id,authorization) // owner + VENUE_ADMIN grant required
        val mode = required(body,"mode",12)
        if (mode !in setOf("NEARBY","ANYWHERE"))
            fail(HttpStatus.BAD_REQUEST,"Modo de acceso inválido")
        val venueId = safeUuid(id)
        return db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",venueId)
                ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            // Share the request admission/mutation protocol so an in-flight
            // command cannot synchronize against an authorization policy that
            // the owner changed after it was admitted.
            requestCommands.requireMutable(venueId)
            db.exec("""DELETE FROM venue_customer_presence WHERE venue_id=? AND EXISTS
                (SELECT 1 FROM venue WHERE id=? AND request_access_mode<>?)""",venueId,venueId,mode)
            db.exec("UPDATE venue SET request_access_mode=?,updated_at=now() WHERE id=?",mode,venueId)
            presence.policy(venueId)
        }
    }
}
