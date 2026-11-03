package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AuthRatePolicyTest {
    @Test fun `admin and customer credentials and Google endpoints are covered`() {
        for (path in listOf("/api/auth/login", "/api/auth/register", "/api/customers/login",
                "/api/customers/register", "/api/customers/google", "/api/customers/me/google/link")) {
            assertTrue(AuthRatePolicy.rules(path, "192.0.2.1", emptyMap(), "").isNotEmpty(), path)
        }
        assertTrue(AuthRatePolicy.rules("/api/customers/google/config", "192.0.2.1", null, "").isEmpty())
        assertEquals(AuthRatePolicy.rules("/api/auth/login", "192.0.2.1", mapOf("email" to "a@example.com"), ""),
            AuthRatePolicy.rules("/api/auth/login/", "192.0.2.1", mapOf("email" to "a@example.com"), ""))
    }

    @Test fun `victim email does not create a global account lockout`() {
        fun key(ip: String) = AuthRatePolicy.rules("/api/customers/login", ip,
            mapOf("email" to "Victim@example.com"), "").first { it.scope == "auth-principal" }.key
        assertNotEquals(key("192.0.2.1"), key("192.0.2.2"))
        val normalized = AuthRatePolicy.rules("/api/customers/login", "192.0.2.1",
            mapOf("email" to " victim@EXAMPLE.com "), "").first { it.scope == "auth-principal" }.key
        assertEquals(key("192.0.2.1"), normalized)
    }

    @Test fun `rotating supplied emails does not reset the peer bucket`() {
        val a = AuthRatePolicy.rules("/api/auth/login", "192.0.2.1", mapOf("email" to "a@example.com"), "")
        val b = AuthRatePolicy.rules("/api/auth/login", "192.0.2.1", mapOf("email" to "b@example.com"), "")
        assertEquals(a.first(), b.first())
        assertNotEquals(a.first { it.scope == "auth-principal" }.key, b.first { it.scope == "auth-principal" }.key)
        assertEquals(120, a.first().limit)
    }

    @Test fun `admin registration is bounded before expensive password hashing`() {
        val rules = AuthRatePolicy.rules("/api/auth/register", "192.0.2.1", mapOf("email" to "new@example.com"), "")
        assertEquals(listOf("auth-peer", "admin-registration", "auth-principal", "auth-global"), rules.map { it.scope })
        assertEquals(10, rules[1].limit)
        assertEquals(3600, rules[1].seconds)
    }

    @Test fun `Google replay keys do not store the credential`() {
        val credential = "opaque-id-token-not-to-be-stored"
        val rule = AuthRatePolicy.rules("/api/customers/google", "192.0.2.1", mapOf("credential" to credential), "").first { it.scope == "auth-principal" }
        assertFalse(rule.key.contains(credential))
        assertEquals(10, rule.limit)
    }
}
