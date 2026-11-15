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
     * Preserve each paid request occurrence still ahead of the playback cursor.
     * Missing historical occurrences are already played/removed; never recreate
     * them. Prefer newer requests when only some repeated songs remain.
     * The final queue entry is this NEW request and always inserts one new copy.
     * Retries replay the frozen RequestPlaylistPlan instead of calling this again.
     */
    fun reconcile(ids: List<String?>, currentTrack: String?, samePlaylist: Boolean,
                  orderedQueue: List<String>, requestedTrack: String): OrderPlan {
        require(orderedQueue.lastOrNull()==requestedTrack) { "New request must be last in the DB queue" }
        val currentIndex = if(samePlaylist && !currentTrack.isNullOrBlank())
            ids.indexOfFirst { it == currentTrack } else -1
        val firstFree = if(currentIndex < 0) 0 else currentIndex + 1
        val available = ids.drop(firstFree).filterNotNull().groupingBy { it }.eachCount().toMutableMap()
        val previous = orderedQueue.dropLast(1).asReversed().filter { id ->
            val remaining=available[id]?:0
            if(remaining>0){available[id]=remaining-1;true}else false
        }.asReversed()
        val activeQueue = previous + requestedTrack
        val mutable = ids.toMutableList()
        val steps = mutableListOf<OrderStep>()
        previous.forEachIndexed { n,wanted ->
            val pos=firstFree+n
            val existing=(pos until mutable.size).first { mutable[it]==wanted }
            val action=if(existing==pos)"ALREADY_IN_ORDER" else "REORDERED"
            if(existing!=pos)mutable.add(pos,mutable.removeAt(existing))
            steps.add(OrderStep(wanted,pos,existing,action))
        }
        val position=firstFree+previous.size
        mutable.add(position,requestedTrack)
        steps.add(OrderStep(requestedTrack,position,null,"INSERTED"))
        return OrderPlan(firstFree,steps,mutable,activeQueue)
    }
}
