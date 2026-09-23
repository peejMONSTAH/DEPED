import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/auth/splash_screen.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // A session the server has ended takes its cached records with it.
  ApiService.onSessionEnded = AuthService.clearAccountCaches;

  // Every font the app uses is bundled under google_fonts/ and declared in
  // pubspec.yaml, so there is no reason to reach fonts.gstatic.com at runtime.
  // Leaving fetching on would mean a teacher on an offline or filtered division
  // network silently gets the default system font across the whole app, and
  // would put an outbound call to Google on every first launch.
  GoogleFonts.config.allowRuntimeFetching = false;

  // Edge-to-Edge System Overlay style to fill black gaps at top status bar and bottom navigation bar
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  runApp(const EminenceMobileApp());
}

class EminenceMobileApp extends StatelessWidget {
  const EminenceMobileApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Digital 201 Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      themeMode: ThemeMode.light,
      home: const SplashScreen(),
    );
  }
}
