package com.amplify.api

/**
 * Pure calculation for playlist item positions. It does NOT model Spotify's
 * already-loaded playback queue, which is a different object.
 */
object PlaylistPlanner {
    data class Plan(val existingIndex: Int?, val insertBefore: Int,
                    val resultPosition: Int, val action: String,
                    val ambiguousCurrent: Boolean)

    fun plan(ids: List<String?>, currentTrack: String?, samePlaylist: Boolean, wanted: String): Plan {
        val playing = if (samePlaylist && !currentTrack.isNullOrBlank())
            ids.indices.filter { ids[it] == currentTrack } else emptyList()
        val currentIndex = playing.firstOrNull()
        val nextIndex = if (currentIndex == null) 0 else currentIndex + 1
        // When current track is requested, never reorder the playing occurrence.
        val existing = ids.indices.firstOrNull { ids[it] == wanted && it != currentIndex }
        val action = when {
            existing == null -> "INSERTED"
            existing == nextIndex -> "ALREADY_NEXT"
            else -> "PROMOTED"
        }
        val effectivePos = if (existing != null && existing < nextIndex && existing != nextIndex)
            nextIndex - 1 else nextIndex
        return Plan(existing, nextIndex, effectivePos, action, playing.size > 1)
    }

    /**
     * FIFO planning for requests from the current venue session. The list
     * [queued] contains older requested track IDs, in chronological order.
     * This only reorders playlist items, not Spotify's live player queue.
     */
    fun planFifo(ids: List<String?>, currentTrack: String?, samePlaylist: Boolean,
                 wanted: String, queued: List<String>): Plan {
        val currentIndex = if (samePlaylist && !currentTrack.isNullOrBlank())
            ids.indexOfFirst { it == currentTrack } else -1
        val firstFree = if (currentIndex >= 0) currentIndex + 1 else 0
        // Existing requests before (or equal to) the currently playing item
        // have already been passed by the Spotify playback cursor.
        val queuedPositions = queued.mapNotNull { q ->
            ids.indices.lastOrNull { i -> ids[i] == q && i >= firstFree }
        }
        val insertBefore = maxOf(firstFree, (queuedPositions.maxOrNull() ?: -1) + 1)
        // Don't move the occurrence which is currently playing.
        val existing = ids.indices.firstOrNull { ids[it] == wanted && it != currentIndex }
        val action = when {
            existing == null -> "INSERTED"
            existing == insertBefore -> "ALREADY_IN_ORDER"
            // Moving the last queued item immediately after itself is already in order.
            existing + 1 == insertBefore -> "ALREADY_IN_ORDER"
            else -> "PROMOTED"
        }
        val effectivePosition = if (existing != null && existing < insertBefore)
            insertBefore - 1 else insertBefore
        return Plan(existing, insertBefore, effectivePosition, action,
            samePlaylist && currentTrack != null && ids.count { it == currentTrack } > 1)
    }


    /**
     * Reconcile the authoritative DB order with Spotify's playlist order.
     * If the player is outside the playlist, existing queued songs retain
     * their places from the start. Historical played requests are not re-added.
     */
    data class OrderStep(val trackId: String, val desiredIndex: Int,
                         val existingIndex: Int?, val action: String)
    data class OrderPlan(val protectedPrefix: Int, val steps: List<OrderStep>,
                         val expected: List<String?>, val activeQueue: List<String>)

    /**
     * Reconcile only the requests that have NOT passed the Spotify playback
     * cursor, plus the track requested right now. A DISPATCHED DB row is a
     * historical request, not proof that the song is still waiting to play.
     *
     * Example: B,C at indices 0,1; Spotify is playing index 6; D is requested.
     * Only D goes at index 7. We must not insert B,C again at indices 7,8.
     *
     * For an external playback context, Spotify provides no cursor into this
     * playlist; we preserve the already-present FIFO prefix from index zero.
     */
    fun reconcile(ids: List<String?>, currentTrack: String?, samePlaylist: Boolean,
                  orderedQueue: List<String>, requestedTrack: String): OrderPlan {
        require(requestedTrack in orderedQueue) { "Requested track must be in the DB queue" }
        val currentIndex = if(samePlaylist && !currentTrack.isNullOrBlank())
            ids.indexOfFirst { it == currentTrack } else -1
        val firstFree = if(currentIndex < 0) 0 else currentIndex + 1
        val futureIds = ids.drop(firstFree).toSet()
        // Previously requested tracks no longer ahead of the cursor have
        // already been played; only an explicit new request may re-add one.
        val activeQueue = orderedQueue.distinct().filter { it == requestedTrack || it in futureIds }
        val mutable = ids.toMutableList()
        val steps = mutableListOf<OrderStep>()
        activeQueue.forEachIndexed { n, wanted ->
            val pos = firstFree + n
            // Never move an occurrence before the cursor, nor the playing song.
            // If a previously played track is explicitly requested again, the
            // new copy is intentional, unlike the historical duplicates in v18.
            val existing = (pos until mutable.size).firstOrNull { mutable[it] == wanted }
            val action = when {
                existing == null -> "INSERTED"
                existing == pos -> "ALREADY_IN_ORDER"
                else -> "REORDERED"
            }
            when(action) {
                "INSERTED" -> mutable.add(pos, wanted)
                "REORDERED" -> {
                    val moved = mutable.removeAt(existing!!)
                    mutable.add(pos, moved)
                }
            }
            steps.add(OrderStep(wanted,pos,existing,action))
        }
        return OrderPlan(firstFree,steps,mutable,activeQueue)
    }
}
