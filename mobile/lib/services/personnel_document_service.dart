import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/personnel_document_model.dart';
import '../models/promotion_checklist_model.dart';
import 'api_service.dart';

class PersonnelDocumentService {
  final ApiService _apiService;
  static final List<PersonnelDocument> _localCache = [];
  static const String _prefKey = 'eminence_personnel_documents_cache';

  PersonnelDocumentService(this._apiService);

  /// Discards every cached document for the account that is signing out.
  ///
  /// The cache is one static list and one SharedPreferences key for the whole
  /// device, so without this the next person to sign in on a shared phone is
  /// served the previous person's 201 file. Called on both sign-in and
  /// sign-out: clearing on sign-in as well means a logout that never completed
  /// - a crash, a killed app - still cannot leak into the next session.
  static Future<void> clearLocalStore() async {
    _localCache.clear();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefKey);
    } catch (_) {}
  }

  /// Clears in-memory cache forcing a fresh network fetch on next request.
  static void invalidateCache() {
    _localCache.clear();
  }

  /// Fetches the stored file itself, so a document can be previewed rather than
  /// only described.
  ///
  /// The endpoint checks ownership and role, so the request must carry the
  /// session — that is why this goes through the authenticated client instead
  /// of handing a bare URL to Image.network.
  Future<Uint8List> getDocumentBytes(int documentId) async {
    final response = await _apiService.dio.get<List<int>>(
      '/personnel/documents/$documentId/file',
      options: Options(responseType: ResponseType.bytes),
    );
    final data = response.data;
    if (data == null || data.isEmpty) {
      throw Exception('This document is empty or could not be retrieved.');
    }
    return Uint8List.fromList(data);
  }

  Future<void> _loadFromDiskIfEmpty() async {
    if (_localCache.isNotEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString(_prefKey);
      if (jsonStr != null && jsonStr.isNotEmpty) {
        final List<dynamic> list = jsonDecode(jsonStr) as List<dynamic>;
        _localCache.clear();
        _localCache.addAll(list.map((item) => PersonnelDocument.fromJson(item as Map<String, dynamic>)));
      }
    } catch (_) {}

  }

  Future<void> _saveToDisk() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = jsonEncode(_localCache.map((d) => d.toJson()).toList());
      await prefs.setString(_prefKey, jsonStr);
    } catch (_) {}
  }

  /// Retrieves list of configurable document types
  Future<List<DocumentTypeConfig>> getDocumentTypes() async {
    try {
      final response = await _apiService.dio.get<dynamic>('/personnel/documents/document-types');
      if (response.data != null && response.data['data'] is List) {
        final list = response.data['data'] as List<dynamic>;
        return list.map((item) => DocumentTypeConfig.fromJson(item as Map<String, dynamic>)).toList();
      }
    } catch (e) {
      debugPrint('[PersonnelDocumentService] Failed to load remote document types: $e');
    }
    return DocumentTypeConfig.defaultTypes;
  }

  /// Retrieves the Annex C checklist (DepEd Order No. 007, s. 2023).
  ///
  /// Served by the backend so a DepEd revision reaches every client without an
  /// app release. Falls back to the bundled copy when the device is offline.
  Future<List<PromotionChecklistItem>> getAnnexCRequirements() async {
    try {
      final response = await _apiService.dio.get<dynamic>('/promotions/annex-c-requirements');
      if (response.data != null && response.data['data'] is List) {
        final list = response.data['data'] as List<dynamic>;
        final items = list
            .map((item) => PromotionChecklistItem.fromJson(item as Map<String, dynamic>))
            .toList();
        if (items.isNotEmpty) return items;
      }
    } catch (e) {
      debugPrint('[PersonnelDocumentService] Failed to load Annex C requirements: $e');
    }
    return PromotionChecklistItem.defaultAnnexCRequirements();
  }

  /// Retrieves uploaded documents for the current personnel
  Future<List<PersonnelDocument>> getDocuments({bool forceRefresh = false}) async {
    if (!forceRefresh && _localCache.isNotEmpty) {
      return List<PersonnelDocument>.from(_localCache);
    }

    try {
      final response = await _apiService.dio.get<dynamic>('/personnel/documents');
      if (response.data != null && response.data['data'] is List) {
        final list = response.data['data'] as List<dynamic>;
        final remote = list.map((item) => PersonnelDocument.fromJson(item as Map<String, dynamic>)).toList();
        _localCache.clear();
        _localCache.addAll(remote);
        await _saveToDisk();
        return remote;
      }
    } catch (e) {
      debugPrint('[PersonnelDocumentService] Remote fetch failed, using local cache: $e');
    }

    await _loadFromDiskIfEmpty();
    return List<PersonnelDocument>.from(_localCache);
  }

  /// Uploads a new personnel document with upload progress
  Future<PersonnelDocument> uploadDocument({
    required AcquiredDocument document,
    required String documentTypeId,
    String? customDocumentName,
    String? issueDate,
    String? expirationDate,
    String? remarks,
    int? replacesDocumentId,
    void Function(double progress)? onProgress,
  }) async {
    MultipartFile multipartFile;
    if (kIsWeb || document.bytes != null) {
      multipartFile = MultipartFile.fromBytes(
        document.bytes!,
        filename: document.name,
        contentType: DioMediaType.parse(document.mimeType),
      );
    } else if (document.path != null) {
      multipartFile = await MultipartFile.fromFile(
        document.path!,
        filename: document.name,
        contentType: DioMediaType.parse(document.mimeType),
      );
    } else {
      throw Exception('No valid document binary data or path available.');
    }

    final formData = FormData.fromMap({
      'file': multipartFile,
      'documentTypeId': documentTypeId,
      if (customDocumentName != null && customDocumentName.isNotEmpty) 'customDocumentName': customDocumentName,
      if (issueDate != null) 'issueDate': issueDate,
      if (expirationDate != null) 'expirationDate': expirationDate,
      if (remarks != null && remarks.isNotEmpty) 'remarks': remarks,
      if (replacesDocumentId != null) 'replacesDocumentId': replacesDocumentId,
    });

    try {
      final response = await _apiService.dio.post<dynamic>(
        '/personnel/documents',
        data: formData,
        onSendProgress: (sent, total) {
          if (total > 0 && onProgress != null) {
            onProgress(sent / total);
          }
        },
      );

      final data = response.data?['data'];
      if (data != null && data is Map<String, dynamic>) {
        final newDoc = PersonnelDocument.fromJson(data);
        _localCache.removeWhere((d) => d.id == newDoc.id);
        _localCache.insert(0, newDoc);
        await _saveToDisk();
        return newDoc;
      }
    } catch (e) {
      rethrow;
    }
    throw StateError('The server did not confirm the upload.');
  }

  /// Replaces an existing personnel document
  Future<PersonnelDocument> replaceDocument({
    required int documentId,
    AcquiredDocument? document,
    String? documentTypeId,
    String? customDocumentName,
    String? issueDate,
    String? expirationDate,
    String? remarks,
    void Function(double progress)? onProgress,
  }) async {
    MultipartFile? multipartFile;
    if (document != null) {
      if (kIsWeb || document.bytes != null) {
        multipartFile = MultipartFile.fromBytes(document.bytes!, filename: document.name, contentType: DioMediaType.parse(document.mimeType));
      } else if (document.path != null) {
        multipartFile = await MultipartFile.fromFile(document.path!, filename: document.name, contentType: DioMediaType.parse(document.mimeType));
      }
    }

    final formData = FormData.fromMap({
      if (multipartFile != null) 'file': multipartFile,
      if (documentTypeId != null) 'documentTypeId': documentTypeId,
      if (customDocumentName != null) 'customDocumentName': customDocumentName,
      if (issueDate != null) 'issueDate': issueDate,
      if (expirationDate != null) 'expirationDate': expirationDate,
      if (remarks != null) 'remarks': remarks,
    });

    try {
      final response = await _apiService.dio.put<dynamic>(
        '/personnel/documents/$documentId',
        data: formData,
        onSendProgress: (sent, total) {
          if (total > 0 && onProgress != null) {
            onProgress(sent / total);
          }
        },
      );

      final data = response.data?['data'];
      if (data != null && data is Map<String, dynamic>) {
        final updated = PersonnelDocument.fromJson(data);
        final idx = _localCache.indexWhere((d) => d.id == documentId);
        if (idx >= 0) _localCache[idx] = updated;
        await _saveToDisk();
        return updated;
      }
    } catch (e) {
      rethrow;
    }
    throw StateError('The server did not confirm the replacement.');
  }

  /// Deletes a personnel document
  Future<void> deleteDocument(int documentId) async {
    // Let the failure propagate: the cache must not drop a document the server
    // still holds, and the caller reports the outcome.
    await _apiService.dio.delete<dynamic>('/personnel/documents/$documentId');

    _localCache.removeWhere((d) => d.id == documentId);
    await _saveToDisk();
  }
}
