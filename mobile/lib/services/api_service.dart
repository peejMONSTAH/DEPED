import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class ApiService {
  static String baseUrl = AppConfig.defaultBaseUrl;

  /// Called once the server has refused the session outright: a revoked or
  /// expired refresh token, as after a password or role change. Everything
  /// cached under that session must go with it. Registered in main().
  static Future<void> Function()? onSessionEnded;

  late final Dio dio;
  final FlutterSecureStorage _storage;
  final Dio _refreshClient;
  static Future<bool>? _refreshing;

  ApiService({Dio? client, Dio? refreshClient, FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(),
        _refreshClient = refreshClient ?? Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        )) {
    dio = client ?? Dio(
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
          options.headers['X-App-Build'] = AppConfig.appBuild.toString();
          // Lets the server keep this device trusted across a password change.
          final deviceToken = await _storage.read(key: 'key_device_token');
          if (deviceToken != null && deviceToken.isNotEmpty) {
            options.headers['X-Device-Token'] = deviceToken;
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          final opts = error.requestOptions;
          final isAuthRequest = ['/auth/login', '/auth/refresh-token']
              .any((path) => opts.path.contains(path));
          if (error.response?.statusCode == 401 && !isAuthRequest && opts.extra['sessionRetried'] != true) {
            opts.extra['sessionRetried'] = true;
            final currentToken = await _storage.read(key: AppConfig.keyAccessToken);
            final alreadyRefreshed = currentToken != null &&
                opts.headers['Authorization'] != 'Bearer $currentToken';
            final refreshed = alreadyRefreshed || await _tryRefreshToken();
            if (refreshed) {
              final accessToken = await _storage.read(key: AppConfig.keyAccessToken);
              opts.headers['Authorization'] = 'Bearer $accessToken';
              // Dio finalizes multipart bodies during the first request.
              if (opts.data is FormData) opts.data = (opts.data as FormData).clone();
              if (opts.data is Stream) return handler.next(error);
              
              try {
                final response = await dio.fetch<dynamic>(opts);
                return handler.resolve(response);
              } on DioException catch (retryError) {
                return handler.next(retryError);
              }
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  Future<bool> _tryRefreshToken() {
    return _refreshing ??= _performRefresh().whenComplete(() { _refreshing = null; });
  }

  Future<bool> _performRefresh() async {
    String? refreshToken;
    try {
      refreshToken = await _storage.read(key: AppConfig.keyRefreshToken);
      if (refreshToken == null) return false;

      // A separate Dio instance on purpose: the interceptor above must not attach
      // the expired access token, or re-enter itself when this call is the one
      // that 401s.
      //
      // It must still carry timeouts. A bare Dio() has none, so a refresh that
      // stalled never returned and never threw: the caller awaited it forever
      // and the screen sat on its spinner with no error, indefinitely.
      final response = await _refreshClient.post<dynamic>(
        '$baseUrl/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 && response.data != null && response.data['data'] != null) {
        final newAccessToken = response.data['data']['accessToken'] as String?;
        if (newAccessToken == null || newAccessToken.isEmpty) return false;
        if (await _storage.read(key: AppConfig.keyRefreshToken) != refreshToken) return false;
        await _storage.write(key: AppConfig.keyAccessToken, value: newAccessToken);
        final rotatedToken = response.data['data']['refreshToken'] as String?;
        if (rotatedToken != null) await _storage.write(key: AppConfig.keyRefreshToken, value: rotatedToken);
        return true;
      }
    } on DioException catch (error) {
      // A rejected refresh token means the session is genuinely over. Clear it so the
      // app stops retrying with a credential the server has already refused.
      final status = error.response?.statusCode;
      if ((status == 401 || status == 403) && await _storage.read(key: AppConfig.keyRefreshToken) == refreshToken) {
        await _storage.delete(key: AppConfig.keyAccessToken);
        await _storage.delete(key: AppConfig.keyRefreshToken);
        await onSessionEnded?.call();
      }
      debugPrint('Token refresh failed (${status ?? 'network'}): ${error.message}');
    } catch (error) {
      debugPrint('Token refresh failed unexpectedly: $error');
    }
    return false;
  }
}
