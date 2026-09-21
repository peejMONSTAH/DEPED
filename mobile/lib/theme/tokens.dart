import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_theme.dart';

/// Design tokens for Digital 201 mobile.
///
/// Before this existed the app used 15 different corner radii, 18 font sizes
/// (including half-points like 12.5 and 14.5) and 38 hardcoded hex colours that
/// bypassed [AppTheme] entirely. Each widget had been nudged into shape on its
/// own, which is what made the interface feel arbitrary.
///
/// Everything visual should come from here. If a value you need is missing, add
/// it to the scale rather than inlining a one-off number at the call site.

/// Spacing scale. 4pt base, no intermediate values.
abstract final class AppSpace {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
}

/// Corner radii. Four steps, down from fifteen.
abstract final class AppRadius {
  /// Chips, badges, small inline controls.
  static const double sm = 8;

  /// Buttons, inputs, inner surfaces.
  static const double md = 12;

  /// Cards and sheets.
  static const double lg = 16;

  /// Fully rounded (avatars, pills, the nav bar).
  static const double pill = 999;

  static BorderRadius get smAll => BorderRadius.circular(sm);
  static BorderRadius get mdAll => BorderRadius.circular(md);
  static BorderRadius get lgAll => BorderRadius.circular(lg);
  static BorderRadius get pillAll => BorderRadius.circular(pill);
}

/// Type scale. Six sizes, whole numbers only.
///
/// Weight carries hierarchy as much as size does, which is what lets the scale
/// stay this short.
abstract final class AppText {
  static TextStyle get display => GoogleFonts.plusJakartaSans(
        fontSize: 22,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
        height: 1.2,
        color: AppTheme.textPrimary,
      );

  /// Screen titles.
  static TextStyle get title => GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
        height: 1.25,
        color: AppTheme.textPrimary,
      );

  /// Section headers and card titles.
  static TextStyle get heading => GoogleFonts.plusJakartaSans(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        height: 1.3,
        color: AppTheme.textPrimary,
      );

  /// Default reading size.
  static TextStyle get body => GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        height: 1.45,
        color: AppTheme.textPrimary,
      );

  /// Supporting detail, metadata, timestamps.
  static TextStyle get caption => GoogleFonts.inter(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        height: 1.35,
        color: AppTheme.textSecondary,
      );

  /// Badges and eyebrow labels. Uppercase is applied by the widget, not here.
  static TextStyle get micro => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.3,
        height: 1.2,
        color: AppTheme.textMuted,
      );

  /// Reference numbers and IDs.
  static TextStyle get mono => GoogleFonts.jetBrainsMono(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        height: 1.3,
        color: AppTheme.textMuted,
      );
}

/// Surface treatment.
///
/// Refined-institutional means separation comes from a hairline border, not a
/// drop shadow. Shadows on every card were a large part of the cluttered feel.
abstract final class AppSurface {
  static const Border hairline =
      Border.fromBorderSide(BorderSide(color: AppTheme.lightBorder, width: 1));

  static BoxDecoration get card => BoxDecoration(
        color: AppTheme.lightBgCard,
        borderRadius: AppRadius.lgAll,
        border: hairline,
      );

  /// A quieter fill for nested blocks inside a card.
  static BoxDecoration get inset => BoxDecoration(
        color: AppTheme.lightSurface,
        borderRadius: AppRadius.mdAll,
        border: hairline,
      );
}

/// Semantic status colours.
///
/// Colour is reserved for state. Brand lime and lavender are deliberately not
/// available here: when every element can be tinted, nothing reads as
/// meaningful, which is why the old screens looked noisy.
enum AppStatusTone { neutral, info, pending, success, danger }

extension AppStatusToneColors on AppStatusTone {
  Color get foreground => switch (this) {
        AppStatusTone.neutral => AppTheme.textMuted,
        AppStatusTone.info => AppTheme.primaryLight,
        AppStatusTone.pending => AppTheme.statusPending,
        AppStatusTone.success => AppTheme.statusApproved,
        AppStatusTone.danger => AppTheme.statusReturned,
      };

  /// A tint light enough to sit behind [foreground] text at 11px.
  Color get background => foreground.withValues(alpha: 0.10);
}
