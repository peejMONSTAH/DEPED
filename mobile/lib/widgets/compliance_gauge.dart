import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/circular_percent_indicator.dart';
import '../theme/app_theme.dart';

class ComplianceGauge extends StatelessWidget {
  final double score;
  final double radius;

  const ComplianceGauge({
    super.key,
    required this.score,
    this.radius = 45.0,
  });

  @override
  Widget build(BuildContext context) {
    final double percent = (score / 100.0).clamp(0.0, 1.0);
    
    // Modern High-Contrast Palette matching Web Dark Theme
    Color progressColor;
    if (score >= 100) {
      progressColor = AppTheme.emeraldGreen;
    } else if (score >= 50) {
      progressColor = AppTheme.accentGold;
    } else if (score > 0) {
      progressColor = const Color(0xFFF97316); // Vibrant Orange
    } else {
      progressColor = const Color(0xFF484F58); // Muted Outline for 0%
    }

    final double strokeWidth = radius <= 26 ? 3.5 : (radius <= 38 ? 5.0 : 7.0);
    final double fontSize = radius <= 26 ? 10.5 : (radius <= 38 ? 13.0 : 16.0);

    return CircularPercentIndicator(
      radius: radius,
      lineWidth: strokeWidth,
      percent: percent,
      animation: true,
      animationDuration: 800,
      circularStrokeCap: CircularStrokeCap.round,
      progressColor: progressColor,
      backgroundColor: AppTheme.lightBorder, // Crisp light ring track
      center: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${score.toInt()}%',
            style: GoogleFonts.jetBrainsMono(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              color: AppTheme.textPrimary, // Visible dark charcoal text
              letterSpacing: -0.5,
            ),
          ),
          if (radius > 40)
            Padding(
              padding: const EdgeInsets.only(top: 2.0),
              child: Text(
                'Compliance',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
