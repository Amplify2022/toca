package com.amplify.api

import io.micronaut.http.HttpResponse
import io.micronaut.http.HttpStatus
import io.micronaut.http.annotation.*
import io.micronaut.scheduling.TaskExecutors
import io.micronaut.scheduling.annotation.ExecuteOn
import java.net.URI
import java.time.Instant
import java.util.UUID

@Controller("/api")
@ExecuteOn(TaskExecutors.BLOCKING)
class ApiController(private val db:Db,private val auth:Auth,private val spotify:Spotify,private val addressGeocoder:AddressGeocoder,private val customerAuth:CustomerAuth,private val presence:VenuePresence) {
    private val publicColumns="""id,name,slug,address,city,description,genre,opening_hours AS "openingHours",request_access_mode AS "requestAccessMode",latitude,longitude,active,
        require_approval AS "requireApproval",curated_only AS "curatedOnly",
        spotify_premium AS "spotifyConnected",playlist_id AS "playlistId", instagram_handle AS "instagramHandle"
    """.trimIndent()
    private val requestColumns="""id,venue_id AS "venueId",track_id AS "trackId",title,artist,status,created_at AS "createdAt",
        request_count AS "requestCount", playlist_position AS "playlistPosition",
        last_requested_at AS "lastRequestedAt"
    """.trimIndent()

    private fun normalizeInstagram(input: Any?): String? {
        val raw = (input as? String)?.trim()
            ?: return if (input == null) null else
                fail(HttpStatus.BAD_REQUEST, "Instagram inválido")

        if (raw.isBlank()) return null

        val username = if (raw.startsWith("https://", ignoreCase = true)) {
            val uri = try {
                URI(raw)
            } catch (_: Exception) {
                fail(HttpStatus.BAD_REQUEST, "URL de Instagram inválida")
            }

            if (uri.host?.lowercase() !in setOf(
                    "instagram.com", "www.instagram.com"
                ) || uri.port != -1 || uri.userInfo != null ||
                uri.fragment != null) {
                fail(HttpStatus.BAD_REQUEST, "El enlace debe ser de Instagram")
            }

            val path = uri.path.trim('/')
            if ('/' in path) {
                fail(HttpStatus.BAD_REQUEST, "Ingresá un perfil, no una publicación")
            }
            path
        } else {
            if (raw.contains("/") || raw.contains(":")) {
                fail(HttpStatus.BAD_REQUEST, "Instagram inválido")
            }
            raw.removePrefix("@")
        }

        if (!username.matches(Regex("[A-Za-z0-9._]{1,30}")) ||
            username.startsWith(".") || username.endsWith(".") ||
            username.contains("..")) {
            fail(HttpStatus.BAD_REQUEST, "Usuario de Instagram inválido")
        }

        return username.lowercase(java.util.Locale.ROOT)
    }

    private fun venueById(id:String):Map<String,Any?> = db.one("SELECT * FROM venue WHERE id=?",safeUuid(id))
        ?: fail(HttpStatus.NOT_FOUND,"Establecimiento no encontrado")
    private fun publicVenue(v:Map<String,Any?>):Map<String,Any?> {
        val id=v["id"]?.toString() ?: ""
        var now:Map<String,String>?=null
        if(v["active"]==true&&v["spotify_premium"]==true) {
            // A provider failure never creates a fake "now playing" song.
            try{now=spotify.nowPlaying(safeUuid(id))}catch (_:Exception){}
        }
        return mapOf("id" to id,"name" to v["name"],"slug" to v["slug"],
            "address" to v["address"],"city" to v["city"],"description" to v["description"],
            "openingHours" to v["opening_hours"],"requestAccessMode" to v["request_access_mode"],
            "genre" to v["genre"],"latitude" to v["latitude"],"longitude" to v["longitude"],
            "active" to v["active"],"requireApproval" to v["require_approval"],
            "curatedOnly" to v["curated_only"],"spotifyConnected" to v["spotify_premium"],
            "instagramHandle" to v["instagram_handle"],"coverPhotoUrl" to coverPhoto(id),"photos" to venuePhotos(id),"now" to now)
    }
    private fun adminVenue(v:Map<String,Any?>):Map<String,Any?> = publicVenue(v)+mapOf(
        "joinToken" to v["join_token"],"playlistId" to v["playlist_id"],"deviceId" to v["spotify_device_id"])
    private fun venuePhotos(venueId:String):List<Map<String,Any?>> = db.list(
        """SELECT id, is_primary AS "isPrimary", created_at AS "createdAt"
            FROM venue_photo WHERE venue_id=? ORDER BY is_primary DESC, position ASC, created_at ASC""",safeUuid(venueId)
    ).map { image -> mapOf(
        "id" to image["id"].toString(), "isPrimary" to image["isPrimary"],
        "url" to "/api/venues/$venueId/photos/${image["id"]}"
    ) }
    private fun coverPhoto(venueId:String):String? = venuePhotos(venueId).firstOrNull()?.get("url") as? String
    private fun ownerVenue(id:String,authorization:String):Map<String,Any?> = auth.ownVenue(id,authorization)
    private fun privateJoin(id:String,token:String) {
        val v=venueById(id)
        // Constant-time comparison prevents timing leakage of QR tokens.
        if(token.isBlank() || !java.security.MessageDigest.isEqual(
                token.toByteArray(Charsets.UTF_8),(v["join_token"] as String).toByteArray(Charsets.UTF_8))) {
            fail(HttpStatus.FORBIDDEN,"Escaneá el QR del bar para solicitar canciones")
        }
    }

