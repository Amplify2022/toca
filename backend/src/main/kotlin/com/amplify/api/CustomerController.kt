package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import org.mindrot.jbcrypt.BCrypt
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.sql.SQLException
import java.sql.Timestamp
import java.time.Instant
import java.util.Locale
import java.util.UUID

/** Customer identities are deliberately isolated from the bar admin login. */
@Singleton
class CustomerAuth(private val db: Db,private val roles:RolePolicy) {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    private fun normalizedEmail(raw: String): String = raw.trim().lowercase(Locale.ROOT)
    private fun credentials(body: Map<String, Any?>): Pair<String, String> {
        val email = normalizedEmail(required(body, "email", 200))
        val password = required(body, "password", 128)
        if (!emailPattern.matches(email)) fail(HttpStatus.BAD_REQUEST, "Correo electrónico inválido")
        return email to password
    }
    private fun passwordPolicy(password: String) {
        if (password.length < 10 || password.toByteArray(StandardCharsets.UTF_8).size > 72) {
            fail(HttpStatus.BAD_REQUEST, "La contraseña debe tener entre 10 y 72 bytes")
        }
    }
    private fun publicUser(row: Map<String, Any?>): Map<String, String> = mapOf(
        "id" to row.getValue("id").toString(),
        "name" to row.getValue("name").toString(),
        "email" to row.getValue("email").toString()
    )
    private fun issue(user: Map<String, Any?>): Map<String, Any?> {
        val token = randomString(48)
        db.exec("""INSERT INTO customer_session(id, customer_id, token_hash, expires_at)
                   VALUES(?,?,?,?)""",
            UUID.randomUUID(), user.getValue("id"), hashToken(token),
            Timestamp.from(Instant.now().plusSeconds(7 * 24 * 60 * 60L)))
        return mapOf("token" to token, "user" to publicUser(user))
    }

    /** Issue the usual TOCÁ customer session after a verified Google ID token. */
    fun issueGoogle(user: Map<String, Any?>): Map<String, Any?> = issue(user)

    fun register(body: Map<String, Any?>): Map<String, Any?> {
        val (email, password) = credentials(body)
        passwordPolicy(password)
        val name = required(body, "name", 120)
        if (name.length < 2) fail(HttpStatus.BAD_REQUEST, "El nombre debe tener al menos 2 caracteres")
        if (db.one("SELECT id FROM customer_account WHERE email=?", email) != null)
            fail(HttpStatus.CONFLICT, "Ya existe una cuenta con ese correo")
        val id = UUID.randomUUID()
        try {
            db.exec("INSERT INTO customer_account(id,name,email,password_hash) VALUES(?,?,?,?)",
                id, name, email, BCrypt.hashpw(password, BCrypt.gensalt(12)))
        } catch (ex: SQLException) {
            if (ex.sqlState == "23505") fail(HttpStatus.CONFLICT, "Ya existe una cuenta con ese correo")
            throw ex
        }
        roles.grantCustomer(id)
        return issue(mapOf("id" to id, "name" to name, "email" to email))
    }

    fun login(body: Map<String, Any?>): Map<String, Any?> {
        val (email, password) = credentials(body)
        // HTTP admission is handled by AuthRateLimitFilter using network peer
        // plus principal. Failed attempts from another IP never lock this email.
        val user = db.one("SELECT id,name,email,password_hash FROM customer_account WHERE email=?", email)
        val ok = user != null && (user["password_hash"] as? String)?.let { BCrypt.checkpw(password, it) } == true
        if (!ok) {
            fail(HttpStatus.UNAUTHORIZED, "Correo o contraseña incorrectos")
        }
        return issue(user!!)
    }

    fun user(authorization: String): Map<String, Any?> {
        if (!authorization.startsWith("Bearer ")) fail(HttpStatus.UNAUTHORIZED, "Iniciá sesión como cliente")
        val token = authorization.removePrefix("Bearer ").trim()
        if (token.length < 40 || token.length > 180) fail(HttpStatus.UNAUTHORIZED, "Sesión inválida")
        val principal=db.one("""SELECT u.id,u.name,u.email FROM customer_session s
            JOIN customer_account u ON u.id=s.customer_id
            WHERE s.token_hash=? AND s.expires_at>now()""", hashToken(token))
            ?: fail(HttpStatus.UNAUTHORIZED, "Sesión de cliente vencida")
        val id=principal["id"] as UUID
        roles.requireCustomer(id)
        return principal + mapOf("roles" to roles.forCustomer(id))
    }

    fun optionalUserId(customerHeader: String): UUID? =
        if (customerHeader.isBlank()) null else user(customerHeader)["id"] as UUID

    fun logout(authorization: String) {
        user(authorization)
        val token = authorization.removePrefix("Bearer ").trim()
        db.exec("DELETE FROM customer_session WHERE token_hash=?", hashToken(token))
    }
}

@Controller("/api/customers")
@ExecuteOn(TaskExecutors.BLOCKING)
class CustomerController(private val auth: CustomerAuth, private val db: Db) {
    @Post("/register") fun register(@Body data: Map<String, Any?>) = auth.register(data)
    @Post("/login") fun login(@Body data: Map<String, Any?>) = auth.login(data)
    @Get("/me") fun me(@Header(value="Authorization",defaultValue="") authorization: String): Map<String, Any?> =
        auth.user(authorization)
    @Post("/logout") fun logout(@Header(value="Authorization",defaultValue="") authorization: String): Map<String, Boolean> {
        auth.logout(authorization)
        return mapOf("loggedOut" to true)
    }
    @Get("/me/requests") fun history(@Header(value="Authorization",defaultValue="") authorization: String): List<Map<String, Any?>> {
        val customerId = auth.user(authorization)["id"] as UUID
        return db.list("""SELECT e.id, e.track_id AS "trackId", e.created_at AS "createdAt",
            r.title, r.artist, r.status, v.name AS "venueName", e.venue_id AS "venueId"
            FROM song_request_event e
            JOIN song_request r ON r.id=e.request_id
            JOIN venue v ON v.id=e.venue_id
            WHERE e.customer_id=? ORDER BY e.created_at DESC LIMIT 100""", customerId)
    }
}
