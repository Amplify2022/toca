package com.amplify.api

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PlaylistPlannerTest {
    @Test fun `add new item immediately after current`() {
        val p=PlaylistPlanner.plan(listOf("a","playing","c"),"playing",true,"new")
        assertEquals("INSERTED",p.action)
        assertEquals(2,p.insertBefore)
        assertEquals(2,p.resultPosition)
    }
    @Test fun `reorder queued item next`() {
        val p=PlaylistPlanner.plan(listOf("a","playing","c","target"),"playing",true,"target")
        assertEquals("PROMOTED",p.action)
        assertEquals(3,p.existingIndex)
        assertEquals(2,p.insertBefore)
    }
    @Test fun `already next is no op`() {
        assertEquals("ALREADY_NEXT",PlaylistPlanner.plan(listOf("a","playing","target"),"playing",true,"target").action)
    }
    @Test fun `reorder earlier item compensates for index shift`() {
        val p=PlaylistPlanner.plan(listOf("target","playing","c"),"playing",true,"target")
        assertEquals("PROMOTED",p.action)
        assertEquals(2,p.insertBefore)
        assertEquals(1,p.resultPosition)
    }
    @Test fun `do not move currently playing occurrence`() {
        assertEquals("INSERTED",PlaylistPlanner.plan(listOf("a","playing","c"),"playing",true,"playing").action)
    }
    @Test fun `different playback context targets beginning`() {
        assertEquals(0,PlaylistPlanner.plan(listOf("a","target","c"),null,false,"target").insertBefore)
    }
    @Test fun `new cycle puts second request after paused first despite old requests in playlist`() {
        val historical=(1..10).map { "old-$it" }
        val ids=listOf("first")+historical
        // The same playlist cursor is authoritative even when paused. The DB
        // supplies only requests from this playback cycle, not historical ones.
        val plan=PlaylistPlanner.reconcile(ids,"first",true,listOf("first","second"),"second")
        assertEquals(listOf("second"),plan.activeQueue)
        assertEquals(listOf("first","second")+historical,plan.expected)
        assertEquals(1,plan.steps.single().desiredIndex)
        val next=PlaylistPlanner.reconcile(plan.expected,"first",true,listOf("first","second","third"),"third")
        assertEquals(listOf("first","second","third")+historical,next.expected)
    }
}
