import 'package:flutter/foundation.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/personnel_document_model.dart';
import 'document_acquisition_service.dart';

DocumentAcquisitionService createDocumentAcquisitionService() => WebDocumentAcquisitionService();

class WebDocumentAcquisitionService implements DocumentAcquisitionService {
  final ImagePicker _imagePicker = ImagePicker();

  @override
  bool get isNativeScannerSupported => false;

  @override
  Future<AcquiredDocument?> scanDocument({int pageLimit = 10}) async {
    // On Web, Google ML Kit is not available.
    // Fallback: Trigger browser/device camera capture if supported.
    return captureCameraPhoto();
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
      final bytes = picked.bytes;
      final ext = picked.extension?.toLowerCase() ?? picked.name.split('.').last.toLowerCase();
      final mime = (ext == 'pdf') ? 'application/pdf' : (ext == 'png' ? 'image/png' : 'image/jpeg');

      return AcquiredDocument(
        name: picked.name,
        bytes: bytes,
        path: picked.name, // Web uses in-memory bytes
        mimeType: mime,
        sizeBytes: picked.size,
        pageCount: 1,
        isScanned: false,
        pagePaths: [picked.name],
        pageBytes: bytes != null ? [bytes] : [],
      );
    } catch (e) {
      debugPrint('[Web Document Acquisition] Pick error: $e');
      throw Exception('Failed to select file on web browser.');
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
      final name = 'Web_Camera_${DateTime.now().millisecondsSinceEpoch}.jpg';

      return AcquiredDocument(
        name: name,
        bytes: bytes,
        path: xFile.name,
        mimeType: 'image/jpeg',
        sizeBytes: bytes.length,
        pageCount: 1,
        isScanned: false,
        pagePaths: [xFile.name],
        pageBytes: [bytes],
      );
    } catch (e) {
      debugPrint('[Web Camera Capture] Error: $e');
      throw Exception('Web browser camera is unavailable or permission denied.');
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
