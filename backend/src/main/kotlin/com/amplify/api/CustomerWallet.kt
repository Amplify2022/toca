package com.amplify.api

import io.micronaut.context.annotation.Value
import io.micronaut.http.HttpStatus
import io.micronaut.http.HttpResponse
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.sql.Timestamp
import java.util.UUID

@Singleton
class CustomerWallet(private val db: Db,
    @Value("\${amplify.tokens.simulated-topups-enabled:true}") private val simulatedTopupsEnabled: Boolean = true) {
    private val packs = listOf(
        mapOf("id" to "5", "tokens" to 5, "price" to 99),
        mapOf("id" to "12", "tokens" to 12, "price" to 199),
        mapOf("id" to "30", "tokens" to 30, "price" to 399))
    private fun inFlight(customer: UUID) = (db.one("SELECT coalesce(sum(amount),0) AS n FROM customer_token_hold WHERE customer_id=? AND status='RESERVED'", customer)!!.getValue("n") as Number).toInt()

    private fun lock(customer: UUID): Int {
        db.exec("INSERT INTO customer_wallet(customer_id) VALUES(?) ON CONFLICT DO NOTHING", customer)
        return (db.one("SELECT balance FROM customer_wallet WHERE customer_id=? FOR UPDATE", customer)!!.getValue("balance") as Number).toInt()
    }

    fun snapshot(customer: UUID): Map<String, Any?> = db.transaction {
        val balance = lock(customer)
        val movements = db.list("""SELECT e.id,CASE WHEN e.kind='RESERVE' THEN 'SPEND' ELSE e.kind END AS kind,
            e.amount,e.pack_id AS "packId",e.created_at AS "createdAt",c.title,c.artist,v.name AS "venueName"
            FROM customer_token_entry e LEFT JOIN customer_token_hold h ON h.command_id=e.command_id
            LEFT JOIN request_command c ON c.id=e.command_id LEFT JOIN venue v ON v.id=c.venue_id
            WHERE e.customer_id=? AND (e.kind IN ('TOPUP','SPEND') OR
                (e.kind='RESERVE' AND h.status='CAPTURED' AND NOT EXISTS
                    (SELECT 1 FROM customer_token_entry n WHERE n.command_id=e.command_id AND n.kind='SPEND')))
            ORDER BY e.created_at DESC,e.id DESC LIMIT 50""", customer).map {
            it + mapOf("createdAt" to (it["createdAt"] as? Timestamp)?.toInstant()?.toString())
        }
        mapOf("balance" to balance, "requestCost" to 1,
            "simulationEnabled" to simulatedTopupsEnabled, "currency" to "UYU", "packs" to packs, "movements" to movements)
    }

    fun topUp(customer: UUID, packId: String, key: String): Map<String, Any?> {
        if (!simulatedTopupsEnabled) fail(HttpStatus.SERVICE_UNAVAILABLE, "Las recargas simuladas no están habilitadas")
        if (!key.matches(Regex("[A-Za-z0-9_-]{8,100}"))) fail(HttpStatus.BAD_REQUEST, "Falta una clave válida para confirmar la recarga")
        val pack = packs.find { it["id"] == packId } ?: fail(HttpStatus.BAD_REQUEST, "Paquete de tokens inválido")
        val credits = pack.getValue("tokens") as Int
        return db.transaction {
            val balance = lock(customer)
            val previous = db.one("SELECT id,pack_id FROM customer_token_entry WHERE customer_id=? AND idempotency_key=?", customer, key)
            if (previous != null && previous["pack_id"] != packId) fail(HttpStatus.CONFLICT, "Esta recarga ya corresponde a otro paquete")
            val id = previous?.get("id") as? UUID ?: UUID.randomUUID()
            if (previous == null) {
                if (balance > 1000000 - credits) fail(HttpStatus.CONFLICT, "Alcanzaste el saldo máximo de prueba")
                db.exec("UPDATE customer_wallet SET balance=balance+?,updated_at=now() WHERE customer_id=?", credits, customer)
                db.exec("INSERT INTO customer_token_entry(id,customer_id,kind,amount,idempotency_key,pack_id) VALUES(?,?,'TOPUP',?,?,?)", id, customer, credits, key, packId)
            }
            snapshot(customer) + mapOf("topupId" to id.toString(), "creditedTokens" to credits, "simulated" to true)
        }
    }

    /** Coordinate concurrent requests without changing the balance or ledger. */
    fun beginRequest(customer: UUID, command: UUID) = db.transaction {
        val balance = lock(customer)
        if (db.one("SELECT command_id FROM customer_token_hold WHERE command_id=?", command) != null) return@transaction
        if (balance < 1) throw InsufficientTokens()
        if (balance <= inFlight(customer))fail(HttpStatus.CONFLICT,"Esperá a que termine tu pedido anterior antes de enviar otro.")
        db.exec("INSERT INTO customer_token_hold(command_id,customer_id,amount,status) VALUES(?,?,1,'RESERVED')", command, customer)
    }

    /** Charge exactly once, in the same transaction that confirms the request. */
    fun capture(command: UUID) = settle(command, false)
    fun release(command: UUID) = settle(command, true)
    private fun settle(command: UUID, refund: Boolean) = db.transaction {
        val row = db.one("SELECT customer_id FROM customer_token_hold WHERE command_id=?", command) ?: return@transaction // pre-V20 command
        val customer = row.getValue("customer_id") as UUID
        lock(customer)
        val changed = db.exec("UPDATE customer_token_hold SET status=? WHERE command_id=? AND status='RESERVED'", if (refund) "RELEASED" else "CAPTURED", command)
        if (changed == 1 && !refund) {
            db.exec("UPDATE customer_wallet SET balance=balance-1,updated_at=now() WHERE customer_id=?", customer)
            db.exec("INSERT INTO customer_token_entry(id,customer_id,kind,amount,command_id) VALUES(?,?,'SPEND',-1,?)", UUID.randomUUID(), customer, command)
        }
    }
}

@Controller("/api/customers/me/wallet")
@ExecuteOn(TaskExecutors.BLOCKING)
class CustomerWalletController(private val auth: CustomerAuth, private val wallet: CustomerWallet) {
    @Get fun snapshot(@Header(value="Authorization",defaultValue="") authorization: String) =
        HttpResponse.ok(wallet.snapshot(auth.user(authorization).getValue("id") as UUID)).header("Cache-Control","no-store")
    @Post("/topups") fun topUp(@Header(value="Authorization",defaultValue="") authorization: String,
        @Header(value="Idempotency-Key",defaultValue="") key: String, @Body body: Map<String, Any?>) =
        HttpResponse.ok(wallet.topUp(auth.user(authorization).getValue("id") as UUID, required(body,"packId",20), key)).header("Cache-Control","no-store")
}
