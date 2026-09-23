import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/models/personnel_document_model.dart';
import 'package:eminence_hris_mobile/utils/display.dart';

void main() {
  group('Personnel Documents Workflow & Redesign Tests', () {
    test('PersonnelDocument parses hasFile correctly for placeholders vs uploaded files', () {
      final placeholderJson = {
        'id': 101,
        'personnelId': 42,
        'documentTypeId': 'PDS',
        'documentTypeName': 'Personal Data Sheet',
        'originalFileName': null,
        'storedFileName': null,
        'mimeType': null,
        'fileSize': 0,
        'fileUrl': null,
        'status': 'NOT_SUBMITTED',
        'isRequired': true,
        'hasFile': false,
      };

      final placeholder = PersonnelDocument.fromJson(placeholderJson);
      expect(placeholder.hasFile, isFalse);
      expect(placeholder.isRequired, isTrue);

      final uploadedJson = {
        'id': 102,
        'personnelId': 42,
        'documentTypeId': 'TOR',
        'documentTypeName': 'Transcript of Records',
        'originalFileName': 'tor_official.pdf',
        'storedFileName': 'tor_102.pdf',
        'mimeType': 'application/pdf',
        'fileSize': 1024 * 500,
        'fileUrl': '/personnel/documents/102/file',
        'status': 'APPROVED',
        'isRequired': true,
        'hasFile': true,
      };

      final uploaded = PersonnelDocument.fromJson(uploadedJson);
      expect(uploaded.hasFile, isTrue);
      expect(uploaded.isPdf, isTrue);
      expect(uploaded.formattedFileSize, '500.0 KB');
    });

    test('201 Selector excludes empty placeholders and prioritizes suggested requirement types', () {
      final placeholder = PersonnelDocument(
        id: 1,
        personnelId: 42,
        documentTypeId: 'LETTER_OF_INTENT',
        documentTypeName: 'Letter of Intent',
        originalFileName: '',
        storedFileName: '',
        mimeType: '',
        fileSize: 0,
        fileUrl: '',
        status: PersonnelDocumentStatus.NOT_SUBMITTED,
        uploadedAt: DateTime.now().toIso8601String(),
        updatedAt: DateTime.now().toIso8601String(),
        hasFile: false,
      );

      final torDoc = PersonnelDocument(
        id: 2,
        personnelId: 42,
        documentTypeId: 'TOR',
        documentTypeName: 'Transcript of Records',
        originalFileName: 'tor.pdf',
        storedFileName: 'tor_2.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024 * 1024,
        fileUrl: '/file/2',
        status: PersonnelDocumentStatus.APPROVED,
        uploadedAt: DateTime.now().toIso8601String(),
        updatedAt: DateTime.now().toIso8601String(),
        hasFile: true,
      );

      final certDoc = PersonnelDocument(
        id: 3,
        personnelId: 42,
        documentTypeId: 'TRAINING_CERT',
        documentTypeName: 'Training Certificate',
        originalFileName: 'training.pdf',
        storedFileName: 'training_3.pdf',
        mimeType: 'application/pdf',
        fileSize: 200 * 1024,
        fileUrl: '/file/3',
        status: PersonnelDocumentStatus.APPROVED,
        uploadedAt: DateTime.now().toIso8601String(),
        updatedAt: DateTime.now().toIso8601String(),
        hasFile: true,
      );

      final allDocs = [placeholder, torDoc, certDoc];

      // 1. Filter out empty placeholders
      final validDocs = allDocs.where((d) => d.hasFile).toList();
      expect(validDocs.length, 2);
      expect(validDocs.contains(placeholder), isFalse);

      // 2. Prioritize suggested types for Annex C item 'e' (Scholastic: TOR, DIPLOMA, CAV)
      const suggestedTypes = ['TOR', 'DIPLOMA', 'CAV'];
      final recommended = validDocs
          .where((d) => suggestedTypes.contains(d.documentTypeId))
          .toList();
      final others = validDocs
          .where((d) => !suggestedTypes.contains(d.documentTypeId))
          .toList();
      final displayList = [...recommended, ...others];

      expect(displayList.first.documentTypeId, 'TOR');
      expect(displayList.last.documentTypeId, 'TRAINING_CERT');
    });

    test('Actionable status detection properly identifies expired, expiring soon, and uploaded files', () {
      final now = DateTime.now();

      final expiredDoc = PersonnelDocument(
        id: 4,
        personnelId: 42,
        documentTypeId: 'LICENSE',
        documentTypeName: 'PRC License',
        originalFileName: 'license.jpg',
        storedFileName: 'lic_4.jpg',
        mimeType: 'image/jpeg',
        fileSize: 50000,
        fileUrl: '/file/4',
        expirationDate: '2020-01-01',
        status: PersonnelDocumentStatus.APPROVED,
        uploadedAt: now.toIso8601String(),
        updatedAt: now.toIso8601String(),
        hasFile: true,
      );
      expect(isDateInPast(expiredDoc.expirationDate!), isTrue);

      final expiringSoonDate = now.add(const Duration(days: 20)).toIso8601String().split('T')[0];
      final expiringDoc = PersonnelDocument(
        id: 5,
        personnelId: 42,
        documentTypeId: 'NBI_CLEARANCE',
        documentTypeName: 'NBI Clearance',
        originalFileName: 'nbi.pdf',
        storedFileName: 'nbi_5.pdf',
        mimeType: 'application/pdf',
        fileSize: 50000,
        fileUrl: '/file/5',
        expirationDate: expiringSoonDate,
        status: PersonnelDocumentStatus.APPROVED,
        uploadedAt: now.toIso8601String(),
        updatedAt: now.toIso8601String(),
        hasFile: true,
      );
      expect(isDateInPast(expiringDoc.expirationDate!), isFalse);
      final dt = DateTime.tryParse(expiringDoc.expirationDate!);
      expect(dt, isNotNull);
      final diffDays = dt!.difference(now).inDays;
      expect(diffDays >= 0 && diffDays <= 60, isTrue);
    });
  });
}
