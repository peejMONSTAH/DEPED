import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../models/personnel_profile_model.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/profile_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/errors.dart';
import '../auth/login_screen.dart';

/// What personnel may change on their own profile, mirroring the website:
/// fill a required detail the AO II/HRMO left blank (once, then it locks),
/// edit contact details, and change the password. Everything else on the
/// official record is maintained by AO II/HRMO.

bool _blank(String? v) => v == null || v.trim().isEmpty;
final _mobilePattern = RegExp(r'^(09\d{9}|\+639\d{9})$');

class _Missing {
  final String key;
  final String label;
  final List<String>? options;
  final bool isDate;
  const _Missing(this.key, this.label, {this.options, this.isDate = false});
}

List<_Missing> _missingDetails(PersonnelProfileModel p) => [
      if (_blank(p.birthDate)) const _Missing('birthDate', 'Date of birth', isDate: true),
      if (_blank(p.gender)) const _Missing('gender', 'Sex', options: ['MALE', 'FEMALE']),
      if (_blank(p.civilStatus))
        const _Missing('civilStatus', 'Civil status', options: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED']),
      if (_blank(p.positionTitle)) const _Missing('designation', 'Position'),
      if (_blank(p.dateHired)) const _Missing('dateHired', 'Date of first appointment', isDate: true),
    ];

String _nice(String v) => v.isEmpty ? v : v[0] + v.substring(1).toLowerCase();

class ProfileActions extends StatelessWidget {
  final PersonnelProfileModel profile;
  final VoidCallback onSaved;
  const ProfileActions({Key? key, required this.profile, required this.onSaved}) : super(key: key);

  void _snack(BuildContext context, String msg, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFFDC2626) : AppTheme.brandDark,
        behavior: SnackBarBehavior.floating,
      ));
  }

  Future<void> _openSheet(BuildContext context, Widget child) => showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        backgroundColor: AppTheme.lightBgCard,
        builder: (ctx) => Padding(
          padding: EdgeInsets.fromLTRB(18, 0, 18, 18 + MediaQuery.viewInsetsOf(ctx).bottom),
          child: SingleChildScrollView(child: child),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final missing = _missingDetails(profile);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (missing.isNotEmpty) ...[
          _Card(
            tint: const Color(0xFFFFF6E5),
            border: const Color(0xFFE9C46A),
            icon: LucideIcons.triangleAlert,
            title: 'Complete your record',
            body: 'These were left blank when your account was made: '
                '${missing.map((m) => m.label.toLowerCase()).join(', ')}. Fill them in once; they lock after saving.',
            action: 'Fill in details',
            onTap: () => _openSheet(context, _MissingForm(missing: missing, onDone: (ok, msg) {
              _snack(context, msg, error: !ok);
              if (ok) onSaved();
            })),
          ),
          const SizedBox(height: 12),
        ],
        _Card(
          icon: LucideIcons.phone,
          title: 'Contact details',
          body: '${profile.mobileNo ?? 'No contact number'}\n${profile.address ?? 'No address'}',
          action: 'Edit',
          onTap: () => _openSheet(context, _ContactForm(profile: profile, onDone: (ok, msg) {
            _snack(context, msg, error: !ok);
            if (ok) onSaved();
          })),
        ),
        const SizedBox(height: 12),
        _Card(
          icon: LucideIcons.keyRound,
          title: 'Password',
          body: 'Change the password you use to sign in. You will be signed out afterwards.',
          action: 'Change password',
          onTap: () => _openSheet(context, _PasswordForm(onChanged: () async {
            await AuthService(ApiService()).logout();
            if (!context.mounted) return;
            Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
              (_) => false,
            );
          }, onError: (msg) => _snack(context, msg, error: true))),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final String action;
  final VoidCallback onTap;
  final Color? tint;
  final Color? border;
  const _Card({required this.icon, required this.title, required this.body, required this.action,
      required this.onTap, this.tint, this.border});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: tint ?? AppTheme.lightBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border ?? AppTheme.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 18, color: AppTheme.brandDark),
            const SizedBox(width: 8),
            Expanded(
              child: Text(title,
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textPrimary)),
            ),
          ]),
          const SizedBox(height: 6),
          Text(body, style: GoogleFonts.inter(fontSize: 13, height: 1.45, color: AppTheme.textSecondary)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: onTap,
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
              child: Text(action),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _sheetTitle(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text(text, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 17)),
    );

class _MissingForm extends StatefulWidget {
  final List<_Missing> missing;
  final void Function(bool ok, String message) onDone;
  const _MissingForm({required this.missing, required this.onDone});
  @override
  State<_MissingForm> createState() => _MissingFormState();
}

class _MissingFormState extends State<_MissingForm> {
  final Map<String, String> _values = {};
  bool _saving = false;

