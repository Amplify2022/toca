package com.amplify.api

import com.fasterxml.jackson.databind.JsonNode
import java.net.URI

/** Shared metadata for search, playlist and playback. No credentials or provider commands. */
internal object SpotifyTrack {
    fun from(node:JsonNode):Map<String,Any?> {
        val image=node.path("album").path("images").firstNotNullOfOrNull { candidate ->
            candidate.path("url").asText("").takeIf { value ->
                runCatching { val uri=URI(value);uri.scheme=="https" && !uri.host.isNullOrBlank() && uri.userInfo==null }.getOrDefault(false)
            }
        }
        return mapOf("id" to node.path("id").asText(),"title" to node.path("name").asText(),
            "artist" to node.path("artists").joinToString(", "){it.path("name").asText()},
            "durationMs" to node.path("duration_ms").asLong(0),"imageUrl" to image,
            "playable" to node.path("is_playable").takeIf {it.isBoolean}?.asBoolean(),
            "isLocal" to node.path("is_local").asBoolean(false))
    }
}
