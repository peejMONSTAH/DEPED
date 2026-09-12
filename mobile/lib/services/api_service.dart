import 'package:dio/dio.dart';
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

      final response = await Dio().post<dynamic>(
        '$baseUrl/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 && response.data != null && response.data['data'] != null) {
        final newAccessToken = response.data['data']['accessToken'] as String?;
        await _storage.write(key: AppConfig.keyAccessToken, value: newAccessToken);
        return true;
      }
    } catch (_) {}
    return false;
  }
}
