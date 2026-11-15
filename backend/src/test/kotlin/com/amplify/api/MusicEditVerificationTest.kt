package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MusicEditVerificationTest {
    private val a="A".repeat(22);private val b="B".repeat(22);private val c="C".repeat(22)
    private fun playlist(vararg ids:String,snapshot:String="s2")=MusicPlaylist("playlist","Bar",snapshot,ids.map{mapOf("id" to it)})
    private fun remove(vararg ids:String)=MusicEditPlan.build("remove",mapOf("snapshot" to "s1","position" to 0),playlist(*ids,snapshot="s1"))

    @Test fun `late provider snapshots are read again without repeating a write`() {
        val plan=remove(a,b);var reads=0;val delays=mutableListOf<Long>()
        val result=MusicEditVerification.confirm(plan,{reads++;if(reads<3)playlist(a,b,snapshot="s1") else playlist(b)},delays::add)
        assertEquals(listOf(b),result?.ids);assertEquals(3,reads);assertEquals(listOf(150L,350L),delays)
    }
    @Test fun `removal allows unrelated songs to change while preserving duplicate occurrences`() {
        val plan=remove(a,b,a)
        assertTrue(MusicEditVerification.matches(plan,playlist(b,a,c)))
        assertFalse(MusicEditVerification.matches(plan,playlist(b,c)))
        assertFalse(MusicEditVerification.matches(plan,playlist(a,b,a,c)))
        assertFalse(MusicEditVerification.matches(plan,playlist(b,a,snapshot="s1")))
        assertFalse(MusicEditVerification.matches(plan,playlist(b,a).copy(id="different")))
    }
    @Test fun `adding an existing song must increase its occurrence count`() {
        val plan=MusicEditPlan.build("add",mapOf("snapshot" to "s1","trackId" to a),playlist(a,b,snapshot="s1"))
        assertFalse(MusicEditVerification.matches(plan,playlist(a,b,c)))
        assertTrue(MusicEditVerification.matches(plan,playlist(a,b,a,c)))
    }
    @Test fun `unconfirmed removals stop after a bounded number of reads`() {
        var reads=0
        assertNull(MusicEditVerification.confirm(remove(a,b),{reads++;playlist(a,b)},{}))
        assertEquals(3,reads)
    }
    @Test fun `a failed read after a successful write can recover`() {
        var reads=0
        assertEquals(listOf(b),MusicEditVerification.confirm(remove(a,b),{if(++reads==1)error("read unavailable");playlist(b)},{})?.ids)
    }
    @Test fun `provider backoff and permission failures do not trigger repeated reads`() {
        for(status in listOf(401,403,429)){
            var reads=0
            assertThrows(SpotifyHttpFailure::class.java){
                MusicEditVerification.confirm(remove(a,b),{reads++;throw SpotifyHttpFailure(status,io.micronaut.http.HttpStatus.BAD_GATEWAY,"Provider rejected read")},{})
            }
            assertEquals(1,reads)
        }
    }
    @Test fun `renaming allows simultaneous track updates but moving requires the requested order`() {
        val before=playlist(a,b,snapshot="s1")
        val rename=MusicEditPlan.build("rename",mapOf("snapshot" to "s1","name" to "New name"),before)
        assertTrue(MusicEditVerification.matches(rename,playlist(c,b).copy(name="New name")))
        val move=MusicEditPlan.build("move",mapOf("snapshot" to "s1","from" to 0,"to" to 1),before)
        assertTrue(MusicEditVerification.matches(move,playlist(b,a)))
        assertFalse(MusicEditVerification.matches(move,playlist(a,b)))
    }
}
