package com.amplify.api

import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.util.UUID

/** A small private JPEG avatar is stored against the authenticated customer.
 *  No customer may access another account's avatar through this API.
 */
@Controller("/api/customers/me/avatar")
@ExecuteOn(TaskExecutors.BLOCKING)
class CustomerAvatarController(private val auth:CustomerAuth,private val avatars:AccountAvatars) {
    private fun customerId(authorization:String):UUID=auth.user(authorization)["id"] as UUID
    @Get
    fun get(@Header(value="Authorization",defaultValue="") authorization:String)=
        io.micronaut.http.HttpResponse.ok(avatars.get(AvatarOwner.CUSTOMER,customerId(authorization))).header("Cache-Control","private, no-store")
    @Put
    fun put(@Header(value="Authorization",defaultValue="") authorization:String,@Body payload:Map<String,Any?>):Map<String,Boolean> {
        avatars.put(AvatarOwner.CUSTOMER,customerId(authorization),payload);return mapOf("saved" to true)
    }
    @Delete
    fun delete(@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean> {
        avatars.delete(AvatarOwner.CUSTOMER,customerId(authorization));return mapOf("deleted" to true)
    }
}
