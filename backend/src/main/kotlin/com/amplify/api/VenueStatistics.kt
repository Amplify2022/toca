package com.amplify.api

import com.fasterxml.jackson.annotation.JsonInclude

/** Empty history is a valid result, so keep days: [] in the HTTP contract. */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class VenueStatistics(
    val tracks:Long,
    val repeats:Long,
    val synced:Long,
    val days:List<Map<String,Any?>>
)
