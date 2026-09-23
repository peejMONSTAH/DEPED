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

    test('Single-instance requirement identity resolution distinguishes types and Annex C codes', () {
      String? resolveRequirementKey(String? typeId, String? customName) {
        if (typeId == null) return null;
        final normalized = typeId.toUpperCase().trim();
        final trimmedCustom = (customName ?? '').trim();

        final annexMatch = RegExp(r'^Annex\s+C\s*[\(\[-]?\s*([a-k])\b', caseSensitive: false)
            .firstMatch(trimmedCustom);
        if (annexMatch != null) {
          final code = annexMatch.group(1)!.toLowerCase();
          return 'ANNEX_C_$code';
        }

        const multi = {'TRAINING_CERT', 'COE'};
        if (multi.contains(normalized)) {
          return null;
        }

        if (normalized == 'OTHER') {
          if (trimmedCustom.isEmpty) return null;
          return 'OTHER:${trimmedCustom.toLowerCase()}';
        }

        return 'DOC_TYPE:$normalized';
      }

      // Single instance standard types
      expect(resolveRequirementKey('LETTER_OF_INTENT', null), 'DOC_TYPE:LETTER_OF_INTENT');
      expect(resolveRequirementKey('PDS', null), 'DOC_TYPE:PDS');
      expect(resolveRequirementKey('TOR', null), 'DOC_TYPE:TOR');

      // Annex C custom types under OTHER
      expect(resolveRequirementKey('OTHER', 'Annex C (a) Letter of Intent'), 'ANNEX_C_a');
      expect(resolveRequirementKey('OTHER', 'Annex C - b: Personal Data Sheet'), 'ANNEX_C_b');
      expect(resolveRequirementKey('OTHER', 'Annex C a: Letter of Intent'), 'ANNEX_C_a');
      expect(resolveRequirementKey('OTHER', 'Annex C k: Other Documents'), 'ANNEX_C_k');

      // Distinct non-Annex C OTHER documents do NOT collide
      expect(resolveRequirementKey('OTHER', 'Special Order No. 42'), 'OTHER:special order no. 42');
      expect(resolveRequirementKey('OTHER', 'Commendation Letter 2025'), 'OTHER:commendation letter 2025');
      expect(
        resolveRequirementKey('OTHER', 'Special Order No. 42') !=
            resolveRequirementKey('OTHER', 'Commendation Letter 2025'),
        isTrue,
      );

      // Multi-instance types return null (allowed multiple active files)
      expect(resolveRequirementKey('TRAINING_CERT', null), isNull);
      expect(resolveRequirementKey('COE', null), isNull);
    });

    test('Active document duplicate detection correctly distinguishes active files from placeholders', () {
      final placeholder = PersonnelDocument(
        id: 10,
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

      final activePds = PersonnelDocument(
        id: 11,
        personnelId: 42,
        documentTypeId: 'PDS',
        documentTypeName: 'Personal Data Sheet',
        originalFileName: 'pds_2026.pdf',
        storedFileName: 'pds_11.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024 * 300,
        fileUrl: '/file/11',
        status: PersonnelDocumentStatus.SUBMITTED,
        uploadedAt: DateTime.now().toIso8601String(),
        updatedAt: DateTime.now().toIso8601String(),
        hasFile: true,
      );

      final existingDocs = [placeholder, activePds];

      bool hasActiveDoc(String typeId, String? customName) {
        const singleInstanceTypes = {
          'LETTER_OF_INTENT', 'PDS', 'WES', 'LICENSE', 'CSC_ELIGIBILITY',
          'APPOINTMENT', 'PERFORMANCE_RATING', 'OMNIBUS_CERT', 'OATH_OF_OFFICE',
          'POSITION_DESCRIPTION', 'SALN', 'GOV_ID', 'BIRTH_CERT', 'MARRIAGE_CERT',
          'NBI_CLEARANCE', 'POLICE_CLEARANCE', 'MED_CERT', 'RESUME_CV', 'TOR',
          'DIPLOMA', 'CAV'
        };
        if (!singleInstanceTypes.contains(typeId)) return false;

        return existingDocs.any((d) =>
            d.hasFile &&
            d.status != PersonnelDocumentStatus.NOT_SUBMITTED &&
            d.documentTypeId == typeId);
      }

      // Placeholder for LETTER_OF_INTENT should NOT be flagged as active document conflict
      expect(hasActiveDoc('LETTER_OF_INTENT', null), isFalse);

      // Active file for PDS SHOULD be flagged as active document conflict
      expect(hasActiveDoc('PDS', null), isTrue);

      // Unrelated type without any file should NOT be flagged
      expect(hasActiveDoc('TOR', null), isFalse);
    });
  });
}

