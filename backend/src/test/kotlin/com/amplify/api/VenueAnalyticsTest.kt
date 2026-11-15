package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant

class VenueAnalyticsTest {
    @Test fun `Uruguay day and week do not advance with UTC midnight`() {
        val range=AnalyticsRange.at("week",Instant.parse("2026-11-16T01:00:00Z"))
        assertEquals("2026-11-09",range.from.toString())
        assertEquals("2026-11-15",range.to.toString())
        assertEquals(Instant.parse("2026-11-09T03:00:00Z"),range.start)
        assertEquals(Instant.parse("2026-11-09T01:00:00Z"),range.previousUntil)
    }
    @Test fun `short previous month cannot overlap the current month`() {
        val range=AnalyticsRange.at("month",Instant.parse("2026-03-31T22:00:00Z"))
        assertEquals(Instant.parse("2026-02-01T03:00:00Z"),range.previousStart)
        assertEquals(range.start,range.previousUntil)
    }
    @Test fun `zero metrics and empty songs remain explicit without inventing income`() {
        val mapper=ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_EMPTY)
        val result=VenueAnalytics("week","America/Montevideo","2026-11-09","2026-11-09","2026-11-09T04:00:00Z",0,0,0,0,0,
            listOf(AnalyticsDay("2026-11-09",0)),emptyList())
        val json=mapper.readTree(mapper.writeValueAsString(result))
        assertEquals(0,json.path("users").asInt(-1))
        assertTrue(json.path("topSongs").isArray)
        assertEquals(0,json.path("days").path(0).path("requests").asInt(-1))
        assertEquals("NOT_CONFIGURED",json.path("income").path("status").asText())
        assertFalse(json.path("income").has("week"))
    }
}
