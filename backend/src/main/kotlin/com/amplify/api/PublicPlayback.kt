package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

@JsonInclude(JsonInclude.Include.ALWAYS)
data class PublicPlayback(val active:Boolean,val isPlaying:Boolean,val now:Map<String,Any?>?,val updatedAt:String=Instant.now().toString())

/** One brief, shared read per bar. Never load its playlist to identify the
 * current song; concurrent viewers share both the sample and provider backoff. */
internal class RecentPlayback(
    private val load:(UUID)->Map<String,Any?>,
    private val clock:()->Long=System::nanoTime
) {
    private data class Entry(val sample:PublicPlayback?,val failure:Exception?,val expires:Long)
    private val entries=ConcurrentHashMap<UUID,Entry>()
    fun get(venue:UUID):PublicPlayback {
        if(entries.size>=1000&&!entries.containsKey(venue))entries.entries.minByOrNull{it.value.expires}?.let{entries.remove(it.key,it.value)}
        val entry=entries.compute(venue){_,previous->
            if(previous!=null&&clock()<previous.expires)previous else try{
                val data=load(venue)
                val raw=data["now"] as? Map<*,*>
                val track=raw?.takeIf{(it["title"] as? String)?.isNotBlank()==true}?.entries
                    ?.filter{it.key in setOf("id","title","artist","durationMs","imageUrl")}
                    ?.associate{it.key.toString() to it.value}
                Entry(PublicPlayback(true,data["isPlaying"]==true,track),null,clock()+TimeUnit.MILLISECONDS.toNanos(500))
            }catch(error:Exception){
                val limited=error is io.micronaut.http.exceptions.HttpStatusException&&error.status==HttpStatus.TOO_MANY_REQUESTS
                Entry(null,error,clock()+TimeUnit.SECONDS.toNanos(if(limited)30 else 1))
            }
        }!!
        entry.failure?.let{throw it}
        return entry.sample!!
    }
}

@Singleton
class PublicPlaybackService(spotify:Spotify) {
    private val samples=RecentPlayback(spotify::adminPlayer)
    fun snapshot(venue:UUID):PublicPlayback=samples.get(venue)
}

@Controller("/api/venues/{id}/playback")
@ExecuteOn(TaskExecutors.BLOCKING)
class PublicPlaybackController(private val db:Db,private val playback:PublicPlaybackService) {
    @Get fun current(id:String):HttpResponse<PublicPlayback> {
        val uuid=safeUuid(id)
        val venue=db.one("SELECT active,spotify_premium FROM venue WHERE id=?",uuid)
            ?:fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        val snapshot=if(venue["active"]==true&&venue["spotify_premium"]==true)playback.snapshot(uuid)
            else PublicPlayback(false,false,null)
        return HttpResponse.ok(snapshot).header("Cache-Control","no-store")
    }
}
