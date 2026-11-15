package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.util.Base64
import java.util.UUID

@JsonInclude(JsonInclude.Include.ALWAYS)
data class AccountAvatar(val avatar:String?)

enum class AvatarOwner(val table:String) { ADMIN("admin_user"), CUSTOMER("customer_account") }

/** Only a trusted table and the authenticated account ID reach the database. */
@Singleton
class AccountAvatars(private val db:Db) {
    companion object {
        private const val PREFIX="data:image/jpeg;base64,"
        private const val MAX_BYTES=160*1024
    }
    fun get(owner:AvatarOwner,id:UUID):AccountAvatar {
        val row=db.one("SELECT avatar_image FROM ${owner.table} WHERE id=?",id)
            ?:fail(HttpStatus.NOT_FOUND,"Cuenta no encontrada")
        return AccountAvatar((row["avatar_image"] as? ByteArray)?.let { PREFIX+Base64.getEncoder().encodeToString(it) })
    }
    fun put(owner:AvatarOwner,id:UUID,payload:Map<String,Any?>):AccountAvatar {
        val raw=payload["image"] as? String?:fail(HttpStatus.BAD_REQUEST,"Seleccioná una imagen JPG válida")
        if(!raw.startsWith(PREFIX)||raw.length>220_000)fail(HttpStatus.BAD_REQUEST,"Solo se aceptan fotos JPG de hasta 160 KB")
        val bytes=try{Base64.getDecoder().decode(raw.substring(PREFIX.length))}catch(_:IllegalArgumentException){fail(HttpStatus.BAD_REQUEST,"Imagen inválida")}
        if(bytes.size !in 100..MAX_BYTES||bytes[0]!=0xFF.toByte()||bytes[1]!=0xD8.toByte()||bytes[2]!=0xFF.toByte()||
            bytes[bytes.size-2]!=0xFF.toByte()||bytes[bytes.size-1]!=0xD9.toByte())fail(HttpStatus.BAD_REQUEST,"La foto debe ser un JPG válido de hasta 160 KB")
        val normalized=ImageValidation.normalize(bytes,"image/jpeg",MAX_BYTES)
        db.exec("UPDATE ${owner.table} SET avatar_image=?,avatar_content_type=? WHERE id=?",normalized,"image/jpeg",id)
        return AccountAvatar(PREFIX+Base64.getEncoder().encodeToString(normalized))
    }
    fun delete(owner:AvatarOwner,id:UUID) {
        db.exec("UPDATE ${owner.table} SET avatar_image=NULL,avatar_content_type=NULL WHERE id=?",id)
    }
}

@Controller("/api/auth/me/avatar")
@ExecuteOn(TaskExecutors.BLOCKING)
class AdminAvatarController(private val auth:Auth,private val avatars:AccountAvatars) {
    private fun id(authorization:String)=auth.user(authorization)["id"] as UUID
    private fun response(avatar:AccountAvatar)=HttpResponse.ok(avatar).header("Cache-Control","private, no-store")
    @Get
    fun get(@Header(value="Authorization",defaultValue="") authorization:String)=response(avatars.get(AvatarOwner.ADMIN,id(authorization)))
    @Put
    fun put(@Header(value="Authorization",defaultValue="") authorization:String,@Body payload:Map<String,Any?>)=response(avatars.put(AvatarOwner.ADMIN,id(authorization),payload))
    @Delete
    fun delete(@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean> {
        avatars.delete(AvatarOwner.ADMIN,id(authorization));return mapOf("deleted" to true)
    }
}
