import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/eminence_logo.dart';
import '../dashboard/home_dashboard_screen.dart';
import 'login_screen.dart';

/// A short, quiet brand moment: the mark settles in, the wordmark rises,
/// a hairline draws underneath, then the app opens. No fake loading steps.
class SplashScreen extends StatefulWidget {
  const SplashScreen({Key? key}) : super(key: key);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  late final Animation<double> _mark =
      CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.45, curve: Curves.easeOutCubic));
  late final Animation<double> _word =
      CurvedAnimation(parent: _c, curve: const Interval(0.25, 0.7, curve: Curves.easeOutCubic));
  late final Animation<double> _line =
      CurvedAnimation(parent: _c, curve: const Interval(0.55, 1.0, curve: Curves.easeInOutCubic));

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    // The session check runs while the animation plays; whichever is slower
    // decides when the app opens.
    final userFuture = AuthService(ApiService()).getCurrentUser();
    await _c.forward();
    final user = await userFuture;
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) =>
            user != null ? HomeDashboardScreen(user: user) : const LoginScreen(),
        transitionsBuilder: (_, animation, __, child) =>
            FadeTransition(opacity: animation, child: child),
        transitionDuration: const Duration(milliseconds: 400),
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
      body: Center(
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Opacity(
                opacity: _mark.value,
                child: Transform.scale(
                  scale: 0.85 + 0.15 * _mark.value,
                  child: const EminenceLogo(
                    variant: EminenceLogoVariant.mark,
                    size: EminenceLogoSize.xl,
                  ),
                ),
              ),
              const SizedBox(height: AppSpace.xl),
              Opacity(
                opacity: _word.value,
                child: Transform.translate(
                  offset: Offset(0, 12 * (1 - _word.value)),
                  child: const EminenceLogo(
                    variant: EminenceLogoVariant.full,
                    size: EminenceLogoSize.lg,
                    showSubtitle: false,
                  ),
                ),
              ),
              const SizedBox(height: AppSpace.lg),
              SizedBox(
                width: 120,
                height: 2,
                child: Align(
                  alignment: Alignment.center,
                  child: FractionallySizedBox(
                    widthFactor: _line.value,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.primaryLight,
                        borderRadius: AppRadius.pillAll,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpace.lg),
              Opacity(
                opacity: _line.value,
                child: Text('City Schools Division of Koronadal',
                    style: AppText.caption),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
