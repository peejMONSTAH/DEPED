import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:eminence_hris_mobile/models/transaction_model.dart';
import 'package:eminence_hris_mobile/models/user_model.dart';
import 'package:eminence_hris_mobile/screens/applications/my_applications_screen.dart';
import 'package:eminence_hris_mobile/services/api_service.dart';

/// A failed request is not an empty list. The applications screen must say it could not load,
/// offer Retry, keep what was already loaded (marked as possibly out of date), and name the
/// part that is missing when only one of its two lists loaded.
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

ResponseBody json(int status, Object data) =>
    ResponseBody.fromString(jsonEncode(data), status, headers: {Headers.contentTypeHeader: ['application/json']});

ApiService apiWith(FutureOr<ResponseBody> Function(RequestOptions) respond) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/api/v1'))..httpClientAdapter = FakeServer(respond);
  return ApiService(client: dio, refreshClient: dio, storage: const FlutterSecureStorage());
}

Widget host(ApiService api) => MaterialApp(
      home: Scaffold(
        body: MyApplicationsScreen(user: UserModel(id: 1, email: 'a@b.invalid', role: UserRole.TEACHING_PERSONNEL), api: api),
      ),
    );

const application = {
  'id': 7, 'applicantNumber': 'APP-1', 'status': 'SUBMITTED', 'stageStatus': null, 'checker': 'HRMO', 'returnedCodes': [],
  'cycle': {'id': 3, 'name': 'Vacancy', 'targetPosition': 'Administrative Assistant II'}, 'items': [],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('a server failure shows an error and Retry, never "No applications yet"', (tester) async {
    final api = apiWith((o) => json(500, {'status': 'error', 'message': 'boom'}));
    await tester.pumpWidget(host(api));
    await tester.pumpAndSettle();
    expect(find.text('We could not load your applications'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining('No applications yet'), findsNothing);
  });

  testWidgets('Retry loads the list once the server answers', (tester) async {
    var fail = true;
    final api = apiWith((o) {
      if (o.path.contains('/promotions/my-applications')) return fail ? json(500, {'message': 'boom'}) : json(200, {'data': [application]});
      return json(200, {'data': [], 'pagination': {'totalPages': 1}});
    });
    await tester.pumpWidget(host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('We could not load your applications'), findsNothing);
    expect(find.text('Administrative Assistant II'), findsOneWidget);
    // The reviewer is named from the server: this applicant's requirements go to HRMO, not an AO II.
    expect(find.text('Submitted — awaiting HRMO'), findsOneWidget);
    expect(find.textContaining('AO II'), findsNothing);
  });

  testWidgets('a genuinely empty result says so, and says it loaded correctly', (tester) async {
    final api = apiWith((o) => o.path.contains('/promotions/my-applications')
        ? json(200, {'data': []})
        : json(200, {'data': [], 'pagination': {'totalPages': 1}}));
    await tester.pumpWidget(host(api));
    await tester.pumpAndSettle();
    expect(find.textContaining('No applications yet'), findsOneWidget);
    expect(find.textContaining('loaded correctly'), findsOneWidget);
    expect(find.text('We could not load your applications'), findsNothing);
  });

  testWidgets('only one list loading names the missing part and is not shown as empty', (tester) async {
    final api = apiWith((o) => o.path.contains('/promotions/my-applications')
        ? json(200, {'data': []})
        : json(500, {'message': 'boom'}));
    await tester.pumpWidget(host(api));
    await tester.pumpAndSettle();
    expect(find.textContaining('appointment requirements did not load'), findsOneWidget);
    expect(find.textContaining('No applications yet'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('a failed refresh keeps the loaded list and marks it out of date', (tester) async {
    var fail = false;
    final api = apiWith((o) {
      if (o.path.contains('/promotions/my-applications')) return fail ? json(500, {'message': 'boom'}) : json(200, {'data': [application]});
      return json(200, {'data': [], 'pagination': {'totalPages': 1}});
    });
    await tester.pumpWidget(host(api));
    await tester.pumpAndSettle();
    expect(find.text('Administrative Assistant II'), findsOneWidget);
    fail = true;
    await tester.drag(find.byType(ListView).first, const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Administrative Assistant II'), findsOneWidget, reason: 'the list already loaded is kept');
    expect(find.textContaining('May be out of date'), findsOneWidget);
  });

  test('a transaction carries who validates it and who did, from the server', () {
    final tx = TransactionModel.fromJson({
      'id': 5, 'status': 'FOR_APPROVAL', 'type': 'PROMOTION', 'complianceScore': 100,
      'review': {'validator': 'HRMO', 'validatedBy': {'role': 'HRMO', 'name': 'Helen Ramos'}, 'summary': 'Validated by HRMO Helen Ramos.'},
    });
    expect(tx.validator, 'HRMO');
    expect(tx.validatedBy, 'HRMO');
    expect(tx.reviewSummary, contains('Helen Ramos'));
    final teaching = TransactionModel.fromJson({'id': 6, 'status': 'PENDING_VALIDATION', 'type': 'PROMOTION', 'complianceScore': 0, 'review': {'validator': 'AO_II'}});
    expect(teaching.validator, 'AO II');
  });
}
