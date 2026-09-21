import 'dart:typed_data';
import '../../models/personnel_document_model.dart';
import 'document_acquisition_service_stub.dart'
    if (dart.library.io) 'document_acquisition_service_io.dart'
    if (dart.library.html) 'document_acquisition_service_web.dart';

class ValidationResult {
  final bool isValid;
  final String? errorMessage;

  const ValidationResult({required this.isValid, this.errorMessage});

  static const ValidationResult valid = ValidationResult(isValid: true);
  static ValidationResult invalid(String message) => ValidationResult(isValid: false, errorMessage: message);
}

abstract class DocumentAcquisitionService {
  factory DocumentAcquisitionService() => createDocumentAcquisitionService();

  /// Scans physical documents.
  /// On Android: Uses Google ML Kit Document Scanner with ScannerMode.full.
  /// On Web: Falls back to browser camera capture.
  Future<AcquiredDocument?> scanDocument({int pageLimit = 10});

  /// Picks an existing PDF or image from local storage.
  Future<AcquiredDocument?> pickDocument({List<String> allowedExtensions = const ['pdf', 'jpg', 'jpeg', 'png']});

  /// Captures a single photo using device camera.
  Future<AcquiredDocument?> captureCameraPhoto();

  /// Returns true if native ML Kit document scanning is supported on this platform.
  bool get isNativeScannerSupported;

  /// Validates document MIME type, size limit, and file signature magic bytes.
  ValidationResult validateDocument(AcquiredDocument document, {int maxSizeBytes = 10 * 1024 * 1024}) {
    if (document.sizeBytes <= 0) {
      return ValidationResult.invalid('Please select a document before submitting.');
    }

    if (document.sizeBytes > maxSizeBytes) {
      final mbLimit = (maxSizeBytes / (1024 * 1024)).round();
      return ValidationResult.invalid('The selected file is larger than the $mbLimit MB limit.');
    }

    // Supported extensions & MIMEs
    final ext = document.name.split('.').last.toLowerCase();
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];
    if (!allowedExts.contains(ext)) {
      return ValidationResult.invalid('Only PDF, JPG, JPEG, and PNG files are supported.');
    }

    // Magic bytes verification when bytes are loaded
    final bytes = document.bytes;
    if (bytes != null && bytes.length >= 4) {
      final isPdf = _isPdfSignature(bytes);
      final isPng = _isPngSignature(bytes);
      final isJpeg = _isJpegSignature(bytes);

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

  static bool _isPdfSignature(Uint8List bytes) {
    // "%PDF-" = 0x25, 0x50, 0x44, 0x46, 0x2D
    if (bytes.length < 5) return false;
    return bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D;
  }

  static bool _isPngSignature(Uint8List bytes) {
    // 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    if (bytes.length < 8) return false;
    return bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
           bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A;
  }

  static bool _isJpegSignature(Uint8List bytes) {
    // 0xFF, 0xD8, 0xFF
    if (bytes.length < 3) return false;
    return bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
  }
}
