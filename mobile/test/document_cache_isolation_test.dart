import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:eminence_hris_mobile/services/personnel_document_service.dart';

/// The 201 document cache is one static list and one SharedPreferences key for
/// the whole device, not one per account. Signing out used to clear the tokens
/// and the transaction store but leave this behind, so the next teacher to sign
/// in on a shared phone was served the previous teacher's 201 file: the
/// filenames, types and dates of their birth certificate, NBI clearance and
/// medical certificate.
///
/// These tests pin the clearing. They are about who can see whose records, so
/// they assert the cache is empty rather than that the method merely runs.
void main() {
  const cacheKey = 'eminence_personnel_documents_cache';

  String documentsFor(String owner) => jsonEncode([
        {
          'id': 1,
          'personnelId': 8,
          'documentTypeId': 'BIRTH_CERT',
          'documentTypeName': 'Birth Certificate',
          'originalFileName': '$owner-psa-birth-certificate.pdf',
          'storedFileName': 'stored.pdf',
          'mimeType': 'application/pdf',
          'fileSize': 120000,
          'fileUrl': '/api/v1/personnel/documents/1/file',
          'issueDate': null,
          'expirationDate': null,
          'remarks': null,
          'status': 'SUBMITTED',
          'rejectionReason': null,
          'uploadedAt': '2026-09-01T00:00:00.000Z',
          'updatedAt': '2026-09-01T00:00:00.000Z',
          'reviewedAt': null,
          'reviewedBy': null,
        }
      ]);

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  test('signing out removes the cached 201 file from the device', () async {
    SharedPreferences.setMockInitialValues({cacheKey: documentsFor('blassy')});

    final before = await SharedPreferences.getInstance();
    expect(before.getString(cacheKey), isNotNull,
        reason: 'the fixture should start with a cached document');

    await PersonnelDocumentService.clearLocalStore();

    final after = await SharedPreferences.getInstance();
    expect(after.getString(cacheKey), isNull,
        reason: "the previous account's documents must not survive sign-out");
  });

  test('a second account on the same device inherits nothing', () async {
    // First teacher signs in and their documents are cached.
    SharedPreferences.setMockInitialValues({cacheKey: documentsFor('blassy')});
    await PersonnelDocumentService.clearLocalStore(); // sign-out

    // Second teacher signs in. clearLocalStore runs again on sign-in, so even a
    // sign-out that never completed cannot carry over.
    await PersonnelDocumentService.clearLocalStore();

    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(cacheKey);
    expect(cached, isNull);
    expect(cached ?? '', isNot(contains('blassy')),
        reason: 'no trace of the previous holder may remain');
  });

  test('clearing an already empty cache is harmless', () async {
    SharedPreferences.setMockInitialValues({});
    await PersonnelDocumentService.clearLocalStore();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(cacheKey), isNull);
  });
}