    @Get("/admin/geocode") fun geocode(
        @Header(value="Authorization",defaultValue="") authHeader:String,
        @QueryValue address:String,
        @QueryValue city:String
    ):Map<String,Any> {
        auth.user(authHeader)
        return mapOf("results" to addressGeocoder.search(address,city))
    }

    @Get("/health") fun health():Map<String,String> = mapOf("status" to "ok","service" to "amplify-api")

    @Post("/auth/register") fun register(@Body body:Map<String,Any?>)=auth.register(body)
    @Post("/auth/login") fun login(@Body body:Map<String,Any?>)=auth.login(body)
    @Get("/auth/me") fun me(@Header(value="Authorization",defaultValue="") authHeader:String):Map<String,Any?> = auth.user(authHeader)
    @Put("/auth/me") fun updateMyProfile(@Header(value="Authorization",defaultValue="") authHeader:String,
        @Body body:Map<String,Any?>):Map<String,Any?> {
        val user=auth.user(authHeader)
        val name=required(body,"name",120)
        if(name.length<2)fail(HttpStatus.BAD_REQUEST,"El nombre debe tener al menos 2 caracteres")
        db.exec("UPDATE admin_user SET name=? WHERE id=?",name,user["id"])
        return mapOf("id" to user["id"].toString(),"name" to name,"email" to user["email"])
    }
    @Post("/auth/logout") fun logout(@Header(value="Authorization",defaultValue="") authHeader:String):Map<String,Boolean> {
        auth.logout(authHeader)
        return mapOf("loggedOut" to true)
    }

    @Get("/venues") fun venues(@QueryValue(defaultValue="") city:String):List<Map<String,Any?>> {
        val list=if(city.isBlank())db.list("SELECT $publicColumns FROM venue WHERE EXISTS (SELECT 1 FROM venue_photo vp WHERE vp.venue_id=venue.id) ORDER BY updated_at DESC LIMIT 150")
            else db.list("SELECT $publicColumns FROM venue WHERE lower(city)=lower(?) AND EXISTS (SELECT 1 FROM venue_photo vp WHERE vp.venue_id=venue.id) ORDER BY updated_at DESC LIMIT 150",city)
        // This list does not call Spotify, avoiding N API calls per map render.
        return list.map {v-> mapOf(
            "id" to v["id"].toString(),"name" to v["name"],"slug" to v["slug"],
            "address" to v["address"],"city" to v["city"],"genre" to v["genre"],
            "description" to v["description"],"openingHours" to v["openingHours"],"requestAccessMode" to v["requestAccessMode"],
            "latitude" to v["latitude"],"longitude" to v["longitude"],
            "active" to v["active"],"spotifyConnected" to v["spotifyConnected"],
            "instagramHandle" to v["instagramHandle"],"coverPhotoUrl" to coverPhoto(v["id"].toString())
        ) }
    }
    @Get("/venues/{id}") fun venue(id:String)=publicVenue(venueById(id))
    @Get("/venues/{id}/requests") fun publicRequests(id:String):List<Map<String,Any?>> {
        venueById(id)
        return db.list("SELECT $requestColumns FROM song_request WHERE venue_id=? ORDER BY last_requested_at DESC NULLS LAST LIMIT 50",safeUuid(id))
    }
    @Get("/venues/{id}/playlist") fun publicPlaylist(id:String):List<Map<String,Any?>> {
        val v=venueById(id)
        if(v["active"]!=true||v["spotify_premium"]!=true)return emptyList()
        return spotify.playlist(safeUuid(id),v["playlist_id"] as? String)
    }
    @Get("/venues/{id}/music-status") fun musicStatus(id:String):Map<String,Any?> {
        val v=venueById(id)
        if(v["active"]!=true || v["spotify_premium"]!=true)
            return mapOf("active" to false,"isPlaying" to false,"now" to null,
                "next" to null,"nextVerified" to false,"playlist" to emptyList<Any>(),
                "note" to "No hay sesión musical activa.")
        return spotify.musicStatus(safeUuid(id),v["playlist_id"] as? String)
    }

