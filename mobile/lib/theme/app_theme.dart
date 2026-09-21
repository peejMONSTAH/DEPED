import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // ═══════════════════════════════════════════════════════════════════
  // EMINENCE HRMIS — DEPED LIGHT DESIGN SYSTEM (MOBILE)
  // Clean, high-contrast, pure light theme only.
  // ═══════════════════════════════════════════════════════════════════

  // Brand Accent Colors
  static const Color accentLime = Color(0xFFD7F84A);       // Electric Lime accent
  static const Color accentLimeHover = Color(0xFFCBEB3F);
  static const Color accentLavender = Color(0xFFB9AEF5);   // Soft Lavender
  static const Color brandDark = Color(0xFF141416);        // Deep Charcoal

  // Backgrounds & Surfaces (Pure Light Mode)
  static const Color lightBg = Color(0xFFF1F5F9);          // Light Slate background
  static const Color lightBgWorkspace = Color(0xFFE2E6E9); // Secondary workspace background
  static const Color lightBgSecondary = Color(0xFFFFFFFF); // Pure white header / surface
  static const Color lightBgCard = Color(0xFFFFFFFF);      // Pure white cards
  static const Color lightSurface = Color(0xFFF8FAFC);     // Subtle contrast fill
  static const Color lightBorder = Color(0xFFE2E8F0);      // Crisp border
  static const Color lightBorderSubtle = Color(0xFFF1F5F9);// Subtle divider

  // Aliases for backwards compatibility with existing screens
  static const Color darkBg = lightBg;
  static const Color darkBgWorkspace = lightBgWorkspace;
  static const Color darkBgSecondary = lightBgSecondary;
  static const Color darkBgCard = lightBgCard;
  static const Color darkSurface = lightSurface;
  static const Color darkBorder = lightBorder;
  static const Color darkBorderSubtle = lightBorderSubtle;

  // Typography Colors (High-Contrast Light Theme)
  static const Color textPrimary = Color(0xFF141416);      // Deep Charcoal
  static const Color textSecondary = Color(0xFF526171);    // Mid Charcoal
  static const Color textMuted = Color(0xFF64748B);        // Subtle Slate
  static const Color textInverse = Color(0xFFFFFFFF);      // White on dark buttons/chips

  // Status Colors (Matching DepEd Corporate Web Tokens)
  static const Color statusDraft = Color(0xFF64748B);
  static const Color statusPending = Color(0xFFD97706);    // Amber
  static const Color statusValidated = Color(0xFF2563EB);  // DepEd Royal Blue
  static const Color statusApproved = Color(0xFF10B981);   // Emerald Green
  static const Color statusReturned = Color(0xFFDC2626);   // Red

  // Aliases for backwards compatibility with existing screens
  static const Color primaryLight = Color(0xFF2563EB);     // DepEd Royal Blue
  static const Color primaryBlue = Color(0xFF2563EB);
  static const Color primaryDark = brandDark;
  static const Color emeraldGreen = statusApproved;
  static const Color accentGold = statusPending;
  static const Color accentPurple = accentLavender;
  static const Color primaryNavy = Color(0xFF1E293B);
  static const Color secondaryNavy = Color(0xFF334155);

  // Pure Light Theme
  static ThemeData get lightTheme {
    final baseTextTheme = GoogleFonts.plusJakartaSansTextTheme(ThemeData.light().textTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: lightBg,
      colorScheme: ColorScheme.light(
        primary: brandDark,
        onPrimary: Colors.white,
        secondary: const Color(0xFF2563EB),
        onSecondary: Colors.white,
        tertiary: statusPending,
        surface: lightBgCard,
        onSurface: textPrimary,
        error: statusReturned,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: lightBgSecondary,
        foregroundColor: textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: textPrimary),
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 19,
          fontWeight: FontWeight.w800,
          color: textPrimary,
          letterSpacing: -0.02,
        ),
      ),
      cardTheme: CardThemeData(
        color: lightBgCard,
        elevation: 0,
        shadowColor: const Color(0x0A000000),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: lightBorder, width: 1),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: lightBgCard,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: lightBorder, width: 1),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: lightBgCard,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: lightSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
        labelStyle: GoogleFonts.plusJakartaSans(color: textSecondary, fontSize: 15, fontWeight: FontWeight.w500),
        hintStyle: GoogleFonts.plusJakartaSans(color: textMuted, fontSize: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: lightBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: lightBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: brandDark, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: statusReturned),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brandDark,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9999), // Pill button
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.01,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          side: const BorderSide(color: lightBorder, width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9999),
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: lightBorder,
        thickness: 1,
        space: 24,
      ),
      textTheme: baseTextTheme.copyWith(
        titleLarge: GoogleFonts.plusJakartaSans(fontSize: 24, fontWeight: FontWeight.w800, color: textPrimary, letterSpacing: -0.02),
        titleMedium: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700, color: textPrimary, letterSpacing: -0.01),
        bodyLarge: GoogleFonts.plusJakartaSans(fontSize: 16, color: textPrimary),
        bodyMedium: GoogleFonts.plusJakartaSans(fontSize: 15, color: textSecondary),
        bodySmall: GoogleFonts.plusJakartaSans(fontSize: 13.5, color: textMuted),
      ),
    );
  }
}
