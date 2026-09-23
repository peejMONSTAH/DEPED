import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:eminence_hris_mobile/config/app_config.dart';
import 'package:eminence_hris_mobile/models/transaction_model.dart';
import 'package:eminence_hris_mobile/services/api_service.dart';
import 'package:eminence_hris_mobile/services/auth_service.dart';
import 'package:eminence_hris_mobile/services/transaction_service.dart';

/// The server decides whose records an account may see. The device must never
/// undercut that: a record the server refuses is dropped rather than served from
/// cache, and nothing cached under one account or session survives into the next.
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
Dio client(FutureOr<ResponseBody> Function(RequestOptions) respond) =>
    Dio(BaseOptions(baseUrl: 'https://example.invalid/api/v1'))..httpClientAdapter = FakeServer(respond);

const transactionsKey = 'eminence_persisted_transactions';
const documentsKey = 'eminence_personnel_documents_cache';

TransactionModel cachedTransaction(int id, String owner) => TransactionModel.fromJson({
      'id': id,
      'status': 'PENDING_VALIDATION',
      'remarks': 'Submitted by $owner',
      'transactionType': {'name': 'Promotion', 'requirementTemplates': []},
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({AppConfig.keyAccessToken: 'access', AppConfig.keyRefreshToken: 'refresh'});
    SharedPreferences.setMockInitialValues({});
    await AuthService.clearAccountCaches();
    ApiService.onSessionEnded = null;
  });

  for (final status in [403, 404]) {
    test('a transaction the server refuses ($status) is dropped from the device, not served from it', () async {
      final service = TransactionService(ApiService(client: client((_) => reply(status, {'message': 'Transaction not found.'}))));
      service.saveLocalTransaction(cachedTransaction(102, 'Villanueva'));
      await Future<void>.delayed(Duration.zero);

      await expectLater(service.getTransaction(102), throwsA(isA<TransactionUnavailableException>()));

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(transactionsKey) ?? '', isNot(contains('Villanueva')),
          reason: 'the refused record must not remain on the device');
    });
  }

  test('an answered but refused list request never falls back to cached records', () async {
    final service = TransactionService(ApiService(client: client((_) => reply(403, {'message': 'Forbidden'}))));
    service.saveLocalTransaction(cachedTransaction(7, 'a previous session'));

    await expectLater(service.getMyTransactions(), throwsA(isA<DioException>()));
    expect(service.isOffline, isFalse, reason: 'only a missing network may show cached records');
  });

  test('a session the server ends takes every cached record with it', () async {
    SharedPreferences.setMockInitialValues({
      transactionsKey: jsonEncode([cachedTransaction(102, 'Villanueva').toJson()]),
      documentsKey: jsonEncode([{'id': 1, 'originalFileName': 'villanueva-tor.pdf'}]),
    });
    ApiService.onSessionEnded = AuthService.clearAccountCaches;
    final api = ApiService(client: client((_) => reply(401)), refreshClient: client((_) => reply(401)));

    await expectLater(api.dio.get<dynamic>('/transactions/my-transactions'), throwsA(isA<DioException>()));

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(transactionsKey), isNull);
    expect(prefs.getString(documentsKey), isNull);
    expect(await const FlutterSecureStorage().read(key: AppConfig.keyRefreshToken), isNull);
  });

  test('a temporary refresh failure does not discard the account\'s own cache', () async {
    SharedPreferences.setMockInitialValues({transactionsKey: jsonEncode([cachedTransaction(5, 'this account').toJson()])});
    var ended = false;
    ApiService.onSessionEnded = () async { ended = true; };
    final api = ApiService(client: client((_) => reply(401)), refreshClient: client((_) => reply(503)));

    await expectLater(api.dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));
    expect(ended, isFalse);
    expect((await SharedPreferences.getInstance()).getString(transactionsKey), isNotNull);
  });

  test('changing accounts on a shared device leaves nothing from the previous one', () async {
    SharedPreferences.setMockInitialValues({
      transactionsKey: jsonEncode([cachedTransaction(102, 'Villanueva').toJson()]),
      documentsKey: jsonEncode([{'id': 1, 'originalFileName': 'villanueva-tor.pdf'}]),
    });

    await AuthService.clearAccountCaches();

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(transactionsKey), isNull);
    expect(prefs.getString(documentsKey), isNull);
    // With the network down, the next account is shown nothing rather than the previous one's records.
    final offline = TransactionService(ApiService(client: client((o) => throw DioException.connectionError(
          requestOptions: o, reason: 'offline'))));
    expect(await offline.getMyTransactions(), isEmpty);
  });
}
