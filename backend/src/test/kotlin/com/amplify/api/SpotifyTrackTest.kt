package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class SpotifyTrackTest {
    private val json=ObjectMapper()
    @Test fun `playlist search and player metadata keep album artwork`() {
        val track=SpotifyTrack.from(json.readTree("""{"id":"abc","name":"Night","artists":[{"name":"One"},{"name":"Two"}],"duration_ms":1234,"album":{"images":[{"url":"https://i.scdn.co/image/album"}]}}"""))
        assertEquals("https://i.scdn.co/image/album",track["imageUrl"])
        assertEquals("Night",track["title"]);assertEquals("One, Two",track["artist"]);assertEquals(1234L,track["durationMs"])
    }
    @Test fun `missing or unsafe album artwork keeps a usable fallback`() {
        assertNull(SpotifyTrack.from(json.readTree("""{"name":"Unavailable"}"""))["imageUrl"])
        val track=SpotifyTrack.from(json.readTree("""{"album":{"images":[{"url":"javascript:alert(1)"},{"url":"https://user:pass@example.test/image"},{"url":"https://i.scdn.co/image/safe"}]}}"""))
        assertEquals("https://i.scdn.co/image/safe",track["imageUrl"])
    }
}
