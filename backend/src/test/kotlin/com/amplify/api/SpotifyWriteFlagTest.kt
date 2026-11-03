package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.util.UUID
import javax.sql.DataSource

class SpotifyWriteFlagTest {
    @Test fun `disabled playlist writes fail before database and provider work`() {
        val source = Proxy.newProxyInstance(DataSource::class.java.classLoader,arrayOf(DataSource::class.java)) { _,_,_ ->
            throw AssertionError("Disabled writes must not borrow a connection")
        } as DataSource
        val spotify = Spotify(Db(source),ObjectMapper(),"client","http://localhost/callback","",false,false,"http://localhost")
        val error = assertThrows(HttpStatusException::class.java) {
            spotify.prepareRequestPlan(UUID.randomUUID(),"D".repeat(22),"unused-token",listOf("D".repeat(22)),"P".repeat(22))
        }
        assertEquals(HttpStatus.PRECONDITION_FAILED,error.status)
    }
}
