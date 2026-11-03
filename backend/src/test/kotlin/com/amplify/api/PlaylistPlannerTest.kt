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
}
