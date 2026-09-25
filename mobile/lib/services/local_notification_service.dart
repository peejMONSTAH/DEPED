import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Shows Digital 201 notifications in the phone's notification shade, with the
/// default sound and vibration, while the app is running (open or in the
/// background). Only notifications newer than the ones already known when the
/// app started are shown, so opening the app never replays old ones.
class LocalNotificationService {
  LocalNotificationService._();
  static final LocalNotificationService instance = LocalNotificationService._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  int? _lastShownId;

  static const _channel = AndroidNotificationDetails(
    'digital201_updates',
    'Digital 201 updates',
    channelDescription: 'Application status, returned documents and approvals',
    importance: Importance.high,
    priority: Priority.high,
    playSound: true,
    enableVibration: true,
    icon: '@mipmap/ic_launcher',
  );

  Future<void> init() async {
    if (_ready || kIsWeb) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
      );
      // Android 13+ asks the user once; earlier versions allow by default.
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      _ready = true;
    } catch (e) {
      debugPrint('[Notifications] init failed: $e');
    }
  }

  /// Records the newest notification already on the server so that only later
  /// ones ring. Call with the latest id after the first load.
  void markSeen(int? latestId) {
    if (latestId == null) return;
    if (_lastShownId == null || latestId > _lastShownId!) _lastShownId = latestId;
  }

  /// Shows each notification newer than the last one shown, oldest first.
  Future<void> showNew(List<Map<String, dynamic>> unread) async {
    if (!_ready) return;
    final fresh = unread
        .where((n) => n['id'] is int && (_lastShownId == null || (n['id'] as int) > _lastShownId!))
        .toList()
      ..sort((a, b) => (a['id'] as int).compareTo(b['id'] as int));
    for (final n in fresh) {
      final message = (n['message'] ?? '').toString();
      final colon = message.indexOf(':');
      final title = colon > 0 && colon < 60 ? message.substring(0, colon) : 'Digital 201';
      final body = colon > 0 && colon < 60 ? message.substring(colon + 1).trim() : message;
      try {
        await _plugin.show(
          id: n['id'] as int,
          title: title,
          body: body,
          notificationDetails: const NotificationDetails(
            android: _channel,
            iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true, presentBadge: true),
          ),
        );
      } catch (e) {
        debugPrint('[Notifications] show failed: $e');
      }
      _lastShownId = n['id'] as int;
    }
  }
}
