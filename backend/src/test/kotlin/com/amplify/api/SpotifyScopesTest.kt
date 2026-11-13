package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.net.URI
import java.net.URLDecoder
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.ResultSetMetaData
import java.sql.Timestamp
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.sql.DataSource
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class SpotifyScopesTest {
    @Test fun `browser needs all three SDK grants even when playlist editing is authorized`() {
        val playlistOnly = "playlist-modify-public playlist-modify-private user-modify-playback-state"
        val error = assertThrows(HttpStatusException::class.java) { SpotifyScopes.requireBrowser(playlistOnly) }
        assertEquals(HttpStatus.PRECONDITION_FAILED, error.status)
        assertTrue(error.message!!.contains("misma cuenta"))
        assertEquals(listOf("user-read-email"), SpotifyScopes.missingBrowser("streaming user-read-private playlist-read-private"))
        SpotifyScopes.requireBrowser("user-read-private streaming user-read-email")
    }

    @Test fun `unknown legacy scopes remain unknown and an explicit empty grant has no permission`() {
        assertNull(SpotifyScopes.missingBrowser(null))
        SpotifyScopes.requireBrowser(null)
        assertEquals(3, SpotifyScopes.missingBrowser("")!!.size)
        assertEquals(emptyList<String>(), SpotifyScopes.missingBrowser("  streaming\tuser-read-email\nuser-read-private streaming "))
    }

    @Test fun `connection status reports missing permissions without exposing credentials or losing playlist`() {
        val spotify = spotify(emptyMap())
        val status = spotify.status(mapOf("spotify_premium" to true, "spotify_access_encrypted" to "encrypted-fixture",
            "spotify_scopes" to "user-modify-playback-state", "playlist_id" to "saved-playlist"))
        assertEquals(true, status["connected"])
        assertEquals("saved-playlist", status["playlistId"])
        assertEquals(listOf("streaming", "user-read-email", "user-read-private"), status["browserMissingScopes"])
        assertFalse(status.toString().contains("encrypted-fixture"))
        assertNull(spotify.status(emptyMap())["browserMissingScopes"])
    }

    @Test fun `browser token rejects a known missing grant before decrypting or refreshing credentials`() {
        val spotify = spotify(mapOf("spotify_access_encrypted" to "deliberately-not-encrypted", "spotify_premium" to true,
            "spotify_scopes" to "user-read-private"))
        val error = assertThrows(HttpStatusException::class.java) { spotify.browserToken(UUID.randomUUID()) }
        assertEquals(HttpStatus.PRECONDITION_FAILED, error.status)
        assertTrue(error.message!!.contains("Renová los permisos"))
    }

    @Test fun `valid browser grant and unknown legacy grant can receive an unexpired token`() {
        val iv = ByteArray(12) { 3 }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(ByteArray(32) { 7 }, "AES"), GCMParameterSpec(128, iv))
        val encrypted = Base64.getEncoder().encodeToString(iv + cipher.doFinal("synthetic-access".toByteArray()))
        for (grant in listOf(null, "streaming user-read-email user-read-private")) {
            val spotify = spotify(mapOf("spotify_access_encrypted" to encrypted, "spotify_premium" to true,
                "spotify_expires_at" to Timestamp.from(Instant.now().plusSeconds(600)), "spotify_scopes" to grant))
            assertEquals("synthetic-access", spotify.browserToken(UUID.randomUUID())["accessToken"])
        }
    }

    @Test fun `renewal requests consent and browser scopes using a fresh state and PKCE`() {
        val spotify = spotify(emptyMap())
        val venue = mapOf<String, Any?>("id" to UUID.randomUUID())
        val owner = mapOf<String, Any?>("id" to UUID.randomUUID())
        fun params() = URI(spotify.authorize(venue, owner)).rawQuery.split("&").associate {
            val parts = it.split("=", limit = 2)
            URLDecoder.decode(parts[0], Charsets.UTF_8) to URLDecoder.decode(parts[1], Charsets.UTF_8)
        }
        val first = params(); val second = params()
        assertEquals("true", first["show_dialog"])
        assertEquals("S256", first["code_challenge_method"])
        assertEquals("http://127.0.0.1:8080/callback", first["redirect_uri"])
        assertEquals(emptyList<String>(), SpotifyScopes.missingBrowser(first["scope"]))
        assertNotEquals(first["state"], second["state"])
        assertNotEquals(first["code_challenge"], second["code_challenge"])
        assertFalse(first.containsKey("code_verifier"))
    }

    private fun spotify(row: Map<String, Any?>): Spotify {
        val columns = row.keys.toList()
        val source = proxy(DataSource::class.java) { method, _ ->
            if (method != "getConnection") error("Unexpected DataSource operation: $method")
            proxy(Connection::class.java) { operation, _ ->
                when (operation) {
                    "close" -> null
                    "prepareStatement" -> proxy(PreparedStatement::class.java) { action, _ ->
                        when (action) {
                            "setObject", "close" -> null
                            "executeUpdate" -> 1
                            "executeQuery" -> {
                                var first = true
                                proxy(ResultSet::class.java) { read, args ->
                                    when (read) {
                                        "next" -> first.also { first = false }
                                        "close" -> null
                                        "getObject" -> row[columns[(args!![0] as Int) - 1]]
                                        "getMetaData" -> proxy(ResultSetMetaData::class.java) { field, indexes ->
                                            when (field) {
                                                "getColumnCount" -> columns.size
                                                "getColumnLabel" -> columns[(indexes!![0] as Int) - 1]
                                                else -> error("Unexpected metadata: $field")
                                            }
                                        }
                                        else -> error("Unexpected result: $read")
                                    }
                                }
                            }
                            else -> error("Unexpected statement: $action")
                        }
                    }
                    else -> error("Unexpected connection: $operation")
                }
            }
        }
        return Spotify(Db(source), ObjectMapper(), "client", "http://127.0.0.1:8080/callback",
            Base64.getEncoder().encodeToString(ByteArray(32) { 7 }), true, true, "http://localhost:5173")
    }

    private fun <T> proxy(type: Class<T>, handler: (String, Array<out Any?>?) -> Any?): T = type.cast(
        Proxy.newProxyInstance(type.classLoader, arrayOf(type)) { _, method, args -> handler(method.name, args) }
    )
}
