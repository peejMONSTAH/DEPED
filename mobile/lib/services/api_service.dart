import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class ApiService {
  static String baseUrl = AppConfig.defaultBaseUrl;

  late final Dio dio;
  final _storage = const FlutterSecureStorage();

  ApiService() {
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _setupInterceptors();
  }

  void _setupInterceptors() {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final accessToken = await _storage.read(key: AppConfig.keyAccessToken);
          if (accessToken != null && accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401 && error.requestOptions.path != '/auth/login') {
            final refreshed = await _tryRefreshToken();
            if (refreshed) {
              final opts = error.requestOptions;
              final accessToken = await _storage.read(key: AppConfig.keyAccessToken);
              opts.headers['Authorization'] = 'Bearer $accessToken';
              
              try {
                final response = await dio.fetch<dynamic>(opts);
                return handler.resolve(response);
              } catch (e) {
                return handler.next(error);
              }
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<bool> _tryRefreshToken() async {
    try {
      final refreshToken = await _storage.read(key: AppConfig.keyRefreshToken);
      if (refreshToken == null) return false;

      // A bare Dio instance on purpose: the interceptor above must not attach the
      // expired access token, or re-enter itself when this call is the one that 401s.
      final response = await Dio().post<dynamic>(
        '$baseUrl/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 && response.data != null && response.data['data'] != null) {
        final newAccessToken = response.data['data']['accessToken'] as String?;
        await _storage.write(key: AppConfig.keyAccessToken, value: newAccessToken);
        return true;
      }
    } on DioException catch (error) {
      // A rejected refresh token means the session is genuinely over. Clear it so the
      // app stops retrying with a credential the server has already refused.
      final status = error.response?.statusCode;
      if (status == 401 || status == 403) {
        await _storage.delete(key: AppConfig.keyAccessToken);
        await _storage.delete(key: AppConfig.keyRefreshToken);
      }
      debugPrint('Token refresh failed (${status ?? 'network'}): ${error.message}');
    } catch (error) {
      debugPrint('Token refresh failed unexpectedly: $error');
    }
    return false;
  }
}
