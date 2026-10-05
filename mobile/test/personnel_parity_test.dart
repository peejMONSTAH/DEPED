import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:eminence_hris_mobile/models/user_model.dart';
import 'package:eminence_hris_mobile/services/requirement_files.dart';
import 'package:eminence_hris_mobile/utils/personnel_notice_route.dart';
import 'package:eminence_hris_mobile/screens/promotions/vacancies_screen.dart';
import 'package:eminence_hris_mobile/screens/applications/my_applications_screen.dart';
import 'applications_load_state_test.dart' show apiWith, json;

PlatformFile pdf(String name) => PlatformFile(
    name: name, size: 9, bytes: Uint8List.fromList('%PDF-demo'.codeUnits));
final user = UserModel(
    id: 1, email: 'demo@example.invalid', role: UserRole.TEACHING_PERSONNEL);
const cycle = {
  'id': 4,
  'name': 'Teacher III',
  'status': 'ACTIVE',
  'applicationsOpen': true,
  'isEligible': true,
  'type': 'NATURAL_VACANCY'
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  test(
      'multiple sources combine once in selection order; a single file passes unchanged',
      () async {
    var calls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(RequirementFiles.channel, (call) async {
      calls++;
      expect(call.method, 'combine');
      expect((call.arguments['files'] as List).length, 2);
      return Uint8List.fromList('%PDF-combined'.codeUnits);
    });
    final first = pdf('first.pdf');
    final single = await RequirementFiles.prepare([first], 'PDS');
    expect(single.bytes, first.bytes);
    expect(calls, 0);
    final combined =
        await RequirementFiles.prepare([first, pdf('second.pdf')], 'PDS & WES');
    expect(calls, 1);
    expect(combined.name, 'PDS-WES.pdf');
    expect(combined.mimeType, 'application/pdf');
  });

  test(
      'invalid files, oversized selection, and native failure do not produce an attachment',
      () async {
    await expectLater(
        RequirementFiles.prepare([], 'PDS'), throwsFormatException);
    await expectLater(
        RequirementFiles.prepare(
            [PlatformFile(name: 'fake.pdf', size: 5, bytes: Uint8List(5))],
            'PDS'),
        throwsFormatException);
    final bytes = Uint8List(RequirementFiles.limit + 1)
      ..setRange(0, 5, '%PDF-'.codeUnits);
    await expectLater(
        RequirementFiles.prepare(
            [PlatformFile(name: 'huge.pdf', size: bytes.length, bytes: bytes)],
            'PDS'),
        throwsFormatException);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            RequirementFiles.channel,
            (_) async => throw PlatformException(
                code: 'COMBINE_FAILED', message: 'Nothing was uploaded.'));
    await expectLater(
        RequirementFiles.prepare([pdf('a.pdf'), pdf('b.pdf')], 'PDS'),
        throwsException);
  });

  test(
      'notice destinations use linked IDs and server requirement focus, not misleading wording',
      () {
    final vacancy = personnelNoticeRoute({
      'relatedEntityType': 'PromotionCycle',
      'relatedEntityId': 4,
      'message': 'Promotion opened'
    });
    expect(vacancy.kind, PersonnelNoticeKind.vacancy);
    expect(vacancy.id, 4);
    final rating = personnelNoticeRoute({
      'relatedEntityType': 'PromotionCycle',
      'relatedEntityId': 4,
      'message': 'Your rating was finalized'
    });
    expect(rating.kind, PersonnelNoticeKind.application);
    expect(rating.cycleId, 4);
    final app = personnelNoticeRoute({
      'relatedEntityType': 'PromotionApplication',
      'relatedEntityId': 7,
      'message': 'Approved'
    });
    expect(app.kind, PersonnelNoticeKind.application);
    expect(app.id, 7);
    final tx = personnelNoticeRoute({
      'relatedEntityType': 'Transaction',
      'relatedEntityId': 8,
      'actionTarget': {
        'kind': 'own',
        'path': '/personnel/checklist?txId=8&requirement=12'
      }
    });
    expect(tx.id, 8);
    expect(tx.requirementId, 12);
    final doc = personnelNoticeRoute(
        {'relatedEntityType': 'PersonnelDocument', 'relatedEntityId': 9});
    expect(doc.kind, PersonnelNoticeKind.document);
    expect(doc.id, 9);
    final review = personnelNoticeRoute({
      'relatedEntityType': 'PromotionApplication',
      'relatedEntityId': 7,
      'actionTarget': {
        'kind': 'review',
        'path': '/admin/promotions?cycle=4&applicant=7'
      }
    });
    expect(review.kind, PersonnelNoticeKind.review);
    expect(personnelNoticeRoute({'message': 'Hello'}).kind,
        PersonnelNoticeKind.none);
  });

  test(
      'closed, ineligible, planned and already-applied vacancies cannot open Apply',
      () {
    for (final changed in [
      {'applicationsOpen': false},
      {'hasApplied': true},
      {'status': 'PLANNING'},
      {'isEligible': false},
      {'applicationsState': 'CLOSED'}
    ]) {
      expect(vacancyBlockReason({...cycle, ...changed}), isNotNull);
    }
    expect(vacancyBlockReason(cycle), isNull);
  });

  testWidgets(
      'viewing vacancy only opens readable details, never the checklist',
      (tester) async {
    final api = apiWith((o) {
      expect(o.method, 'GET');
      return json(200, {
        'data': [cycle]
      });
    });
    await tester.pumpWidget(
        MaterialApp(home: VacanciesScreen(user: user, cycleId: 4, api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Vacancy details'), findsOneWidget);
    expect(find.textContaining('Viewing this vacancy does not submit'),
        findsOneWidget);
    expect(find.text('Requirements'), findsNothing);
  });

  testWidgets(
      'vacancy details remain readable on a narrow screen with large text',
      (tester) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!),
        home: VacancyDetailsScreen(cycle: {
          ...cycle,
          'name': 'Administrative Officer II – Demonstration Elementary School'
        }, user: user)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('application notification shows only its exact application',
      (tester) async {
    final api = apiWith((o) => json(200, {
          'data': [
            {
              'id': 7,
              'cycle': {'id': 4, 'name': 'Linked position'},
              'items': []
            },
            {
              'id': 8,
              'cycle': {'id': 5, 'name': 'Other position'},
              'items': []
            },
          ]
        }));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body:
                MyApplicationsScreen(user: user, applicationId: 7, api: api))));
    await tester.pumpAndSettle();
    expect(find.text('Linked position'), findsOneWidget);
    expect(find.text('Other position'), findsNothing);
  });

  testWidgets(
      'both classifications remain visible when only Natural Vacancy has results',
      (tester) async {
    final api = apiWith((o) => json(200, {
          'data': [cycle]
        }));
    await tester
        .pumpWidget(MaterialApp(home: VacanciesScreen(user: user, api: api)));
    await tester.pumpAndSettle();
    expect(find.text('All classifications'), findsOneWidget);
    expect(find.text('Natural Vacancy'), findsOneWidget);
    expect(find.text('ECP'), findsOneWidget);
    await tester.tap(find.text('ECP'));
    await tester.pumpAndSettle();
    expect(find.text('Teacher III'), findsNothing);
    expect(
        find.text('No ECP items available to your account.'), findsOneWidget);
    await tester.tap(find.text('Natural Vacancy'));
    await tester.pumpAndSettle();
    expect(find.text('Teacher III'), findsNWidgets(2));
  });

  testWidgets('classification filters separate ECP and Natural Vacancy records',
      (tester) async {
    final api = apiWith((o) => json(200, {
          'data': [
            cycle,
            {...cycle, 'id': 5, 'name': 'ECP opportunity', 'type': 'ECP'}
          ]
        }));
    await tester
        .pumpWidget(MaterialApp(home: VacanciesScreen(user: user, api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ECP'));
    await tester.pumpAndSettle();
    expect(find.text('ECP opportunity'), findsNWidgets(2));
    expect(find.text('Teacher III'), findsNothing);
    await tester.tap(find.text('Natural Vacancy'));
    await tester.pumpAndSettle();
    expect(find.text('Teacher III'), findsNWidgets(2));
    expect(find.text('ECP opportunity'), findsNothing);
  });
}
