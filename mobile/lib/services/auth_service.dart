import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'transaction_service.dart';

class AuthService {
  final ApiService _apiService;
  final _storage = const FlutterSecureStorage();

  AuthService(this._apiService);

  Future<UserModel> login(String email, String password) async {
    try {
      // Clear previous local transaction store before saving new user session
      await TransactionService.clearLocalStore();

      final response = await _apiService.dio.post<dynamic>(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );

      final data = response.data['data'] as Map<String, dynamic>;
      final String accessToken = data['accessToken'] as String;
      final String refreshToken = data['refreshToken'] as String;
      final userJson = data['user'] as Map<String, dynamic>;

      // Save tokens & user session securely
      await _storage.write(key: AppConfig.keyAccessToken, value: accessToken);
      await _storage.write(key: AppConfig.keyRefreshToken, value: refreshToken);
      await _storage.write(key: 'key_saved_user', value: jsonEncode(userJson));

      final user = UserModel.fromJson(userJson);

      // Whether the password must be replaced is the server's answer. The old
      // check looked for a 'Temp@' prefix no issued password ever had, and for an
      // isFirstLogin field the API never sent, so it never once fired. The API now
      // refuses every route but change-password while this is set.
      final rawMustChange = userJson['mustChangePassword'] ?? userJson['isFirstLogin'];
      final bool requiresChange = rawMustChange is bool ? rawMustChange : rawMustChange == true;
      
      return UserModel(
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        personnelId: user.personnelId,
        isFirstLogin: requiresChange,
      );
    } on DioException catch (e) {
      String message = 'Login failed. Please check your credentials.';
      final resData = e.response?.data;
      if (resData is Map && resData['message'] != null) {
        message = resData['message'].toString();
      } else if (e.type == DioExceptionType.connectionTimeout || 
                 e.type == DioExceptionType.connectionError ||
                 e.type == DioExceptionType.receiveTimeout) {
        message = 'Cannot connect to backend server (${ApiService.baseUrl}). Please ensure backend server is running.';
      }
      throw Exception(message);
    }
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    try {
      await _apiService.dio.post<dynamic>(
        '/auth/change-password',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );
    } on DioException catch (e) {
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Failed to update password.';
      throw Exception(message);
    }
  }

  Future<UserModel?> getCurrentUser() async {
    try {
      final token = await _storage.read(key: AppConfig.keyAccessToken);
      if (token == null || token.isEmpty) return null;

      final userStr = await _storage.read(key: 'key_saved_user');
      if (userStr != null && userStr.isNotEmpty) {
        final Map<String, dynamic> userJson = jsonDecode(userStr);
        return UserModel.fromJson(userJson);
      }
    } catch (_) {}
    return null;
  }

  Future<void> logout() async {
    try {
      final refreshToken = await _storage.read(key: AppConfig.keyRefreshToken);
      if (refreshToken != null) {
        await _apiService.dio.post<dynamic>('/auth/logout', data: {'refreshToken': refreshToken});
      }
    } catch (_) {} finally {
      await _storage.deleteAll();
      await TransactionService.clearLocalStore();
    }
  }
}
