package com.amplify.api

import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty
import io.micronaut.core.annotation.Introspected

/** HTTP contracts independent of the SQL/session implementation. Existing
 * services retain their adapters so migrations do not change issued sessions. */
@Introspected
data class LoginInput @JsonCreator constructor(
 @JsonProperty("email") val email:String,
 @JsonProperty("password") val password:String
){fun values():Map<String,Any?> = mapOf("email" to email,"password" to password)}

@Introspected
data class RegistrationInput @JsonCreator constructor(
 @JsonProperty("name") val name:String,
 @JsonProperty("email") val email:String,
 @JsonProperty("password") val password:String
){fun values():Map<String,Any?> = mapOf("name" to name,"email" to email,"password" to password)}
