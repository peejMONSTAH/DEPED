import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/eminence_logo.dart';
import '../dashboard/home_dashboard_screen.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({Key? key}) : super(key: key);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnim;
  late Animation<double> _fadeAnim;
  late Animation<double> _progressAnim;

  int _stepIndex = 1;
  Timer? _timer;

  final List<String> _steps = [
    'Verifying DepEd HRIS security tokens',
    'Initializing SSL/TLS encrypted session',
    'Loading 201 personnel workspace permissions',
  ];

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );

    _scaleAnim = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack),
    );

    _fadeAnim = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.4, curve: Curves.easeIn),
    );

    _progressAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.2, 0.95, curve: Curves.easeInOut),
      ),
    );

    _controller.forward();

    // Step checklist progression timers
    Timer(const Duration(milliseconds: 800), () {
      if (mounted) setState(() => _stepIndex = 2);
    });

    Timer(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _stepIndex = 3);
    });

    // Navigation timer
    _timer = Timer(const Duration(milliseconds: 2800), () async {
      if (!mounted) return;
      final authService = AuthService(ApiService());
      final currentUser = await authService.getCurrentUser();

      if (!mounted) return;

      final Widget nextScreen = currentUser != null
          ? HomeDashboardScreen(user: currentUser)
          : const LoginScreen();

      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          pageBuilder: (_, animation, secondaryAnimation) => nextScreen,
          transitionsBuilder: (_, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
          transitionDuration: const Duration(milliseconds: 600),
        ),
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      body: Stack(
        children: [
          // Ambient Radial Light Aura (Top center glow)
          Positioned(
            top: -100,
            left: MediaQuery.of(context).size.width * 0.5 - 150,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.accentLime.withOpacity(0.12),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.7],
                ),
              ),
            ),
          ),

          // Bottom right subtle lavender glow
          Positioned(
            bottom: -80,
            right: -80,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.accentLavender.withOpacity(0.1),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.7],
                ),
              ),
            ),
          ),

          // Main Center Content
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Spacer(),

                    // Animated Eminence Logo Hero
                    AnimatedBuilder(
                      animation: _controller,
                      builder: (context, child) {
                        return Transform.scale(
                          scale: _scaleAnim.value,
                          child: Opacity(
                            opacity: _fadeAnim.value,
                            child: child,
                          ),
                        );
                      },
                      child: Column(
                        children: [
                          // Icon / Mark Badge
                          Container(
                            width: 100,
                            height: 100,
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.darkBgCard,
                              border: Border.all(color: AppTheme.accentLime.withOpacity(0.4), width: 2),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.accentLime.withOpacity(0.25),
                                  blurRadius: 28,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                            child: const Center(
                              child: EminenceLogo(
                                variant: EminenceLogoVariant.mark,
                                size: EminenceLogoSize.md,
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Full Logo Text
                          const EminenceLogo(
                            variant: EminenceLogoVariant.full,
                            size: EminenceLogoSize.xl,
                          ),
                          const SizedBox(height: 12),

                          Text(
                            'City Schools Division of Koronadal City',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: const Color(0xFF8B949E),
                              letterSpacing: 0.5,
                            ),
                          ),
                          Text(
                            'Department of Education · Region XII',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: const Color(0xFF6E7681),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    // Progress Section Card
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppTheme.darkBgCard,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppTheme.darkBorder),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.4),
                            blurRadius: 20,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Initializing System...',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                              AnimatedBuilder(
                                animation: _progressAnim,
                                builder: (ctx, _) {
                                  final pct = (_progressAnim.value * 100).toInt();
                                  return Text(
                                    '$pct%',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.primaryLight,
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),

                          // Animated Gradient Progress Bar
                          AnimatedBuilder(
                            animation: _progressAnim,
                            builder: (ctx, _) {
                              return ClipRRect(
                                borderRadius: BorderRadius.circular(999),
                                child: Container(
                                  height: 6,
                                  width: double.infinity,
                                  color: AppTheme.darkSurface,
                                  child: Align(
                                    alignment: Alignment.centerLeft,
                                    child: FractionallySizedBox(
                                      widthFactor: _progressAnim.value,
                                      child: Container(
                                        decoration: const BoxDecoration(
                                          gradient: LinearGradient(
                                            colors: [AppTheme.accentLime, AppTheme.accentLavender],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 16),

                          // Step Checklist Items
                          ...List.generate(_steps.length, (idx) {
                            final stepNum = idx + 1;
                            final isDone = _stepIndex >= stepNum;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6.0),
                              child: Row(
                                children: [
                                  AnimatedContainer(
                                    duration: const Duration(milliseconds: 300),
                                    width: 16,
                                    height: 16,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isDone ? const Color(0xFF10B981).withOpacity(0.2) : Colors.transparent,
                                      border: Border.all(
                                        color: isDone ? const Color(0xFF10B981) : AppTheme.darkBorder,
                                      ),
                                    ),
                                    child: isDone
                                        ? const Icon(Icons.check, size: 10, color: Color(0xFF10B981))
                                        : null,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      _steps[idx],
                                      style: GoogleFonts.inter(
                                        fontSize: 11,
                                        fontWeight: isDone ? FontWeight.w600 : FontWeight.w400,
                                        color: isDone ? Colors.white : const Color(0xFF6E7681),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),
                    Text(
                      'Eminence HRIS v1.0 · Protected by DepEd Data Privacy',
                      style: GoogleFonts.inter(fontSize: 10, color: const Color(0xFF6E7681)),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
