package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.context.annotation.Value
import io.micronaut.http.exceptions.HttpStatusException
import io.micronaut.scheduling.annotation.Scheduled
import jakarta.inject.Singleton
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class RequestPlaylistResult(val action: String, val position: Int, val warning: String?)

/** Provider boundary also allows failure-injection without real Google/Spotify accounts. */
interface RequestSpotifyGateway {
    val enabled: Boolean
    fun metadata(venueId: UUID, trackId: String): Map<String, String>
    fun token(venueId: UUID): String
    fun prepare(venueId: UUID, trackId: String, token: String, orderedQueue: List<String>, expectedPlaylistId: String): String
    fun apply(venueId: UUID, token: String, planJson: String): RequestPlaylistResult
    fun verify(venueId: UUID, token: String, planJson: String): RequestPlaylistResult?
}

/** Production gateways check durable ownership before each external mutation. */
interface OwnedRequestSpotifyGateway : RequestSpotifyGateway {
    fun applyOwned(venueId: UUID, token: String, planJson: String, beforeMutation: () -> Unit): RequestPlaylistResult
}

/** Recovery must recognize the saved plan's exact states before any write. */
interface RecoverableRequestSpotifyGateway : OwnedRequestSpotifyGateway {
    fun resumeOwned(venueId: UUID, token: String, planJson: String, beforeMutation: () -> Unit): RequestPlaylistResult
}

interface PlaybackRequestSpotifyGateway : RecoverableRequestSpotifyGateway {
    fun applyWithPlayback(venueId: UUID, token: String, planJson: String, attempted: Boolean,
        beforeMutation: () -> Unit, beforePlayback: () -> Unit): RequestPlaylistResult
    fun verifyWithPlayback(venueId: UUID, token: String, planJson: String, attempted: Boolean): RequestPlaylistResult?
}

@Singleton
class SpotifyRequestGateway(private val spotify: Spotify) : PlaybackRequestSpotifyGateway {
    override val enabled get() = spotify.playlistWriteEnabled
    override fun metadata(venueId: UUID, trackId: String): Map<String, String> =
        spotify.getTrack(venueId, trackId).let { mapOf("title" to it["title"]?.toString().orEmpty(), "artist" to it["artist"]?.toString().orEmpty()) }
    override fun token(venueId: UUID) = spotify.playlistMutationToken(venueId)
    override fun prepare(venueId: UUID, trackId: String, token: String, orderedQueue: List<String>, expectedPlaylistId: String) =
        spotify.prepareRequestPlan(venueId, trackId, token, orderedQueue, expectedPlaylistId)
    override fun apply(venueId: UUID, token: String, planJson: String) =
        spotify.applyRequestPlan(venueId, token, planJson).let { RequestPlaylistResult(it.action, it.position, it.warning) }
    override fun applyOwned(venueId: UUID, token: String, planJson: String, beforeMutation: () -> Unit) =
        spotify.applyRequestPlan(venueId, token, planJson, beforeMutation).let { RequestPlaylistResult(it.action, it.position, it.warning) }
    override fun verify(venueId: UUID, token: String, planJson: String) =
        spotify.verifyRequestPlan(venueId, token, planJson)?.let { RequestPlaylistResult(it.action, it.position, it.warning) }
    override fun resumeOwned(venueId: UUID, token: String, planJson: String, beforeMutation: () -> Unit) =
        applyOwned(venueId, token, planJson, beforeMutation)
    override fun applyWithPlayback(venueId: UUID, token: String, planJson: String, attempted: Boolean,
        beforeMutation: () -> Unit, beforePlayback: () -> Unit) =
        spotify.applyRequestPlan(venueId,token,planJson,beforeMutation,attempted,beforePlayback).let { RequestPlaylistResult(it.action,it.position,it.warning) }
    override fun verifyWithPlayback(venueId: UUID, token: String, planJson: String, attempted: Boolean) =
        spotify.verifyRequestPlan(venueId,token,planJson,attempted)?.let { RequestPlaylistResult(it.action,it.position,it.warning) }
}

/**
 * Short PostgreSQL transactions admit/claim/finalize durable commands. Provider
 * I/O NEVER runs in a transaction or while holding a venue row lock. Unknown
 * outcomes are checked automatically against the saved plan before resuming.
 */
