package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException
import jakarta.inject.Singleton
import org.mindrot.jbcrypt.BCrypt
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.sql.DataSource

fun fail(status: HttpStatus, text: String): Nothing = throw HttpStatusException(status, text)
fun required(map: Map<String, Any?>, key: String, max: Int = 300): String {
    val v = (map[key] as? String)?.trim() ?: fail(HttpStatus.BAD_REQUEST, "$key es obligatorio")
    if (v.isBlank() || v.length > max) fail(HttpStatus.BAD_REQUEST, "$key inválido")
    return v
}
fun asBoolean(data: Map<String, Any?>, key: String, default: Boolean = false): Boolean = data[key] as? Boolean ?: default
fun randomString(n: Int=32): String { val bytes=ByteArray(n);SecureRandom().nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) }
fun hashToken(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
fun safeUuid(s: String): UUID = try { UUID.fromString(s) } catch (_: Exception) { fail(HttpStatus.BAD_REQUEST,"Identificador inválido") }

@Singleton
class Db(private val datasource: DataSource) {
    private class Transaction(val connection: Connection, var rollbackOnly: Boolean = false)
    private val current = ThreadLocal<Transaction>()

    // Blocking services invoked inside a transaction share its connection. They
    // must not borrow another pool slot while holding a row lock on the first.
    private fun <T> connection(block: (Connection) -> T): T {
        val transaction = current.get()
        return if (transaction != null) block(transaction.connection)
        else datasource.connection.use(block)
    }
    private fun row(rs: ResultSet): Map<String, Any?> {
        val meta = rs.metaData
        return (1..meta.columnCount).associate { i -> meta.getColumnLabel(i) to rs.getObject(i) }
    }
    fun list(sql: String, vararg args: Any?): List<Map<String, Any?>> = connection { c ->
        c.prepareStatement(sql).use { s ->
            args.forEachIndexed { i, v -> s.setObject(i+1,v) }
            s.executeQuery().use { r -> buildList { while (r.next()) add(row(r)) } }
        }
    }
    fun one(sql: String, vararg args: Any?): Map<String, Any?>? = list(sql,*args).firstOrNull()
    fun exec(sql: String, vararg args: Any?): Int = connection { c ->
        c.prepareStatement(sql).use { s -> args.forEachIndexed { i,v -> s.setObject(i+1,v) }; s.executeUpdate() }
    }
    fun <T> transaction(block: (Connection)->T): T {
        val nested = current.get()
        if (nested != null) {
            try { return block(nested.connection) }
            catch (failure: Throwable) { nested.rollbackOnly = true; throw failure }
        }
        return datasource.connection.use { c ->
            val old = c.autoCommit
            c.autoCommit = false
            val transaction = Transaction(c)
            current.set(transaction)
            try {
                val result = block(c)
                check(!transaction.rollbackOnly) { "La transacción fue cancelada por una operación interna" }
                c.commit()
                result
            } catch (failure: Throwable) {
                try { c.rollback() } catch (rollback: Throwable) { failure.addSuppressed(rollback) }
                throw failure
            } finally {
                current.remove()
                c.autoCommit = old
            }
        }
    }
}

@Singleton
class Auth(private val db: Db,private val roles:RolePolicy) {
    fun register(body: Map<String,Any?>): Map<String,Any?> {
        val name=required(body,"name",120)
        val email=required(body,"email",200).lowercase()
        val password=required(body,"password",128)
        if (!email.contains('@')||!email.contains('.')) fail(HttpStatus.BAD_REQUEST,"Correo electrónico inválido")
        if(password.toByteArray(Charsets.UTF_8).size>72) fail(HttpStatus.BAD_REQUEST,"Contraseña de máximo 72 bytes UTF-8")
        if(password.length<10) fail(HttpStatus.BAD_REQUEST,"Contraseña de al menos 10 caracteres")
        if(db.one("SELECT id FROM admin_user WHERE email=?",email)!=null) fail(HttpStatus.CONFLICT,"El correo ya está registrado")
        val id=UUID.randomUUID()
        db.exec("INSERT INTO admin_user(id,name,email,password_hash) VALUES(?,?,?,?)",id,name,email,BCrypt.hashpw(password,BCrypt.gensalt(12)))
        roles.grantVenueAdmin(id)
        return issue(id,name,email)
    }
    fun login(body:Map<String,Any?>):Map<String,Any?> {
        val email=required(body,"email",200).lowercase()
        val password=required(body,"password",128)
        if(password.toByteArray(Charsets.UTF_8).size>72) fail(HttpStatus.BAD_REQUEST,"La contraseña supera 72 bytes; usá recuperación para restablecerla")
        val user=db.one("SELECT id,name,email,password_hash FROM admin_user WHERE email=?",email)
        if(user==null || !BCrypt.checkpw(password,user["password_hash"] as String)) fail(HttpStatus.UNAUTHORIZED,"Credenciales incorrectas")
        return issue(user["id"] as UUID,user["name"] as String,email)
    }
    private fun issue(id:UUID,name:String,email:String):Map<String,Any?> {
        val token=randomString(48)
        db.exec("INSERT INTO auth_session(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)",UUID.randomUUID(),id,hashToken(token),java.sql.Timestamp.from(Instant.now().plusSeconds(86400*7L)))
        return mapOf("token" to token,"user" to mapOf("id" to id.toString(),"name" to name,"email" to email))
    }
    fun user(authorization:String): Map<String,Any?> {
        if(!authorization.startsWith("Bearer "))fail(HttpStatus.UNAUTHORIZED,"Sesión requerida")
        val token=authorization.removePrefix("Bearer ").trim()
        if(token.length<40)fail(HttpStatus.UNAUTHORIZED,"Token inválido")
        val principal=db.one("""SELECT u.id,u.name,u.email FROM auth_session s JOIN admin_user u ON u.id=s.user_id
                     WHERE s.token_hash=? AND s.expires_at>now()""",hashToken(token))
            ?:fail(HttpStatus.UNAUTHORIZED,"Sesión expirada")
        val id=principal["id"] as UUID
        roles.requireVenueAdmin(id)
        return principal + mapOf("roles" to roles.forAdmin(id))
    }
    fun logout(authorization:String) {
        if(!authorization.startsWith("Bearer "))fail(HttpStatus.UNAUTHORIZED,"Sesión requerida")
        val token=authorization.removePrefix("Bearer ").trim()
        if(token.length<40)fail(HttpStatus.UNAUTHORIZED,"Token inválido")
        db.exec("DELETE FROM auth_session WHERE token_hash=?",hashToken(token))
    }
    fun ownVenue(id:String,authorization:String):Map<String,Any?> {
        val user=user(authorization)
        return db.one("SELECT * FROM venue WHERE id=? AND owner_id=?",safeUuid(id),user["id"])
            ?: fail(HttpStatus.FORBIDDEN,"No podés administrar este establecimiento")
    }
}
