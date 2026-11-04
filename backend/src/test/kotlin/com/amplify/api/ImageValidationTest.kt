package com.amplify.api
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import io.micronaut.http.exceptions.HttpStatusException
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
class ImageValidationTest {
 @Test fun `reject bogus jpeg signature`() {assertThrows(HttpStatusException::class.java){ImageValidation.normalize(byteArrayOf(-1,-40,-1)+ByteArray(101),"image/jpeg",1000)}}
 @Test fun `decode and normalize png`() {val output=ByteArrayOutputStream();ImageIO.write(BufferedImage(20,20,BufferedImage.TYPE_INT_RGB),"png",output);val normalized=ImageValidation.normalize(output.toByteArray(),"image/png",10000);assertEquals(20,ImageIO.read(normalized.inputStream()).width)}
 @Test fun `reject format mismatch`() {val output=ByteArrayOutputStream();ImageIO.write(BufferedImage(20,20,BufferedImage.TYPE_INT_RGB),"png",output);assertThrows(HttpStatusException::class.java){ImageValidation.normalize(output.toByteArray(),"image/jpeg",10000)}}
 @Test fun `reject excessive input before decode`() {assertThrows(HttpStatusException::class.java){ImageValidation.normalize(ByteArray(1024),"image/png",100)}}
}
