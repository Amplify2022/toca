package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import io.micronaut.scheduling.annotation.Scheduled
import jakarta.inject.Singleton
import org.slf4j.LoggerFactory
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets.UTF_8
import java.security.SecureRandom
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal class InstagramTokenCipher(key: String, private val credentialId: String) {
    private val secret = SecretKeySpec(Base64.getDecoder().decode(key).also { require(it.size == 32) }, "AES")

    private fun cipher(mode: Int, nonce: ByteArray) = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(mode, secret, GCMParameterSpec(128, nonce))
        updateAAD(credentialId.toByteArray(UTF_8))
    }

    fun seal(token: String): String {
        val nonce = ByteArray(12).also(SecureRandom()::nextBytes)
        return Base64.getEncoder().encodeToString(nonce + cipher(Cipher.ENCRYPT_MODE, nonce).doFinal(token.toByteArray(UTF_8)))
    }

    fun open(value: String): String {
        val bytes = Base64.getDecoder().decode(value)
        require(bytes.size > 28)
        val nonce = bytes.copyOfRange(0, 12)
        return String(cipher(Cipher.DECRYPT_MODE, nonce).doFinal(bytes, 12, bytes.size - 12), UTF_8)
    }
}

internal class InstagramTokenExchange(val token: String, val expiresIn: Long)

internal fun instagramTokenExchange(response: JsonNode): InstagramTokenExchange {
    val token = response.path("access_token").asText("")
    val expiresIn = response.path("expires_in").asLong(0)
    require(token.isNotBlank() && expiresIn in 1..Duration.ofDays(61).seconds)
    return InstagramTokenExchange(token, expiresIn)
}

@Singleton
class InstagramDiscovery(
    private val db: Db,
    private val json: ObjectMapper,
    @Value("\${INSTAGRAM_DISCOVERY_TOKEN:}") private val initialToken: String,
    @Value("\${INSTAGRAM_DISCOVERY_ACCOUNT_ID:}") private val accountId: String,
    @Value("\${META_GRAPH_VERSION:v23.0}") private val graphVersion: String,
    @Value("\${INSTAGRAM_DISCOVERY_AUTO_RENEW:false}") private val autoRenew: Boolean,
    @Value("\${INSTAGRAM_DISCOVERY_META_APP_ID:}") private val appId: String,
    @Value("\${INSTAGRAM_DISCOVERY_META_APP_SECRET:}") private val appSecret: String,
    @Value("\${INSTAGRAM_DISCOVERY_TOKEN_KEY:}") private val encryptionKey: String,
    @Value("\${INSTAGRAM_DISCOVERY_CHECK_PROFILE:}") private val checkProfile: String
) {
    private val log = LoggerFactory.getLogger(InstagramDiscovery::class.java)
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val graphBase = "https://graph.facebook.com/$graphVersion"
    private val credentialId = hashToken("$appId:$accountId:${hashToken(initialToken)}")
    private val cipher by lazy { InstagramTokenCipher(encryptionKey, credentialId) }
    val configured = initialToken.isNotBlank() && accountId.matches(Regex("[0-9]+")) &&
        graphVersion.matches(Regex("v[0-9]+\\.[0-9]+"))

    private fun encode(value: String) = URLEncoder.encode(value, UTF_8)

    private fun read(request: HttpRequest): JsonNode {
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        check(response.statusCode() in 200..299)
        return json.readTree(response.body())
    }

    private fun lookup(handle: String, token: String): JsonNode {
        val fields = encode("business_discovery.username($handle){name,username,biography,website}")
        val request = HttpRequest.newBuilder(URI("$graphBase/$accountId?fields=$fields"))
            .timeout(Duration.ofSeconds(12)).header("Authorization", "Bearer $token").GET().build()
        return read(request).path("business_discovery")
    }

    fun profile(handle: String): JsonNode {
        if (!configured) fail(HttpStatus.PRECONDITION_FAILED,
            "La importación de Instagram aún no está configurada. Podés completar el formulario manualmente.")
        return try {
            val stored = if (autoRenew) db.one(
                "SELECT token_ciphertext FROM instagram_discovery_credential WHERE credential_id=?", credentialId
            )?.get("token_ciphertext") as? String else null
            lookup(handle, stored?.let(cipher::open) ?: initialToken)
        } catch (_: Exception) {
            fail(HttpStatus.BAD_GATEWAY,
                "No se pudo consultar el perfil de Instagram. Revisá el acceso de la integración y el nombre del local.")
        }
    }

    @Scheduled(initialDelay = "30s", fixedDelay = "1h")
    fun renew() {
        if (!autoRenew) return
        if (!configured || !appId.matches(Regex("[0-9]+")) || appSecret.isBlank() ||
            encryptionKey.isBlank() || checkProfile.isBlank()
        ) {
            log.warn("La renovación automática de Instagram tiene configuración incompleta.")
            return
        }
        val lease = UUID.randomUUID()
        var stage = "preparar la renovación"
        try {
            val handle = VenueImportData.instagramHandle(checkProfile)
            val crypto = cipher
            db.exec("""INSERT INTO instagram_discovery_credential(credential_id) VALUES (?)
                ON CONFLICT (credential_id) DO NOTHING""", credentialId)
            // Reserve an attempt before contacting Meta. No transaction stays open across HTTP calls.
            val row = db.one("""UPDATE instagram_discovery_credential
                SET lease_id=?, next_attempt_at=now()+interval '6 hours'
                WHERE credential_id=? AND next_attempt_at<=now()
                  AND (expires_at IS NULL OR expires_at<=now()+interval '14 days')
                RETURNING token_ciphertext""", lease, credentialId) ?: return
            val currentToken = (row["token_ciphertext"] as? String)?.let(crypto::open) ?: initialToken
            stage = "renovar el token en Meta"
            val params = mapOf(
                "grant_type" to "fb_exchange_token",
                "client_id" to appId,
                "client_secret" to appSecret,
                "fb_exchange_token" to currentToken,
                "set_token_expires_in_60_days" to "true"
            ).entries.joinToString("&") { (key, value) -> "$key=${encode(value)}" }
            val exchangedAt = OffsetDateTime.now(ZoneOffset.UTC)
            val renewed = instagramTokenExchange(read(HttpRequest.newBuilder(URI("$graphBase/oauth/access_token?$params"))
                .timeout(Duration.ofSeconds(12)).GET().build()))
            stage = "verificar Business Discovery con el token nuevo"
            val verified = lookup(handle, renewed.token)
            check(verified.path("username").asText("").equals(handle, ignoreCase = true))
            stage = "guardar el token validado"
            val updated = db.exec("""UPDATE instagram_discovery_credential
                SET token_ciphertext=?, expires_at=?, lease_id=NULL
                WHERE credential_id=? AND lease_id=?""",
                crypto.seal(renewed.token), exchangedAt.plusSeconds(renewed.expiresIn), credentialId, lease)
            if (updated == 1) log.info("Token de Instagram renovado y verificado; vence el {}.", exchangedAt.plusSeconds(renewed.expiresIn))
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (_: Exception) {
            // Exceptions from the HTTP client can contain a URL with credentials.
            log.warn("No se pudo {} para Instagram; se conserva el token anterior.", stage)
        }
    }
}
