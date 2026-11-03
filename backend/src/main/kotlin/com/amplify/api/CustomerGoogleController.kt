package com.amplify.api

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.io.IOException
import java.security.GeneralSecurityException
import java.sql.SQLException
import java.util.Locale
import java.util.UUID

/** Web Google Identity Services login is for CUSTOMER identities only.
 * Existing bar admins are never created or authorized by this endpoint.
 * Google's cryptographically verified `sub` is the unique federated identifier.
 */
@Singleton
class CustomerGoogleAuth(
    private val db: Db,
    private val customerAuth: CustomerAuth,
    @Value("\${GOOGLE_CLIENT_ID:}") private val clientId: String,
) {
    // Reuse the verifier; it caches Google's periodically rotating public keys.
    private val verifier: GoogleIdTokenVerifier? by lazy {
        if (clientId.isBlank()) null else GoogleIdTokenVerifier.Builder(
            NetHttpTransport(), GsonFactory.getDefaultInstance()
        ).setAudience(listOf(clientId)).build()
    }

    fun config(): Map<String, Any> = mapOf("enabled" to clientId.isNotBlank(), "clientId" to clientId)

    private data class Identity(val subject: String, val email: String, val name: String)

    private fun identity(data: Map<String, Any?>): Identity {
        val googleVerifier = verifier ?: fail(HttpStatus.SERVICE_UNAVAILABLE, "Login con Google no configurado")
        val credential = required(data, "credential", 8192)
        // No unsigned parsing or tokeninfo lookups: verify signature, issuer, audience and expiry.
        val token: GoogleIdToken = try {
            googleVerifier.verify(credential)
        } catch (_: GeneralSecurityException) {
            fail(HttpStatus.UNAUTHORIZED, "No se pudo verificar tu cuenta de Google")
        } catch (_: IOException) {
            fail(HttpStatus.SERVICE_UNAVAILABLE, "Google no está disponible. Reintentá más tarde")
        } catch (_: IllegalArgumentException) {
            fail(HttpStatus.UNAUTHORIZED, "Credencial de Google inválida")
        } ?: fail(HttpStatus.UNAUTHORIZED, "Credencial de Google inválida o vencida")
        val payload = token.payload
        val sub = payload.subject?.trim().orEmpty()
        val email = payload.email?.trim()?.lowercase(Locale.ROOT).orEmpty()
        if (payload.emailVerified != true || sub.length !in 1..255 ||
            email.length !in 3..200 || !email.contains('@')) {
            fail(HttpStatus.UNAUTHORIZED, "Google no confirmó un correo válido")
        }
        val claimedName = (payload["name"] as? String)?.trim().orEmpty()
        val name = claimedName.take(120).takeIf { it.length >= 2 } ?: "Usuario TOCÁ"
        return Identity(sub, email, name)
    }

    fun login(data: Map<String, Any?>): Map<String, Any?> {
        val google = identity(data)
        var customer = db.one(
            "SELECT id,name,email FROM customer_account WHERE google_sub=?", google.subject
        )
        if (customer == null) {
            // Never silently bind an existing password identity by matching an email.
            // Ownership of a mailbox is not proof of ownership of the local account.
            if (db.one("SELECT id FROM customer_account WHERE email=?", google.email) != null) {
                fail(HttpStatus.CONFLICT,
                    "Ese correo ya tiene una cuenta. Iniciá sesión con contraseña y vinculá Google desde tu perfil.")
            }
            try {
                db.exec("""INSERT INTO customer_account(id,name,email,password_hash,google_sub)
                          VALUES(?,?,?,NULL,?)""", UUID.randomUUID(), google.name, google.email, google.subject)
            } catch (error: SQLException) {
                if (error.sqlState != "23505") throw error
                // Can race against a simultaneous Google registration; resolve by sub only.
            }
            customer = db.one("SELECT id,name,email FROM customer_account WHERE google_sub=?", google.subject)
                ?: fail(HttpStatus.CONFLICT, "Ese correo ya pertenece a otra cuenta")
        }
        return customerAuth.issueGoogle(customer)
    }

    fun link(authorization: String, data: Map<String, Any?>): Map<String, Boolean> {
        val user = customerAuth.user(authorization)  // verified local customer session, NOT admin
        val google = identity(data)
        if ((user["email"] as String).lowercase(Locale.ROOT) != google.email)
            fail(HttpStatus.CONFLICT, "El correo de Google debe coincidir con el de tu cuenta TOCÁ")
        try {
            val updated = db.exec("""UPDATE customer_account SET google_sub=?
                WHERE id=? AND (google_sub IS NULL OR google_sub=?)""",
                google.subject, user["id"], google.subject)
            if (updated != 1) fail(HttpStatus.CONFLICT, "La cuenta ya está vinculada con otro Google")
        } catch (error: SQLException) {
            if (error.sqlState == "23505")
                fail(HttpStatus.CONFLICT, "Esta cuenta de Google ya está vinculada a otro usuario")
            throw error
        }
        return mapOf("linked" to true)
    }
}

@Controller("/api/customers")
@ExecuteOn(TaskExecutors.BLOCKING)
class CustomerGoogleController(private val google: CustomerGoogleAuth) {
    @Get("/google/config") fun config() = google.config()
    @Post("/google") fun login(@Body body: Map<String, Any?>) = google.login(body)
    @Post("/me/google/link") fun link(
        @Header(value="Authorization", defaultValue="") authorization: String,
        @Body body: Map<String, Any?>,
    ) = google.link(authorization, body)
}
