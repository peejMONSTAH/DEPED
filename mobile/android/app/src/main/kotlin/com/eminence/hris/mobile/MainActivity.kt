package com.eminence.hris.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.net.Uri
import android.graphics.BitmapFactory
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

class MainActivity: FlutterActivity() {
    private val documents = Executors.newSingleThreadExecutor()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "digital201/documents")
            .setMethodCallHandler { call, result ->
                if (call.method == "openReview") {
                    val path = call.argument<String>("path") ?: ""
                    if (!path.startsWith("/admin/") || path.contains("\\") || path.contains("..")) {
                        result.error("INVALID_TARGET", "This review link is invalid.", null)
                    } else {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://digital201.online$path")))
                            result.success(null)
                        } catch (e: Exception) {
                            result.error("OPEN_FAILED", "Open the Digital 201 web portal to review this case.", null)
                        }
                    }
                    return@setMethodCallHandler
                }
                if (call.method != "combine") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val files = call.argument<List<Map<String, Any>>>("files") ?: emptyList()
                documents.execute {
                    try {
                        PDFBoxResourceLoader.init(applicationContext)
                        val output = RequirementPdfCombiner.combine(files)
                        runOnUiThread { result.success(output) }
                    } catch (e: Exception) {
                        runOnUiThread { result.error("COMBINE_FAILED", "Could not combine these files. Use valid, unencrypted PDFs, PNG or JPEG images. Nothing was uploaded.", null) }
                    }
                }
            }
    }

}

// Copy PDF pages, not screenshots: text stays sharp and searchable.
internal object RequirementPdfCombiner {
    fun combine(files: List<Map<String, Any>>): ByteArray {
        require(files.size in 2..20)
        val limit = 10 * 1024 * 1024
        require(files.sumOf { (it["bytes"] as ByteArray).size.toLong() } <= limit)
        PDDocument().use { output ->
            val merger = PDFMergerUtility()
            for (file in files) {
                val bytes = file["bytes"] as ByteArray
                require(bytes.isNotEmpty())
                if (file["mimeType"] == "application/pdf") {
                    PDDocument.load(bytes).use { source ->
                        require(!source.isEncrypted && source.numberOfPages > 0)
                        require(source.numberOfPages + output.numberOfPages <= 300)
                        merger.appendDocument(output, source)
                    }
                } else {
                    require(file["mimeType"] == "image/png" || file["mimeType"] == "image/jpeg")
                    val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, dimensions)
                    require(dimensions.outWidth > 0 && dimensions.outHeight > 0)
                    require(dimensions.outWidth.toLong() * dimensions.outHeight <= 40_000_000)
                    val image = PDImageXObject.createFromByteArray(output, bytes, "attachment")
                    val page = PDPage(PDRectangle.A4)
                    output.addPage(page)
                    val scale = minOf((page.mediaBox.width - 40) / image.width, (page.mediaBox.height - 40) / image.height)
                    val width = image.width * scale
                    val height = image.height * scale
                    PDPageContentStream(output, page).use { stream ->
                        stream.drawImage(image, (page.mediaBox.width - width) / 2, (page.mediaBox.height - height) / 2, width, height)
                    }
                }
            }
            val buffer = ByteArrayOutputStream()
            output.save(buffer)
            require(buffer.size() <= limit)
            return buffer.toByteArray()
        }
    }
}
