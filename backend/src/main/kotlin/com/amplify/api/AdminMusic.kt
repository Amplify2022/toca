package com.amplify.api

import com.fasterxml.jackson.databind.ObjectMapper
import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.util.UUID

data class MusicPlaylist(val id:String,val name:String,val snapshot:String,val tracks:List<Map<String,Any?>>) {
    val ids get()=tracks.map { it["id"] as? String }
}

interface MusicEditGateway {
    val enabled:Boolean
    fun snapshot(venue:UUID,playlist:String):MusicPlaylist
    fun create(venue:UUID,name:String,marker:String):String
    fun findCreated(venue:UUID,marker:String):String?
    fun edit(venue:UUID,plan:Map<String,Any?>)
}

/** Index-based edits retain duplicates and unavailable entries. */
object MusicEditPlan {
    fun build(action:String,body:Map<String,Any?>,state:MusicPlaylist):Map<String,Any?> {
        if(body["snapshot"]!=state.snapshot)fail(HttpStatus.CONFLICT,"La playlist cambió. Actualizá antes de editar.")
        val ids=state.ids.toMutableList()
        fun index(key:String):Int {
            val value=body[key] as? Number ?: fail(HttpStatus.BAD_REQUEST,"Posición requerida")
            val i=value.toInt()
            if(value.toDouble()!=i.toDouble() || i !in ids.indices)fail(HttpStatus.BAD_REQUEST,"Posición inválida")
            return i
        }
        val extra=mutableMapOf<String,Any?>()
        when(action) {
            "add" -> {
                val track=required(body,"trackId",22)
                if(!track.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"Canción inválida")
                if(ids.size>=1000)fail(HttpStatus.CONFLICT,"Máximo 1000 canciones por playlist")
                ids.add(track);extra["trackId"]=track
            }
            "remove" -> { val i=index("position");if(ids[i]==null)fail(HttpStatus.BAD_REQUEST,"Este elemento no está disponible para editar");extra["position"]=i;extra["trackId"]=ids.removeAt(i) }
            "move" -> {val from=index("from");val to=index("to");extra["from"]=from;extra["to"]=to;ids.add(to,ids.removeAt(from))}
            "rename" -> extra["name"]=required(body,"name",100)
            else -> fail(HttpStatus.BAD_REQUEST,"Edición inválida")
        }
        return mapOf("action" to action,"playlistId" to state.id,"snapshot" to state.snapshot,"before" to state.ids,
            "expected" to ids,"oldName" to state.name) + extra
    }
}

@Singleton
class AdminMusic(private val db:Db,private val json:ObjectMapper,private val gateway:MusicEditGateway) {
    private fun decode(raw:Any?):Map<String,Any?> = json.readValue(raw as String,Map::class.java) as Map<String,Any?>
    private fun row(id:UUID,venue:UUID)=db.one("SELECT * FROM venue_music_operation WHERE id=? AND venue_id=?",id,venue)
        ?: fail(HttpStatus.NOT_FOUND,"Edición no encontrada")
    private fun response(row:Map<String,Any?>):Map<String,Any?> = mapOf("id" to row["id"],"status" to row["status"],
        "action" to row["plan"]?.let { decode(it)["action"] },
        "message" to row["message"],"result" to row["result"]?.let { decode(it) })
    fun pending(venue:UUID):Map<String,Any?>? = db.one("SELECT * FROM venue_music_operation WHERE venue_id=? AND status IN ('PREPARING','APPLYING','UNCERTAIN')",venue)?.let(::response)

