import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/user_model.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/eminence_logo.dart';
import '../dashboard/home_dashboard_screen.dart';
import 'change_password_dialog.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _loadingRole;

  // Auth welcome transition overlay state
  bool _showWelcomeOverlay = false;
  UserModel? _welcomeUser;

  late final AuthService _authService;

  @override
  void initState() {
    super.initState();
    _authService = AuthService(ApiService());
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  void _handleLogin({String? overrideEmail, String? overridePass, String? roleTag}) async {
    final email = overrideEmail ?? _emailCtrl.text.trim();
    final pass = overridePass ?? _passCtrl.text.trim();

    if (overrideEmail == null && !_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _loadingRole = roleTag;
    });

    try {
      // Trim email string before login
      final cleanEmail = email.trim();
      final user = await _authService.login(cleanEmail, pass);

      if (!mounted) return;

      // Handle first login password change requirement
      if (user.isFirstLogin) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => ChangePasswordDialog(
            temporaryPassword: pass,
            onSubmit: (curr, newPass) async {
              await _authService.changePassword(curr, newPass);
              _triggerWelcomeOverlay(user);
            },
          ),
        );
      } else {
        _triggerWelcomeOverlay(user);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: const Color(0xFFF85149),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _loadingRole = null;
        });
      }
    }
  }

  void _triggerWelcomeOverlay(UserModel user) {
    setState(() {
      _welcomeUser = user;
      _showWelcomeOverlay = true;
    });

    // Auto complete overlay after 2 seconds
    Future.delayed(const Duration(milliseconds: 2000), () {
      if (mounted) {
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (_, a1, a2) => HomeDashboardScreen(user: user),
            transitionsBuilder: (_, a1, a2, child) => FadeTransition(opacity: a1, child: child),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      body: Stack(
        children: [
          // Background ambient light grid aura
          Positioned(
            top: -60,
            left: -60,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.primaryLight.withOpacity(0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isCompact = constraints.maxHeight < 720 || constraints.maxWidth < 360;
                final horizontalPadding = constraints.maxWidth < 400 ? 18.0 : 28.0;

                return SingleChildScrollView(
                  physics: const ClampingScrollPhysics(),
                  padding: EdgeInsets.symmetric(
                    horizontal: horizontalPadding,
                    vertical: isCompact ? 16.0 : 32.0,
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight - (isCompact ? 32.0 : 64.0),
                    ),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 440),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Official Partnership Badge
                            Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                                decoration: BoxDecoration(
                                  color: AppTheme.primaryLight.withOpacity(0.08),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: AppTheme.primaryLight.withOpacity(0.2)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(LucideIcons.shieldCheck, size: 16, color: AppTheme.primaryLight),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Official DepEd Region XII & NDMU HRIS',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w700,
                                        color: AppTheme.primaryLight,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            SizedBox(height: isCompact ? 16 : 22),

                            // Eminence Logo Hero Component
                            Center(
                              child: EminenceLogo(
                                variant: EminenceLogoVariant.wordmark,
                                size: isCompact ? EminenceLogoSize.md : EminenceLogoSize.lg,
                                showSubtitle: false,
                              ),
                            ),
                            const SizedBox(height: 8),

                            Text(
                              'City Schools Division of Koronadal City',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'Personnel Digital 201 Portal',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w500,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                            SizedBox(height: isCompact ? 20 : 28),

                            // Login Main Card (Light Container)
                            Container(
                              padding: EdgeInsets.all(isCompact ? 20.0 : 26.0),
                              decoration: BoxDecoration(
                                color: AppTheme.lightBgCard,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: AppTheme.lightBorder),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x0C000000),
                                    blurRadius: 20,
                                    offset: Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Form(
                                key: _formKey,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Personnel Sign In',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 22,
                                        fontWeight: FontWeight.w800,
                                        color: AppTheme.textPrimary,
                                        letterSpacing: -0.02,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'Enter your DepEd enterprise credentials to proceed.',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                        color: AppTheme.textSecondary,
                                        height: 1.4,
                                      ),
                                    ),
                                    const SizedBox(height: 22),

                                    // DepEd Email
                                    TextFormField(
                                      controller: _emailCtrl,
                                      keyboardType: TextInputType.emailAddress,
                                      style: GoogleFonts.inter(
                                        color: AppTheme.textPrimary,
                                        fontSize: 15.5,
                                        fontWeight: FontWeight.w500,
                                      ),
                                      decoration: const InputDecoration(
                                        labelText: 'DepEd Email Address',
                                        prefixIcon: Icon(LucideIcons.mail, size: 20, color: AppTheme.textMuted),
                                      ),
                                      validator: (val) {
                                        if (val == null || val.isEmpty) return 'Email is required';
                                        if (!val.contains('@')) return 'Enter a valid email address';
                                        return null;
                                      },
                                    ),
                                    const SizedBox(height: 18),

                                    // Password Input
                                    TextFormField(
                                      controller: _passCtrl,
                                      obscureText: _obscurePassword,
                                      style: GoogleFonts.inter(
                                        color: AppTheme.textPrimary,
                                        fontSize: 15.5,
                                        fontWeight: FontWeight.w500,
                                      ),
                                      decoration: InputDecoration(
                                        labelText: 'Password',
                                        prefixIcon: const Icon(LucideIcons.lock, size: 20, color: AppTheme.textMuted),
                                        suffixIcon: IconButton(
                                          icon: Icon(
                                            _obscurePassword ? LucideIcons.eyeOff : LucideIcons.eye,
                                            size: 20,
                                            color: AppTheme.textMuted,
                                          ),
                                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                                        ),
                                      ),
                                      validator: (val) => val == null || val.isEmpty ? 'Password is required' : null,
                                    ),
                                    const SizedBox(height: 24),

                                    // Submit Button
                                    SizedBox(
                                      width: double.infinity,
                                      child: ElevatedButton(
                                        onPressed: _isLoading ? null : () => _handleLogin(),
                                        style: ElevatedButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(vertical: 16),
                                          backgroundColor: AppTheme.brandDark,
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                          elevation: 0,
                                        ),
                                        child: _isLoading && _loadingRole == null
                                            ? const SizedBox(
                                                height: 22,
                                                width: 22,
                                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                              )
                                            : Text(
                                                'Sign In to 201 Portal',
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontSize: 16,
                                                  fontWeight: FontWeight.w800,
                                                  color: Colors.white,
                                                  letterSpacing: 0.1,
                                                ),
                                              ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                            SizedBox(height: isCompact ? 16 : 24),
                            Text(
                              'Protected by DepEd Enterprise Security · 201 File Automation',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Auth Welcome Overlay (Replicating Web AuthTransitionOverlay.tsx)
          if (_showWelcomeOverlay) _buildWelcomeOverlay(),
        ],
      ),
    );
  }

  Widget _buildWelcomeOverlay() {
    final fn = _welcomeUser?.firstName;
    final ln = _welcomeUser?.lastName;
    final initials = (fn != null && fn.isNotEmpty && ln != null && ln.isNotEmpty)
        ? '${fn[0]}${ln[0]}'.toUpperCase()
        : 'P';
    final roleName = _welcomeUser?.role == UserRole.TEACHING_PERSONNEL
        ? 'Teaching Personnel'
        : 'Non-Teaching Personnel';

    return Container(
      color: Colors.black.withOpacity(0.4),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Container(
            margin: const EdgeInsets.all(24),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: AppTheme.lightBgCard,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.4)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.12),
                  blurRadius: 30,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Avatar Circle
                Container(
                  width: 76,
                  height: 76,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFF10B981), Color(0xFF059669)],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      initials,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0xFF10B981).withOpacity(0.4)),
                  ),
                  child: Text(
                    roleName,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF059669),
                    ),
                  ),
                ),
                const SizedBox(height: 14),

                Text(
                  'Welcome back, ${_welcomeUser?.firstName}!',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Launching your DepEd 201 HRIS workspace...',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(fontSize: 13.5, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 24),

                const SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(color: Color(0xFF10B981), strokeWidth: 3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
