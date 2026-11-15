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
    @Test fun `each new paid request inserts one copy even when the track is already next`() {
        val first=PlaylistPlanner.reconcile(listOf("playing","base"),"playing",true,listOf("a"),"a")
        val second=PlaylistPlanner.reconcile(first.expected,"playing",true,listOf("a","a"),"a")
        assertEquals(listOf("playing","a","a","base"),second.expected)
        assertEquals(listOf("a","a"),second.activeQueue)
        assertEquals("INSERTED",second.steps.last().action)
        assertEquals(2,second.steps.last().desiredIndex)
        val third=PlaylistPlanner.reconcile(second.expected,"playing",true,listOf("a","a","b"),"b")
        assertEquals(listOf("playing","a","a","b","base"),third.expected)
    }
    @Test fun `repeated requests retain their chronological slots between other songs`() {
        var ids:List<String?> = listOf("playing","base")
        val queue=mutableListOf<String>()
        for(track in listOf("a","b","a","c","a")){
            queue.add(track)
            ids=PlaylistPlanner.reconcile(ids,"playing",true,queue,track).expected
            assertEquals(listOf("playing")+queue+"base",ids)
        }
    }
    @Test fun `currently playing repeat is passed and later copies retain FIFO`() {
        val plan=PlaylistPlanner.reconcile(listOf("a","b","a","base"),"a",true,listOf("a","b","a","c"),"c")
        assertEquals(listOf("b","a","c"),plan.activeQueue)
        assertEquals(listOf("a","b","a","c","base"),plan.expected)
    }
    @Test fun `missing historical duplicates are not recreated`() {
        val plan=PlaylistPlanner.reconcile(listOf("playing","a","base"),"playing",true,listOf("a","a","gone","a"),"a")
        assertEquals(listOf("playing","a","a","base"),plan.expected)
        assertEquals(1,plan.steps.count{it.action=="INSERTED"})
    }
    @Test fun `a base playlist occurrence is not reused as a paid request`() {
        val plan=PlaylistPlanner.reconcile(listOf("playing","a","base"),"playing",true,listOf("a"),"a")
        assertEquals(listOf("playing","a","a","base"),plan.expected)
        assertEquals(1,plan.steps.single().desiredIndex)
    }
}
