package com.amplify.api

import io.micronaut.http.exceptions.HttpStatusException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.UUID

class ContactInputTest {
    private val body=mapOf("id" to UUID.randomUUID().toString(),"name" to "Nacho", "email" to " Test@example.test ","kind" to "suggestion","message" to "Me gustaría sugerir una mejora.")
    @Test fun `normalizes contact details and keeps message as plain text`() {
        val input=ContactInput.parse(body+mapOf("message" to "<b>Texto literal</b> y una sugerencia."))
        assertEquals("test@example.test",input.email);assertTrue(input.message.startsWith("<b>"));assertFalse(input.trap)
        assertEquals(input.fingerprint,ContactInput.parse(body+mapOf("message" to input.message,"email" to "test@example.test")).fingerprint)
    }
    @Test fun `rejects malformed and unbounded submissions`() {
        for(change in listOf(mapOf("email" to "bad"),mapOf("email" to "x@example.test\r\nBcc:a@test.test"),mapOf("message" to "tiny"),mapOf("message" to "x".repeat(4001)),mapOf("message" to "text with \u0000 invalid data"),mapOf("name" to "a\nb"),mapOf("kind" to "unknown"),mapOf("id" to "wrong"))){
            assertThrows(HttpStatusException::class.java){ContactInput.parse(body+change)}
        }
    }
    @Test fun `recognizes automated form trap without exposing it`() {assertTrue(ContactInput.parse(body+mapOf("website" to "https://spam.test")).trap)}
}
