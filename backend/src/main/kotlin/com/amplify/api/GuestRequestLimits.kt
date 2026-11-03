package com.amplify.api

import java.time.Duration
import java.time.Instant

/** Per-guestId limits for a private test session. A guestId is not strong identity. */
object GuestRequestLimits {
    const val MAX_IN_TEN_MINUTES = 6
    const val MIN_INTERVAL_SECONDS = 15L

    fun reason(requestsInWindow:Int,lastRequest:Instant?,now:Instant):String? {
        if(requestsInWindow>=MAX_IN_TEN_MINUTES)
            return "Alcanzaste el máximo de 6 canciones en 10 minutos. Probá nuevamente más tarde."
        if(lastRequest!=null && Duration.between(lastRequest,now).seconds<MIN_INTERVAL_SECONDS)
            return "Esperá 15 segundos entre solicitudes de canciones."
        return null
    }
}
