import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_mlkit_document_scanner/google_mlkit_document_scanner.dart';
import '../../models/personnel_document_model.dart';
import 'document_acquisition_service.dart';

DocumentAcquisitionService createDocumentAcquisitionService() => MlKitDocumentAcquisitionService();

class MlKitDocumentAcquisitionService implements DocumentAcquisitionService {
  final ImagePicker _imagePicker = ImagePicker();

  @override
  bool get isNativeScannerSupported => Platform.isAndroid;

  @override
  Future<AcquiredDocument?> scanDocument({int pageLimit = 10}) async {
    if (!Platform.isAndroid) {
      // Fallback for non-Android platforms (e.g., Desktop or Simulator)
      return captureCameraPhoto();
    }

    DocumentScanner? scanner;
    try {
      final options = DocumentScannerOptions(
        mode: ScannerMode.full,
        documentFormats: {
          DocumentFormat.jpeg,
          DocumentFormat.pdf,
        },
        pageLimit: pageLimit,
        isGalleryImport: true,
      );

      scanner = DocumentScanner(options: options);
      final result = await scanner.scanDocument();

      final pdf = result.pdf;
      final images = result.images ?? [];

      if (images.isEmpty && pdf == null) {
        // User cancelled scan normally
        return null;
      }

      // Read pages
      final List<String> pagePaths = List<String>.from(images);
      final List<Uint8List> pageBytes = [];
      for (final p in pagePaths) {
        final f = File(p);
        if (await f.exists()) {
          pageBytes.add(await f.readAsBytes());
        }
      }

      // If PDF output was generated
      if (pdf != null && pdf.uri.isNotEmpty) {
        final pdfFile = File(pdf.uri);
        Uint8List? pdfBytes;
        int pdfSize = 0;
        if (await pdfFile.exists()) {
          pdfBytes = await pdfFile.readAsBytes();
          pdfSize = pdfBytes.length;
        }

        final fileName = 'Scanned_Doc_${DateTime.now().millisecondsSinceEpoch}.pdf';
        return AcquiredDocument(
          name: fileName,
          bytes: pdfBytes ?? (pageBytes.isNotEmpty ? pageBytes.first : null),
          path: pdf.uri,
          mimeType: 'application/pdf',
          sizeBytes: pdfSize > 0 ? pdfSize : (pageBytes.isNotEmpty ? pageBytes.first.length : 0),
          pageCount: pdf.pageCount > 0 ? pdf.pageCount : pagePaths.length,
          isScanned: true,
          pagePaths: pagePaths,
          pageBytes: pageBytes,
        );
      }

      // If JPEG pages only
      if (pagePaths.isNotEmpty) {
        final primaryPath = pagePaths.first;
        final primaryBytes = pageBytes.isNotEmpty ? pageBytes.first : await File(primaryPath).readAsBytes();
        final fileName = 'Scanned_Doc_${DateTime.now().millisecondsSinceEpoch}.jpg';

        return AcquiredDocument(
          name: fileName,
          bytes: primaryBytes,
          path: primaryPath,
          mimeType: 'image/jpeg',
          sizeBytes: primaryBytes.length,
          pageCount: pagePaths.length,
          isScanned: true,
          pagePaths: pagePaths,
          pageBytes: pageBytes,
        );
      }

      return null;
    } on PlatformException catch (e) {
      debugPrint('[MLKit Document Scanner] Error: ${e.code} - ${e.message}');
      if (e.code.toLowerCase().contains('cancel') || (e.message?.toLowerCase().contains('cancel') ?? false)) {
        return null;
      }
      throw Exception('Document scanning is not available on this device. You can upload a photo or PDF instead.');
    } catch (e) {
      debugPrint('[MLKit Document Scanner] General error: $e');
      final errorStr = e.toString().toLowerCase();
      if (errorStr.contains('cancel')) {
        return null;
      }
      throw Exception('Document scanning is not available on this device. You can upload a photo or PDF instead.');
    } finally {
      try {
        await scanner?.close();
      } catch (_) {}
    }
  }

  @override
  Future<AcquiredDocument?> pickDocument({List<String> allowedExtensions = const ['pdf', 'jpg', 'jpeg', 'png']}) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: allowedExtensions,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return null;
      }

      final picked = result.files.single;
      Uint8List? bytes = picked.bytes;
      if (bytes == null && picked.path != null) {
        final f = File(picked.path!);
        if (await f.exists()) {
          bytes = await f.readAsBytes();
        }
      }

      final ext = picked.extension?.toLowerCase() ?? picked.name.split('.').last.toLowerCase();
      final mime = (ext == 'pdf') ? 'application/pdf' : (ext == 'png' ? 'image/png' : 'image/jpeg');

      return AcquiredDocument(
        name: picked.name,
        bytes: bytes,
        path: picked.path,
        mimeType: mime,
        sizeBytes: picked.size,
        pageCount: 1,
        isScanned: false,
        pagePaths: picked.path != null ? [picked.path!] : [],
        pageBytes: bytes != null ? [bytes] : [],
      );
    } catch (e) {
      debugPrint('[FilePicker IO] Error: $e');
      throw Exception('Failed to select document: ${e.toString()}');
    }
  }

  @override
  Future<AcquiredDocument?> captureCameraPhoto() async {
    try {
      final xFile = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 92,
      );

      if (xFile == null) return null;

      final bytes = await xFile.readAsBytes();
      final name = 'Camera_Capture_${DateTime.now().millisecondsSinceEpoch}.jpg';

      return AcquiredDocument(
        name: name,
        bytes: bytes,
        path: xFile.path,
        mimeType: 'image/jpeg',
        sizeBytes: bytes.length,
        pageCount: 1,
        isScanned: false,
        pagePaths: [xFile.path],
        pageBytes: [bytes],
      );
    } catch (e) {
      debugPrint('[Camera Capture IO] Error: $e');
      throw Exception('Failed to capture photo with camera.');
    }
  }

  @override
  ValidationResult validateDocument(AcquiredDocument document, {int maxSizeBytes = 10 * 1024 * 1024}) {
    if (document.sizeBytes <= 0) {
      return ValidationResult.invalid('Please select a document before submitting.');
    }

    if (document.sizeBytes > maxSizeBytes) {
      final mbLimit = (maxSizeBytes / (1024 * 1024)).round();
      return ValidationResult.invalid('The selected file is larger than the $mbLimit MB limit.');
    }

    final ext = document.name.split('.').last.toLowerCase();
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];
    if (!allowedExts.contains(ext)) {
      return ValidationResult.invalid('Only PDF, JPG, JPEG, and PNG files are supported.');
    }

    // Magic bytes verification
    final bytes = document.bytes;
    if (bytes != null && bytes.length >= 4) {
      final isPdf = bytes.length >= 5 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D;
      final isPng = bytes.length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;
      final isJpeg = bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;

      if (ext == 'pdf' && !isPdf) {
        return ValidationResult.invalid('The selected file has a .pdf extension but is not a valid PDF document.');
      }
      if (ext == 'png' && !isPng) {
        return ValidationResult.invalid('The selected file has a .png extension but is not a valid PNG image.');
      }
      if ((ext == 'jpg' || ext == 'jpeg') && !isJpeg) {
        return ValidationResult.invalid('The selected file has a JPG extension but is not a valid JPEG image.');
      }

      if (!isPdf && !isPng && !isJpeg) {
        return ValidationResult.invalid('The file contents do not match a valid PDF, JPEG, or PNG format.');
      }
    }

    return ValidationResult.valid;
  }
}
