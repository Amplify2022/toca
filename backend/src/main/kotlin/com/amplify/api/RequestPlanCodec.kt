package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper

/** Durable commands must preserve empty arrays and null insertion indices,
 * independently of the public API's NON_EMPTY serialization configuration. */
internal object RequestPlanCodec {
    fun encode(json:ObjectMapper,plan:RequestPlaylistPlan):String =
        json.copy().setSerializationInclusion(JsonInclude.Include.ALWAYS).writeValueAsString(mapOf(
            "version" to 2,"playlistId" to plan.playlistId,"requestedTrack" to plan.requestedTrack,
            "initialIds" to plan.initialIds,"position" to plan.position,"outsideContext" to plan.outsideContext,
            "restartPlayback" to plan.restartPlayback,
            "steps" to plan.steps.map {mapOf("trackId" to it.trackId,"desiredIndex" to it.desiredIndex,
                "existingIndex" to it.existingIndex,"action" to it.action)}))

    fun decode(json:ObjectMapper,value:String):RequestPlaylistPlan {
        require(value.length<=200_000)
        val node=json.readTree(value)
        val version=node.path("version").asInt(-1)
        require(version in 1..2)
        require(node.path("initialIds").isArray || (version==1 && node.path("initialIds").isMissingNode))
        require(node.path("steps").isArray || (version==1 && node.path("steps").isMissingNode))
        require(node.path("position").isInt && node.path("outsideContext").isBoolean)
        val initial=node.path("initialIds").map {
            require(it.isNull || (it.isTextual && it.asText().length<=128))
            if(it.isNull)null else it.asText()
        }
        val steps=node.path("steps").map {
            val existing=it.path("existingIndex")
            require(it.path("desiredIndex").isInt && (existing.isNull || existing.isMissingNode || existing.isInt))
            PlaylistPlanner.OrderStep(it.path("trackId").asText(),it.path("desiredIndex").asInt(),
                if(existing.isNull||existing.isMissingNode)null else existing.asInt(),it.path("action").asText())
        }
        return RequestPlaylistPlan(node.path("playlistId").asText(),node.path("requestedTrack").asText(),initial,steps,
            node.path("position").asInt(),node.path("outsideContext").asBoolean(),node.path("restartPlayback").asBoolean(false)).also{it.states()}
    }
}
