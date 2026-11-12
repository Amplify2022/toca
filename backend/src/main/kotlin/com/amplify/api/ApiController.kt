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
class ApiController(private val db:Db,private val auth:Auth,private val spotify:Spotify,private val addressGeocoder:AddressGeocoder,private val customerAuth:CustomerAuth,private val presence:VenuePresence,private val requestCommands:RequestCommands,private val media:VenueMediaService) {
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
        val photos=venuePhotos(id)
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
            "instagramHandle" to v["instagram_handle"],"coverPhotoUrl" to photos.firstOrNull()?.get("url"),"photos" to photos,"now" to now)
    }
    private fun adminVenue(v:Map<String,Any?>):Map<String,Any?> = publicVenue(v)+mapOf(
        "joinToken" to v["join_token"],"playlistId" to v["playlist_id"],"deviceId" to v["spotify_device_id"],
        "published" to v["published"],"registrationId" to v["registration_id"]?.toString())
    private fun venuePhotos(venueId:String):List<Map<String,Any?>> = db.list(
        """SELECT id, is_primary AS "isPrimary", created_at AS "createdAt"
            FROM venue_photo WHERE venue_id=? ORDER BY is_primary DESC, position ASC, created_at ASC""",safeUuid(venueId)
    ).map { image -> mapOf(
        "id" to image["id"].toString(), "isPrimary" to image["isPrimary"],
        "url" to "/api/venues/$venueId/photos/${image["id"]}"
    ) }
    private fun coverPhoto(venueId:String):String? = db.one("SELECT id FROM venue_photo WHERE venue_id=? ORDER BY is_primary DESC,position,created_at LIMIT 1",safeUuid(venueId))?.let { "/api/venues/$venueId/photos/${it["id"]}" }
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

    @Post("/auth/register") fun register(@Body body:RegistrationInput)=auth.register(body.values())
    @Post("/auth/login") fun login(@Body body:LoginInput)=auth.login(body.values())
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

    @Get("/venues") fun venues(@QueryValue(defaultValue="") city:String,@QueryValue(defaultValue="0") offset:Int,@QueryValue(defaultValue="50") limit:Int):List<Map<String,Any?>> {
        val columns=publicColumns+""",(SELECT id FROM venue_photo cover WHERE cover.venue_id=venue.id ORDER BY is_primary DESC,position,created_at LIMIT 1) AS "coverPhotoId""""
        val list=if(city.isBlank())db.list("SELECT $columns FROM venue WHERE published AND EXISTS (SELECT 1 FROM venue_photo vp WHERE vp.venue_id=venue.id) ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",limit.coerceIn(1,150),offset.coerceAtLeast(0))
            else db.list("SELECT $columns FROM venue WHERE published AND lower(city)=lower(?) AND EXISTS (SELECT 1 FROM venue_photo vp WHERE vp.venue_id=venue.id) ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",city,limit.coerceIn(1,150),offset.coerceAtLeast(0))
        // This list does not call Spotify, avoiding N API calls per map render.
        return list.map {v-> mapOf(
            "id" to v["id"].toString(),"name" to v["name"],"slug" to v["slug"],
            "address" to v["address"],"city" to v["city"],"genre" to v["genre"],
            "description" to v["description"],"openingHours" to v["openingHours"],"requestAccessMode" to v["requestAccessMode"],
            "latitude" to v["latitude"],"longitude" to v["longitude"],
            "active" to v["active"],"spotifyConnected" to v["spotifyConnected"],
            "instagramHandle" to v["instagramHandle"],"coverPhotoUrl" to v["coverPhotoId"]?.let { "/api/venues/${v["id"]}/photos/$it" }
        ) }
    }
    @Get("/venues/{id}") fun venue(id:String)=publicVenue(venueById(id))
    @Get("/venues/{id}/requests") fun publicRequests(id:String,@QueryValue(defaultValue="0") offset:Int,@QueryValue(defaultValue="50") limit:Int):List<Map<String,Any?>> {
        venueById(id)
        return db.list("SELECT $requestColumns FROM song_request WHERE venue_id=? ORDER BY last_requested_at DESC NULLS LAST,id LIMIT ? OFFSET ?",safeUuid(id),limit.coerceIn(1,200),offset.coerceAtLeast(0))
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
    @Post("/venues/{id}/requests")
    fun request(id:String,@Body body:Map<String,Any?>,
        @Header(value="X-TOCA-Customer",defaultValue="") customerAuthorization:String,
        @Header(value="Idempotency-Key",defaultValue="") idempotencyKey:String):Map<String,Any?> {
        val customerId=customerAuth.user(customerAuthorization)["id"] as UUID
        return requestCommands.submit(safeUuid(id),customerId,body,idempotencyKey)
    }
    @Get("/customers/me/request-commands/{commandId}")
    fun customerCommand(commandId:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> =
        requestCommands.status(safeUuid(commandId),customerAuth.user(authorization)["id"] as UUID)

    @Get("/admin/venues/{id}/request-commands")
    fun requestCommands(id:String,@Header(value="Authorization",defaultValue="") authorization:String):List<Map<String,Any?>> {
        ownerVenue(id,authorization)
        return requestCommands.listForVenue(safeUuid(id))
    }
    @Post("/admin/venues/{id}/request-commands/{commandId}/reconcile")
    fun reconcileCommand(id:String,commandId:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        return requestCommands.reconcile(safeUuid(id),safeUuid(commandId))
    }
    @Post("/admin/venues/{id}/request-commands/{commandId}/cancel")
    fun cancelCommand(id:String,commandId:String,@Body body:Map<String,Any?>,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        return requestCommands.cancel(safeUuid(id),safeUuid(commandId),body["acknowledgeProviderState"]==true)
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
        return media.add(safeUuid(id),body)
    }
    @Put("/admin/venues/{id}/photos/{photoId}/primary")
    fun setPrimaryPhoto(id:String,photoId:String,@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization);return media.primary(safeUuid(id),safeUuid(photoId))
    }
    @Delete("/admin/venues/{id}/photos/{photoId}")
    fun deletePhoto(id:String,photoId:String,@Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization);return media.delete(safeUuid(id),safeUuid(photoId))
    }

    @Get("/admin/venues/{id}/stats")
    fun stats(id:String,@Header(value="Authorization",defaultValue="") authorization:String):VenueStatistics {
        ownerVenue(id,authorization);val venue=safeUuid(id)
        val totals=db.one("""SELECT count(*) AS tracks,coalesce(sum(request_count-1),0) AS repeats,
            count(*) FILTER(WHERE status IN ('APPROVED','DISPATCHED')) AS synced FROM song_request WHERE venue_id=?""",venue)!!
        val days=db.list("""SELECT to_char(created_at AT TIME ZONE 'America/Montevideo','YYYY-MM-DD') AS day,count(*) AS total
            FROM song_request_event WHERE venue_id=? AND created_at>=now()-interval '7 days' GROUP BY day ORDER BY day""",venue)
        return VenueStatistics((totals.getValue("tracks") as Number).toLong(),
            (totals.getValue("repeats") as Number).toLong(),
            (totals.getValue("synced") as Number).toLong(),days)
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
        val openingHours=(body["openingHours"] as? String)?.trim().orEmpty()
        if(openingHours.length>180)fail(HttpStatus.BAD_REQUEST,"Horario demasiado largo")
        val instagram=normalizeInstagram(body["instagramHandle"])
        val access=(body["requestAccessMode"] as? String)?:"NEARBY"
        if(access !in setOf("NEARBY","ANYWHERE"))fail(HttpStatus.BAD_REQUEST,"Modo de acceso inválido")
        val registration=body["registrationId"]?.let { safeUuid(it as? String ?: fail(HttpStatus.BAD_REQUEST,"Registro inválido")) }
        val id=UUID.randomUUID();val slug="bar-"+id.toString().take(8)
        val saved=db.transaction {
            db.exec("""INSERT INTO venue(id,owner_id,name,slug,address,city,genre,latitude,longitude,join_token,description,opening_hours,instagram_handle,request_access_mode,published,registration_id)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,false,?) ON CONFLICT(owner_id,registration_id) DO NOTHING""",id,user["id"],name,slug,address,city,genre,lat,lon,randomString(36),
                (body["description"] as? String)?.take(2000)?:"",openingHours,instagram,access,registration)
            if(registration==null)venueById(id.toString())
            else db.one("SELECT * FROM venue WHERE owner_id=? AND registration_id=?",user["id"],registration)!!
        }
        return adminVenue(saved)
    }
    @Put("/admin/venues/{id}/publication") fun publishVenue(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Any?> {
        ownerVenue(id,authorization)
        return db.transaction {
            val venue=db.one("SELECT * FROM venue WHERE id=? FOR UPDATE",safeUuid(id)) ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            if(coverPhoto(id)==null)fail(HttpStatus.PRECONDITION_FAILED,"Agregá una foto de portada antes de publicar el bar")
            if(venue["name"].toString().isBlank()||venue["address"].toString().isBlank()||venue["city"].toString().isBlank())
                fail(HttpStatus.PRECONDITION_FAILED,"Completá el nombre y la dirección antes de publicar")
            db.exec("UPDATE venue SET published=true,updated_at=now() WHERE id=?",safeUuid(id))
            adminVenue(venueById(id))
        }
    }
    @Put("/admin/venues/{id}") fun editVenue(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        ownerVenue(id,authorization)
        val lat=(body["latitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Latitud requerida")
        val lon=(body["longitude"] as? Number)?.toDouble()?:fail(HttpStatus.BAD_REQUEST,"Longitud requerida")
        if(lat !in -90.0..90.0||lon !in -180.0..180.0)fail(HttpStatus.BAD_REQUEST,"Coordenadas inválidas")
        if(coverPhoto(id)==null && venueById(id)["published"]==true)
            fail(HttpStatus.BAD_REQUEST,"Agregá una foto de portada antes de guardar Mi Bar")
        val openingHours=(body["openingHours"] as? String)?.trim().orEmpty()
        if(openingHours.length>180)
            fail(HttpStatus.BAD_REQUEST,"Horario demasiado largo (máximo 180 caracteres)")
        db.exec("""UPDATE venue SET name=?,address=?,city=?,description=?,genre=?,instagram_handle=?,opening_hours=?,latitude=?,longitude=?,updated_at=now() WHERE id=?""",
            required(body,"name",160),required(body,"address",240),required(body,"city",120),
            (body["description"] as? String)?.take(2000)?:"",(body["genre"] as? String)?.take(160)?:"",normalizeInstagram(body["instagramHandle"]),openingHours,lat,lon,safeUuid(id))
        return adminVenue(venueById(id))
    }
    /** Independent editors only change their submitted fields, never a stale full profile. */
    @Patch("/admin/venues/{id}") fun patchVenue(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String,
        @Body body:Map<String,Any?>):Map<String,Any?> {
        val owned=ownerVenue(id,authorization)
        val columns=mapOf("name" to "name","address" to "address","city" to "city","description" to "description",
            "genre" to "genre","instagramHandle" to "instagram_handle","openingHours" to "opening_hours",
            "latitude" to "latitude","longitude" to "longitude")
        val changes=body["changes"] as? Map<*,*> ?: fail(HttpStatus.BAD_REQUEST,"Cambios inválidos")
        val expected=body["expected"] as? Map<*,*> ?: fail(HttpStatus.BAD_REQUEST,"Falta la versión de los datos que revisaste")
        if(changes.isEmpty() || changes.keys.any { it !in columns } || changes.keys!=expected.keys)
            fail(HttpStatus.BAD_REQUEST,"Campos de actualización inválidos")
        val geo=changes.keys.any {it in setOf("address","city","latitude","longitude")}
        if(geo && (body["locationConfirmed"]!=true || !changes.containsKey("latitude") || !changes.containsKey("longitude")))
            fail(HttpStatus.BAD_REQUEST,"Confirmá el pin de la nueva ubicación")
        val limits=mapOf("name" to 160,"address" to 240,"city" to 120,"description" to 2000,"genre" to 160,"instagramHandle" to 160,"openingHours" to 180)
        val values=changes.map { (rawKey,value) ->
            val key=rawKey as String
            key to if(key in setOf("latitude","longitude")) {
                val number=(value as? Number)?.toDouble() ?: fail(HttpStatus.BAD_REQUEST,"Coordenadas inválidas")
                if(!number.isFinite() || (key=="latitude" && number !in -90.0..90.0) || (key=="longitude" && number !in -180.0..180.0))
                    fail(HttpStatus.BAD_REQUEST,"Coordenadas inválidas")
                number
            } else {
                val text=(value as? String) ?: fail(HttpStatus.BAD_REQUEST,"Dato inválido: $key")
                if(text.length>limits.getValue(key))fail(HttpStatus.BAD_REQUEST,"Dato demasiado largo: $key")
                if(key in setOf("name","address","city") && text.trim().length<(if(key=="name")2 else if(key=="address")4 else 1))
                    fail(HttpStatus.BAD_REQUEST,"Completá el nombre, la dirección y la ciudad")
                if(key=="instagramHandle")normalizeInstagram(text) else text.trim()
            }
        }.toMap()
        val saved=db.transaction {
            val current=db.one("SELECT * FROM venue WHERE id=? AND owner_id=? FOR UPDATE",safeUuid(id),owned["owner_id"])
                ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            for(key in values.keys) {
                val actual=current[columns.getValue(key)]
                val same=if(key in setOf("latitude","longitude"))
                    (actual as? Number)?.toDouble()==(expected[key] as? Number)?.toDouble()
                else actual?.toString().orEmpty()==(expected[key] as? String).orEmpty()
                if(!same)fail(HttpStatus.CONFLICT,"Estos datos cambiaron en otra pantalla. Recargá y revisá los cambios antes de guardar.")
            }
            if(geo)requestCommands.requireMutable(safeUuid(id))
            val assignments=values.keys.joinToString(",") { columns.getValue(it)+"=?" }
            db.exec("UPDATE venue SET $assignments,updated_at=now() WHERE id=?",*(values.values.toList()+safeUuid(id)).toTypedArray())
            venueById(id)
        }
        return adminVenue(saved)
    }
    /** Delete a bar only when the authenticated user owns it.
     *  Venue child records are deleted by PostgreSQL ON DELETE CASCADE constraints.
     *  This never deletes the administrator account or the external Spotify playlist.
     */
    @Delete("/admin/venues/{id}")
    fun deleteVenue(id:String,
        @Header(value="Authorization",defaultValue="") authorization:String):Map<String,Boolean> {
        val venue=ownerVenue(id,authorization)
        val deleted=db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",safeUuid(id))
            requestCommands.requireMutable(safeUuid(id))
            db.exec("DELETE FROM venue WHERE id=? AND owner_id=?",safeUuid(id),venue["owner_id"])
        }
        if(deleted==0)fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
        return mapOf("deleted" to true)
    }

    @Post("/admin/venues/{id}/session") fun session(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        ownerVenue(id,authorization)
        val active=asBoolean(body,"active")
        db.transaction {
            val v=db.one("SELECT * FROM venue WHERE id=? FOR UPDATE",safeUuid(id)) ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            requestCommands.requireMutable(safeUuid(id))
            if(active && v["published"]!=true)fail(HttpStatus.PRECONDITION_FAILED,"Publicá el bar antes de abrir la sesión musical")
            if(active && ((v["playlist_id"] as? String).isNullOrBlank() || !spotify.playlistWriteEnabled)) fail(HttpStatus.PRECONDITION_FAILED,"Seleccioná una playlist y habilitá sus escrituras antes de abrir la sesión")
            if(active&&(v["spotify_premium"]!=true||v["spotify_access_encrypted"]==null))
                fail(HttpStatus.PRECONDITION_FAILED,"Vinculá Spotify Premium antes de abrir la sesión")
            db.exec("""UPDATE venue SET active=?,queue_started_at=CASE WHEN ? AND NOT active THEN now() ELSE queue_started_at END,
                join_token=CASE WHEN ? AND NOT active THEN ? ELSE join_token END,updated_at=now() WHERE id=?""",
                active,active,active,randomString(36),safeUuid(id))
            if(!active)db.exec("DELETE FROM venue_customer_presence WHERE venue_id=?",safeUuid(id))
        }
        return mapOf("active" to active)
    }
    @Put("/admin/venues/{id}/policy") fun policy(id:String,@Header(value="Authorization",defaultValue="")authorization:String,@Body body:Map<String,Any?>):Map<String,Any?> {
        ownerVenue(id,authorization)
        val curated=db.transaction {
            val v=db.one("SELECT * FROM venue WHERE id=? FOR UPDATE",safeUuid(id)) ?: fail(HttpStatus.NOT_FOUND,"Bar no encontrado")
            requestCommands.requireMutable(safeUuid(id))
            val selected=asBoolean(body,"curatedOnly",v["curated_only"] as Boolean)
            db.exec("UPDATE venue SET require_approval=false,curated_only=?,updated_at=now() WHERE id=?",selected,safeUuid(id))
            selected
        }
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
            requestCommands.requireMutable(safeUuid(id))
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
        db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",safeUuid(id))
            requestCommands.requireMutable(safeUuid(id))
            db.exec("DELETE FROM venue_track_rule WHERE venue_id=? AND track_id=? AND mode=?",safeUuid(id),track,mode)
        }
        return mapOf("removed" to true)
    }
    @Post("/admin/venues/{id}/join-token/rotate") fun rotateJoin(id:String,@Header(value="Authorization",defaultValue="")authorization:String):Map<String,Boolean> {
        ownerVenue(id,authorization)
        db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",safeUuid(id))
            requestCommands.requireMutable(safeUuid(id))
            db.exec("UPDATE venue SET join_token=?,updated_at=now() WHERE id=?",randomString(36),safeUuid(id))
        }
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
        val changed=db.transaction {
            db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",safeUuid(id))
            requestCommands.requireMutable(safeUuid(id))
            db.exec("UPDATE song_request SET status='PLAYED',updated_at=now() WHERE id=? AND venue_id=? AND status IN ('APPROVED','DISPATCHED')",safeUuid(requestId),safeUuid(id))
        }
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
        return mapOf("playlistId" to p)
    }
}
