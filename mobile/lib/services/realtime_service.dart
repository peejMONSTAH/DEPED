import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';
import 'api_service.dart';

class RealtimeService {
  final ApiService _apiService;
  final _storage = const FlutterSecureStorage();

  Timer? _pollingTimer;
  StreamSubscription? _sseSubscription;

  final StreamController<void> _transactionUpdateController = StreamController<void>.broadcast();
  final StreamController<Map<String, dynamic>> _notificationController = StreamController<Map<String, dynamic>>.broadcast();

  Stream<void> get onTransactionUpdate => _transactionUpdateController.stream;
  Stream<Map<String, dynamic>> get onNotificationReceived => _notificationController.stream;

  int _lastNotificationCount = -1;

  RealtimeService(this._apiService);

  void startListening({int intervalSeconds = 4}) {
    stopListening();

    // Start background stream polling
    _pollingTimer = Timer.periodic(Duration(seconds: intervalSeconds), (_) {
      _pollForUpdates();
    });

    // Execute immediate initial check
    _pollForUpdates();
    _startSSEStream();
  }

  Future<void> _startSSEStream() async {
    try {
      final token = await _storage.read(key: AppConfig.keyAccessToken);
      if (token == null || token.isEmpty) return;

      final url = '${ApiService.baseUrl}/notifications/stream';
      final dio = Dio();
      
      final response = await dio.get<ResponseBody>(
        url,
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'text/event-stream',
          },
          responseType: ResponseType.stream,
        ),
      );

      _sseSubscription = response.data?.stream
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
        (String line) {
          if (line.startsWith('data: ')) {
            try {
              final jsonStr = line.substring(6).trim();
              final data = jsonDecode(jsonStr) as Map<String, dynamic>;
              if (data['type'] == 'NOTIFICATION' || data['type'] == 'CONNECTED') {
                _transactionUpdateController.add(null);
                _notificationController.add(data);
              }
            } catch (_) {}
          }
        },
        onError: (_) {},
        cancelOnError: false,
      );
    } catch (_) {}
  }

  Future<void> _pollForUpdates() async {
    try {
      // Check unread notifications count
      final res = await _apiService.dio.get<dynamic>('/notifications?status=unread');
      if (res.data != null && res.data['data'] is List) {
        final currentCount = (res.data['data'] as List).length;
        if (_lastNotificationCount != -1 && currentCount != _lastNotificationCount) {
          _transactionUpdateController.add(null);
          if (currentCount > _lastNotificationCount && (res.data['data'] as List).isNotEmpty) {
            final newest = (res.data['data'] as List).first as Map<String, dynamic>;
            _notificationController.add(newest);
          }
        }
        _lastNotificationCount = currentCount;
      }
    } catch (_) {}
  }

  void stopListening() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
    _sseSubscription?.cancel();
    _sseSubscription = null;
  }

  void dispose() {
    stopListening();
    _transactionUpdateController.close();
    _notificationController.close();
  }
}
