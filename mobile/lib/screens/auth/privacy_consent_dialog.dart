import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../config/privacy_notice.dart';
import '../../theme/app_theme.dart';

/// Asks the person to read the Privacy Notice once. Pops true when accepted, false to sign out.
/// The box starts unchecked and Continue stays disabled until it is ticked.
class PrivacyConsentDialog extends StatefulWidget {
  final Future<void> Function() onAccept;
  const PrivacyConsentDialog({super.key, required this.onAccept});

  @override
  State<PrivacyConsentDialog> createState() => _PrivacyConsentDialogState();
}

class _PrivacyConsentDialogState extends State<PrivacyConsentDialog> {
  bool _checked = false;
  bool _saving = false;
  String? _error;

  Future<void> _continue() async {
    setState(() { _saving = true; _error = null; });
    try {
      await widget.onAccept();
      if (mounted) Navigator.of(context).pop(true);
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = data is Map ? data['message'] : null;
      if (mounted) setState(() { _error = message is String ? message : 'Your answer could not be saved. Please try again.'; _saving = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Your answer could not be saved. Please try again.'; _saving = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Dialog(
        insetPadding: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF17472E), Color(0xFF2F7D52)]),
                  border: Border(bottom: BorderSide(color: Color(0xFFC79A2E), width: 3)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Privacy Notice', style: GoogleFonts.inter(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('Before you continue, please read how Digital 201 handles your personal data.',
                      style: GoogleFonts.inter(color: Colors.white70, fontSize: 13)),
                ]),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    for (final s in privacyNotice) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: 12, bottom: 4),
                        child: Text(s.title, style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w800, color: AppTheme.textPrimary)),
                      ),
                      for (final p in s.body)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Text(p, style: GoogleFonts.inter(fontSize: 13, height: 1.5, color: AppTheme.textPrimary)),
                        ),
                    ],
                  ]),
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 16, 14),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  InkWell(
                    onTap: _saving ? null : () => setState(() => _checked = !_checked),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Checkbox(
                        key: const Key('privacy-checkbox'),
                        value: _checked,
                        onChanged: _saving ? null : (v) => setState(() => _checked = v ?? false),
                        activeColor: const Color(0xFF2F7D52),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Text(privacyNoticeSummary, style: GoogleFonts.inter(fontSize: 12.5, height: 1.45, color: AppTheme.textPrimary)),
                        ),
                      ),
                    ]),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(left: 12, top: 6),
                      child: Text(_error!, style: GoogleFonts.inter(fontSize: 12.5, color: Colors.red.shade700)),
                    ),
                  const SizedBox(height: 8),
                  Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    TextButton(
                      onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                      child: Text('Sign out', style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      key: const Key('privacy-continue'),
                      onPressed: (_checked && !_saving) ? _continue : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2F7D52),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      ),
                      child: Text(_saving ? 'Saving…' : 'Continue', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
                    ),
                  ]),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
