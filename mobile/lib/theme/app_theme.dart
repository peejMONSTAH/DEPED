import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // ═══════════════════════════════════════════════════════════════════
  // EMINENCE HRMIS — SOFT BRUTALIST DESIGN SYSTEM (WEB PARITY)
  // Palette: Dark Charcoal (#0D0D11 / #1E1E22), Card Dark (#1C1C22),
  // Electric Lime (#D7F84A), Soft Lavender (#B9AEF5), Pure White (#FFFFFF)
  // ═══════════════════════════════════════════════════════════════════

  // Brand Accent Colors
  static const Color accentLime = Color(0xFFD7F84A);       // Web --color-accent-lime / --color-primary (dark)
  static const Color accentLimeHover = Color(0xFFE4FB71);  // Web --color-primary-hover
  static const Color accentLavender = Color(0xFFB9AEF5);   // Web --color-accent-lavender
  static const Color brandDark = Color(0xFF141416);        // Web --color-text-inverse (text on lime)

  // Backgrounds & Surfaces
  static const Color darkBg = Color(0xFF0D0D11);           // Web --color-bg (dark)
  static const Color darkBgWorkspace = Color(0xFF121215);  // Web --color-bg-workspace (dark)
  static const Color darkBgSecondary = Color(0xFF1E1E22);  // Web --color-bg / header background
  static const Color darkBgCard = Color(0xFF1C1C22);       // Web --color-bg-card (dark)
  static const Color darkSurface = Color(0xFF24242C);      // Web --color-bg-tertiary (dark)
  static const Color darkBorder = Color(0x1FFFFFFF);       // Web rgba(255, 255, 255, 0.08)
  static const Color darkBorderSubtle = Color(0x0FFFFFFF); // Web rgba(255, 255, 255, 0.04)

  // Typography Colors
  static const Color textPrimary = Color(0xFFF4F4F5);      // Web --color-text-primary
  static const Color textSecondary = Color(0xFFA1A1AA);    // Web --color-text-secondary
  static const Color textMuted = Color(0xFF71717A);        // Web --color-text-muted
  static const Color textInverse = Color(0xFF141416);      // Deep dark on lime/white

  // Status Colors (Matching Web Tokens)
  static const Color statusDraft = Color(0xFF71717A);
  static const Color statusPending = Color(0xFFF59E0B);    // Web --color-warning
  static const Color statusValidated = Color(0xFF3B82F6);  // Web --color-info
  static const Color statusApproved = Color(0xFF10B981);   // Web --color-success
  static const Color statusReturned = Color(0xFFEF4444);   // Web --color-error

  // Aliases for backwards compatibility with existing screens
  static const Color primaryLight = accentLime;
  static const Color primaryBlue = accentLime;
  static const Color primaryDark = brandDark;
  static const Color emeraldGreen = statusApproved;
  static const Color accentGold = statusPending;
  static const Color accentPurple = accentLavender;
  static const Color primaryNavy = darkBg;
  static const Color secondaryNavy = darkBgCard;

  // Dark Theme Matching the Web Application
  static ThemeData get lightTheme {
    final baseTextTheme = GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkBg,
      colorScheme: ColorScheme.fromSeed(
        seedColor: accentLime,
        brightness: Brightness.dark,
        primary: accentLime,
        onPrimary: brandDark,
        secondary: accentLavender,
        onSecondary: brandDark,
        tertiary: statusPending,
        surface: darkBgCard,
        background: darkBg,
        error: statusReturned,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: darkBgSecondary,
        foregroundColor: textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: textPrimary,
          letterSpacing: -0.02,
        ),
      ),
      cardTheme: CardThemeData(
        color: darkBgCard,
        elevation: 0,
        shadowColor: Colors.black.withOpacity(0.35),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: darkBorder, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        labelStyle: GoogleFonts.plusJakartaSans(color: textSecondary, fontSize: 14),
        hintStyle: GoogleFonts.plusJakartaSans(color: textMuted, fontSize: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: accentLime, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: statusReturned),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentLime,
          foregroundColor: brandDark,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9999), // Web pill button
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.01,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          side: const BorderSide(color: darkBorder, width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9999),
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: darkBorder,
        thickness: 1,
        space: 24,
      ),
      textTheme: baseTextTheme.copyWith(
        titleLarge: GoogleFonts.plusJakartaSans(fontSize: 22, fontWeight: FontWeight.w800, color: textPrimary, letterSpacing: -0.02),
        titleMedium: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w700, color: textPrimary, letterSpacing: -0.01),
        bodyLarge: GoogleFonts.plusJakartaSans(fontSize: 15, color: textPrimary),
        bodyMedium: GoogleFonts.plusJakartaSans(fontSize: 14, color: textSecondary),
        bodySmall: GoogleFonts.plusJakartaSans(fontSize: 12, color: textMuted),
      ),
    );
  }
}
