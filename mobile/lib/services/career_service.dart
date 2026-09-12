import 'package:dio/dio.dart';
import '../models/service_record_model.dart';
import 'api_service.dart';

class CareerService {
  final ApiService _apiService;

  CareerService(this._apiService);

  Future<List<ServiceRecordModel>> getServiceRecords() async {
    try {
      dynamic resData;
      try {
        final response = await _apiService.dio.get<dynamic>('/career/service-records');
        resData = response.data;
      } on DioException catch (e) {
        if (e.response?.statusCode == 404) {
          final fallbackRes = await _apiService.dio.get<dynamic>('/personnel/me/service-record');
          resData = fallbackRes.data;
        } else {
          rethrow;
        }
      }

      List<dynamic> list = [];
      if (resData != null) {
        if (resData['data'] is List) {
          list = resData['data'] as List<dynamic>;
        } else if (resData['data'] is Map && resData['data']['careerTimeline'] is List) {
          list = resData['data']['careerTimeline'] as List<dynamic>;
        }
      }

      return list.map((dynamic item) => ServiceRecordModel.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      return <ServiceRecordModel>[];
    }
  }

  double calculateYearsOfService(List<ServiceRecordModel> records, {String? dateHired}) {
    if (records.isNotEmpty) {
      DateTime? earliestStart;
      final DateTime now = DateTime.now();

      for (final record in records) {
        final DateTime? start = DateTime.tryParse(record.dateFrom);
        if (start != null) {
          if (earliestStart == null || start.isBefore(earliestStart)) {
            earliestStart = start;
          }
        }
      }

      if (earliestStart != null) {
        final days = now.difference(earliestStart).inDays;
        final yrs = days / 365.25;
        if (yrs > 0) return yrs;
      }
    }

    if (dateHired != null && dateHired.isNotEmpty) {
      final DateTime? hiredDate = DateTime.tryParse(dateHired);
      if (hiredDate != null) {
        final days = DateTime.now().difference(hiredDate).inDays;
        return (days > 0 ? days : 0) / 365.25;
      }
    }

    return 0.0;
  }
}
