package com.amplify.api

import io.micronaut.context.annotation.Value
import io.micronaut.http.*
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import io.micronaut.scheduling.annotation.Scheduled
import jakarta.inject.Singleton
import java.util.UUID

data class ContactInput(val id:UUID,val name:String,val email:String,val kind:String,val message:String,val trap:Boolean) {
    val fingerprint get()=hashToken(listOf(name,email,kind,message).joinToString("\u0000"))
    companion object {
        fun parse(body:Map<String,Any?>):ContactInput {
            val name=required(body,"name",120)
            val email=required(body,"email",200).lowercase()
            val kind=required(body,"kind",20)
            val message=required(body,"message",4000)
            if(name.length<2||name.any{it.isISOControl()}||!email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))||
                email.any{it.isISOControl()}||kind !in setOf("suggestion","problem","other")||message.length<10||message.contains('\u0000'))
                fail(HttpStatus.BAD_REQUEST,"Revisá tu nombre, correo y mensaje antes de enviarlo.")
            return ContactInput(safeUuid(required(body,"id",36)),name,email,kind,message,(body["website"] as? String).orEmpty().isNotBlank())
        }
    }
}

class ContactLimited(val retry:Int):RuntimeException()

@Singleton
class ContactMessages(private val db:Db,private val limiter:AuthRateLimiter,private val mail:AccountMail,
    @Value("\${contact.recipient:}") private val recipient:String) {
    fun submit(peer:String,body:Map<String,Any?>):Map<String,Any> {
        val input=ContactInput.parse(body)
        val existing=db.one("SELECT payload_hash FROM contact_message WHERE id=?",input.id)
        if(existing!=null){
            if(existing["payload_hash"]!=input.fingerprint)fail(HttpStatus.CONFLICT,"Ese envío ya corresponde a otro mensaje.")
            return mapOf("accepted" to true,"receiptId" to input.id.toString())
        }
        limiter.checkRules(listOf(AuthRateRule("contact-peer",peer,5,3600),AuthRateRule("contact-global","all",300,3600)))?.let{throw ContactLimited(it)}
        if(input.trap)return mapOf("accepted" to true)
        db.exec("""INSERT INTO contact_message(id,payload_hash,name,email,kind,message) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING""",
            input.id,input.fingerprint,input.name,input.email,input.kind,input.message)
        if(db.one("SELECT payload_hash FROM contact_message WHERE id=?",input.id)?.get("payload_hash")!=input.fingerprint)
            fail(HttpStatus.CONFLICT,"Ese envío ya corresponde a otro mensaje.")
        return mapOf("accepted" to true,"receiptId" to input.id.toString())
    }

    /** Durable inbox first. Optional SMTP notifications never block submission. */
    @Scheduled(fixedDelay="30s",initialDelay="10s")
    fun notifyPending() {
        if(recipient.isBlank()||!mail.contactEnabled())return
        repeat(10){
            val row=db.one("""WITH candidate AS (
                SELECT id FROM contact_message WHERE notified_at IS NULL AND notification_attempts<5
                AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())
                ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                UPDATE contact_message m SET notification_attempts=notification_attempts+1,lease_until=now()+interval '2 minutes'
                FROM candidate c WHERE m.id=c.id RETURNING m.*""")?:return
            try {
                mail.sendContact(recipient,row["name"] as String,row["email"] as String,row["kind"] as String,row["message"] as String)
                db.exec("UPDATE contact_message SET notified_at=now(),lease_until=NULL,notification_error=NULL WHERE id=?",row["id"])
            }catch(_:Exception){
                db.exec("""UPDATE contact_message SET lease_until=NULL,notification_error='No se pudo enviar la notificación.',
                    next_attempt_at=now()+notification_attempts*interval '5 minutes' WHERE id=?""",row["id"])
            }
        }
    }
}

@Controller("/api/contact")
@ExecuteOn(TaskExecutors.BLOCKING)
class ContactController(private val messages:ContactMessages,@Value("\${amplify.trusted-proxy-token:}") private val proxyToken:String) {
    @Post
    fun submit(request:HttpRequest<*>,@Body body:Map<String,Any?>):HttpResponse<Map<String,Any>> {
        val actual=request.remoteAddress.address?.hostAddress?:request.remoteAddress.hostString
        val peer=TrustedProxyAddress.resolve(actual,request.headers.get("X-Toca-Proxy-Key").orEmpty(),request.headers.get("X-Toca-Client-IP").orEmpty(),proxyToken)
        return try{HttpResponse.status<Map<String,Any>>(HttpStatus.ACCEPTED).body(messages.submit(peer,body)).header("Cache-Control","no-store")}
        catch(error:ContactLimited){HttpResponse.status<Map<String,Any>>(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After",error.retry.toString())
            .body(mapOf("message" to "Recibimos varios mensajes desde esta conexión. Volvé a intentarlo más tarde."))}
    }
}
