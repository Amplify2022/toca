package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.Base64
import javax.crypto.AEADBadTagException

class InstagramDiscoveryTest {
    private val json = ObjectMapper()
    private val key = Base64.getEncoder().encodeToString(ByteArray(32) { it.toByte() })

    @Test fun `system token exchange requires a token with a usable expiry`() {
        val exchange = instagramTokenExchange(json.readTree("""{"access_token":"synthetic-token","expires_in":5183944}"""))
        assertEquals("synthetic-token", exchange.token)
        assertEquals(5183944L, exchange.expiresIn)
        for (response in listOf(
            """{"access_token":"synthetic-token"}""",
            """{"expires_in":5183944}""",
            """{"access_token":"synthetic-token","expires_in":0}""",
            """{"access_token":"synthetic-token","expires_in":${Duration.ofDays(90).seconds}}"""
        )) {
            assertThrows(IllegalArgumentException::class.java) { instagramTokenExchange(json.readTree(response)) }
        }
    }

    @Test fun `rotated token can be read after restart with the same key and credential identity`() {
        val cipher = InstagramTokenCipher(key, "account-and-app")
        val token = "synthetic-system-user-token"
        val encrypted = cipher.seal(token)
        assertNotEquals(token, encrypted)
        assertNotEquals(encrypted, cipher.seal(token))
        assertEquals(token, InstagramTokenCipher(key, "account-and-app").open(encrypted))
        assertThrows(AEADBadTagException::class.java) { InstagramTokenCipher(key, "other-account").open(encrypted) }
    }
}
