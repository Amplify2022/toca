package com.amplify.api

import io.micronaut.http.HttpStatus
import jakarta.inject.Singleton
import java.util.UUID
import java.util.Base64
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

object ImageValidation {
    private val decoders=java.util.concurrent.Semaphore(2)
    fun normalize(bytes: ByteArray, mime: String, limit: Int): ByteArray {
        if(!decoders.tryAcquire())fail(HttpStatus.TOO_MANY_REQUESTS,"Hay otras imágenes en proceso. Reintentá más tarde")
        try{return decode(bytes,mime,limit)}finally{decoders.release()}
    }
    private fun decode(bytes: ByteArray, mime: String, limit: Int): ByteArray {
        if(bytes.size !in 24..limit) fail(HttpStatus.BAD_REQUEST,"Imagen demasiado grande o vacía")
        val format=when(mime){"image/jpeg"->"jpeg";"image/png"->"png";else->fail(HttpStatus.BAD_REQUEST,"Usá JPEG o PNG")}
        ImageIO.createImageInputStream(ByteArrayInputStream(bytes)).use { input ->
            val readers=ImageIO.getImageReaders(input)
            if(!readers.hasNext())fail(HttpStatus.BAD_REQUEST,"Imagen inválida")
            val reader=readers.next()
            try {
                reader.input=input
                if(!reader.formatName.equals(format,true)&&!(format=="jpeg"&&reader.formatName.equals("jpg",true)))fail(HttpStatus.BAD_REQUEST,"Formato de imagen incorrecto")
                val width=reader.getWidth(0);val height=reader.getHeight(0)
                if(width<=0||height<=0||width.toLong()*height>20_000_000L)fail(HttpStatus.BAD_REQUEST,"Máximo 20 megapíxeles")
                val image=reader.read(0)?:fail(HttpStatus.BAD_REQUEST,"Imagen incompleta")
                val output=ByteArrayOutputStream()
                if(!ImageIO.write(image,format,output))fail(HttpStatus.BAD_REQUEST,"Imagen no compatible")
                return output.toByteArray().also {if(it.size>limit)fail(HttpStatus.BAD_REQUEST,"La imagen normalizada es demasiado grande")}
            } catch(e:io.micronaut.http.exceptions.HttpStatusException){throw e}
            catch(_:Exception){fail(HttpStatus.BAD_REQUEST,"No se pudo decodificar la imagen")}
            finally{reader.dispose()}
        }
    }
}

@Singleton
class VenueMediaService(private val db: Db) {
    private fun lock(id:UUID){if(db.one("SELECT id FROM venue WHERE id=? FOR UPDATE",id)==null)fail(HttpStatus.NOT_FOUND,"Bar no encontrado")}
    fun result(id:UUID):Map<String,Any?> {
        val photos=db.list("SELECT id,is_primary AS \"isPrimary\" FROM venue_photo WHERE venue_id=? ORDER BY is_primary DESC,position,created_at",id)
            .map{mapOf("id" to it["id"].toString(),"isPrimary" to it["isPrimary"],"url" to "/api/venues/$id/photos/${it["id"]}")}
        return mapOf("photos" to photos,"coverPhotoUrl" to photos.firstOrNull()?.get("url"))
    }
    fun add(id:UUID,body:Map<String,Any?>):Map<String,Any?> {
        val mime=required(body,"contentType",40).lowercase()
        val bytes=try{Base64.getDecoder().decode(required(body,"dataBase64",4_000_000))}catch(_:IllegalArgumentException){fail(HttpStatus.BAD_REQUEST,"Imagen inválida")}
        val normalized=ImageValidation.normalize(bytes,mime,2_500_000)
        return db.transaction {
            lock(id);val count=(db.one("SELECT count(*) AS total FROM venue_photo WHERE venue_id=?",id)!!["total"] as Number).toInt()
            if(count>=8)fail(HttpStatus.CONFLICT,"Máximo 8 fotos por bar")
            db.exec("INSERT INTO venue_photo(id,venue_id,data,content_type,position,is_primary) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),id,normalized,mime,count,count==0)
            result(id)
        }
    }
    fun primary(id:UUID,photo:UUID):Map<String,Any?> = db.transaction {
        lock(id);if(db.one("SELECT id FROM venue_photo WHERE venue_id=? AND id=?",id,photo)==null)fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        db.exec("UPDATE venue_photo SET is_primary=false WHERE venue_id=?",id)
        db.exec("UPDATE venue_photo SET is_primary=true WHERE venue_id=? AND id=?",id,photo);result(id)
    }
    fun delete(id:UUID,photo:UUID):Map<String,Any?> = db.transaction {
        lock(id);val count=(db.one("SELECT count(*) AS total FROM venue_photo WHERE venue_id=?",id)!!["total"] as Number).toInt()
        if(count<=1)fail(HttpStatus.CONFLICT,"El bar necesita una foto de portada")
        if(db.exec("DELETE FROM venue_photo WHERE venue_id=? AND id=?",id,photo)==0)fail(HttpStatus.NOT_FOUND,"Foto no encontrada")
        if(db.one("SELECT id FROM venue_photo WHERE venue_id=? AND is_primary=true",id)==null)
            db.exec("UPDATE venue_photo SET is_primary=true WHERE id=(SELECT id FROM venue_photo WHERE venue_id=? ORDER BY position,created_at LIMIT 1)",id)
        result(id)
    }
}
