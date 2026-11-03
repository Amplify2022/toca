package com.amplify.api

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant

class GuestRequestLimitsTest {
    private val now=Instant.parse("2026-10-26T20:00:00Z")
    @Test fun `first request allowed`() { assertNull(GuestRequestLimits.reason(0,null,now)) }
    @Test fun `second request inside 15 seconds blocked`() {
        assertTrue(GuestRequestLimits.reason(1,now.minusSeconds(14),now)!!.contains("15 segundos"))
    }
    @Test fun `second request after 15 seconds allowed`() {
        assertNull(GuestRequestLimits.reason(1,now.minusSeconds(15),now))
    }
    @Test fun `six requests in ten minutes blocked`() {
        assertTrue(GuestRequestLimits.reason(6,now.minusSeconds(20),now)!!.contains("6 canciones"))
    }
    @Test fun `five requests beyond cooldown allowed`() {
        assertNull(GuestRequestLimits.reason(5,now.minusSeconds(25),now))
    }
}