    @Get("/venues/{id}/tracks") fun tracks(id:String,@QueryValue(defaultValue="")q:String,
        @Header(value="X-TOCA-Join",defaultValue="")guestToken:String,
        @QueryValue(defaultValue="")joinToken:String):List<Map<String,Any?>> {
        // Accept legacy query access for old clients; updated TOCÁ sends a header
        // so a reusable QR secret is not exposed in the HTTP access-log URL.
        // Track discovery is public. Location is validated when requesting.
        val v=venueById(id)
        if(v["active"]!=true)fail(HttpStatus.CONFLICT,"No hay sesión activa")
        return spotify.search(safeUuid(id),q.take(120)).filter { t ->
            val trackId=t["id"] as String
            val blocked=db.one("""SELECT 1 FROM venue_track_rule WHERE venue_id=? AND mode='BLOCK'
                AND (track_id=? OR (lower(trim(coalesce(title,'')))=lower(trim(?))
                    AND lower(trim(coalesce(artist,'')))=lower(trim(?))
                    AND coalesce(title,'')<>'' AND coalesce(artist,'')<>'')) LIMIT 1""",
                safeUuid(id),trackId,t["title"].toString(),t["artist"].toString())!=null
            val allowed=v["curated_only"]!=true || db.one("SELECT 1 FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode='ALLOW'",safeUuid(id),trackId)!=null
            !blocked && allowed
        }
    }
    @Post("/venues/{id}/requests") fun request(id:String,@Body body:Map<String,Any?>,@Header(value="X-TOCA-Customer",defaultValue="") customerAuthorization:String):Map<String,Any?> {
        // Both a verified customer session and the bar QR are required for a request.
        val customerId = customerAuth.user(customerAuthorization)["id"] as UUID
        // Customer session plus venue presence replace the mandatory QR.
        val v=venueById(id)
        if(v["active"]!=true || v["spotify_premium"]!=true)
            fail(HttpStatus.CONFLICT,"La sesión Spotify del bar está cerrada")
        val venueId=safeUuid(id)
        presence.requireAllowed(venueId,customerId)
        val trackId=required(body,"trackId",50)
        if(db.one("SELECT 1 FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode='BLOCK'",venueId,trackId)!=null)
            fail(HttpStatus.FORBIDDEN,"La canción está bloqueada")
        if(v["curated_only"]==true&&db.one("SELECT 1 FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode='ALLOW'",venueId,trackId)==null)
            fail(HttpStatus.FORBIDDEN,"La canción no está en la lista blanca")
        val guestId=required(body,"guestId",90)
        if(!guestId.matches(Regex("[A-Za-z0-9_-]{10,90}")))fail(HttpStatus.BAD_REQUEST,"Identificador invitado inválido")
        // Rate limits are checked inside the per-venue DB lock below. A row in
        // song_request represents a track, not every request; the events table
        // preserves each guest submission, including promotions of existing songs.
        // Spotify OAuth refresh and metadata calls occur outside the DB lock to avoid
        // deadlocks (refresh updates the venue row on a separate connection).
        val track=spotify.getTrack(venueId,trackId)
        val spotifyToken=spotify.playlistMutationToken(venueId)
        // Serialize requests to this venue across server instances. This lock deliberately
        // spans the Spotify API mutation; a busy provider causes backpressure, not reordering.
        return db.transaction { connection ->
            connection.prepareStatement("SELECT id FROM venue WHERE id=? FOR UPDATE").use { s ->
                s.setObject(1,venueId)
                s.executeQuery().use { rs -> if(!rs.next()) fail(HttpStatus.NOT_FOUND,"Bar no encontrado") }
            }
            presence.requireAllowed(venueId,customerId)
            // Repeat authorization checks under the SAME venue row lock that rule
            // changes acquire. This closes the race between request and blacklist.
            val blockedInside=connection.prepareStatement("""SELECT 1 FROM venue_track_rule
                WHERE venue_id=? AND mode='BLOCK' AND (
                    track_id=? OR (lower(trim(coalesce(title,'')))=lower(trim(?))
                        AND lower(trim(coalesce(artist,'')))=lower(trim(?))
                        AND coalesce(title,'')<>'' AND coalesce(artist,'')<>'')
                ) LIMIT 1""").use { statement ->
                statement.setObject(1,venueId);statement.setString(2,trackId)
                statement.setString(3,track["title"].toString());statement.setString(4,track["artist"].toString())
                statement.executeQuery().use { it.next() }
            }
            if(blockedInside)fail(HttpStatus.FORBIDDEN,"La canción está bloqueada por el bar")
            if(v["curated_only"]==true) {
                val allowed=connection.prepareStatement("""SELECT 1 FROM venue_track_rule
                    WHERE venue_id=? AND mode='ALLOW' AND track_id=? LIMIT 1""").use { statement ->
                    statement.setObject(1,venueId);statement.setString(2,trackId)
                    statement.executeQuery().use { it.next() }
                }
                if(!allowed)fail(HttpStatus.FORBIDDEN,"La canción no está en la lista blanca")
            }
            val usage=connection.prepareStatement("""SELECT count(*) AS total, max(created_at) AS last_at
                 FROM song_request_event WHERE venue_id=? AND guest_id=? AND created_at>now()-interval '10 minutes'""").use { statement ->
                statement.setObject(1,venueId);statement.setString(2,guestId)
                statement.executeQuery().use { rs ->
                    rs.next()
                    Pair(rs.getInt("total"),rs.getTimestamp("last_at")?.toInstant())
                }
            }
            val restriction=GuestRequestLimits.reason(usage.first,usage.second,Instant.now())
            if(restriction!=null)fail(HttpStatus.TOO_MANY_REQUESTS,restriction)
            // Queue is scoped to the current bar session. Old historical
            // DISPATCHED rows do not reserve positions in new sessions.
            val startTime=connection.prepareStatement("SELECT queue_started_at FROM venue WHERE id=?").use { statement ->
                statement.setObject(1,venueId)
                statement.executeQuery().use { rs -> rs.next();rs.getTimestamp("queue_started_at")?.toInstant() }
            } ?: Instant.EPOCH
            val existing=connection.prepareStatement("""SELECT id,playlist_position,queued_at,status FROM song_request
                WHERE venue_id=? AND track_id=? AND status IN ('PENDING','APPROVED','DISPATCHED') FOR UPDATE""").use { statement ->
                statement.setObject(1,venueId);statement.setString(2,trackId)
                statement.executeQuery().use { rs ->
                    if(rs.next()) Triple(rs.getObject("id",UUID::class.java),
                        rs.getTimestamp("queued_at")?.toInstant(),rs.getInt("playlist_position"))
                    else null
                }
            }
            val existingId=existing?.first
            val alreadyQueued=existing?.second?.let { !it.isBefore(startTime) }==true
            val queuedIds=connection.prepareStatement("""SELECT track_id FROM song_request
                WHERE venue_id=? AND status='DISPATCHED' AND queued_at>=?
                ORDER BY queued_at,id""").use { statement ->
                statement.setObject(1,venueId)
                statement.setObject(2,java.sql.Timestamp.from(startTime))
                statement.executeQuery().use { rs -> buildList { while(rs.next())add(rs.getString("track_id")) } }
            }
            // Reconcile the full authoritative queue, including an already
            // requested track in its original slot. A duplicate never goes last.
            val desiredOrder=if(alreadyQueued) queuedIds else queuedIds+trackId
            val changed=spotify.reconcilePlaylistFifoPrivateTest(
                venueId,trackId,spotifyToken,desiredOrder)
            // Only in explicitly authorized private tests: while the player is
            // outside the venue playlist, append new accepted requests to the
            // actual Spotify playback queue. This does NOT switch playlist
            // context, and Spotify may have other queued songs before ours.
            // The per-venue DB lock serializes B then C also for Spotify queue.
            var queueWarning:String?=null
            if(!alreadyQueued && changed.outsideContext && spotify.controlEnabled) {
                try { spotify.enqueuePrivateTest(venueId,trackId) }
                catch (err:Exception) {
                    queueWarning="No se pudo agregar a la cola activa de Spotify: ${err.message ?: "error del reproductor"}"
                }
            }
            val requestId=existingId ?: UUID.randomUUID()
            if(existingId!=null) {
                connection.prepareStatement("""UPDATE song_request SET status='DISPATCHED',request_count=request_count+1,
                    playlist_position=?,queued_at=CASE WHEN ? THEN queued_at ELSE now() END,
                    last_requested_at=now(),updated_at=now(),guest_id=? WHERE id=?""").use { statement ->
                    statement.setInt(1,changed.position);statement.setBoolean(2,alreadyQueued)
                    statement.setString(3,guestId);statement.setObject(4,requestId);statement.executeUpdate()
                }
            } else {
                connection.prepareStatement("""INSERT INTO song_request(id,venue_id,track_id,title,artist,status,guest_id,
                       playlist_position,queued_at,last_requested_at) VALUES(?,?,?,?,?,'DISPATCHED',?,?,now(),now())""").use { statement ->
                    statement.setObject(1,requestId);statement.setObject(2,venueId)
                    statement.setString(3,trackId);statement.setString(4,track["title"].toString())
                    statement.setString(5,track["artist"].toString());statement.setString(6,guestId)
                    statement.setInt(7,changed.position);statement.executeUpdate()
                }
            }
            connection.prepareStatement("""INSERT INTO song_request_event
                 (id,venue_id,request_id,guest_id,track_id,customer_id) VALUES(?,?,?,?,?,?)""").use { statement ->
                statement.setObject(1,UUID.randomUUID());statement.setObject(2,venueId)
                statement.setObject(3,requestId);statement.setString(4,guestId)
                statement.setString(5,trackId);statement.setObject(6,customerId);statement.executeUpdate()
            }
            mapOf("id" to requestId.toString(),"status" to "DISPATCHED",
                "title" to (track["title"]?:""),"action" to changed.action,
                "playlistPosition" to changed.position,"warning" to
                    listOfNotNull(changed.warning,queueWarning).joinToString(" "),
                "note" to "Orden FIFO verificado en la playlist. La cola activa de Spotify puede tener temas previos o un contexto distinto.")
        }
    }

