package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException

/** An explicit provider rejection is distinct from a lost/unknown response. */
class SpotifyHttpFailure(val providerStatus: Int, status: HttpStatus, message: String) :
    HttpStatusException(status, message)

/** The first attempt proved that none of its playlist writes took effect. */
class RequestNotApplied(status: HttpStatus, message: String) : HttpStatusException(status, message)