  Future<void> _pickDate(String key) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 30),
      firstDate: DateTime(1940),
      lastDate: now,
    );
    if (picked != null) {
      setState(() => _values[key] = picked.toIso8601String().split('T').first);
    }
  }

  Future<void> _save() async {
    final body = {for (final e in _values.entries) if (e.value.trim().isNotEmpty) e.key: e.value.trim()};
    if (body.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ProfileService(ApiService()).updateProfile(body);
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone(true, 'Details saved. They are now locked.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      widget.onDone(false, friendlyError(e, fallback: 'Could not save these details.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sheetTitle('Complete your record'),
        for (final m in widget.missing) ...[
          if (m.options != null)
            DropdownButtonFormField<String>(
              value: _values[m.key],
              decoration: InputDecoration(labelText: m.label),
              items: [for (final o in m.options!) DropdownMenuItem(value: o, child: Text(_nice(o)))],
              onChanged: _saving ? null : (v) => setState(() => _values[m.key] = v ?? ''),
            )
          else if (m.isDate)
            InkWell(
              onTap: _saving ? null : () => _pickDate(m.key),
              child: InputDecorator(
                decoration: InputDecoration(labelText: m.label, suffixIcon: const Icon(LucideIcons.calendar, size: 18)),
                child: Text(_values[m.key] ?? 'Select date'),
              ),
            )
          else
            TextField(
              enabled: !_saving,
              maxLength: 100,
              decoration: InputDecoration(labelText: m.label, counterText: ''),
              onChanged: (v) => _values[m.key] = v,
            ),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          child: Text(_saving ? 'Saving…' : 'Save details'),
        ),
      ],
    );
  }
}

class _ContactForm extends StatefulWidget {
  final PersonnelProfileModel profile;
  final void Function(bool ok, String message) onDone;
  const _ContactForm({required this.profile, required this.onDone});
  @override
  State<_ContactForm> createState() => _ContactFormState();
}

class _ContactFormState extends State<_ContactForm> {
  late final TextEditingController _phone = TextEditingController(text: widget.profile.mobileNo ?? '');
  late final TextEditingController _address = TextEditingController(text: widget.profile.address ?? '');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final phone = _phone.text.trim();
    final address = _address.text.trim();
    if (!_mobilePattern.hasMatch(phone)) {
      setState(() => _error = 'Enter a mobile number as 09XXXXXXXXX or +639XXXXXXXXX.');
      return;
    }
    if (address.isEmpty) {
      setState(() => _error = 'Enter your address.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await ProfileService(ApiService()).updateProfile({'contactNumber': phone, 'address': address});
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone(true, 'Contact details updated.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      widget.onDone(false, friendlyError(e, fallback: 'Could not update your contact details.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sheetTitle('Contact details'),
        TextField(
          controller: _phone,
          enabled: !_saving,
          keyboardType: TextInputType.phone,
          maxLength: 13,
          decoration: const InputDecoration(labelText: 'Contact number', hintText: '09XXXXXXXXX', counterText: ''),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _address,
          enabled: !_saving,
          minLines: 2,
          maxLines: 3,
          maxLength: 300,
          decoration: const InputDecoration(labelText: 'Address', counterText: ''),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          child: Text(_saving ? 'Saving…' : 'Save'),
        ),
      ],
    );
  }
}

class _PasswordForm extends StatefulWidget {
  final Future<void> Function() onChanged;
  final void Function(String message) onError;
  const _PasswordForm({required this.onChanged, required this.onError});
  @override
  State<_PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<_PasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  // Same rule the server enforces.
  List<(bool, String)> get _rules {
    final p = _next.text;
    return [
      (p.length >= 12, 'At least 12 characters'),
      (RegExp(r'[A-Z]').hasMatch(p) && RegExp(r'[a-z]').hasMatch(p), 'Upper- and lowercase letters'),
      (RegExp(r'[0-9]').hasMatch(p), 'A number'),
      (RegExp(r'[^A-Za-z0-9]').hasMatch(p), 'A symbol'),
      (p.isNotEmpty && p == _confirm.text, 'Both new passwords match'),
    ];
  }

  bool get _valid => _current.text.isNotEmpty && _rules.every((r) => r.$1);

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await AuthService(ApiService()).changePassword(_current.text, _next.text);
      if (!mounted) return;
      Navigator.of(context).pop();
      await widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      widget.onError(friendlyError(e, fallback: 'Could not change your password.'));
    }
  }

  Widget _field(TextEditingController c, String label, String autofill) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          enabled: !_saving,
          obscureText: true,
          autofillHints: [autofill],
          decoration: InputDecoration(labelText: label),
          onChanged: (_) => setState(() {}),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sheetTitle('Change password'),
        _field(_current, 'Current password', AutofillHints.password),
        _field(_next, 'New password', AutofillHints.newPassword),
        _field(_confirm, 'Confirm new password', AutofillHints.newPassword),
        if (_next.text.isNotEmpty)
          for (final r in _rules)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(children: [
                Icon(r.$1 ? LucideIcons.circleCheck : LucideIcons.circle,
                    size: 14, color: r.$1 ? AppTheme.emeraldGreen : AppTheme.textMuted),
                const SizedBox(width: 6),
                Text(r.$2, style: TextStyle(fontSize: 13, color: r.$1 ? AppTheme.emeraldGreen : AppTheme.textMuted)),
              ]),
            ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving || !_valid ? null : _save,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          child: Text(_saving ? 'Changing…' : 'Change password'),
        ),
        const SizedBox(height: 6),
        Text('You will be signed out and asked to sign in with the new password.',
            textAlign: TextAlign.center, style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textMuted)),
      ],
    );
  }
}