    fun execute(venue:UUID,id:UUID,body:Map<String,Any?>):Map<String,Any?> {
        if(!gateway.enabled)fail(HttpStatus.PRECONDITION_FAILED,"Las escrituras de playlist están desactivadas en este entorno")
        val action=required(body,"action",12)
        val hash=hashToken(json.writeValueAsString(body.toSortedMap()))
        val selected=db.transaction {
            val v=db.one("SELECT playlist_id FROM venue WHERE id=? FOR UPDATE",venue)?:fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            val existing=db.one("SELECT * FROM venue_music_operation WHERE id=?",id)
            if(existing!=null) {
                if(existing["venue_id"]!=venue || existing["input_hash"]!=hash)fail(HttpStatus.CONFLICT,"La clave corresponde a otra edición")
                return@transaction null
            }
            if(pending(venue)!=null || db.one("SELECT id FROM request_command WHERE venue_id=? AND status IN ('PENDING','PREPARING','APPLYING','UNCERTAIN') LIMIT 1",venue)!=null)
                fail(HttpStatus.CONFLICT,"Hay una sincronización pendiente. Resolvela antes de editar la playlist.")
            db.exec("INSERT INTO venue_music_operation(id,venue_id,input_hash,status) VALUES(?,?,?,'PREPARING')",id,venue,hash)
            v["playlist_id"] as? String ?: ""
        } ?: return response(row(id,venue))
        var applying=false
        try {
            val plan=if(action=="create")mapOf("action" to "create","name" to required(body,"name",100),"marker" to "toca:$id")
                else {
                    if(selected.isBlank())fail(HttpStatus.PRECONDITION_FAILED,"Seleccioná o creá una playlist")
                    MusicEditPlan.build(action,body,gateway.snapshot(venue,selected))
                }
            // No SQL connection/transaction remains open during provider calls.
            val changed=db.exec("UPDATE venue_music_operation SET plan=?,status='APPLYING',updated_at=now() WHERE id=? AND status='PREPARING'",
                json.writeValueAsString(plan),id)
            if(changed!=1)fail(HttpStatus.CONFLICT,"La edición ya no está activa")
            applying=true
            val playlist=if(action=="create")gateway.create(venue,plan["name"] as String,plan["marker"] as String)
                else {gateway.edit(venue,plan);selected}
            val actual=gateway.snapshot(venue,playlist)
            if(action!="create" && !matches(plan,actual))fail(HttpStatus.CONFLICT,"Spotify cambió durante la edición. Revisá el estado actual.")
            finish(id,venue,actual,action=="create")
        } catch (error:Exception) {
            val reason=(error as? io.micronaut.http.exceptions.HttpStatusException)?.message
                ?.replace(Regex("[\\r\\n\\t]")," ")?.take(200)
            db.exec("UPDATE venue_music_operation SET status=?,message=?,updated_at=now() WHERE id=? AND status IN ('PREPARING','APPLYING')",
                if(applying)"UNCERTAIN" else "FAILED",
                (if(applying)"No se confirmó el resultado. Consultá el estado antes de realizar otra edición." else "No se pudo preparar la edición. Actualizá la playlist y verificá la conexión.")+
                    (reason?.let {" $it"}?:""),id)
        }
        return response(row(id,venue))
    }
    private fun matches(plan:Map<String,Any?>,state:MusicPlaylist)=
        state.ids==plan["expected"] && (plan["action"]!="rename" || state.name==plan["name"])
    private fun finish(id:UUID,venue:UUID,state:MusicPlaylist,select:Boolean) {
        db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",venue)
            if(select)db.exec("UPDATE venue SET playlist_id=?,queue_started_at=now(),updated_at=now() WHERE id=?",state.id,venue)
            db.exec("UPDATE venue_music_operation SET status='COMPLETED',result=?,message=NULL,updated_at=now() WHERE id=?",
                json.writeValueAsString(mapOf("playlistId" to state.id,"name" to state.name)),id)
        }
    }
    /** Read-only recovery. Never resend an unknown provider write. */
    fun reconcile(venue:UUID,id:UUID,body:Map<String,Any?>):Map<String,Any?> {
        val operation=row(id,venue)
        if(operation["status"] !in listOf("PREPARING","APPLYING","UNCERTAIN"))return response(operation)
        val stale=db.one("SELECT id FROM venue_music_operation WHERE id=? AND updated_at<now()-interval '5 minutes'",id)!=null
        if(operation["status"]!="UNCERTAIN" && !stale)fail(HttpStatus.CONFLICT,"La edición sigue en proceso. Esperá a que termine.")
        if(operation["plan"]==null) {
            db.exec("UPDATE venue_music_operation SET status='FAILED',updated_at=now() WHERE id=? AND status='PREPARING'",id)
            return response(row(id,venue))
        }
        val plan=decode(operation["plan"])
        val created=plan["action"]=="create"
        val playlist=if(created)gateway.findCreated(venue,plan["marker"] as String) else plan["playlistId"] as String
        if(playlist!=null) {
            val state=gateway.snapshot(venue,playlist)
            if(created || matches(plan,state))finish(id,venue,state,created)
            else if(body["acceptSnapshot"]==state.snapshot) {
                db.exec("UPDATE venue_music_operation SET status='RELEASED',message='Estado actual aceptado por el administrador',updated_at=now() WHERE id=?",id)
            }
        } else if(created && body["acceptMissing"]==true) {
            // The administrator explicitly reviewed the current playlist list.
            db.exec("UPDATE venue_music_operation SET status='RELEASED',updated_at=now() WHERE id=?",id)
        }
        return response(row(id,venue))
    }
}
