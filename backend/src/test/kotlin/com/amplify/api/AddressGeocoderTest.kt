package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AddressGeocoderTest {
    private val geocoder = AddressGeocoder(ObjectMapper())

    @Test fun `Photon features are converted to unique valid candidates`() {
        val json = ObjectMapper().readTree("""{
          "features": [
            {"geometry":{"coordinates":[-56.19,-34.9]},"properties":{"name":"18 de Julio","city":"Montevideo"}},
            {"geometry":{"coordinates":[-56.19,-34.9]},"properties":{"name":"Duplicado"}},
            {"geometry":{"coordinates":[500,500]},"properties":{"name":"Invalido"}}
          ]} """)
        val results = geocoder.parseFeatures(json)
        assertEquals(1, results.size)
        assertEquals(-34.9, results[0]["lat"])
        assertEquals(-56.19, results[0]["lon"])
    }

    @Test fun `Nominatim fallback produces valid coordinates`() {
        val json = ObjectMapper().readTree("""[
            {"lat":"-34.906", "lon":"-56.194", "display_name":"Centro, Montevideo"},
            {"lat":"x", "lon":"-56.2", "display_name":"Invalido"}
        ]""")
        val results = geocoder.parseNominatim(json)
        assertEquals(1, results.size)
        assertEquals("Centro, Montevideo", results[0]["name"])
    }
}
