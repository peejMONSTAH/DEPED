import 'package:dio/dio.dart';
import '../config/privacy_notice.dart';
import 'api_service.dart';

/// Whether this person has accepted the current Privacy Notice, and recording it.
class PrivacyService {
  final ApiService _apiService;
  PrivacyService(this._apiService);

  /// True when no prompt is needed. A failed check never locks anyone out of their records:
  /// only an explicit "not accepted" from the server asks for the notice.
  Future<bool> isAccepted() async {
    try {
      final response = await _apiService.dio.get<dynamic>('/auth/privacy-consent');
      final data = response.data;
      final accepted = data is Map ? (data['data'] is Map ? data['data']['accepted'] : null) : null;
      return accepted != false;
    } on DioException {
      return true;
    }
  }

  Future<void> accept() async {
    await _apiService.dio.post<dynamic>('/auth/privacy-consent', data: {'version': privacyNoticeVersion});
  }
}
