package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RequestPlaylistReplayTest {
    private val a = "A".repeat(22)
    private val b = "B".repeat(22)
    private val d = "D".repeat(22)
    private val e = "E".repeat(22)
    private fun plan(steps: List<PlaylistPlanner.OrderStep>, wanted: String = d, position: Int = 1) =
        RequestPlaylistPlan("P".repeat(22), wanted, listOf(a,b), steps, position, false)
    private fun insert(track: String, at: Int) = PlaylistPlanner.OrderStep(track,at,null,"INSERTED")

    @Test fun `lost provider response does not duplicate an already inserted song`() {
        val command = plan(listOf(insert(d,1)))
        val remote = mutableListOf<String?>(a,b)
        var calls = 0
        assertThrows(IllegalStateException::class.java) {
            RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"snapshot")}) { step,_ ->
                remote.add(step.desiredIndex,step.trackId)
                calls++
                throw IllegalStateException("response lost after remote commit")
            }
        }
        val changed = RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"new-snapshot")}) { _,_ ->
            fail<Unit>("Already applied command must not mutate Spotify")
        }
        assertFalse(changed)
        assertEquals(listOf(a,d,b),remote)
        assertEquals(1,calls)
    }

    @Test fun `partial command resumes without repeating its successful first step`() {
        val command = plan(listOf(insert(d,1),insert(e,2)),e,2)
        val remote = mutableListOf<String?>(a,b)
        var insertedD = 0
        assertThrows(IllegalStateException::class.java) {
            RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"snapshot")}) { step,_ ->
                if(step.trackId==e)throw IllegalStateException("provider unavailable before second mutation")
                remote.add(step.desiredIndex,step.trackId)
                insertedD++
            }
        }
        RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"intermediate-snapshot")}) { step,snapshot ->
            assertEquals(e,step.trackId)
            assertEquals("intermediate-snapshot",snapshot)
            remote.add(step.desiredIndex,step.trackId)
        }
        assertEquals(1,insertedD)
        assertEquals(listOf(a,d,e,b),remote)
    }

    @Test fun `lost reorder response is recognized without reusing old indexes`() {
        val command = RequestPlaylistPlan("P".repeat(22),d,listOf(a,b,d),
            listOf(PlaylistPlanner.OrderStep(d,1,2,"REORDERED")),1,false)
        val remote = mutableListOf<String?>(a,b,d)
        assertThrows(IllegalStateException::class.java) {
            RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"before")}) { step,snapshot ->
                assertEquals("before",snapshot)
                remote.add(step.desiredIndex,remote.removeAt(step.existingIndex!!))
                throw IllegalStateException("reorder applied but response lost")
            }
        }
        assertFalse(RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"after")}) { _,_ ->
            fail<Unit>("Do not reorder another song using stale indexes")
        })
        assertEquals(listOf(a,d,b),remote)
    }

    @Test fun `unrelated remote edit is rejected without applying stale indexes`() {
        val command = plan(listOf(insert(d,1)))
        assertThrows(RequestPlaylistReplay.Drift::class.java) {
            RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(listOf(e,a,b),"external")}) { _,_ ->
                fail<Unit>("Unrelated state must not be mutated")
            }
        }
    }

    @Test fun `unexpected provider result stops the remaining mutations`() {
        val command = plan(listOf(insert(d,1),insert(e,2)),e,2)
        val remote = mutableListOf<String?>(a,b)
        var calls = 0
        assertThrows(RequestPlaylistReplay.Drift::class.java) {
            RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"snapshot")}) { _,_ ->
                calls++
                remote.add(0,e) // An external actor changed the order at the same time.
            }
        }
        assertEquals(1,calls)
    }

    @Test fun `frozen plan keeps its insertion point when playback advances before replay`() {
        val command = plan(listOf(insert(d,1)))
        val remote = mutableListOf<String?>(a,b)
        RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"snapshot")}) { step,_ ->
            assertEquals(1,step.desiredIndex)
            remote.add(step.desiredIndex,step.trackId)
        }
        // No current-playback callback exists here: recovery uses the saved plan.
        assertFalse(RequestPlaylistReplay.apply(command,{RequestPlaylistSnapshot(remote.toList(),"snapshot2")}) { _,_ ->
            fail<Unit>("Playback advancement must not trigger a new insert")
        })
        assertEquals(listOf(a,d,b),remote)
    }

    @Test fun `malformed saved step is rejected before contacting provider`() {
        val invalid = plan(listOf(PlaylistPlanner.OrderStep(d,10,null,"INSERTED")))
        assertThrows(IllegalArgumentException::class.java) {
            RequestPlaylistReplay.apply(invalid,{fail("Invalid command must not be read")}) { _,_ ->
                fail<Unit>("Invalid command must not mutate")
            }
        }
    }
}
