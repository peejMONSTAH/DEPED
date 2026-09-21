import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/transaction_model.dart';
import 'api_service.dart';

class TransactionService {
  final ApiService _apiService;
  static final List<TransactionModel> _localStore = [];
  static const String _prefKey = 'eminence_persisted_transactions';

  TransactionService(this._apiService);
  String? syncError;
  DateTime? lastSyncedAt;
  bool isOffline = false;

  Future<TransactionModel> getTransaction(int id) async {
    final response = await _apiService.dio.get<dynamic>('/transactions/$id');
    final tx = TransactionModel.fromJson(Map<String, dynamic>.from(response.data['data']));
    saveLocalTransaction(tx);
    return tx;
  }

  static Future<void> clearLocalStore() async {
    _localStore.clear();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefKey);
    } catch (_) {}
  }

  Future<void> _loadFromDiskIfEmpty() async {
    if (_localStore.isNotEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? jsonStr = prefs.getString(_prefKey);
      if (jsonStr != null && jsonStr.isNotEmpty) {
        final List<dynamic> list = jsonDecode(jsonStr) as List<dynamic>;
        _localStore.clear();
        _localStore.addAll(list.map(
            (item) => TransactionModel.fromJson(item as Map<String, dynamic>)));
      }
    } catch (_) {}
  }

  Future<void> _saveToDisk() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = jsonEncode(_localStore.map((t) => t.toJson()).toList());
      await prefs.setString(_prefKey, jsonStr);
    } catch (_) {}
  }

  Future<List<TransactionModel>> getMyTransactions() async {
    syncError = null;
    isOffline = false;
    try {
      final response =
          await _apiService.dio.get<dynamic>('/transactions/my-transactions');
      final List<dynamic> list =
          (response.data != null && response.data['data'] is List)
              ? (response.data['data'] as List<dynamic>)
              : <dynamic>[];
      final remoteList = list
          .map((dynamic item) =>
              TransactionModel.fromJson(item as Map<String, dynamic>))
          .toList();

      _localStore.clear();
      _localStore.addAll(remoteList);
      await _saveToDisk();
      lastSyncedAt = DateTime.now();
      return remoteList;
    } on DioException catch (error) {
      if (error.response != null) {
        syncError = 'Unable to refresh transactions. Sign in again if your session expired.';
        rethrow;
      }
      isOffline = true;
      syncError = 'Offline: displaying previously synchronized transactions. Reconnect before making changes.';
      await _loadFromDiskIfEmpty();
      return List<TransactionModel>.from(_localStore);
    }
  }

  void saveLocalTransaction(TransactionModel tx) {
    final index = _localStore.indexWhere((t) =>
        t.id == tx.id ||
        (t.referenceNo == tx.referenceNo && t.referenceNo != 'TRX-000'));
    if (index >= 0) {
      _localStore[index] = tx;
    } else {
      _localStore.insert(0, tx);
    }
    _saveToDisk();
  }

  Future<Map<String, dynamic>> checkPromotionStatus() async {
    try {
      final response =
          await _apiService.dio.get<dynamic>('/promotions/my-promotion-status');
      if (response.data != null &&
          response.data['data'] is Map<String, dynamic>) {
        return response.data['data'] as Map<String, dynamic>;
      }
    } catch (_) {}
    return {
      'isPromoted': false,
      'promotionDetails': null,
      'message': 'You are ineligible yet.',
    };
  }

  Future<TransactionModel> initiateTransaction(TransactionType type) async {
    throw UnsupportedError(
      'Personnel cannot initiate transactions. Hiring and promotion transactions are assigned automatically by the AO/HRMO workflow.',
    );
  }

  Future<void> uploadDocument(
      int transactionId, int requirementId, String filePath) async {
    try {
      final formData = FormData.fromMap({
        'requirementId': requirementId,
        'file': await MultipartFile.fromFile(filePath),
      });

      await _apiService.dio.post<dynamic>(
        '/transactions/$transactionId/upload',
        data: formData,
      );
    } on DioException catch (e) {
      final message =
          (e.response?.data is Map && e.response?.data['message'] != null)
              ? e.response?.data['message'].toString()
              : 'Failed to upload document.';
      throw Exception(message);
    }
  }

  Future<int> submitTransaction(int transactionId,
      {TransactionType? type}) async {
    if (transactionId <= 0) {
      throw StateError(
        'This is not an assigned transaction. Wait for the AO or HRMO to assign your hiring or promotion transaction.',
      );
    }

    try {
      await _apiService.dio
          .post<dynamic>('/transactions/$transactionId/submit');
      return transactionId;
    } on DioException catch (e) {
      final message =
          (e.response?.data is Map && e.response?.data['message'] != null)
              ? e.response?.data['message'].toString()
              : 'Cannot submit transaction. Ensure compliance score is 100%.';
      throw Exception(message);
    }
  }
}
