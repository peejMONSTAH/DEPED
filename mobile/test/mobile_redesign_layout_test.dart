import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:eminence_hris_mobile/theme/app_theme.dart';
import 'package:eminence_hris_mobile/theme/tokens.dart';
import 'package:eminence_hris_mobile/widgets/personnel_navigation.dart';
import 'package:eminence_hris_mobile/widgets/ui_kit.dart';
import 'package:eminence_hris_mobile/models/personnel_profile_model.dart';
import 'package:eminence_hris_mobile/screens/profile/profile_screen.dart';
import 'package:eminence_hris_mobile/screens/auth/login_screen.dart';
import 'package:eminence_hris_mobile/screens/auth/verify_device_dialog.dart';
import 'package:eminence_hris_mobile/services/auth_service.dart';
import 'package:eminence_hris_mobile/services/api_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  setUpAll(() async {
    final icons = FontLoader('packages/lucide_icons_flutter/Lucide');
    icons.addFont(
        rootBundle.load('packages/lucide_icons_flutter/assets/lucide.ttf'));
    await icons.load();
  });
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });
  final profile = PersonnelProfileModel(
    id: 1,
    employeeId: 'DEMO-001',
    firstName: 'Rosa',
    lastName: 'Delacruz',
    positionTitle: 'Administrative Officer II',
    plantillaItemNo: 'DEMO-ITEM',
    stationName: 'Demonstration Elementary School, District 1',
    personnelType: 'NON_TEACHING_PERSONNEL',
    email: 'rosa.delacruz@demo.test',
    mobileNo: 'Not recorded',
  );
  for (final width in [320.0, 390.0, 768.0]) {
    for (final scale in [1.0, 1.8]) {
      testWidgets('Profile and navigation fit width $width scale $scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var selected = -1;
        await tester.pumpWidget(MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: Scaffold(
              body: ProfileScreen(profile: profile, onRefresh: () {}),
              bottomNavigationBar: PersonnelNavigation(
                  index: 1, onChanged: (index) => selected = index)),
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final nav = tester.getRect(find.byType(PersonnelNavigation));
        final scroll = tester.getRect(find.byType(SingleChildScrollView).first);
        expect(scroll.bottom, lessThanOrEqualTo(nav.top));
        if (width == 390 && scale == 1) {
          await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/profile-redesign.png'));
        }
        await tester.tap(find.text('Applications'));
        expect(selected, 5);
        await tester.drag(
            find.byType(SingleChildScrollView).first, const Offset(0, -650));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('Sign-in golden and keyboard layout', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
        MaterialApp(theme: AppTheme.lightTheme, home: const LoginScreen()));
    await tester.runAsync(() async {
      final context = tester.element(find.byType(LoginScreen));
      await precacheImage(
          const AssetImage('assets/images/digital201-header-lockup.png'),
          context);
    });
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await expectLater(find.byType(LoginScreen),
        matchesGoldenFile('goldens/sign-in-redesign.png'));
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Sign in to Digital 201'));
    expect(tester.takeException(), isNull);
  });
  testWidgets('Verification fits a narrow screen with keyboard and large text', (tester) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(MaterialApp(theme: AppTheme.lightTheme,
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(
        textScaler: TextScaler.linear(1.8)), child: child!),
      home: Scaffold(body: VerifyDeviceDialog(authService: AuthService(ApiService()),
        challenge: DeviceVerificationRequired(challengeToken: 'synthetic-test-only',
          maskedEmail: 'r••••••••••••••••••••@demo.test', resendAfterSeconds: 60))),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Verify and sign in'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('Personnel hero and status headings remain readable',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: ListView(padding: const EdgeInsets.all(20), children: [
            const PersonnelHero(
                name: 'Rosa Delacruz',
                initials: 'RD',
                role: 'Teaching personnel',
                position: 'Teacher III',
                station: 'Demonstration Elementary School, District 1'),
            const SizedBox(height: 24),
            const AppCard(
                child: SectionHeading(
                    title: 'Your 201 files',
                    trailing: StatusPill(
                        label: '8 need attention',
                        tone: AppStatusTone.pending))),
            const SizedBox(height: 16),
            const AppCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Personal Data Sheet',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  SizedBox(height: 12),
                  StatusPill(label: 'Uploaded', tone: AppStatusTone.success),
                  SizedBox(height: 12),
                  Text(
                      'Review the file before attaching it to an application.'),
                ])),
          ]),
          bottomNavigationBar: PersonnelNavigation(index: 0, onChanged: (_) {}),
        )));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await expectLater(find.byType(Scaffold),
        matchesGoldenFile('goldens/workspace-redesign.png'));
  });
}
