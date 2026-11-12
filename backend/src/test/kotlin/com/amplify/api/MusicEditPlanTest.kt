package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import io.micronaut.http.exceptions.HttpStatusException

class MusicEditPlanTest {
    private val a="A".repeat(22);private val b="B".repeat(22)
    private val state=MusicPlaylist("playlist","Bar","s1",listOf(mapOf("id" to a),mapOf("id" to b),mapOf("id" to a)))
    @Test fun `position removal preserves another occurrence of the same song`() {
        val plan=MusicEditPlan.build("remove",mapOf("snapshot" to "s1","position" to 2),state)
        assertEquals(listOf(a,b),plan["expected"]);assertEquals(2,plan["position"])
    }
    @Test fun `reorder works both directions without changing multiplicity`() {
        assertEquals(listOf(b,a,a),MusicEditPlan.build("move",mapOf("snapshot" to "s1","from" to 0,"to" to 2),state)["expected"])
        assertEquals(listOf(a,a,b),MusicEditPlan.build("move",mapOf("snapshot" to "s1","from" to 2,"to" to 0),state)["expected"])
    }
    @Test fun `stale snapshots and fractional positions fail before mutation`() {
        assertThrows(PlaylistSnapshotChanged::class.java){MusicEditPlan.build("remove",mapOf("snapshot" to "old","position" to 0),state)}
        val invalid=assertThrows(HttpStatusException::class.java){MusicEditPlan.build("remove",mapOf("snapshot" to "s1","position" to 1.5),state)}
        assertFalse(invalid is PlaylistSnapshotChanged,"Only a stale pre-write snapshot may request a refreshed retry")
    }
    @Test fun `unavailable elements are preserved in reorder plans`() {
        val unavailable=state.copy(tracks=listOf(mapOf("id" to null),mapOf("id" to a)))
        assertEquals(listOf(a,null),MusicEditPlan.build("move",mapOf("snapshot" to "s1","from" to 1,"to" to 0),unavailable)["expected"])
        assertThrows(HttpStatusException::class.java){MusicEditPlan.build("remove",mapOf("snapshot" to "s1","position" to 0),unavailable)}
    }
}
