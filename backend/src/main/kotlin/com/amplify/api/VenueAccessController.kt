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
    private val presence: VenuePresence
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
        db.exec("UPDATE venue SET request_access_mode=?,updated_at=now() WHERE id=?",mode,safeUuid(id))
        return presence.policy(safeUuid(id))
    }
}
