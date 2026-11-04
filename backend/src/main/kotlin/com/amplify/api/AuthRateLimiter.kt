package com.amplify.api

import io.micronaut.http.HttpRequest
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.MutableHttpResponse
import io.micronaut.http.filter.FilterContinuation
import io.micronaut.http.annotation.RequestFilter
import io.micronaut.http.annotation.ServerFilter
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import io.micronaut.scheduling.annotation.Scheduled
import io.micronaut.http.server.filter.FilterBodyParser
import jakarta.inject.Singleton
import java.util.Locale
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

data class AuthRateRule(val scope: String, val key: String, val limit: Int, val seconds: Int)

/** Input identity is only ever paired with the actual network peer: knowing a
 * victim's email must not let another IP lock that victim out globally.
 */
object AuthRatePolicy {
    private val paths = setOf(
        "/api/auth/login", "/api/auth/register",
        "/api/customers/login", "/api/customers/register",
        "/api/customers/google", "/api/customers/me/google/link"
    )

    fun covers(path: String): Boolean = path.trimEnd('/') in paths || path.trimEnd('/').matches(Regex("/api/accounts/(customer|admin)/(recover|verify-request|consume|password|delete|revoke)"))

    fun rules(path: String, peer: String, body: Map<String, Any?>?, authorization: String): List<AuthRateRule> {
        val normalizedPath = path.trimEnd('/')
        if (!covers(normalizedPath)) return emptyList()
        val registering = normalizedPath.endsWith("/register")
        val email = (body?.get("email") as? String)?.trim()?.lowercase(Locale.ROOT)?.take(200)
        // Google tokens are opaque and untrusted here. Hashing them limits replay
        // without parsing claims or creating a global mailbox/subject lockout.
        val principal = email?.takeIf { it.isNotBlank() }
            ?: authorization.takeIf { it.isNotBlank() }?.let { "session:" + hashToken(it) }
            ?: (body?.get("credential") as? String)?.take(8192)?.let { "credential:" + hashToken(it) }
        return buildList {
            // Local admission comes first so an already blocked peer/principal
            // cannot keep spending everyone else's global work budget.
            add(AuthRateRule("auth-peer", peer, 120, 900))
            if (registering) {
                val admin = normalizedPath.startsWith("/api/auth/")
                add(AuthRateRule(if (admin) "admin-registration" else "customer-registration",
                    peer, if (admin) 10 else 60, 3600))
            }
            if (principal != null) {
                add(AuthRateRule("auth-principal", "$normalizedPath\u0000$peer\u0000$principal", 10, 900))
            }
            // Charged only after local admission; a global rejection rolls back
            // new rows, bounding cardinality even with rotating identities/IPs.
            add(AuthRateRule("auth-global", "all", 1200, 60))
        }
    }
}

object TrustedProxyAddress {
    fun resolve(actual:String,supplied:String,forwarded:String,expected:String):String {
        val trusted=expected.length>=32&&java.security.MessageDigest.isEqual(expected.toByteArray(),supplied.toByteArray())
        val numeric=forwarded.matches(Regex("[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+")) ||
            (forwarded.contains(':')&&forwarded.matches(Regex("[0-9a-fA-F:.]+")))
        if(!trusted||!numeric||forwarded.length !in 2..64)return actual
        return runCatching{java.net.InetAddress.getByName(forwarded).hostAddress}.getOrDefault(actual)
    }
}

@Singleton
class AuthRateLimiter(private val db: Db) {
    private class Denied(val retryAfter: Int) : RuntimeException()
    /** Atomic bounded increment; concurrent workers/instances share the same row. */
    fun consume(rule: AuthRateRule): Boolean = db.one("""INSERT INTO auth_rate_bucket
        (scope,key_hash,attempts,expires_at) VALUES(?,?,1,now() + (? * interval '1 second'))
        ON CONFLICT (scope,key_hash) DO UPDATE SET
            attempts=CASE WHEN auth_rate_bucket.expires_at<=now() THEN 1 ELSE auth_rate_bucket.attempts+1 END,
            expires_at=CASE WHEN auth_rate_bucket.expires_at<=now()
                THEN now() + (? * interval '1 second') ELSE auth_rate_bucket.expires_at END
        WHERE auth_rate_bucket.expires_at<=now() OR auth_rate_bucket.attempts<?
        RETURNING attempts""", rule.scope, hashToken(rule.key), rule.seconds, rule.seconds, rule.limit) != null

    fun check(path: String, peer: String, body: Map<String, Any?>?, authorization: String): Int? {
        val rules = AuthRatePolicy.rules(path, peer, body, authorization)
        if (rules.isEmpty()) return null
        return try {
            db.transaction {
                for (rule in rules) {
                    if (!consume(rule)) throw Denied(rule.seconds)
                }
            }
            null
        } catch (denied: Denied) {
            denied.retryAfter
        }
    }

    @Scheduled(fixedDelay = "5m", initialDelay = "5m")
    fun purgeExpired() {
        // Do not wait on an in-flight admission transaction while holding an
        // expired global bucket: SKIP LOCKED prevents reverse-order deadlocks.
        db.exec("""WITH expired AS (
            SELECT scope,key_hash FROM auth_rate_bucket WHERE expires_at<now()
            ORDER BY expires_at LIMIT 2000 FOR UPDATE SKIP LOCKED
        ) DELETE FROM auth_rate_bucket b USING expired e
          WHERE b.scope=e.scope AND b.key_hash=e.key_hash""")
    }
}

/** Body-aware filter runs on the blocking executor before any password hash or
 * Google verification. Forwarded/X-Forwarded-For are deliberately not trusted.
 */
@ServerFilter("/api/auth/**", "/api/customers/**", "/api/accounts/**")
class AuthRateLimitFilter(
    private val limiter: AuthRateLimiter,
    private val bodyParser: FilterBodyParser,
    @io.micronaut.context.annotation.Value("\${amplify.trusted-proxy-token:}") private val proxyToken:String = "",
) {
    @RequestFilter
    @ExecuteOn(TaskExecutors.BLOCKING)
    fun check(request: HttpRequest<*>, continuation: FilterContinuation<MutableHttpResponse<*>>): MutableHttpResponse<*> {
        if (request.method.name != "POST" || !AuthRatePolicy.covers(request.path))
            return continuation.proceed()
        // Filters do not support controller-style @Body Map binding. The
        // supported parser preserves the body for the eventual controller. This
        // entire continuation runs on BLOCKING, never on the Netty event loop.
        val body = try { bodyParser.parseBody(request).get(10, TimeUnit.SECONDS) }
        catch (_: TimeoutException) { return HttpResponse.status<Any>(HttpStatus.REQUEST_TIMEOUT) }
        catch (_: ExecutionException) { return HttpResponse.badRequest(mapOf("message" to "Cuerpo de solicitud inválido")) }
        val actualPeer = request.remoteAddress.address?.hostAddress ?: request.remoteAddress.hostString
        val supplied=request.headers.get("X-Toca-Proxy-Key").orEmpty()
        val forwarded=request.headers.get("X-Toca-Client-IP").orEmpty()
        val peer=TrustedProxyAddress.resolve(actualPeer,supplied,forwarded,proxyToken)
        val retryAfter = limiter.check(request.path, peer, body, request.headers.get("Authorization").orEmpty())
            ?: return continuation.proceed()
        return HttpResponse.status<Map<String, String>>(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", retryAfter.toString())
            .body(mapOf("message" to "Demasiados intentos desde esta conexión. Reintentá más tarde."))
    }
}
