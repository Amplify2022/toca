package com.amplify.api

import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.http.annotation.Header
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import io.micronaut.scheduling.annotation.Scheduled
import jakarta.inject.Singleton
import jakarta.mail.*
import jakarta.mail.internet.*
import java.util.Properties
import java.util.UUID
import org.mindrot.jbcrypt.BCrypt

@Singleton
class AccountMail(
 @Value("\${account.smtp.host:}") private val host:String,
 @Value("\${account.smtp.port:587}") private val port:Int,
 @Value("\${account.smtp.username:}") private val username:String,
 @Value("\${account.smtp.password:}") private val password:String,
 @Value("\${account.smtp.from:}") private val from:String,
 @Value("\${amplify.frontend-origin}") private val origin:String
){
 fun enabled()=host.isNotBlank()&&from.isNotBlank()&&origin.startsWith("https://")
 fun send(email:String,token:String,purpose:String,kind:String){
  if(!enabled())fail(HttpStatus.SERVICE_UNAVAILABLE,"El envío de correo no está configurado")
  val props=Properties();props["mail.smtp.host"]=host;props["mail.smtp.port"]=port.toString()
  props["mail.smtp.auth"]=username.isNotBlank().toString();props["mail.smtp.starttls.enable"]="true";props["mail.smtp.starttls.required"]="true"
  props["mail.smtp.ssl.checkserveridentity"]="true";props["mail.smtp.connectiontimeout"]="10000";props["mail.smtp.timeout"]="10000";props["mail.smtp.writetimeout"]="10000"
  val session=Session.getInstance(props,object:Authenticator(){override fun getPasswordAuthentication()=PasswordAuthentication(username,password)})
  val message=MimeMessage(session);message.setFrom(InternetAddress(from));message.setRecipients(Message.RecipientType.TO,InternetAddress.parse(email,true))
  message.subject=if(purpose=="reset")"Restablecer contraseña TOCÁ" else "Verificar correo TOCÁ"
  message.setText("Abrí este enlace de un solo uso (vence en 30 minutos):\n$origin/#/account?kind=$kind&purpose=$purpose&token=$token\nSi no lo solicitaste, ignoralo.","UTF-8")
  try{Transport.send(message)}catch(_:Exception){fail(HttpStatus.SERVICE_UNAVAILABLE,"No se pudo enviar el correo. Reintentá más tarde")}
 }
}

