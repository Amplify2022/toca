package com.amplify.api

import io.micronaut.http.HttpStatus
import io.micronaut.http.exceptions.HttpStatusException

/** Verify the requested change, allowing unrelated edits made in Spotify.
 * Never retry a provider write: reads can briefly return the pre-edit version. */
object MusicEditVerification {
    fun matches(plan:Map<String,Any?>,state:MusicPlaylist):Boolean {
        if(state.id!=plan["playlistId"])return false
        if(plan["action"]=="rename")return state.name==plan["name"]
        val before=plan["before"] as? List<*> ?:return false
        val expected=plan["expected"] as? List<*> ?:return false
        if(before!=expected&&state.snapshot==plan["snapshot"])return false
        val id=plan["trackId"] as? String
        return when(plan["action"]){
            "remove"->id!=null&&state.ids.count{it==id}==before.count{it==id}-1
            "add"->id!=null&&state.ids.count{it==id}>=before.count{it==id}+1
            else->state.ids==expected
        }
    }
    fun confirm(plan:Map<String,Any?>,read:()->MusicPlaylist,pause:(Long)->Unit={Thread.sleep(it)}):MusicPlaylist? {
        var lastError:Exception?=null
        for(delay in longArrayOf(0,150,350)){
            if(delay>0)pause(delay)
            val state=try{read()}catch(error:Exception){
                if(error is InterruptedException){Thread.currentThread().interrupt();throw error}
                if(error is SpotifyHttpFailure&&error.providerStatus in listOf(401,403,429)||
                    error is HttpStatusException&&error.status in listOf(HttpStatus.UNAUTHORIZED,HttpStatus.FORBIDDEN,HttpStatus.TOO_MANY_REQUESTS))throw error
                lastError=error;continue
            }
            lastError=null
            if(matches(plan,state))return state
        }
        lastError?.let{throw it}
        return null
    }
}
