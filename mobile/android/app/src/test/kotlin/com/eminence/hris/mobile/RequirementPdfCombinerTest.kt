package com.eminence.hris.mobile

import android.graphics.Bitmap
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import java.io.ByteArrayOutputStream
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RequirementPdfCombinerTest {
    @Before fun setup() { PDFBoxResourceLoader.init(RuntimeEnvironment.getApplication()) }

    private fun pdf(text: String, encrypt: Boolean = false): ByteArray {
        PDDocument().use { doc ->
            val page = PDPage()
            doc.addPage(page)
            PDPageContentStream(doc, page).use { stream ->
                stream.beginText(); stream.setFont(PDType1Font.HELVETICA, 12f)
                stream.newLineAtOffset(40f, 700f); stream.showText(text); stream.endText()
            }
            if (encrypt) doc.protect(StandardProtectionPolicy("owner", "secret", AccessPermission()))
            val output = ByteArrayOutputStream(); doc.save(output); return output.toByteArray()
        }
    }

    @Test fun orderedPdfsAndImageKeepAllPagesAndSearchableText() {
        val image = ByteArrayOutputStream()
        Bitmap.createBitmap(20, 40, Bitmap.Config.ARGB_8888).apply {
            eraseColor(android.graphics.Color.WHITE)
            compress(Bitmap.CompressFormat.PNG, 100, image)
            recycle()
        }
        val bytes = RequirementPdfCombiner.combine(listOf(
            mapOf("bytes" to pdf("First document"), "mimeType" to "application/pdf"),
            mapOf("bytes" to image.toByteArray(), "mimeType" to "image/png"),
            mapOf("bytes" to pdf("Last document"), "mimeType" to "application/pdf"),
        ))
        PDDocument.load(bytes).use { doc ->
            assertEquals(3, doc.numberOfPages)
            val text = PDFTextStripper().getText(doc)
            assertTrue(text.contains("First document"))
            assertTrue(text.contains("Last document"))
            assertTrue(text.indexOf("First document") < text.indexOf("Last document"))
        }
    }

    @Test fun encryptedOrInvalidFilesAreRejectedBeforeUpload() {
        for (bytes in listOf(pdf("Private", true), byteArrayOf(1, 2, 3))) {
            assertThrows(Exception::class.java) {
                RequirementPdfCombiner.combine(listOf(
                    mapOf("bytes" to pdf("Good"), "mimeType" to "application/pdf"),
                    mapOf("bytes" to bytes, "mimeType" to "application/pdf"),
                ))
            }
        }
    }
}
