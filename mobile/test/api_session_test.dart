import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/config/app_config.dart';
import 'package:eminence_hris_mobile/services/api_service.dart';

class FakeServer implements HttpClientAdapter {
  final FutureOr<ResponseBody> Function(RequestOptions) respond;
  FakeServer(this.respond);
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (requestStream != null) await requestStream.drain<void>();
    return respond(options);
  }
  @override
  void close({bool force = false}) {}
}

ResponseBody reply(int status, [Object data = const {}]) => ResponseBody.fromString(
  jsonEncode(data), status, headers: {Headers.contentTypeHeader: ['application/json']},
);
Dio client(FutureOr<ResponseBody> Function(RequestOptions) respond) => Dio(BaseOptions(baseUrl: 'https://example.invalid/api/v1'))..httpClientAdapter = FakeServer(respond);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const storage = FlutterSecureStorage();
  setUp(() { FlutterSecureStorage.setMockInitialValues({AppConfig.keyAccessToken: 'expired', AppConfig.keyRefreshToken: 'refresh'}); });

  test('concurrent expired calls share one refresh and retry with the new token', () async {
    var refreshes = 0;
    final server = client((o) => reply(o.headers['Authorization'] == 'Bearer fresh' ? 200 : 401));
    final refresh = client((o) async {
      refreshes++;
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return reply(200, {'data': {'accessToken': 'fresh'}});
    });
    final api = ApiService(client: server, refreshClient: refresh);
    final results = await Future.wait([api.dio.get<dynamic>('/one'), api.dio.get<dynamic>('/two'), api.dio.get<dynamic>('/three')]);
    expect(refreshes, 1); expect(results.every((r) => r.statusCode == 200), true);
  });

  test('persistent 401 stops after one retry', () async {
    var requests = 0; var refreshes = 0;
    final api = ApiService(client: client((o) { requests++; return reply(401); }), refreshClient: client((o) { refreshes++; return reply(200, {'data': {'accessToken': 'fresh'}}); }));
    await expectLater(api.dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));
    expect(requests, 2); expect(refreshes, 1);
  });

  test('invalid login does not trigger refresh', () async {
    var refreshes = 0;
    final api = ApiService(client: client((o) => reply(401)), refreshClient: client((o) { refreshes++; return reply(500); }));
    await expectLater(api.dio.post<dynamic>('/auth/login'), throwsA(isA<DioException>()));
    expect(refreshes, 0);
  });

  test('temporary refresh failure retains credentials for recovery', () async {
    final api = ApiService(client: client((o) => reply(401)), refreshClient: client((o) => reply(503)));
    await expectLater(api.dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));
    expect(await storage.read(key: AppConfig.keyRefreshToken), 'refresh');
  });

  test('logout during refresh cannot restore the session', () async {
    final api = ApiService(client: client((o) => reply(401)), refreshClient: client((o) async {
      await storage.deleteAll(); return reply(200, {'data': {'accessToken': 'fresh'}});
    }));
    await expectLater(api.dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));
    expect(await storage.read(key: AppConfig.keyAccessToken), isNull);
  });

  test('an expired multipart upload is cloned before retry', () async {
    var requests = 0;
    final api = ApiService(client: client((o) { requests++; return reply(o.headers['Authorization'] == 'Bearer fresh' ? 201 : 401); }), refreshClient: client((o) => reply(200, {'data': {'accessToken': 'fresh'}})));
    final response = await api.dio.post<dynamic>('/transactions/1/upload', data: FormData.fromMap({'file': MultipartFile.fromBytes([1,2,3],filename:'test.pdf')}));
    expect(response.statusCode, 201); expect(requests, 2);
  });
}
