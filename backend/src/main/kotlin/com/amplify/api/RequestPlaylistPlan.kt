package com.amplify.api

/** A frozen playlist command. Persist it before the first provider mutation.
 *
 * Playback may advance between attempts, so recovery must never recompute the
 * insertion point from the new player cursor. Every retry instead compares the
 * complete observed playlist with the known states of this command.
 */
data class RequestPlaylistPlan(
    val playlistId: String,
    val requestedTrack: String,
    val initialIds: List<String?>,
    val steps: List<PlaylistPlanner.OrderStep>,
    val position: Int,
    val outsideContext: Boolean,
) {
    fun states(): List<List<String?>> {
        require(playlistId.matches(Regex("[A-Za-z0-9]{15,40}"))) { "Invalid saved playlist" }
        require(requestedTrack.matches(Regex("[A-Za-z0-9]{22}"))) { "Invalid saved track" }
        require(initialIds.size <= 1000 && steps.size <= 100) { "Saved command is too large" }
        val current = initialIds.toMutableList()
        val states = mutableListOf(current.toList())
        for (step in steps) {
            require(step.trackId.matches(Regex("[A-Za-z0-9]{22}"))) { "Invalid saved step track" }
            require(step.desiredIndex in 0..current.size) { "Invalid saved insertion point" }
            when (step.action) {
                "INSERTED" -> {
                    require(step.existingIndex == null) { "Insertion has an existing index" }
                    current.add(step.desiredIndex, step.trackId)
                }
                "REORDERED" -> {
                    val from = requireNotNull(step.existingIndex)
                    require(from in current.indices && from > step.desiredIndex && current[from] == step.trackId) {
                        "Invalid saved reorder"
                    }
                    current.add(step.desiredIndex, current.removeAt(from))
                }
                else -> error("Unsupported saved mutation")
            }
            require(current.size <= 1000) { "Saved command exceeds playlist size limit" }
            states += current.toList()
        }
        require(position in current.indices && current[position] == requestedTrack) { "Invalid saved result position" }
        return states
    }
}

data class RequestPlaylistSnapshot(val ids: List<String?>, val snapshotId: String)

/** The caller records ambiguous failures; this class never retries a mutation.
 * A later, explicit reconciliation can safely resume at a known intermediate
 * state, or recognize an already-applied command after a lost response/commit.
 */
object RequestPlaylistReplay {
    class Drift : IllegalStateException("La playlist cambió fuera del pedido; revisá la sincronización antes de continuar")

    fun apply(
        plan: RequestPlaylistPlan,
        read: () -> RequestPlaylistSnapshot,
        mutate: (PlaylistPlanner.OrderStep, String) -> Unit,
    ): Boolean {
        val states = plan.states()
        var observed = read()
        // Repeated states can result from indistinguishable duplicate items;
        // selecting the furthest known state avoids replaying an observed no-op.
        val completed = states.indices.lastOrNull { states[it] == observed.ids } ?: throw Drift()
        if (completed == plan.steps.size) return false
        for (i in completed until plan.steps.size) {
            mutate(plan.steps[i], observed.snapshotId)
            observed = read()
            if (observed.ids != states[i + 1]) throw Drift()
        }
        return true
    }
}
