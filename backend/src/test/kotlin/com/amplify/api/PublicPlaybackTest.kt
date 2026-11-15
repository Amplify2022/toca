package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.annotation.JsonInclude
import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class PublicPlaybackTest {
    private val venue=UUID.randomUUID()
    private fun state(id:String)=mapOf<String,Any?>("isPlaying" to true,"now" to mapOf("id" to id,"title" to id,"artist" to "Artist","imageUrl" to "https://i.scdn.co/image/$id"),"device" to mapOf("id" to "private-device"),"accessToken" to "private-token")

    @Test fun `current song and cover refresh after half a second without exposing private player fields`() {
        var clock=0L;var track="first";var reads=0
        val cache=RecentPlayback({reads++;state(track)},{clock})
        val first=cache.get(venue)
        track="second";clock=TimeUnit.MILLISECONDS.toNanos(499)
        assertSame(first,cache.get(venue));assertEquals(1,reads)
        clock=TimeUnit.MILLISECONDS.toNanos(500)
        val second=cache.get(venue)
        assertEquals("second",second.now?.get("title"));assertEquals("https://i.scdn.co/image/second",second.now?.get("imageUrl"));assertEquals(2,reads)
        val json=ObjectMapper().writeValueAsString(second)
        assertFalse(json.contains("private-device"));assertFalse(json.contains("private-token"))
    }
    @Test fun `concurrent viewers share a single provider read`() {
        val entered=CountDownLatch(1);val release=CountDownLatch(1);val reads=AtomicInteger()
        val cache=RecentPlayback({reads.incrementAndGet();entered.countDown();check(release.await(5,TimeUnit.SECONDS));state("song")},{0L})
        val pool=Executors.newFixedThreadPool(8)
        try{
            val jobs=(1..8).map{pool.submit<PublicPlayback>{cache.get(venue)}}
            assertTrue(entered.await(2,TimeUnit.SECONDS));release.countDown()
            val samples=jobs.map{it.get(3,TimeUnit.SECONDS)}
            assertEquals(1,reads.get());assertTrue(samples.all{it===samples.first()})
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun `provider errors share a backoff instead of serving an old playing song`() {
        var clock=0L;var limited=false;var reads=0
        val cache=RecentPlayback({reads++;if(limited)throw HttpStatusException(HttpStatus.TOO_MANY_REQUESTS,"limited");state("song")},{clock})
        cache.get(venue);limited=true;clock=TimeUnit.SECONDS.toNanos(1)
        repeat(3){assertThrows(HttpStatusException::class.java){cache.get(venue)}}
        assertEquals(2,reads)
        limited=false;clock=TimeUnit.SECONDS.toNanos(30)
        assertThrows(HttpStatusException::class.java){cache.get(venue)}
        clock=TimeUnit.SECONDS.toNanos(31)
        assertEquals("song",cache.get(venue).now?.get("title"));assertEquals(3,reads)
    }
    @Test fun `another venue has independent data and failure recovery retries after a second`() {
        var clock=0L;var fail=true
        val other=UUID.randomUUID()
        val cache=RecentPlayback({id->if(id==venue&&fail)throw IllegalStateException("offline");state(id.toString())},{clock})
        assertThrows(IllegalStateException::class.java){cache.get(venue)}
        assertEquals(other.toString(),cache.get(other).now?.get("title"))
        fail=false;clock=TimeUnit.SECONDS.toNanos(1)
        assertEquals(venue.toString(),cache.get(venue).now?.get("title"))
    }
    @Test fun `disabled or empty playback remains explicit with the production JSON inclusion policy`() {
        val mapper=ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_EMPTY)
        val disabled=mapper.readTree(mapper.writeValueAsString(PublicPlayback(false,false,null)))
        assertTrue(disabled.has("active"));assertFalse(disabled["active"].asBoolean());assertTrue(disabled["now"].isNull)
        val empty=RecentPlayback({mapOf("isPlaying" to false)}).get(venue)
        assertFalse(empty.isPlaying);assertNull(empty.now)
    }
}
