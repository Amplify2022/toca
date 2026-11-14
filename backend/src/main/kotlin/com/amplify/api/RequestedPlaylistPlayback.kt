package com.amplify.api

/** A matching context URI alone also occurs during Spotify autoplay. */
internal object RequestedPlaylistPlayback {
    fun usesPlaylist(playlistId: String, ids: List<String?>, context: String, track: String?): Boolean =
        context == "spotify:playlist:$playlistId" && !track.isNullOrBlank() && track in ids

    fun shouldRestart(required: Boolean, attempted: Boolean, playingPlaylist: Boolean): Boolean =
        required && (!attempted || !playingPlaylist)

    fun body(playlistId: String, ids: List<String?>): Map<String, Any> {
        val first = requireNotNull(ids.firstOrNull())
        val offset = if(ids.count { it==first }==1) mapOf("uri" to "spotify:track:$first") else mapOf("position" to 0)
        return mapOf("context_uri" to "spotify:playlist:$playlistId", "offset" to offset, "position_ms" to 0)
    }
}
