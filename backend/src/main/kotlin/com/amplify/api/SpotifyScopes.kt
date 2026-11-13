package com.amplify.api

import io.micronaut.http.HttpStatus

internal object SpotifyScopes {
    const val requested = "streaming user-read-email user-read-private user-read-playback-state user-read-currently-playing user-modify-playback-state playlist-read-private playlist-modify-public playlist-modify-private"
    private val browser = listOf("streaming", "user-read-email", "user-read-private")

    fun normalize(scope: String): String = scope.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.distinct().sorted().joinToString(" ")

    // An unrecorded legacy grant is checked by the SDK; it is neither a known
    // complete grant nor proof that permissions are missing.
    fun missingBrowser(scope: String?): List<String>? = scope?.let {
        val granted = normalize(it).split(" ").toSet()
        browser.filterNot(granted::contains)
    }

    fun requireBrowser(scope: String?) {
        if (!missingBrowser(scope).isNullOrEmpty())
            fail(HttpStatus.PRECONDITION_FAILED, "Renová los permisos de Spotify para activar el audio del navegador. Usá la misma cuenta para conservar tu playlist.")
    }
}
