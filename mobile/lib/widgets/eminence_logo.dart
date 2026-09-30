import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

enum EminenceLogoVariant {
  /// Large hero wordmark with subtext (ideal for splash/login screens)
  full,

  /// Sleek horizontal logo with HRMIS pill & division subtitle
  wordmark,

  /// Typographic compact mark
  mark,
}

enum EminenceLogoSize { sm, md, lg, xl }

class EminenceLogo extends StatelessWidget {
  final EminenceLogoVariant variant;
  final EminenceLogoSize size;
  final TextStyle? customStyle;
  final bool showSubtitle;

  const EminenceLogo({
    Key? key,
    this.variant = EminenceLogoVariant.full,
    this.size = EminenceLogoSize.md,
    this.customStyle,
    this.showSubtitle = true,
  }) : super(key: key);

  double get fontSize {
    switch (size) {
      case EminenceLogoSize.sm:
        return variant == EminenceLogoVariant.full ? 20 : 15;
      case EminenceLogoSize.md:
        return variant == EminenceLogoVariant.full ? 26 : 18;
      case EminenceLogoSize.lg:
        return variant == EminenceLogoVariant.full ? 32 : 22;
      case EminenceLogoSize.xl:
        return variant == EminenceLogoVariant.full ? 40 : 26;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (variant == EminenceLogoVariant.mark) {
      return _buildMark();
    } else if (variant == EminenceLogoVariant.wordmark) {
      return _buildWordmark();
    } else {
      return _buildFull();
    }
  }

  Widget _buildMark() {
    return Text.rich(
      TextSpan(
        text: 'E',
        style: GoogleFonts.plusJakartaSans(
          fontSize: fontSize * 1.3,
          fontWeight: FontWeight.w900,
          color: AppTheme.textPrimary,
          letterSpacing: -0.5,
        ),
        children: const [
          TextSpan(
            text: '.',
            style: TextStyle(color: AppTheme.accentLime),
          ),
        ],
      ),
    );
  }

  Widget _buildWordmark() {
    final fontSz = fontSize;

    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Brand header lockup (mark + DIGITAL 201), from brand-assets.
          Image.asset(
            'assets/images/digital201-header-lockup.png',
            height: fontSz * 1.6,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            semanticLabel: 'Digital 201',
          ),
          if (showSubtitle) ...[
            const SizedBox(height: 2),
            Text(
              'City Schools Division of Koronadal',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.textMuted,
                letterSpacing: 0.1,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFull() {
    final fontSz = fontSize;

    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                'DIGITAL 201',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: fontSz,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.0,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.accentLime,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'HRMIS',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: fontSz * 0.45,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.0,
                    color: AppTheme.brandDark,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'City Schools Division of Koronadal',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.textMuted,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 10),
          // Subtle Electric Lime Accent Line
          Container(
            width: 140,
            height: 2.5,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              gradient: const LinearGradient(
                colors: [
                  Colors.transparent,
                  AppTheme.accentLime,
                  AppTheme.accentLavender,
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
