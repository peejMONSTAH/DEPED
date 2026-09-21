import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode;

class AppConfig {
  static const String appName = 'Digital 201';
  static const String appVersion = '1.0.0';

  // Dynamic Base API resolution:
  // - Android Emulator requires 10.0.2.2 to connect to host PC backend at port 5000
  // - Web / Desktop / iOS Simulator uses localhost
  static String get defaultBaseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) {
      if (kReleaseMode && !fromEnv.startsWith('https://')) {
        throw StateError('API_BASE_URL must use HTTPS in a release build (got: $fromEnv).');
      }
      return fromEnv;
    }
    // The loopback defaults below only reach the developer's own machine. A release
    // build has no such host, so fail at startup rather than ship an unreachable app.
    if (kReleaseMode) {
      throw StateError(
        'API_BASE_URL was not provided at build time. '
        'Build with --dart-define=API_BASE_URL=https://your-api-host/api/v1',
      );
    }
    if (kIsWeb) {
      return 'http://localhost:5000/api/v1';
    } else if (Platform.isAndroid) {
      return 'http://10.0.2.2:5000/api/v1';
    } else {
      return 'http://localhost:5000/api/v1';
    }
  }

  // Storage Keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserData = 'user_data';
  static const String keyBaseUrl = 'custom_base_url';
}
