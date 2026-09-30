import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/resume_splash.dart';
import '../dashboard/home_dashboard_screen.dart';
import 'login_screen.dart';

/// The brand moment shown on every launch and, briefly, when the app returns
/// from the background: the Digital 201 logo rises in, a hairline draws
/// underneath. [t] runs 0 → 1.
class SplashBrand extends StatelessWidget {
  const SplashBrand({super.key, required this.t});

  final double t;

  double _seg(double a, double b) =>
      Curves.easeOutCubic.transform(((t - a) / (b - a)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final word = _seg(0.0, 0.55);
    final line = _seg(0.35, 1.0);
    return ColoredBox(
      color: AppTheme.lightBg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Opacity(
              opacity: word,
              child: Transform.translate(
                offset: Offset(0, 12 * (1 - word)),
                child: Image.asset(
                  'assets/images/digital201-header-lockup.png',
                  width: 280,
                  filterQuality: FilterQuality.high,
                  semanticLabel: 'Digital 201',
                ),
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            SizedBox(
              width: 120,
              height: 2,
              child: Center(
                child: FractionallySizedBox(
                  widthFactor: line,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppTheme.primaryLight,
                      borderRadius: AppRadius.pillAll,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// First screen on every fresh launch. The saved session is restored while the
/// animation plays; then the app opens on the dashboard or the sign-in screen.
class SplashScreen extends StatefulWidget {
  const SplashScreen({Key? key}) : super(key: key);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  );
  bool _left = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    // Never hang on the splash: a slow or failing session check falls back to
    // the sign-in screen, which works offline and explains itself.
    final userFuture = AuthService(ApiService())
        .getCurrentUser()
        .timeout(const Duration(seconds: 8))
        .catchError((Object _) => null);
    await _c.forward();
    final user = await userFuture;
    if (!mounted || _left) return;
    _left = true;
    ResumeSplash.launchFinished();
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) =>
            user != null ? HomeDashboardScreen(user: user) : const LoginScreen(),
        transitionsBuilder: (_, animation, __, child) =>
            FadeTransition(opacity: animation, child: child),
        transitionDuration: const Duration(milliseconds: 350),
      ),
    );
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      body: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => SplashBrand(t: _c.value),
      ),
    );
  }
}
