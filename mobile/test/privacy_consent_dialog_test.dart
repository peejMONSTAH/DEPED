import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:eminence_hris_mobile/screens/auth/privacy_consent_dialog.dart';

void main() {
  testWidgets('Continue stays disabled until the unchecked box is ticked, then saves', (tester) async {
    var saved = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: Builder(builder: (context) => Center(
        child: ElevatedButton(
          onPressed: () => showDialog<bool>(
            context: context,
            barrierDismissible: false,
            builder: (_) => PrivacyConsentDialog(onAccept: () async { saved++; }),
          ),
          child: const Text('open'),
        ),
      ))),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    ElevatedButton button() => tester.widget<ElevatedButton>(find.byKey(const Key('privacy-continue')));
    expect(tester.widget<Checkbox>(find.byKey(const Key('privacy-checkbox'))).value, false);
    expect(button().onPressed, isNull);

    await tester.tap(find.byKey(const Key('privacy-checkbox')));
    await tester.pump();
    expect(button().onPressed, isNotNull);

    await tester.tap(find.byKey(const Key('privacy-continue')));
    await tester.pumpAndSettle();
    expect(saved, 1);
    expect(find.byType(PrivacyConsentDialog), findsNothing);
  });
}