    // Public image delivery; only the owning administrator can mutate photos.
    @Get("/venues/{id}/photos/{photoId}")
    fun photo(id:String,photoId:String):HttpResponse<ByteArray> {
        val item=db.one("SELECT data,content_type FROM venue_photo WHERE venue_id=? AND id=?",
            safeUuid(id),safeUuid(photoId)) ?: fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        val bytes=item["data"] as? ByteArray ?: fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        val mime=item["content_type"] as String
        return HttpResponse.ok(bytes)
            .contentType(io.micronaut.http.MediaType.of(mime))
            .header("Cache-Control","public, max-age=300")
            .header("X-Content-Type-Options","nosniff")
    }
    @Post("/admin/venues/{id}/photos")
    fun addPhoto(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String,
        @Body body:Map<String,Any?>):Map<String,Any?> {
        ownerVenue(id,authorization)
        val venueId=safeUuid(id)
        val existingPhotos=(db.one("SELECT count(*) AS total FROM venue_photo WHERE venue_id=?",venueId)
            ?.get("total") as Number).toInt()
        if(existingPhotos>=8)
            fail(HttpStatus.CONFLICT,"Máximo 8 fotos por bar")
        val mime=required(body,"contentType",40).lowercase()
        if(mime !in setOf("image/jpeg","image/png","image/webp"))
            fail(HttpStatus.BAD_REQUEST,"Solo se permiten imágenes JPEG, PNG o WebP")
        val input=required(body,"dataBase64",4500000)
        val bytes=try { java.util.Base64.getDecoder().decode(input) }
                  catch (_:IllegalArgumentException) { fail(HttpStatus.BAD_REQUEST,"Imagen codificada inválida") }
        if(bytes.size>2500000 || bytes.size<24)
            fail(HttpStatus.BAD_REQUEST,"La foto debe ocupar menos de 2,5 MB")
        val startsJpeg=bytes.size>3 && bytes[0]==0xFF.toByte() && bytes[1]==0xD8.toByte() && bytes[2]==0xFF.toByte()
        val startsPng=bytes.size>8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(137.toByte(),80,78,71,13,10,26,10))
        val startsWebp=bytes.size>12 && String(bytes,0,4,Charsets.US_ASCII)=="RIFF" && String(bytes,8,4,Charsets.US_ASCII)=="WEBP"
        if(!when(mime){"image/jpeg"->startsJpeg;"image/png"->startsPng;else->startsWebp})
            fail(HttpStatus.BAD_REQUEST,"El formato real de la foto no coincide con el declarado")
        val total=existingPhotos
        val photoId=UUID.randomUUID()
        db.exec("""INSERT INTO venue_photo(id,venue_id,data,content_type,position,is_primary)
            VALUES(?,?,?,?,?,?)""",photoId,venueId,bytes,mime,total,total==0)
        return mapOf("photos" to venuePhotos(id),"coverPhotoUrl" to coverPhoto(id))
    }
    @Put("/admin/venues/{id}/photos/{photoId}/primary")
    fun setPrimaryPhoto(id:String,photoId:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        val venueId=safeUuid(id); val imageId=safeUuid(photoId)
        if(db.one("SELECT id FROM venue_photo WHERE venue_id=? AND id=?",venueId,imageId)==null)
            fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        // Two updates in one transaction avoid the partial-unique-index collision.
        db.transaction { c ->
            c.prepareStatement("UPDATE venue_photo SET is_primary=false WHERE venue_id=?").use { statement ->
                statement.setObject(1,venueId);statement.executeUpdate()
            }
            c.prepareStatement("UPDATE venue_photo SET is_primary=true WHERE venue_id=? AND id=?").use { statement ->
                statement.setObject(1,venueId);statement.setObject(2,imageId);statement.executeUpdate()
            }
        }
        return mapOf("photos" to venuePhotos(id),"coverPhotoUrl" to coverPhoto(id))
    }
    @Delete("/admin/venues/{id}/photos/{photoId}")
    fun deletePhoto(id:String,photoId:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        val venueId=safeUuid(id)
        val count=(db.one("SELECT count(*) AS total FROM venue_photo WHERE venue_id=?",venueId)?.get("total") as Number).toInt()
        if(count<=1)
            fail(HttpStatus.CONFLICT,"El bar necesita al menos una foto de portada. Subí otra foto antes de eliminar esta.")
        if(db.exec("DELETE FROM venue_photo WHERE venue_id=? AND id=?",venueId,safeUuid(photoId))==0)
            fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        if(db.one("SELECT id FROM venue_photo WHERE venue_id=? AND is_primary=true",venueId)==null)
            db.exec("""UPDATE venue_photo SET is_primary=true WHERE id=(
                SELECT id FROM venue_photo WHERE venue_id=? ORDER BY position,created_at LIMIT 1)""",venueId)
        return mapOf("photos" to venuePhotos(id),"coverPhotoUrl" to coverPhoto(id))
    }

    @Get("/admin/venues") fun owned(@Header(value="Authorization",defaultValue="")authorization:String):List<Map<String,Any?>> {
        val user=auth.user(authorization)
        return db.list("SELECT * FROM venue WHERE owner_id=? ORDER BY created_at DESC",user["id"]).map(::adminVenue)
    }
    @Post("/admin/venues") fun createVenue(@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        val user=auth.user(authorization)
        val name=required(body,"name",160)
        val address=required(body,"address",240)
        val city=required(body,"city",120)
        val genre=(body["genre"] as? String)?.trim()?.take(160) ?: ""
        val lat=(body["latitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Latitud requerida")
        val lon=(body["longitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Longitud requerida")
        if(lat !in -90.0..90.0||lon !in -180.0..180.0)fail(HttpStatus.BAD_REQUEST,"Coordenadas inválidas")
        val id=UUID.randomUUID();val slug="bar-"+id.toString().take(8)
        db.exec("""INSERT INTO venue(id,owner_id,name,slug,address,city,genre,latitude,longitude,join_token)
              VALUES(?,?,?,?,?,?,?,?,?,?)""",id,user["id"],name,slug,address,city,genre,lat,lon,randomString(36))
        return adminVenue(venueById(id.toString()))
    }
    @Put("/admin/venues/{id}") fun editVenue(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        ownerVenue(id,authorization)
        val lat=(body["latitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Latitud requerida")
        val lon=(body["longitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Longitud requerida")
        if(lat !in -90.0..90.0||lon !in -180.0..180.0)fail(HttpStatus.BAD_REQUEST,"Coordenadas inválidas")
        if(coverPhoto(id)==null)
            fail(HttpStatus.BAD_REQUEST,"Agregá una foto de portada antes de guardar Mi Bar")
        val openingHours=(body["openingHours"] as? String)?.trim().orEmpty()
        if(openingHours.length>180)
            fail(HttpStatus.BAD_REQUEST,"Horario demasiado largo (máximo 180 caracteres)")
        db.exec("""UPDATE venue SET name=?,address=?,city=?,description=?,genre=?,instagram_handle=?,opening_hours=?,latitude=?,longitude=?,updated_at=now() WHERE id=?""",
            required(body,"name",160),required(body,"address",240),required(body,"city",120),
            (body["description"] as? String)?.take(2000)?:"",(body["genre"] as? String)?.take(160)?:"",normalizeInstagram(body["instagramHandle"]),openingHours,lat,lon,safeUuid(id))
        return adminVenue(venueById(id))
    }
    /** Delete a bar only when the authenticated user owns it.
     *  Venue child records are deleted by PostgreSQL ON DELETE CASCADE constraints.
     *  This never deletes the administrator account or the external Spotify playlist.
     */
    @Delete("/admin/venues/{id}")
    fun deleteVenue(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean> {
        val venue=ownerVenue(id,authorization)
        val deleted=db.exec("DELETE FROM venue WHERE id=? AND owner_id=?",
            safeUuid(id),venue["owner_id"])
        if(deleted==0)fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        return mapOf("deleted" to true)
    }

    @Post("/admin/venues/{id}/session") fun session(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        val v=ownerVenue(id,authorization);val active=asBoolean(body,"active")
        if(active&&(v["spotify_premium"]!=true||v["spotify_access_encrypted"]==null))fail(HttpStatus.PRECONDITION_FAILED,"Vinculá Spotify Premium antes de abrir la sesión")
        db.exec("UPDATE venue SET active=?,queue_started_at=CASE WHEN ? AND NOT active THEN now() ELSE queue_started_at END,updated_at=now() WHERE id=?",
            active,active,safeUuid(id))
        return mapOf("active" to active)
    }
    @Put("/admin/venues/{id}/policy") fun policy(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        val v=ownerVenue(id,authorization)
        val curated=asBoolean(body,"curatedOnly",v["curated_only"] as Boolean)
        db.exec("UPDATE venue SET require_approval=false,curated_only=?,updated_at=now() WHERE id=?",curated,safeUuid(id))
        return mapOf("requireApproval" to false,"curatedOnly" to curated)
    }
    @Get("/admin/venues/{id}/tracks") fun adminTrackSearch(
        id:String,
        @Header(value="Authorization",defaultValue="") authorization:String,
        @QueryValue(defaultValue="") q:String
    ):List<Map<String,Any?>> {
        ownerVenue(id,authorization)
        return spotify.search(safeUuid(id),q.take(120))
    }

    @Get("/admin/venues/{id}/blocked") fun blocked(id:String,@Header(value="Authorization",defaultValue="")authorization:String)= rules(id,authorization,"BLOCK")
    @Get("/admin/venues/{id}/allowed") fun allowed(id:String,@Header(value="Authorization",defaultValue="")authorization:String)= rules(id,authorization,"ALLOW")
    private fun rules(id:String,authorization:String,mode:String):List<Map<String,Any?>> {
        ownerVenue(id,authorization)
        return db.list("""SELECT track_id AS "trackId", title, artist
            FROM venue_track_rule WHERE venue_id=? AND mode=? ORDER BY title NULLS LAST, track_id""",safeUuid(id),mode)
    }
    @Post("/admin/venues/{id}/blocked") fun block(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>)= addRule(id,authorization,body,"BLOCK")
    @Post("/admin/venues/{id}/allowed") fun allow(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>)= addRule(id,authorization,body,"ALLOW")
    private fun addRule(id:String,authorization:String,body:Map<String,Any?>,mode:String):Map<String,String> {
        ownerVenue(id,authorization)
        val trackId=required(body,"trackId",50)
        if(!trackId.matches(Regex("[A-Za-z0-9]{22}")))fail(HttpStatus.BAD_REQUEST,"ID Spotify de 22 caracteres requerido")
        val song=spotify.getTrack(safeUuid(id),trackId)
        db.transaction { c ->
            c.prepareStatement("SELECT id FROM venue WHERE id=? FOR UPDATE").use { statement ->
                statement.setObject(1,safeUuid(id))
                statement.executeQuery().use { if(!it.next())fail(HttpStatus.NOT_FOUND,"Bar no encontrado") }
            }
            c.prepareStatement("""INSERT INTO venue_track_rule(venue_id,track_id,mode,title,artist)
                VALUES(?,?,?,?,?) ON CONFLICT (venue_id,track_id,mode) DO UPDATE
                SET title=EXCLUDED.title, artist=EXCLUDED.artist""").use { statement ->
                statement.setObject(1,safeUuid(id));statement.setString(2,trackId)
                statement.setString(3,mode);statement.setString(4,song["title"]?.toString()?:"")
                statement.setString(5,song["artist"]?.toString()?:"");statement.executeUpdate()
            }
        }
        return mapOf("trackId" to trackId)
    }
    @Delete("/admin/venues/{id}/blocked/{track}") fun unblock(id:String,track:String,@Header(value="Authorization",defaultValue="")authorization:String)= removeRule(id,track,authorization,"BLOCK")
    @Delete("/admin/venues/{id}/allowed/{track}") fun unallow(id:String,track:String,@Header(value="Authorization",defaultValue="")authorization:String)= removeRule(id,track,authorization,"ALLOW")
    private fun removeRule(id:String,track:String,authorization:String,mode:String):Map<String,Boolean> {
        ownerVenue(id,authorization)
        db.exec("DELETE FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode=?",safeUuid(id),track,mode)
        return mapOf("removed" to true)
    }
    @Post("/admin/venues/{id}/join-token/rotate") fun rotateJoin(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,Boolean> {
        ownerVenue(id,authorization)
        db.exec("UPDATE venue SET join_token=?,updated_at=now() WHERE id=?",randomString(36),safeUuid(id))
        return mapOf("rotated" to true)
    }
    @Post("/admin/venues/{id}/requests/{requestId}/approve")
    fun approve(id:String,requestId:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,String> {
        ownerVenue(id,authorization)
        fail(HttpStatus.CONFLICT,"La playlist recibe solicitudes automáticamente; ya no se aprueban manualmente")
    }
    @Post("/admin/venues/{id}/requests/{requestId}/reject")
    fun reject(id:String,requestId:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,String> {
        ownerVenue(id,authorization)
        fail(HttpStatus.CONFLICT,"No hay solicitudes pendientes en modo playlist automático")
    }
    @Post("/admin/venues/{id}/requests/{requestId}/played") fun played(id:String,requestId:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,String> {
        ownerVenue(id,authorization)
        val changed=db.exec("UPDATE song_request SET status='PLAYED',updated_at=now() WHERE id=? AND venue_id=? AND status IN ('APPROVED','DISPATCHED')",safeUuid(requestId),safeUuid(id))
        if(changed==0)fail(HttpStatus.CONFLICT,"La canción no estaba en cola")
        return mapOf("status" to "PLAYED")
    }
    @Get("/admin/venues/{id}/spotify/status") fun spotifyStatus(id:String,@Header(value="Authorization",defaultValue="")authorization:String)=spotify.status(ownerVenue(id,authorization))
    @Get("/admin/venues/{id}/spotify/authorize") fun spotifyAuthorize(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,String> {
        val owner=auth.user(authorization)
        return mapOf("url" to spotify.authorize(ownerVenue(id,authorization),owner))
    }
    @Get("/integrations/spotify/callback") fun spotifyCallback(@QueryValue(defaultValue="")code:String,@QueryValue(defaultValue="")state:String,@QueryValue(defaultValue="")error:String):HttpResponse<Any> {
        if(error.isNotBlank())fail(HttpStatus.BAD_REQUEST,"El usuario rechazó la autorización Spotify")
        if(code.isBlank()||state.isBlank())fail(HttpStatus.BAD_REQUEST,"OAuth incompleto")
        return HttpResponse.redirect(URI(spotify.callback(code,state)))
    }
    @Post("/admin/venues/{id}/spotify/disconnect") fun spotifyDisconnect(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,Boolean> {
        ownerVenue(id,authorization);spotify.disconnect(safeUuid(id));return mapOf("disconnected" to true)
    }
    @Get("/admin/venues/{id}/spotify/playlists") fun spotifyPlaylists(id:String,@Header(value="Authorization",defaultValue="")authorization:String):List<Map<String,String>> {
        ownerVenue(id,authorization);return spotify.playlists(safeUuid(id))
    }
    @Post("/admin/venues/{id}/spotify/resume-playlist")
    fun resumePlaylist(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        return spotify.resumeVenuePlaylistPrivateTest(safeUuid(id))
    }

    /** Non-sensitive diagnostic: DB FIFO versus actual Spotify playlist order.
     *  Requires ownership and never returns an access or refresh token.
     */
    @Get("/admin/venues/{id}/spotify/queue-diagnostics")
    fun queueDiagnostics(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        val v=ownerVenue(id,authorization)
        val rows=db.list("""SELECT track_id AS "trackId",title,artist,queued_at AS "queuedAt",
                status,playlist_position AS "storedPosition"
            FROM song_request WHERE venue_id=? AND status='DISPATCHED'
              AND queued_at>=COALESCE((SELECT queue_started_at FROM venue WHERE id=?),'epoch'::timestamptz)
            ORDER BY queued_at,id""",safeUuid(id),safeUuid(id))
        val items=spotify.playlist(safeUuid(id),v["playlist_id"] as? String)
        val order=rows.mapNotNull { it["trackId"]?.toString() }.distinct()
        val inPlaylist=items.mapNotNull { it["id"]?.toString() }
        return mapOf("requestedFifo" to rows,
            "spotifyPlaylistFirst50" to items.take(50),
            "pendingOrderInFirst50" to inPlaylist.filter { it in order },
            "sameOrderInFirst50" to (inPlaylist.filter { it in order }==order.filter { it in inPlaylist }),
            "note" to "Orden real de Spotify API; la aplicación de Spotify puede mostrar otra clasificación.")
    }

    @Get("/admin/venues/{id}/spotify/devices") fun spotifyDevices(id:String,@Header(value="Authorization",defaultValue="")authorization:String):List<Map<String,Any?>> {
        ownerVenue(id,authorization);return spotify.devices(safeUuid(id))
    }
    @Put("/admin/venues/{id}/spotify/device") fun spotifySetDevice(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,String> {
        ownerVenue(id,authorization)
        val selected=required(body,"deviceId",150)
        spotify.selectDevice(safeUuid(id),selected)
        return mapOf("deviceId" to selected)
    }
    @Put("/admin/venues/{id}/spotify/playlist") fun spotifySetPlaylist(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,String> {
        ownerVenue(id,authorization)
        val p=required(body,"playlistId",100)
        spotify.selectPlaylist(safeUuid(id),p)
        db.exec("UPDATE venue SET queue_started_at=now() WHERE id=?",safeUuid(id))
        return mapOf("playlistId" to p)
    }
}
