package com.amplify.api

import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import jakarta.inject.Singleton
import java.util.UUID

@Singleton
class SpotifyMusicEditGateway(private val spotify:Spotify):MusicEditGateway {
    override val enabled get()=spotify.playlistWriteEnabled
    override fun snapshot(venue:UUID,playlist:String)=spotify.adminPlaylist(venue,playlist)
    override fun create(venue:UUID,name:String,marker:String)=spotify.createAdminPlaylist(venue,name,marker)
    override fun findCreated(venue:UUID,marker:String)=spotify.findAdminPlaylist(venue,marker)
    override fun edit(venue:UUID,plan:Map<String,Any?>)=spotify.editAdminPlaylist(venue,plan)
}

@Controller("/api/admin/venues/{id}/music")
@ExecuteOn(TaskExecutors.BLOCKING)
class AdminMusicController(private val auth:Auth,private val spotify:Spotify,private val edits:AdminMusic) {
    @Get("/playlist") fun playlist(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,Any?> {
        val venue=auth.ownVenue(id,authorization)
        val selected=(venue["playlist_id"] as? String).orEmpty()
        var error:String?=null
        val state=if(selected.isBlank())null else try {spotify.adminPlaylist(safeUuid(id),selected)} catch(e:Exception) {
            error="No se pudo cargar la playlist. Revisá la conexión y actualizá antes de editar.";null
        }
        return mapOf("playlist" to state,"operation" to edits.pending(safeUuid(id)),"error" to error)
    }
    @Post("/edits/{operationId}") fun edit(id:String,operationId:String,@Header(value="Authorization",defaultValue="")authorization:String,
        @Body body:Map<String,Any?>):Map<String,Any?> {
        auth.ownVenue(id,authorization)
        return edits.execute(safeUuid(id),safeUuid(operationId),body)
    }
    @Post("/edits/{operationId}/reconcile") fun reconcile(id:String,operationId:String,@Header(value="Authorization",defaultValue="")authorization:String,
        @Body body:Map<String,Any?>):Map<String,Any?> {
        auth.ownVenue(id,authorization)
        return edits.reconcile(safeUuid(id),safeUuid(operationId),body)
    }
    @Get("/browser-token") fun token(id:String,@Header(value="Authorization",defaultValue="")authorization:String):HttpResponse<*> {
        auth.ownVenue(id,authorization)
        return HttpResponse.ok(spotify.browserToken(safeUuid(id))).header("Cache-Control","no-store, private").header("Pragma","no-cache")
    }
    @Get("/player") fun player(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,Any?> {
        auth.ownVenue(id,authorization);return spotify.adminPlayer(safeUuid(id))
    }
    @Post("/player") fun control(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Boolean> {
        auth.ownVenue(id,authorization);return spotify.playerCommand(safeUuid(id),body)
    }
}
