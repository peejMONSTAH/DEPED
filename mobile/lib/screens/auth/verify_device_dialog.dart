import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/user_model.dart';
import '../../services/auth_service.dart';

/// Asks for the 6-digit code emailed when signing in on a new device.
/// Pops with the signed-in [UserModel], or null if cancelled.
class VerifyDeviceDialog extends StatefulWidget {
  final AuthService authService;
  final DeviceVerificationRequired challenge;

  const VerifyDeviceDialog({super.key, required this.authService, required this.challenge});

  @override
  State<VerifyDeviceDialog> createState() => _VerifyDeviceDialogState();
}

class _VerifyDeviceDialogState extends State<VerifyDeviceDialog> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;
  String? _error;
  late int _resendIn;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown(widget.challenge.resendAfterSeconds);
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
      if (_resendIn == 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from your email.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final user = await widget.authService.verifyDevice(widget.challenge.challengeToken, code);
      if (mounted) Navigator.of(context).pop(user);
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceAll('Exception: ', ''); _codeCtrl.clear(); });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _error = null);
    try {
      final wait = await widget.authService.resendCode(widget.challenge.challengeToken);
      _startCountdown(wait);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('A new code was sent to ${widget.challenge.maskedEmail}.')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF2F7D52);
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Check your email', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              'This phone is new to your account, so we sent a 6-digit code to ${widget.challenge.maskedEmail}. '
              'You will not be asked again on this phone for 30 days.',
              style: const TextStyle(fontSize: 14, height: 1.4, color: Color(0xFF55615A)),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _codeCtrl,
              autofocus: true,
              enabled: !_busy,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: 10),
              decoration: InputDecoration(
                hintText: '000000',
                errorText: _error,
                errorMaxLines: 3,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (v) { if (v.length == 6 && !_busy) _verify(); },
              onSubmitted: (_) => _verify(),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: green, shape: const StadiumBorder()),
                onPressed: _busy ? null : _verify,
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Verify and sign in', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: _resendIn > 0 || _busy ? null : _resend,
                  child: Text(_resendIn > 0 ? 'New code in ${_resendIn}s' : 'Send a new code'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
