import 'package:dio/dio.dart';
import '../models/personnel_profile_model.dart';
import 'api_service.dart';

class ProfileService {
  final ApiService _apiService;

  ProfileService(this._apiService);

  Future<PersonnelProfileModel> getProfile() async {
    try {
      dynamic resData;
      try {
        final response = await _apiService.dio.get<dynamic>('/personnel/profile');
        resData = response.data;
      } on DioException catch (e) {
        if (e.response?.statusCode == 404) {
          final fallbackRes = await _apiService.dio.get<dynamic>('/personnel/me');
          resData = fallbackRes.data;
        } else {
          rethrow;
        }
      }

      final Map<String, dynamic> data = (resData != null && resData['data'] is Map<String, dynamic>)
          ? (resData['data'] as Map<String, dynamic>)
          : <String, dynamic>{};
      return PersonnelProfileModel.fromJson(data);
    } on DioException catch (e) {
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Failed to fetch personnel profile.';
      throw Exception(message);
    }
  }

  Future<void> updateProfile(Map<String, dynamic> profileData) async {
    try {
      await _apiService.dio.put<dynamic>('/personnel/profile', data: profileData);
    } on DioException catch (e) {
      final message = (e.response?.data is Map && e.response?.data['message'] != null)
          ? e.response?.data['message'].toString()
          : 'Failed to update profile.';
      throw Exception(message);
    }
  }
}