@Singleton
class AccountManagement(private val db:Db,private val customers:CustomerAuth,private val admins:Auth,private val mail:AccountMail){
 private fun table(kind:String)=when(kind){"customer"->"customer_account";"admin"->"admin_user";else->fail(HttpStatus.BAD_REQUEST,"Tipo de cuenta inválido")}
 private fun sessions(kind:String)=if(kind=="customer")"customer_session" else "auth_session"
 private fun idColumn(kind:String)=if(kind=="customer")"customer_id" else "user_id"
 private fun user(kind:String,authorization:String):Map<String,Any?>{table(kind);return if(kind=="customer")customers.user(authorization) else admins.user(authorization)}
 private fun password(raw:Any?):String {val value=raw as? String?:fail(HttpStatus.BAD_REQUEST,"Contraseña requerida");if(value!=value.trim()||value.length<10||value.toByteArray(Charsets.UTF_8).size>72)fail(HttpStatus.BAD_REQUEST,"Contraseña de 10 caracteres a 72 bytes UTF-8");return value}
 fun request(kind:String,email:String,purpose:String):Map<String,Boolean>{
  val table=table(kind);if(purpose !in setOf("reset","verify"))fail(HttpStatus.BAD_REQUEST,"Acción inválida")
  if(!mail.enabled())fail(HttpStatus.SERVICE_UNAVAILABLE,"El correo de recuperación no está configurado")
  val account=db.one("SELECT id FROM $table WHERE email=?",email.trim().lowercase())
  if(account!=null){val token=randomString(48);db.transaction{db.one("SELECT id FROM $table WHERE id=? FOR UPDATE",account["id"]);db.exec("INSERT INTO account_action(token_hash,kind,account_id,purpose,expires_at) VALUES(?,?,?,?,now()+interval '30 minutes')",hashToken(token),kind,account["id"],purpose)};mail.send(email.trim().lowercase(),token,purpose,kind)}
  return mapOf("accepted" to true)
 }
 fun consume(kind:String,body:Map<String,Any?>):Map<String,Boolean>{
  val table=table(kind);val hash=hashToken(required(body,"token",200));if(db.one("SELECT token_hash FROM account_action WHERE token_hash=? AND kind=? AND expires_at>now()",hash,kind)==null)fail(HttpStatus.BAD_REQUEST,"Enlace inválido o vencido");val secret=(body["password"] as? String)?.let{BCrypt.hashpw(password(it),BCrypt.gensalt(12))}
  return db.transaction{
   val action=db.one("SELECT * FROM account_action WHERE token_hash=? AND kind=? AND expires_at>now() FOR UPDATE",hash,kind)?:fail(HttpStatus.BAD_REQUEST,"Enlace inválido o vencido")
   if(action["purpose"]=="reset"){
    if(secret==null)fail(HttpStatus.BAD_REQUEST,"Ingresá una contraseña nueva")
    db.exec("UPDATE $table SET password_hash=? WHERE id=?",secret,action["account_id"])
    db.exec("DELETE FROM ${sessions(kind)} WHERE ${idColumn(kind)}=?",action["account_id"])
   }else db.exec("UPDATE $table SET email_verified_at=now() WHERE id=?",action["account_id"])
   db.exec("DELETE FROM account_action WHERE kind=? AND account_id=? AND purpose=?",kind,action["account_id"],action["purpose"])
   mapOf("completed" to true)
  }
 }
 fun change(kind:String,authorization:String,body:Map<String,Any?>):Map<String,Boolean>{
  val account=user(kind,authorization);val table=table(kind);val hashed=BCrypt.hashpw(password(body["newPassword"]),BCrypt.gensalt(12))
  return db.transaction{val row=db.one("SELECT password_hash FROM $table WHERE id=? FOR UPDATE",account["id"])!!
   val old=row["password_hash"] as? String?:fail(HttpStatus.CONFLICT,"Primero creá una contraseña mediante recuperación de correo")
   if(!BCrypt.checkpw(required(body,"currentPassword",128),old))fail(HttpStatus.UNAUTHORIZED,"Contraseña actual incorrecta")
   db.exec("UPDATE $table SET password_hash=? WHERE id=?",hashed,account["id"]);db.exec("DELETE FROM account_action WHERE kind=? AND account_id=? AND purpose='reset'",kind,account["id"]);db.exec("DELETE FROM ${sessions(kind)} WHERE ${idColumn(kind)}=?",account["id"]);mapOf("changed" to true)}
 }
 fun revoke(kind:String,authorization:String):Map<String,Boolean>{val account=user(kind,authorization);db.exec("DELETE FROM ${sessions(kind)} WHERE ${idColumn(kind)}=?",account["id"]);return mapOf("revoked" to true)}
 fun delete(kind:String,authorization:String,body:Map<String,Any?>):Map<String,Boolean>{
  val account=user(kind,authorization);val table=table(kind)
  if(body["confirmation"]!="ELIMINAR")fail(HttpStatus.BAD_REQUEST,"Escribí ELIMINAR para confirmar")
  db.transaction{
   val row=db.one("SELECT password_hash FROM $table WHERE id=? FOR UPDATE",account["id"])!!
   val hash=row["password_hash"] as? String
   if(hash==null)fail(HttpStatus.CONFLICT,"Primero configurá una contraseña mediante recuperación")
   if(!BCrypt.checkpw(required(body,"password",128),hash))fail(HttpStatus.UNAUTHORIZED,"Contraseña incorrecta")
   if(kind=="admin"&&db.one("SELECT id FROM venue WHERE owner_id=? LIMIT 1",account["id"])!=null)fail(HttpStatus.CONFLICT,"Eliminá o transferí tus bares antes de eliminar la cuenta")
   if(kind=="customer"&&db.one("SELECT id FROM request_command WHERE customer_id=? AND status IN ('PENDING','PREPARING','APPLYING','UNCERTAIN') LIMIT 1",account["id"])!=null)fail(HttpStatus.CONFLICT,"Hay pedidos pendientes de resolver")
   db.exec("DELETE FROM account_action WHERE kind=? AND account_id=?",kind,account["id"]);db.exec("DELETE FROM $table WHERE id=?",account["id"])
  };return mapOf("deleted" to true)
 }
 @Scheduled(fixedDelay="1h",initialDelay="1h") fun cleanup(){
  db.exec("DELETE FROM account_action WHERE expires_at<now()")
  db.exec("DELETE FROM customer_session WHERE expires_at<now()")
  db.exec("DELETE FROM auth_session WHERE expires_at<now()")
  db.exec("DELETE FROM spotify_oauth_state WHERE expires_at<now()")
  db.exec("DELETE FROM venue_customer_presence WHERE expires_at<now()")
  db.exec("DELETE FROM customer_login_failure WHERE happened_at<now()-interval '1 day'")
 }
}

@Controller("/api/accounts/{kind}")
@ExecuteOn(TaskExecutors.BLOCKING)
class AccountController(private val accounts:AccountManagement){
 @Post("/recover") fun recover(kind:String,@Body body:Map<String,Any?>)=accounts.request(kind,required(body,"email",200),"reset")
 @Post("/verify-request") fun verify(kind:String,@Body body:Map<String,Any?>)=accounts.request(kind,required(body,"email",200),"verify")
 @Post("/consume") fun consume(kind:String,@Body body:Map<String,Any?>)=accounts.consume(kind,body)
 @Post("/password") fun change(kind:String,@Header(value="Authorization",defaultValue="") authorization:String,@Body body:Map<String,Any?>)=accounts.change(kind,authorization,body)
 @Post("/revoke") fun revoke(kind:String,@Header(value="Authorization",defaultValue="") authorization:String)=accounts.revoke(kind,authorization)
 @Post("/delete") fun delete(kind:String,@Header(value="Authorization",defaultValue="") authorization:String,@Body body:Map<String,Any?>)=accounts.delete(kind,authorization,body)
}

@Controller("/api/customers/me/favorites")
@ExecuteOn(TaskExecutors.BLOCKING)
class FavoriteController(private val auth:CustomerAuth,private val db:Db){
 @Get fun list(@Header(value="Authorization",defaultValue="") authorization:String):List<String>{val id=auth.user(authorization)["id"];return db.list("SELECT venue_id FROM customer_favorite WHERE customer_id=? ORDER BY venue_id",id).map{it["venue_id"].toString()}}
 @Put("/{id}") fun add(id:String,@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean>{val user=auth.user(authorization);val venue=safeUuid(id);if(db.one("SELECT id FROM venue WHERE id=?",venue)==null)fail(HttpStatus.NOT_FOUND,"Bar no encontrado");db.exec("INSERT INTO customer_favorite VALUES(?,?) ON CONFLICT DO NOTHING",user["id"],venue);return mapOf("saved" to true)}
 @Delete("/{id}") fun remove(id:String,@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean>{db.exec("DELETE FROM customer_favorite WHERE customer_id=? AND venue_id=?",auth.user(authorization)["id"],safeUuid(id));return mapOf("removed" to true)}
}