@Singleton
class RequestCommands(private val db: Db, private val presence: VenuePresence,
                      private val gateway: RequestSpotifyGateway,
                      private val wallet: CustomerWallet,
                      @Value("\${amplify.requests.worker-enabled:true}") private val workerEnabled: Boolean = true) {
    private val running = ConcurrentHashMap<UUID, UUID>()
    private val activeStates = "'PREPARING','APPLYING','UNCERTAIN'"

    private fun lockVenue(id: UUID): Map<String, Any?> = db.one("SELECT * FROM venue WHERE id=? FOR UPDATE", id)
        ?: fail(HttpStatus.NOT_FOUND, "Bar no encontrado")

    /** Call under the same venue transaction as the mutation. */
    fun requireMutable(venueId: UUID) {
        if (db.one("SELECT id FROM venue_music_operation WHERE venue_id=? AND status IN ('PREPARING','APPLYING','UNCERTAIN') LIMIT 1",venueId)!=null)
            fail(HttpStatus.CONFLICT,"Hay una edición de playlist pendiente de revisión.")
        if (db.one("SELECT id FROM request_command WHERE venue_id=? AND status IN ('PENDING',$activeStates) LIMIT 1", venueId) != null)
            fail(HttpStatus.CONFLICT, "Hay un pedido sincronizándose o pendiente de revisión. Resolvelo antes de cambiar la sesión o sus reglas.")
    }

    private fun validate(venue: Map<String, Any?>, customerId: UUID, trackId: String,
                         title: String? = null, artist: String? = null) {
        val venueId = venue.getValue("id") as UUID
        if (db.one("SELECT id FROM venue_music_operation WHERE venue_id=? AND status IN ('PREPARING','APPLYING','UNCERTAIN') LIMIT 1",venueId)!=null)
            fail(HttpStatus.CONFLICT,"El administrador está actualizando la playlist. Intentá nuevamente en unos momentos.")
        if (venue["active"] != true || venue["spotify_premium"] != true)
            fail(HttpStatus.CONFLICT, "La sesión Spotify del bar está cerrada")
        if ((venue["playlist_id"] as? String).isNullOrBlank())
            fail(HttpStatus.PRECONDITION_FAILED, "Seleccioná la playlist del bar antes de recibir pedidos")
        if (!gateway.enabled)
            fail(HttpStatus.PRECONDITION_FAILED, "Las escrituras de playlist están desactivadas en este entorno")
        presence.requireAllowed(venueId, customerId)
        val blocked = if (title == null || artist == null) db.one(
            "SELECT 1 FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode='BLOCK'", venueId, trackId
        ) else db.one("""SELECT 1 FROM venue_track_rule WHERE venue_id=? AND mode='BLOCK' AND
            (track_id=? OR (lower(trim(coalesce(title,'')))=lower(trim(?)) AND
            lower(trim(coalesce(artist,'')))=lower(trim(?)) AND coalesce(title,'')<>'' AND coalesce(artist,'')<>'')) LIMIT 1""",
            venueId, trackId, title, artist)
        if (blocked != null) fail(HttpStatus.FORBIDDEN, "La canción está bloqueada por el bar")
        if (venue["curated_only"] == true && db.one(
                "SELECT 1 FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode='ALLOW'", venueId, trackId) == null)
            fail(HttpStatus.FORBIDDEN, "La canción no está en la lista blanca")
    }

    fun submit(venueId: UUID, customerId: UUID, body: Map<String, Any?>, idempotencyKey: String): Map<String, Any?> {
        val trackId = required(body, "trackId", 22)
        if (!trackId.matches(Regex("[A-Za-z0-9]{22}"))) fail(HttpStatus.BAD_REQUEST, "ID de canción inválido")
        val key = idempotencyKey.ifBlank { (body["requestId"] as? String).orEmpty() }.ifBlank { UUID.randomUUID().toString() }
        if (!key.matches(Regex("[A-Za-z0-9_-]{8,100}"))) fail(HttpStatus.BAD_REQUEST, "Idempotency-Key inválida")
        val guestId = (body["guestId"] as? String)?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{10,90}")) }
            ?: "customer-$customerId" // compatibility only: never the authorization/rate key
        val commandId = db.transaction {
            val venue = lockVenue(venueId)
            val existing = db.one("SELECT id,track_id FROM request_command WHERE venue_id=? AND customer_id=? AND idempotency_key=?",
                venueId, customerId, key)
            if (existing != null) {
                if (existing["track_id"] != trackId) fail(HttpStatus.CONFLICT, "La clave de reintento ya corresponde a otra canción")
                existing.getValue("id") as UUID
            } else {
                validate(venue, customerId, trackId) // cheap authenticated checks BEFORE provider calls
                val usage = db.one("""SELECT count(*) AS total,max(created_at) AS last_at FROM (
                    SELECT created_at FROM request_command WHERE venue_id=? AND customer_id=? AND created_at>now()-interval '10 minutes'
                    UNION ALL SELECT created_at FROM song_request_event WHERE venue_id=? AND customer_id=? AND command_id IS NULL
                      AND created_at>now()-interval '10 minutes') usage""", venueId, customerId, venueId, customerId)!!
                val last = (usage["last_at"] as? Timestamp)?.toInstant()
                GuestRequestLimits.reason((usage["total"] as Number).toInt(), last, Instant.now())?.let {
                    fail(HttpStatus.TOO_MANY_REQUESTS, it)
                }
                val outstanding = db.one("SELECT count(*) AS total FROM request_command WHERE venue_id=? AND status IN ('PENDING','PREPARING','APPLYING','UNCERTAIN')", venueId)!!
                if ((outstanding["total"] as Number).toInt() >= 100) fail(HttpStatus.TOO_MANY_REQUESTS, "El bar tiene demasiados pedidos pendientes. Reintentá más tarde")
                val id = UUID.randomUUID()
                db.exec("""INSERT INTO request_command(id,venue_id,customer_id,idempotency_key,track_id,guest_id,playlist_id,session_started_at,status)
                    VALUES(?,?,?,?,?,?,?,?,'PENDING')""", id, venueId, customerId, key, trackId, guestId, venue["playlist_id"], venue["queue_started_at"])
                wallet.beginRequest(customerId, id)
                id
            }
        }
        // Replaying a completed/uncertain key only reads its durable result;
        // it must not start another provider operation as a side effect.
        if (db.one("SELECT status FROM request_command WHERE id=?", commandId)?.get("status") == "PENDING")
            processVenue(venueId)
        return status(commandId, customerId)
    }

    private fun currentForCommand(command: Map<String, Any?>): Map<String, Any?> {
        val venue = lockVenue(command.getValue("venue_id") as UUID)
        if (venue["playlist_id"] != command["playlist_id"] || venue["queue_started_at"] != command["session_started_at"])
            fail(HttpStatus.CONFLICT, "La sesión o playlist cambió desde que se recibió el pedido")
        validate(venue, command.getValue("customer_id") as UUID, command.getValue("track_id") as String,
            command["title"] as? String, command["artist"] as? String)
        return venue
    }

    /** Processes at most one command. Other HTTP requests can return PENDING. */
    fun processVenue(venueId: UUID) {
        val owner = UUID.randomUUID()
        val command = db.transaction {
            lockVenue(venueId)
            if (db.one("SELECT id FROM request_command WHERE venue_id=? AND status IN ($activeStates) LIMIT 1", venueId) != null) null
            else {
                val next = db.one("SELECT * FROM request_command WHERE venue_id=? AND status='PENDING' ORDER BY sequence LIMIT 1 FOR UPDATE", venueId)
                if (next == null) null else {
                    db.exec("UPDATE request_command SET status='PREPARING',worker_id=?,lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=?", owner, next["id"])
                    next
                }
            }
        } ?: return
        val id = command.getValue("id") as UUID
        running[id] = owner
        var applying = false
        try {
            // First ensure an already-invalid queued command performs NO provider work.
            db.transaction { currentForCommand(command) }
            val track = gateway.metadata(venueId, command.getValue("track_id") as String)
            val token = gateway.token(venueId)
            val queue = db.transaction {
                val refreshed = command + mapOf("title" to track["title"], "artist" to track["artist"])
                val currentVenue = currentForCommand(refreshed) // repeat fresh rules AFTER provider metadata
                db.exec("UPDATE request_command SET title=?,artist=?,updated_at=now() WHERE id=? AND worker_id=? AND status='PREPARING'",
                    track["title"].orEmpty().take(300), track["artist"].orEmpty().take(300), id, owner)
                // The summary row groups songs for reporting. FIFO must use
                // individual successful commands so repeated paid requests keep
                // their own occurrence and chronological place in the queue.
                val rows = db.list("""SELECT track_id FROM request_command WHERE venue_id=? AND status='SUCCEEDED'
                    AND session_started_at IS NOT DISTINCT FROM ?::timestamptz
                    AND updated_at>=GREATEST(COALESCE(?::timestamptz,'epoch'::timestamptz),
                        COALESCE(?::timestamptz,'epoch'::timestamptz)) ORDER BY sequence""",
                    venueId,command["session_started_at"],command["session_started_at"],currentVenue["request_cycle_started_at"])
                    .map { it.getValue("track_id") as String }
                rows + command.getValue("track_id").toString()
            }
            val plan = gateway.prepare(venueId, command.getValue("track_id") as String, token, queue, command.getValue("playlist_id") as String)
            db.transaction {
                lockVenue(venueId)
                val latest = db.one("SELECT * FROM request_command WHERE id=? FOR UPDATE", id)!!
                if (latest["status"] != "PREPARING" || latest["worker_id"] != owner) fail(HttpStatus.CONFLICT, "El pedido ya no pertenece a este proceso")
                currentForCommand(latest) // last authorization check before the durable remote command
                db.exec("UPDATE request_command SET plan_json=?,status='APPLYING',lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=?", plan, id)
            }
            applying = true
            // No SQL transaction/row lock spans these calls. No player enqueue is
            // attempted: Spotify's live queue has no idempotency/replay primitive.
            val assertOwner = { renewOwnership(id, owner) }
            assertOwner()
            val result = if(gateway is PlaybackRequestSpotifyGateway) gateway.applyWithPlayback(venueId,token,plan,false,assertOwner,{ markPlayback(id,owner) })
                else if (gateway is OwnedRequestSpotifyGateway) gateway.applyOwned(venueId, token, plan, assertOwner)
                else gateway.apply(venueId, token, plan)
            finalize(id, owner, result)
        } catch (error: Exception) {
            val uncertain = applying && error !is RequestNotApplied && error !is RequestPlaybackRejected
            val message = if (uncertain) "Estamos comprobando automáticamente el resultado en Spotify. No hace falta aprobación del bar."
                else (error as? HttpStatusException)?.message?.take(500) ?: "No se pudo preparar el pedido. No se modificó Spotify."
            // If DB is unavailable, APPLYING remains durable and recovery marks
            // it uncertain. Never turn an unknown remote result into success.
            runCatching { db.transaction {
                lockVenue(venueId)
                val changed = db.exec("""UPDATE request_command SET status=?,error=?,updated_at=now(),
                lease_until=CASE WHEN ? THEN now() ELSE lease_until END
                WHERE id=? AND worker_id=? AND status IN ('PREPARING','APPLYING')""",
                if (uncertain) "UNCERTAIN" else "FAILED", message, uncertain, id, owner)
                if (changed == 1 && !uncertain) wallet.release(id)
            } }
        } finally { running.remove(id, owner) }
        // A lost response or failed local commit often leaves the final playlist
        // already correct. Confirm it now using reads only, without resending.
        if (applying) runCatching { confirmUncertain(id) }
    }

    private fun renewOwnership(id: UUID, owner: UUID) {
        val renewed = db.exec("""UPDATE request_command SET lease_until=now()+interval '15 minutes'
            WHERE id=? AND worker_id=? AND status='APPLYING' AND lease_until>now()""", id, owner)
        if (renewed != 1) fail(HttpStatus.CONFLICT, "El proceso perdió la autorización para modificar Spotify")
    }

    private fun markPlayback(id: UUID, owner: UUID) {
        if(db.exec("""UPDATE request_command SET playback_attempted=true
            WHERE id=? AND worker_id=? AND status='APPLYING' AND lease_until>now()""",id,owner)!=1)
            fail(HttpStatus.CONFLICT,"El pedido perdió la autorización para iniciar la playlist")
    }

    private fun verified(command: Map<String,Any?>, token: String): RequestPlaylistResult? {
        val venue=command.getValue("venue_id") as UUID
        val plan=command.getValue("plan_json") as String
        return if(gateway is PlaybackRequestSpotifyGateway) gateway.verifyWithPlayback(venue,token,plan,command["playback_attempted"]==true)
            else gateway.verify(venue,token,plan)
    }

    private fun confirmUncertain(id: UUID) {
        val command = db.one("SELECT * FROM request_command WHERE id=? AND status='UNCERTAIN'", id) ?: return
        val venueId = command.getValue("venue_id") as UUID
        val plan = command["plan_json"] as? String ?: return
        val result = verified(command,gateway.token(venueId)) ?: return
        finalize(id, command.getValue("worker_id") as UUID, result)
    }

    /** One durable owner may resume an expired command, using its frozen plan.
     * The grace period lets an in-flight provider request settle before writes.
     * Verification and mutations remain outside SQL transactions. */
    private fun recoverUncertain(id: UUID) {
        val row = db.one("SELECT venue_id FROM request_command WHERE id=?", id) ?: return
        val venueId = row.getValue("venue_id") as UUID
        val owner = UUID.randomUUID()
        val command = db.transaction {
            lockVenue(venueId)
            val current = db.one("SELECT * FROM request_command WHERE id=? FOR UPDATE", id) ?: return@transaction null
            val lease = (current["lease_until"] as? Timestamp)?.toInstant() ?: return@transaction null
            if (current["status"] != "UNCERTAIN" || running.containsKey(id) || lease.plusSeconds(120).isAfter(Instant.now())) return@transaction null
            if (current["plan_json"] !is String) return@transaction null
            db.exec("UPDATE request_command SET status='APPLYING',worker_id=?,lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=?", owner, id)
            current
        } ?: return
        running[id] = owner
        var resuming = false
        try {
            val token = gateway.token(venueId)
            val plan = command.getValue("plan_json") as String
            val verified = verified(command, token)
            val result = verified ?: run {
                val recoverable = gateway as? RecoverableRequestSpotifyGateway
                    ?: fail(HttpStatus.CONFLICT, "La integración no permite reanudar este pedido automáticamente")
                db.transaction { currentForCommand(command) }
                val assertOwner = { renewOwnership(id, owner) }
                assertOwner()
                resuming = true
                if(gateway is PlaybackRequestSpotifyGateway) gateway.applyWithPlayback(venueId,token,plan,command["playback_attempted"]==true,assertOwner,{markPlayback(id,owner)})
                else recoverable.resumeOwned(venueId, token, plan, assertOwner)
            }
            finalize(id, owner, result)
        } catch (error: Exception) {
            // Once the previous owner has settled, a conflicting playlist or
            // rejected authorization cannot require human approval of a song.
            // End this unconfirmed request honestly, refund it, and unblock the
            // following requests. Transient outages still back off and retry.
            val terminal = (!resuming || error is RequestNotApplied || error is RequestPlaybackRejected) && error is HttpStatusException &&
                error.status in setOf(HttpStatus.CONFLICT, HttpStatus.FORBIDDEN, HttpStatus.PRECONDITION_FAILED)
            db.transaction {
                lockVenue(venueId)
                val changed = db.exec("""UPDATE request_command SET status=?,lease_until=now(),updated_at=now(),error=?
                    WHERE id=? AND worker_id=? AND status='APPLYING'""",
                    if(terminal) "FAILED" else "UNCERTAIN",
                    if(terminal) "No pudimos completar el pedido. No se descontaron tokens."
                    else "Seguimos comprobando automáticamente la sincronización con Spotify.", id, owner)
                if(changed==1 && terminal) wallet.release(id)
            }
        } finally { running.remove(id, owner) }
    }

    private fun finalize(id: UUID, owner: UUID, result: RequestPlaylistResult) {
        val venueId = db.one("SELECT venue_id FROM request_command WHERE id=?",id)?.get("venue_id") as? UUID ?: return
        db.transaction {
            val venue = lockVenue(venueId)
            val command = db.one("SELECT * FROM request_command WHERE id=? FOR UPDATE", id) ?: return@transaction
            if (command["status"] == "SUCCEEDED") return@transaction
            if (command["worker_id"] != owner || command["status"] !in setOf("APPLYING", "UNCERTAIN")) return@transaction
            val old = db.one("""SELECT id,queued_at FROM song_request WHERE venue_id=? AND track_id=?
                AND status IN ('PENDING','APPROVED','DISPATCHED') FOR UPDATE""", venueId, command["track_id"])
            val requestId = old?.get("id") as? UUID ?: UUID.randomUUID()
            val restarted = result.action == "PLAYLIST_RESTARTED"
            val alreadyQueued = !restarted && (old?.get("queued_at") as? Timestamp)?.toInstant()?.let {
                val start = maxOf((command["session_started_at"] as? Timestamp)?.toInstant() ?: Instant.EPOCH,
                    (venue["request_cycle_started_at"] as? Timestamp)?.toInstant() ?: Instant.EPOCH)
                !it.isBefore(start)
            } == true
            if (old == null) db.exec("""INSERT INTO song_request(id,venue_id,track_id,title,artist,status,guest_id,playlist_position,queued_at,last_requested_at)
                VALUES(?,?,?,?,?,'DISPATCHED',?,?,now(),now())""", requestId, venueId, command["track_id"], command["title"], command["artist"], command["guest_id"], result.position)
            else db.exec("""UPDATE song_request SET status='DISPATCHED',request_count=request_count+1,playlist_position=?,
                queued_at=CASE WHEN ? THEN queued_at ELSE now() END,last_requested_at=now(),updated_at=now(),guest_id=? WHERE id=?""",
                result.position, alreadyQueued, command["guest_id"], requestId)
            db.exec("""INSERT INTO song_request_event(id,venue_id,request_id,guest_id,track_id,customer_id,command_id)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING""", UUID.randomUUID(), venueId, requestId, command["guest_id"], command["track_id"], command["customer_id"], id)
            db.exec("""UPDATE request_command SET status='SUCCEEDED',request_id=?,action=?,playlist_position=?,warning=?,error=NULL,updated_at=now()
                WHERE id=?""", requestId, result.action, result.position, result.warning, id)
            if(restarted)db.exec("UPDATE venue SET request_cycle_started_at=now() WHERE id=?",venueId)
            wallet.capture(id)
        }
    }

    private fun response(command: Map<String, Any?>): Map<String, Any?> {
        val internal = command["status"] as String
        val status = when (internal) { "SUCCEEDED" -> "DISPATCHED"; "PREPARING", "APPLYING" -> "PROCESSING"; else -> internal }
        val message = when (status) {
            "DISPATCHED" -> "La playlist confirmó tu pedido."
            "FAILED" -> command["error"] ?: "El pedido no pudo sincronizarse."
            else -> "Estamos agregando tu canción."
        }
        return mapOf("commandId" to command["id"].toString(), "id" to (command["request_id"] ?: command["id"]).toString(),
            "code" to if(command["action"]=="RETRY_AFTER_UPDATE") "REQUEST_RETRY_AFTER_UPDATE" else null,
            "requiresApproval" to false,
            "status" to status, "trackId" to command["track_id"], "title" to command["title"], "action" to command["action"],
            "playlistPosition" to command["playlist_position"], "warning" to command["warning"], "message" to message,
            "note" to "La playlist y la cola de reproducción de Spotify son objetos distintos; no se garantiza reproducción inmediata.")
    }

    fun status(commandId: UUID, customerId: UUID): Map<String, Any?> = response(db.one(
        "SELECT * FROM request_command WHERE id=? AND customer_id=?", commandId, customerId)
        ?: fail(HttpStatus.NOT_FOUND, "Pedido no encontrado"))

    fun listForVenue(venueId: UUID): List<Map<String, Any?>> = db.list(
        "SELECT * FROM request_command WHERE venue_id=? ORDER BY sequence DESC LIMIT 50", venueId).map(::response)

    /** Read-only provider check. Uncertain effects are NEVER automatically replayed. */
    fun reconcile(venueId: UUID, commandId: UUID): Map<String, Any?> {
        val command = db.one("SELECT * FROM request_command WHERE id=? AND venue_id=?", commandId, venueId)
            ?: fail(HttpStatus.NOT_FOUND, "Pedido no encontrado")
        if (command["status"] != "UNCERTAIN") return response(command)
        if (running.containsKey(commandId) || (command["lease_until"] as? Timestamp)?.toInstant()?.plusSeconds(120)?.isAfter(Instant.now()) == true)
            fail(HttpStatus.CONFLICT, "El proceso original todavía puede estar terminando. Esperá antes de revisar el resultado.")
        val plan = command["plan_json"] as? String ?: fail(HttpStatus.CONFLICT, "Este pedido no tiene un plan remoto para verificar")
        val result = verified(command,gateway.token(venueId))
        if (result != null) finalize(commandId, command.getValue("worker_id") as UUID, result)
        return response(db.one("SELECT * FROM request_command WHERE id=?", commandId)!!)
    }

    fun cancel(venueId: UUID, commandId: UUID, acknowledge: Boolean): Map<String, Any?> {
        if (!acknowledge) fail(HttpStatus.BAD_REQUEST, "Confirmá que revisaste el estado real de Spotify; cancelar no revierte sus cambios")
        db.transaction {
            lockVenue(venueId)
            val command = db.one("SELECT * FROM request_command WHERE id=? AND venue_id=? FOR UPDATE", commandId, venueId)
                ?: fail(HttpStatus.NOT_FOUND, "Pedido no encontrado")
            if (command["status"] != "UNCERTAIN") fail(HttpStatus.CONFLICT, "Solo se puede cerrar un resultado incierto")
            if (running.containsKey(commandId) || (command["lease_until"] as? Timestamp)?.toInstant()?.plusSeconds(120)?.isAfter(Instant.now()) == true)
                fail(HttpStatus.CONFLICT, "Esperá a que termine el proceso original antes de cerrar la revisión")
            db.exec("UPDATE request_command SET status='FAILED',error='Revisión cerrada por el administrador; los cambios de Spotify no fueron revertidos',updated_at=now() WHERE id=?", commandId)
            wallet.release(commandId)
        }
        return response(db.one("SELECT * FROM request_command WHERE id=?", commandId)!!)
    }

    @Scheduled(fixedDelay = "5s", initialDelay = "5s")
    fun recoverPending() {
        if (!workerEnabled) return
        // Preserve the saved plan across a crash; recovery checks remote state
        // and resumes only an exact known state after the original lease settles.
        db.list("SELECT id,venue_id FROM request_command WHERE status IN ('PREPARING','APPLYING') AND lease_until<now()")
            .forEach { row -> db.transaction {
                lockVenue(row.getValue("venue_id") as UUID)
                val id = row.getValue("id") as UUID
                val old = db.one("SELECT status FROM request_command WHERE id=? FOR UPDATE", id)!!
                val changed = db.exec("""UPDATE request_command SET status=CASE WHEN status='PREPARING' THEN 'FAILED' ELSE 'UNCERTAIN' END,
            error=CASE WHEN status='PREPARING' THEN 'El proceso terminó antes de modificar Spotify'
              ELSE 'Se interrumpió la sincronización; la app comprobará el resultado automáticamente' END,updated_at=now()
            WHERE id=? AND status IN ('PREPARING','APPLYING') AND lease_until<now()""", id)
                if (changed == 1 && old["status"] == "PREPARING") wallet.release(id)
            } }
        db.list("""SELECT id FROM request_command WHERE status='UNCERTAIN'
            AND lease_until<now()-interval '120 seconds' ORDER BY lease_until,sequence LIMIT 5""")
            .forEach { runCatching { recoverUncertain(it.getValue("id") as UUID) } }
        db.list("""SELECT venue_id FROM request_command WHERE status='PENDING' GROUP BY venue_id
            ORDER BY min(sequence) LIMIT 5""").forEach { runCatching { processVenue(it.getValue("venue_id") as UUID) } }
    }
}
