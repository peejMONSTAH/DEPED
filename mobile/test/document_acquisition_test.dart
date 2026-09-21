import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/models/personnel_document_model.dart';
import 'package:eminence_hris_mobile/services/acquisition/document_acquisition_service.dart';

void main() {
  group('DocumentAcquisitionService Validation Tests', () {
    final service = DocumentAcquisitionService();

    test('Validates authentic PDF document with %PDF- signature', () {
      final validPdfBytes = Uint8List.fromList([
        0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
        0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3,
      ]);

      final doc = AcquiredDocument(
        name: 'DepEd_Service_Record.pdf',
        bytes: validPdfBytes,
        mimeType: 'application/pdf',
        sizeBytes: validPdfBytes.length,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isTrue);
      expect(result.errorMessage, isNull);
    });

    test('Validates authentic PNG document signature', () {
      final validPngBytes = Uint8List.fromList([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      ]);

      final doc = AcquiredDocument(
        name: 'PRC_License_Scan.png',
        bytes: validPngBytes,
        mimeType: 'image/png',
        sizeBytes: validPngBytes.length,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isTrue);
    });

    test('Validates authentic JPEG document signature', () {
      final validJpegBytes = Uint8List.fromList([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,
      ]);

      final doc = AcquiredDocument(
        name: 'Government_ID_Front.jpg',
        bytes: validJpegBytes,
        mimeType: 'image/jpeg',
        sizeBytes: validJpegBytes.length,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isTrue);
    });

    test('Rejects spoofed file where extension is .pdf but content is not PDF', () {
      final fakeBytes = Uint8List.fromList([
        0x4D, 0x5A, 0x90, 0x00, 0x03, // Windows Executable 'MZ'
      ]);

      final doc = AcquiredDocument(
        name: 'Malicious_Document.pdf',
        bytes: fakeBytes,
        mimeType: 'application/pdf',
        sizeBytes: fakeBytes.length,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isFalse);
      expect(result.errorMessage, contains('valid PDF document'));
    });

    test('Rejects unsupported file extension with user-friendly error', () {
      final doc = AcquiredDocument(
        name: 'script.exe',
        bytes: Uint8List.fromList([0x01, 0x02]),
        mimeType: 'application/octet-stream',
        sizeBytes: 2,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isFalse);
      expect(result.errorMessage, equals('Only PDF, JPG, JPEG, and PNG files are supported.'));
    });

    test('Rejects file exceeding configurable 10 MB limit', () {
      final oversizedBytes = Uint8List.fromList([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
      const elevenMb = 11 * 1024 * 1024;

      final doc = AcquiredDocument(
        name: 'Large_Scan.pdf',
        bytes: oversizedBytes,
        mimeType: 'application/pdf',
        sizeBytes: elevenMb,
      );

      final result = service.validateDocument(doc, maxSizeBytes: 10 * 1024 * 1024);
      expect(result.isValid, isFalse);
      expect(result.errorMessage, contains('larger than the 10 MB limit'));
    });

    test('Rejects empty or 0-byte document', () {
      final doc = AcquiredDocument(
        name: 'empty.pdf',
        bytes: Uint8List(0),
        mimeType: 'application/pdf',
        sizeBytes: 0,
      );

      final result = service.validateDocument(doc);
      expect(result.isValid, isFalse);
      expect(result.errorMessage, equals('Please select a document before submitting.'));
    });
  });

  group('DocumentTypeConfig Tests', () {
    test('Configures expiration correctly across standard types', () {
      const types = DocumentTypeConfig.defaultTypes;

      final govId = types.firstWhere((t) => t.id == 'GOV_ID');
      expect(govId.supportsExpiration, isTrue);

      final birthCert = types.firstWhere((t) => t.id == 'BIRTH_CERT');
      expect(birthCert.supportsExpiration, isFalse);

      final diploma = types.firstWhere((t) => t.id == 'DIPLOMA');
      expect(diploma.supportsExpiration, isFalse);

      final nbi = types.firstWhere((t) => t.id == 'NBI_CLEARANCE');
      expect(nbi.supportsExpiration, isTrue);

      final license = types.firstWhere((t) => t.id == 'LICENSE');
      expect(license.supportsExpiration, isTrue);
    });
  });

  group('PersonnelDocument Model Serialization Tests', () {
    test('Correctly serializes and deserializes PersonnelDocument', () {
      const json = {
        'id': 201,
        'personnelId': 5,
        'documentTypeId': 'LICENSE',
        'documentTypeName': 'License',
        'originalFileName': 'PRC_Teacher_I.pdf',
        'storedFileName': 'stored_prc.pdf',
        'mimeType': 'application/pdf',
        'fileSize': 1572864,
        'fileUrl': '/api/v1/personnel/documents/201/file',
        'issueDate': '2024-05-10',
        'expirationDate': '2027-05-10',
        'remarks': 'Verified PRC Teacher Board Certification.',
        'status': 'APPROVED',
        'uploadedAt': '2026-01-15T10:00:00.000Z',
        'updatedAt': '2026-01-16T10:00:00.000Z',
      };

      final doc = PersonnelDocument.fromJson(json);

      expect(doc.id, equals(201));
      expect(doc.personnelId, equals(5));
      expect(doc.documentTypeName, equals('License'));
      expect(doc.status, equals(PersonnelDocumentStatus.APPROVED));
      expect(doc.formattedFileSize, equals('1.5 MB'));
      expect(doc.isPdf, isTrue);
      expect(doc.isImage, isFalse);
    });
  });
}
