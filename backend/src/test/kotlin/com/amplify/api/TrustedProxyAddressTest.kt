package com.amplify.api
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
class TrustedProxyAddressTest {
 private val key="synthetic-test-key-abcdefghijklmnopqrstuvwxyz"
 @Test fun `unconfigured and spoofed headers retain actual peer`(){assertEquals("127.0.0.1",TrustedProxyAddress.resolve("127.0.0.1",key,"203.0.113.1",""));assertEquals("127.0.0.1",TrustedProxyAddress.resolve("127.0.0.1","wrong","203.0.113.1",key))}
 @Test fun `configured gateway supplies independent client address`(){assertEquals("203.0.113.1",TrustedProxyAddress.resolve("127.0.0.1",key,"203.0.113.1",key))}
 @Test fun `hostnames and malformed addresses are never resolved`(){for(value in listOf("deadbeef","attacker.example","ffff.ffff","999.999.999.999"))assertEquals("127.0.0.1",TrustedProxyAddress.resolve("127.0.0.1",key,value,key))}
}
