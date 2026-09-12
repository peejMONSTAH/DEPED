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
        _localStore.addAll(list.map((item) => TransactionModel.fromJson(item as Map<String, dynamic>)));
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
    try {
      final response = await _apiService.dio.get<dynamic>('/transactions/my-transactions');
      final List<dynamic> list = (response.data != null && response.data['data'] is List)
          ? (response.data['data'] as List<dynamic>)
          : <dynamic>[];
      final remoteList = list.map((dynamic item) => TransactionModel.fromJson(item as Map<String, dynamic>)).toList();

      _localStore.clear();
      _localStore.addAll(remoteList);
      await _saveToDisk();
      return remoteList;
    } on DioException catch (_) {
      await _loadFromDiskIfEmpty();
      return List<TransactionModel>.from(_localStore);
    } catch (_) {
      await _loadFromDiskIfEmpty();
      return List<TransactionModel>.from(_localStore);
    }
  }

  void saveLocalTransaction(TransactionModel tx) {
    final index = _localStore.indexWhere((t) => t.id == tx.id || (t.referenceNo == tx.referenceNo && t.referenceNo != 'TRX-000'));
    if (index >= 0) {
      _localStore[index] = tx;
    } else {
      _localStore.insert(0, tx);
    }
    _saveToDisk();
  }

  Future<Map<String, dynamic>> checkPromotionStatus() async {
    try {
      final response = await _apiService.dio.get<dynamic>('/promotions/my-promotion-status');
      if (response.data != null && response.data['data'] is Map<String, dynamic>) {
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
    try {
      final response = await _apiService.dio.post<dynamic>(
        '/transactions',
        data: {'type': type.name, 'transactionType': type.name},
      );
      final Map<String, dynamic> data = (response.data != null && response.data['data'] is Map<String, dynamic>)
          ? (response.data['data'] as Map<String, dynamic>)
          : <String, dynamic>{};
      final tx = TransactionModel.fromJson(data);
      saveLocalTransaction(tx);
      return tx;
    } on DioException catch (e) {
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Failed to initiate transaction.';
      throw Exception(message);
    }
  }

  Future<void> uploadDocument(int transactionId, int requirementId, String filePath) async {
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
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Failed to upload document.';
      throw Exception(message);
    }
  }

  Future<int> submitTransaction(int transactionId, {TransactionType? type}) async {
    try {
      int realId = transactionId;
      if (transactionId > 1000000) {
        final initRes = await _apiService.dio.post<dynamic>(
          '/transactions',
          data: {'type': (type ?? TransactionType.PROMOTION).name, 'transactionType': (type ?? TransactionType.PROMOTION).name},
        );
        if (initRes.data != null && initRes.data['data'] != null && initRes.data['data']['id'] != null) {
          realId = initRes.data['data']['id'] as int;
        }
      }

      try {
        await _apiService.dio.post<dynamic>('/transactions/$realId/submit');
      } on DioException catch (e) {
        if (e.response?.statusCode == 404) {
          final initRes = await _apiService.dio.post<dynamic>(
            '/transactions',
            data: {'type': (type ?? TransactionType.PROMOTION).name, 'transactionType': (type ?? TransactionType.PROMOTION).name},
          );
          if (initRes.data != null && initRes.data['data'] != null && initRes.data['data']['id'] != null) {
            realId = initRes.data['data']['id'] as int;
            await _apiService.dio.post<dynamic>('/transactions/$realId/submit');
          }
        } else {
          rethrow;
        }
      }
      return realId;
    } on DioException catch (e) {
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Cannot submit transaction. Ensure compliance score is 100%.';
      throw Exception(message);
    }
  }
}
