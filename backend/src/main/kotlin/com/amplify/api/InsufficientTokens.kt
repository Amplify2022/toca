package com.amplify.api

import io.micronaut.http.annotation.Produces
import io.micronaut.http.HttpRequest
import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException
import io.micronaut.http.server.exceptions.ExceptionHandler
import jakarta.inject.Singleton

class InsufficientTokens : HttpStatusException(HttpStatus.PAYMENT_REQUIRED,
    "No tenés tokens suficientes. Recargá para pedir esta canción.")

@Produces
@Singleton
class InsufficientTokensHandler : ExceptionHandler<InsufficientTokens, HttpResponse<Map<String, String>>> {
    override fun handle(request: HttpRequest<*>, exception: InsufficientTokens): HttpResponse<Map<String, String>> =
        HttpResponse.status<Map<String, String>>(HttpStatus.PAYMENT_REQUIRED).body(mapOf(
            "code" to "INSUFFICIENT_TOKENS", "message" to exception.message.orEmpty(),
            "rechargePath" to "/profile/tokens?recharge=1"
        )).header("Cache-Control", "no-store")
}
