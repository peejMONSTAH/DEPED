import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/widgets/resume_splash.dart';
import 'package:eminence_hris_mobile/screens/auth/splash_screen.dart';

Future<void> pumpApp(WidgetTester tester, {String field = ''}) async {
  await tester.pumpWidget(MaterialApp(
    builder: (context, child) => ResumeSplash(child: child!),
    home: Scaffold(body: TextField(key: const Key('form'), controller: TextEditingController(text: field))),
  ));
}

void setLifecycle(WidgetTester tester, AppLifecycleState s) =>
    tester.binding.handleAppLifecycleStateChanged(s);

Future<void> goAway(WidgetTester tester, {Duration away = const Duration(seconds: 2)}) async {
  setLifecycle(tester, AppLifecycleState.inactive);
  setLifecycle(tester, AppLifecycleState.hidden);
  setLifecycle(tester, AppLifecycleState.paused);
  // Real clock: the away time is measured with DateTime.now().
  await tester.runAsync(() => Future<void>.delayed(away));
  setLifecycle(tester, AppLifecycleState.hidden);
  setLifecycle(tester, AppLifecycleState.inactive);
  setLifecycle(tester, AppLifecycleState.resumed);
  await tester.pump();
}

void main() {
  setUp(ResumeSplash.launchFinished);

  testWidgets('returning from the background shows the splash once, then the same screen', (tester) async {
    await pumpApp(tester, field: 'half-typed');
    await goAway(tester);
    expect(find.byType(SplashBrand), findsOneWidget);
    // A second resume while it plays does not stack another.
    setLifecycle(tester, AppLifecycleState.resumed);
    await tester.pump();
    expect(find.byType(SplashBrand), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1400));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(SplashBrand), findsNothing);
    expect(find.text('half-typed'), findsOneWidget, reason: 'screen and its state are kept');
  });

  testWidgets('the notification shade or a permission dialog (inactive only) does not replay it', (tester) async {
    await pumpApp(tester);
    setLifecycle(tester, AppLifecycleState.inactive);
    setLifecycle(tester, AppLifecycleState.resumed);
    await tester.pump();
    expect(find.byType(SplashBrand), findsNothing);
  });

  testWidgets('a file picker or camera trip does not replay it', (tester) async {
    await pumpApp(tester);
    await tester.runAsync(() => ExternalActivity.run(() async {
          for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused]) { setLifecycle(tester, s); }
          await Future<void>.delayed(const Duration(seconds: 2));
          for (final s in [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) { setLifecycle(tester, s); }
        }));
    await tester.pump();
    expect(find.byType(SplashBrand), findsNothing);
  });

  testWidgets('ordinary navigation and rebuilds do not replay it', (tester) async {
    await pumpApp(tester);
    await tester.pumpAndSettle();
    await pumpApp(tester, field: 'rebuilt');
    await tester.pump();
    expect(find.byType(SplashBrand), findsNothing);
  });

  testWidgets('the splash has no "E." mark', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SplashBrand(t: 1))));
    await tester.pump();
    expect(find.text('E'), findsNothing);
    // The division line was removed from the splash on request; the logo carries the identity.
    expect(find.text('City Schools Division of Koronadal'), findsNothing);
  });
}
