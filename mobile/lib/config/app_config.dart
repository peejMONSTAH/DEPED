import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  static const String appName = 'Eminence HRIS';
  static const String appVersion = '1.0.0';

  // Dynamic Base API resolution:
  // - Android Emulator requires 10.0.2.2 to connect to host PC backend at port 5000
  // - Web / Desktop / iOS Simulator uses localhost
  static String get defaultBaseUrl {
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
