package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RequestPlanCodecTest {
    private val json=ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_EMPTY)
    private val track="T".repeat(22)
    private val playlist="P".repeat(22)
    @Test fun `empty playlist insertion survives public mapper omission settings`() {
        val plan=RequestPlaylistPlan(playlist,track,emptyList(),listOf(PlaylistPlanner.OrderStep(track,0,null,"INSERTED")),0,true,true)
        val saved=RequestPlanCodec.encode(json,plan)
        assertEquals(plan,RequestPlanCodec.decode(json,saved))
        assertTrue(json.readTree(saved).path("initialIds").isArray)
        assertTrue(json.readTree(saved).path("steps")[0].has("existingIndex"))
    }
    @Test fun `already first track keeps the empty step list`() {
        val plan=RequestPlaylistPlan(playlist,track,listOf(track),emptyList(),0,true,true)
        assertEquals(plan,RequestPlanCodec.decode(json,RequestPlanCodec.encode(json,plan)))
    }
    @Test fun `legacy plans with omitted null insertion indices can be read`() {
        val saved="""{"version":1,"playlistId":"$playlist","requestedTrack":"$track","steps":[{"trackId":"$track","desiredIndex":0,"action":"INSERTED"}],"position":0,"outsideContext":true}"""
        assertEquals(listOf(track),RequestPlanCodec.decode(json,saved).states().last())
    }
    @Test fun `malformed nonempty input is still rejected`() {
        assertThrows(IllegalArgumentException::class.java){RequestPlanCodec.decode(json,"""{"version":2,"initialIds":"bad","steps":[],"position":0,"outsideContext":true}""")}
    }
}
