package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import io.micronaut.http.exceptions.HttpStatusException

class VenueImportTest {
    private val json=ObjectMapper()
    @Test fun `Google maps Sunday to last day and preserves overnight closing`() {
        val result=VenueImportData.google(json.readTree("""{"displayName":{"text":"Mi bar"},"formattedAddress":"Centro 123",
            "addressComponents":[{"longText":"Montevideo","types":["locality"]}],"location":{"latitude":-34.9,"longitude":-56.1},
            "regularOpeningHours":{"periods":[{"open":{"day":0,"hour":18},"close":{"day":1,"hour":2}}]}}"""))
        val fields=result["fields"] as Map<*,*>
        assertEquals("Mi bar",fields["name"]);assertEquals("Montevideo",fields["city"])
        assertEquals("W2|-|-|-|-|-|-|18:00-02:00",fields["openingHours"])
    }
    @Test fun `split hours are warned about rather than silently discarded`() {
        val result=VenueImportData.google(json.readTree("""{"regularOpeningHours":{"periods":[
            {"open":{"day":1,"hour":10},"close":{"day":1,"hour":14}},
            {"open":{"day":1,"hour":18},"close":{"day":2,"hour":2}}]}}"""))
        assertFalse((result["fields"] as Map<*,*>).containsKey("openingHours"))
        assertFalse((result["warnings"] as List<*>).isEmpty())
    }
    @Test fun `Instagram accepts profile links but never fetches arbitrary input URLs`() {
        assertEquals("mi.bar",VenueImportData.instagramHandle("https://www.instagram.com/mi.bar/?igsh=123"))
        for(value in listOf("https://127.0.0.1/secret","https://instagram.com.evil.test/bar/","https://instagram.com/p/post/","foo){id}","https://a@instagram.com/bar/"))
            assertThrows(HttpStatusException::class.java){VenueImportData.instagramHandle(value)}
    }
    @Test fun `Instagram does not invent coordinates or business hours from biography`() {
        val result=VenueImportData.instagram(json.readTree("""{"name":"Bar","biography":"Centro 123. Abierto siempre"}"""),"mi.bar")
        val fields=result["fields"] as Map<*,*>
        assertEquals("Centro 123. Abierto siempre",fields["description"])
        assertFalse(fields.containsKey("address"));assertFalse(fields.containsKey("openingHours"))
    }
}
