import 'package:flutter/material.dart';
import '../screens/auth/splash_screen.dart';

/// Wraps work that sends the person to another app and back (file picker,
/// camera, document scanner). While it runs, and for a moment after, leaving
/// and returning is not treated as "reopening the app".
class ExternalActivity {
  static int _depth = 0;
  static DateTime? _endedAt;

  static Future<T> run<T>(Future<T> Function() task) async {
    _depth++;
    try {
      return await task();
    } finally {
      _depth--;
      _endedAt = DateTime.now();
    }
  }

  static bool get active =>
      _depth > 0 ||
      (_endedAt != null &&
          DateTime.now().difference(_endedAt!) < const Duration(seconds: 2));
}

/// Shows the splash briefly when the app comes back from the background.
///
/// It is an overlay above the navigator, so the screen underneath (and any
/// half-filled form) stays exactly as it was. Only a real trip to the
/// background counts: AppLifecycleState.paused/hidden. The notification shade
/// and permission dialogs only make the app "inactive", and pickers/cameras
/// run inside [ExternalActivity], so neither replays it.
class ResumeSplash extends StatefulWidget {
  const ResumeSplash({super.key, required this.child});

  final Widget child;

  static bool _launchDone = false;

  /// Called by the launch splash once it has handed over, so a resume that
  /// happens during the launch splash does not stack a second one on top.
  static void launchFinished() => _launchDone = true;

  /// Minimum time away before the splash replays.
  static const minAway = Duration(seconds: 1);

  @override
  State<ResumeSplash> createState() => _ResumeSplashState();
}

class _ResumeSplashState extends State<ResumeSplash>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  late final AnimationController _c;
  DateTime? _leftAt;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      if (!ExternalActivity.active) _leftAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final leftAt = _leftAt;
      _leftAt = null;
      if (leftAt == null || !ResumeSplash._launchDone || _visible || ExternalActivity.active) return;
      if (DateTime.now().difference(leftAt) < ResumeSplash.minAway) return;
      _play();
    }
  }

  Future<void> _play() async {
    setState(() => _visible = true);
    await _c.forward(from: 0);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (mounted) setState(() => _visible = false);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_visible)
          Positioned.fill(
            // Swallows taps while shown, then disappears without touching
            // the navigator underneath.
            child: AbsorbPointer(
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, __) => SplashBrand(t: _c.value),
              ),
            ),
          ),
      ],
    );
  }
}
