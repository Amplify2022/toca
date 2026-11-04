package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.util.Base64
import java.util.UUID

/** A small private JPEG avatar is stored against the authenticated customer.
 *  No customer may access another account's avatar through this API.
 */
@Controller("/api/customers/me/avatar")
@ExecuteOn(TaskExecutors.BLOCKING)
class CustomerAvatarController(private val auth: CustomerAuth, private val db: Db) {
    companion object {
        private const val PREFIX = "data:image/jpeg;base64,"
        private const val MAX_IMAGE_BYTES = 160 * 1024
        private const val MAX_BODY_CHARS = 220_000
    }

    private fun customerId(authorization: String): UUID = auth.user(authorization)["id"] as UUID

    @Get
    fun get(@Header(value = "Authorization", defaultValue = "") authorization: String): Map<String, String?> {
        val id = customerId(authorization)
        val row = db.one("SELECT avatar_image FROM customer_account WHERE id=?", id)
            ?: fail(HttpStatus.NOT_FOUND, "Cuenta no encontrada")
        val bytes = row["avatar_image"] as? ByteArray
        return mapOf("avatar" to bytes?.let { PREFIX + Base64.getEncoder().encodeToString(it) })
    }

    @Put
    fun put(@Header(value = "Authorization", defaultValue = "") authorization: String,
            @Body payload: Map<String, Any?>): Map<String, Boolean> {
        val id = customerId(authorization)
        val raw = payload["image"] as? String
            ?: fail(HttpStatus.BAD_REQUEST, "Seleccioná una imagen JPG válida")
        if (!raw.startsWith(PREFIX) || raw.length > MAX_BODY_CHARS)
            fail(HttpStatus.BAD_REQUEST, "Solo se aceptan fotos JPG de hasta 160 KB")
        val bytes = try { Base64.getDecoder().decode(raw.substring(PREFIX.length)) }
                    catch (_: IllegalArgumentException) { fail(HttpStatus.BAD_REQUEST, "Imagen inválida") }
        // Minimum size and genuine JPEG SOI/EOI markers. Do not accept SVG/HTML.
        if (bytes.size !in 100..MAX_IMAGE_BYTES ||
            bytes[0] != 0xFF.toByte() || bytes[1] != 0xD8.toByte() || bytes[2] != 0xFF.toByte() ||
            bytes[bytes.size - 2] != 0xFF.toByte() || bytes[bytes.size - 1] != 0xD9.toByte())
            fail(HttpStatus.BAD_REQUEST, "La foto debe ser un JPG válido de hasta 160 KB")
        db.exec("UPDATE customer_account SET avatar_image=?, avatar_content_type=? WHERE id=?",
            ImageValidation.normalize(bytes,"image/jpeg",MAX_IMAGE_BYTES), "image/jpeg", id)
        return mapOf("saved" to true)
    }

    @Delete
    fun delete(@Header(value = "Authorization", defaultValue = "") authorization: String): Map<String, Boolean> {
        val id = customerId(authorization)
        db.exec("UPDATE customer_account SET avatar_image=NULL, avatar_content_type=NULL WHERE id=?", id)
        return mapOf("deleted" to true)
    }
}
