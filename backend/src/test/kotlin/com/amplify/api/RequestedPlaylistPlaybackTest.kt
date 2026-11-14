package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RequestedPlaylistPlaybackTest {
    private val playlist="P".repeat(22)
    private val a="A".repeat(22)
    private val b="B".repeat(22)
    private val wanted="W".repeat(22)
    @Test fun `autoplay can retain the playlist context while playing unrelated tracks`() {
        assertFalse(RequestedPlaylistPlayback.usesPlaylist(playlist,listOf(a,b),"spotify:playlist:$playlist",wanted))
        assertTrue(RequestedPlaylistPlayback.usesPlaylist(playlist,listOf(a,b),"spotify:playlist:$playlist",a))
        assertFalse(RequestedPlaylistPlayback.usesPlaylist(playlist,listOf(a,b),"spotify:album:other",a))
    }
    @Test fun `restart puts the requested track first and retains the full playlist`() {
        val plan=PlaylistPlanner.reconcile(listOf(a,b),wanted,false,listOf(wanted),wanted)
        assertEquals(listOf(wanted,a,b),plan.expected)
        val body=RequestedPlaylistPlayback.body(playlist,plan.expected)
        assertEquals("spotify:playlist:$playlist",body["context_uri"])
        assertEquals(mapOf("uri" to "spotify:track:$wanted"),body["offset"])
        assertEquals(0,body["position_ms"])
    }
    @Test fun `an existing requested song moves to first without being duplicated`() {
        val plan=PlaylistPlanner.reconcile(listOf(a,b,wanted),b,false,listOf(wanted),wanted)
        assertEquals(listOf(wanted,a,b),plan.expected)
        assertEquals(1,plan.expected.count{it==wanted})
    }
    @Test fun `recovery does not restart a playlist again after a lost response`() {
        assertTrue(RequestedPlaylistPlayback.shouldRestart(true,false,true))
        assertFalse(RequestedPlaylistPlayback.shouldRestart(true,true,true))
        assertTrue(RequestedPlaylistPlayback.shouldRestart(true,true,false))
        assertFalse(RequestedPlaylistPlayback.shouldRestart(false,false,false))
    }
}
