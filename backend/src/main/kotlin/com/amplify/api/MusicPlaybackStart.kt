package com.amplify.api

import io.micronaut.http.HttpStatus

/** Resolve the selected song against the current list, without walking the player queue. */
internal object MusicPlaybackStart {
    fun body(playlist:MusicPlaylist,input:Map<String,Any?>):Map<String,Any> {
        val requestedPlaylist=input["playlistId"] as? String
        if(requestedPlaylist!=null && requestedPlaylist!=playlist.id)
            fail(HttpStatus.CONFLICT,"La playlist del bar cambió. Actualizá la lista antes de reproducir.")
        val raw=input["position"] as? Number?:fail(HttpStatus.BAD_REQUEST,"Posición requerida")
        val position=raw.toInt()
        if(raw.toDouble()!=position.toDouble() || position !in 0..999)fail(HttpStatus.BAD_REQUEST,"Posición inválida")
        val selected=input["trackId"] as? String
        if(selected!=null && !selected.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"Canción inválida")
        val matches=if(selected==null)emptyList() else playlist.tracks.indices.filter {playlist.tracks[it]["id"]==selected}
        val index=when {
            selected==null -> position
            matches.size==1 -> matches.single()
            position in matches && input["snapshot"]==playlist.snapshot -> position
            else -> fail(HttpStatus.CONFLICT,"La canción o su posición cambiaron. Actualizá la playlist antes de reproducir.")
        }
        val track=playlist.tracks.getOrNull(index)?:fail(HttpStatus.PRECONDITION_FAILED,"La canción no está disponible en la playlist.")
        val id=(track["id"] as? String)?.takeIf {it.matches(Regex("[A-Za-z0-9]{22}"))}
            ?:fail(HttpStatus.PRECONDITION_FAILED,"Esta canción no está disponible para reproducir en Spotify.")
        if(track["playable"]==false || track["isLocal"]==true)
            fail(HttpStatus.PRECONDITION_FAILED,"Spotify no permite reproducir esta canción con esta cuenta o desde el navegador.")
        val occurrences=playlist.tracks.count {it["id"]==id}
        val offset=if(occurrences==1)mapOf("uri" to "spotify:track:$id") else mapOf("position" to index)
        return mapOf("context_uri" to "spotify:playlist:${playlist.id}","offset" to offset,"position_ms" to 0)
    }
}
