package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import io.micronaut.http.exceptions.HttpStatusException

class MusicPlaybackStartTest {
    private val a="A".repeat(22);private val b="B".repeat(22);private val c="C".repeat(22)
    private fun playlist(vararg ids:String)=MusicPlaylist("bar-list","Night","s2",ids.map {mapOf("id" to it)})
    @Test fun `play targets the chosen URI even if its index changed`() {
        val body=MusicPlaybackStart.body(playlist(c,a,b),mapOf("position" to 0,"trackId" to a,"playlistId" to "bar-list","snapshot" to "s1"))
        assertEquals(mapOf("uri" to "spotify:track:$a"),body["offset"])
        assertEquals("spotify:playlist:bar-list",body["context_uri"])
        assertEquals(0,body["position_ms"])
    }
    @Test fun `playlist start uses the first song URI rather than advancing a queue`() {
        val body=MusicPlaybackStart.body(playlist(a,b,c),mapOf("position" to 0,"trackId" to a,"snapshot" to "s2"))
        assertEquals(mapOf("uri" to "spotify:track:$a"),body["offset"])
    }
    @Test fun `duplicate occurrences need a matching snapshot`() {
        assertEquals(mapOf("position" to 2),MusicPlaybackStart.body(playlist(a,b,a),mapOf("position" to 2,"trackId" to a,"snapshot" to "s2"))["offset"])
        assertThrows(HttpStatusException::class.java){MusicPlaybackStart.body(playlist(a,b,a),mapOf("position" to 2,"trackId" to a,"snapshot" to "old"))}
    }
    @Test fun `removed restricted and local songs do not silently skip to another`() {
        assertThrows(HttpStatusException::class.java){MusicPlaybackStart.body(playlist(b),mapOf("position" to 0,"trackId" to a))}
        for(track in listOf(mapOf("id" to a,"playable" to false),mapOf("id" to a,"isLocal" to true))){
            assertThrows(HttpStatusException::class.java){MusicPlaybackStart.body(MusicPlaylist("bar-list","Night","s2",listOf(track)),mapOf("position" to 0,"trackId" to a))}
        }
    }
    @Test fun `a different playlist is not started accidentally`() {
        assertThrows(HttpStatusException::class.java){MusicPlaybackStart.body(playlist(a),mapOf("position" to 0,"trackId" to a,"playlistId" to "other"))}
    }
}
