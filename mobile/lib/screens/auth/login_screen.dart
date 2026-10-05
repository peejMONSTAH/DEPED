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
import 'verify_device_dialog.dart';

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

  void _handleLogin(
      {String? overrideEmail, String? overridePass, String? roleTag}) async {
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
      UserModel user;
      try {
        user = await _authService.login(cleanEmail, pass);
      } on DeviceVerificationRequired catch (challenge) {
        // A new phone: finish with the code emailed to the account.
        if (!mounted) return;
        setState(() => _isLoading = false);
        final verified = await showDialog<UserModel>(
          context: context,
          barrierDismissible: false,
          builder: (_) => VerifyDeviceDialog(
              authService: _authService, challenge: challenge),
        );
        if (verified == null) return;
        user = verified;
      }

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
            transitionsBuilder: (_, a1, a2, child) =>
                FadeTransition(opacity: a1, child: child),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightBg,
      body: Stack(children: [
        SafeArea(child: LayoutBuilder(builder: (context, constraints) {
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
            child: Center(
                child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Align(
                        alignment: Alignment.centerLeft,
                        child: EminenceLogo(
                            variant: EminenceLogoVariant.wordmark,
                            size: EminenceLogoSize.md,
                            showSubtitle: false)),
                    const SizedBox(height: 36),
                    Text('Your records.\nYour next step.',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 32,
                            height: 1.12,
                            letterSpacing: -1.2,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.brandDark)),
                    const SizedBox(height: 12),
                    Text(
                        'The personnel workspace for the City Schools Division of Koronadal.',
                        style: GoogleFonts.inter(
                            fontSize: 14,
                            height: 1.5,
                            color: AppTheme.textSecondary)),
                    const SizedBox(height: 28),
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24)),
                      child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('Sign in',
                                  style: GoogleFonts.plusJakartaSans(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                      color: AppTheme.brandDark)),
                              const SizedBox(height: 6),
                              const Text(
                                  'Use the account issued by your school or HR office.',
                                  style: TextStyle(
                                      fontSize: 13,
                                      height: 1.5,
                                      color: AppTheme.textSecondary)),
                              const SizedBox(height: 24),
                              TextFormField(
                                controller: _emailCtrl,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autofillHints: const [AutofillHints.username],
                                decoration: const InputDecoration(
                                    labelText: 'Email address',
                                    prefixIcon:
                                        Icon(LucideIcons.mail, size: 20)),
                                validator: (value) =>
                                    value == null || value.isEmpty
                                        ? 'Email is required'
                                        : !value.contains('@')
                                            ? 'Enter a valid email address'
                                            : null,
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                controller: _passCtrl,
                                obscureText: _obscurePassword,
                                autofillHints: const [AutofillHints.password],
                                onFieldSubmitted: (_) {
                                  if (!_isLoading) _handleLogin();
                                },
                                decoration: InputDecoration(
                                    labelText: 'Password',
                                    prefixIcon:
                                        const Icon(LucideIcons.lock, size: 20),
                                    suffixIcon: IconButton(
                                        tooltip: _obscurePassword
                                            ? 'Show password'
                                            : 'Hide password',
                                        onPressed: () => setState(() =>
                                            _obscurePassword =
                                                !_obscurePassword),
                                        icon: Icon(
                                            _obscurePassword
                                                ? LucideIcons.eyeOff
                                                : LucideIcons.eye,
                                            size: 20))),
                                validator: (value) =>
                                    value == null || value.isEmpty
                                        ? 'Password is required'
                                        : null,
                              ),
                              const SizedBox(height: 24),
                              ElevatedButton(
                                onPressed:
                                    _isLoading ? null : () => _handleLogin(),
                                child: _isLoading && _loadingRole == null
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : const Text('Sign in to Digital 201'),
                              ),
                            ],
                          )),
                    ),
                    const SizedBox(height: 24),
                    const Row(children: [
                      Icon(LucideIcons.folderOpen,
                          size: 18, color: AppTheme.primaryLight),
                      SizedBox(width: 10),
                      Expanded(
                          child: Text(
                              'Records, requirements and application updates.',
                              style: TextStyle(
                                  fontSize: 12,
                                  height: 1.4,
                                  color: AppTheme.textSecondary))),
                    ]),
                    const SizedBox(height: 12),
                    Container(
                        height: 3,
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                            widthFactor: 0.18,
                            child: Container(color: AppTheme.accentLime))),
                  ]),
            )),
          );
        })),
        if (_showWelcomeOverlay) _buildWelcomeOverlay(),
      ]),
    );
  }

  Widget _buildWelcomeOverlay() {
    final fn = _welcomeUser?.firstName;
    final ln = _welcomeUser?.lastName;
    final initials =
        (fn != null && fn.isNotEmpty && ln != null && ln.isNotEmpty)
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
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.emeraldGreen.withOpacity(0.4)),
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
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: const Color(0xFF10B981).withOpacity(0.4)),
                  ),
                  child: Text(
                    roleName,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
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
                  style: GoogleFonts.inter(
                      fontSize: 13, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 24),

                const SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                      color: Color(0xFF10B981), strokeWidth: 3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
