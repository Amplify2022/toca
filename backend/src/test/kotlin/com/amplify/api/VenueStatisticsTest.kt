package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class VenueStatisticsTest {
    @Test fun `empty daily history survives NON_EMPTY serialization`() {
        val mapper=ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_EMPTY)
        val body=mapper.readTree(mapper.writeValueAsString(VenueStatistics(0,0,0,emptyList())))
        assertTrue(body.has("days"))
        assertTrue(body.path("days").isArray)
        assertEquals(0,body.path("days").size())
        assertEquals(0,body.path("tracks").asInt(-1))
    }
}
