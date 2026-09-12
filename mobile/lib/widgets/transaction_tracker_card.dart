import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../models/transaction_model.dart';
import '../theme/app_theme.dart';

class TransactionTrackerCard extends StatelessWidget {
  final TransactionModel transaction;

  const TransactionTrackerCard({super.key, required this.transaction});

  @override
  Widget build(BuildContext context) {
    int currentStep = 1;
    if (transaction.status == TransactionStatus.SUBMITTED_TO_AO2) {
      currentStep = 2;
    } else if (transaction.status == TransactionStatus.FORWARDED_TO_HRMO) {
      currentStep = 3;
    } else if (transaction.status == TransactionStatus.APPROVED_BY_HRMO) {
      currentStep = 4;
    }

    final isReturned = transaction.status == TransactionStatus.RETURNED_BY_AO2 ||
        transaction.status == TransactionStatus.RETURNED_BY_HRMO;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.darkBgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isReturned
              ? AppTheme.statusReturned.withOpacity(0.5)
              : AppTheme.primaryLight.withOpacity(0.3),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryLight.withOpacity(0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(LucideIcons.route, size: 16, color: AppTheme.primaryLight),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Transaction Status Tracking',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.accentLime.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.accentLime.withOpacity(0.35)),
                ),
                child: Text(
                  transaction.referenceNo,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.accentLime,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Stepper Timeline Rows
          _buildTrackerStep(
            stepNum: 1,
            title: 'Personnel Submission',
            subtitle: '100% Mandatory Documents Uploaded',
            isDone: currentStep >= 1,
            isCurrent: currentStep == 1 && !isReturned,
            isFailed: false,
          ),
          _buildConnectorLine(isDone: currentStep >= 2),
          _buildTrackerStep(
            stepNum: 2,
            title: 'AO II Initial Validation',
            subtitle: isReturned && transaction.status == TransactionStatus.RETURNED_BY_AO2
                ? 'Action Required: Returned by AO II'
                : (currentStep > 2
                    ? 'Validated & Declared Qualified'
                    : (currentStep == 2 ? 'Under AO II School-Level Review' : 'Awaiting Submission')),
            isDone: currentStep > 2,
            isCurrent: currentStep == 2 && !isReturned,
            isFailed: isReturned && transaction.status == TransactionStatus.RETURNED_BY_AO2,
          ),
          _buildConnectorLine(isDone: currentStep >= 3),
          _buildTrackerStep(
            stepNum: 3,
            title: 'HRMO Final Approval & Ranking',
            subtitle: isReturned && transaction.status == TransactionStatus.RETURNED_BY_HRMO
                ? 'Action Required: Returned by HRMO'
                : (currentStep > 3
                    ? 'Approved & Signed by HRMO'
                    : (currentStep == 3 ? 'Under HRMO Division Review' : 'Pending AO Validation')),
            isDone: currentStep > 3,
            isCurrent: currentStep == 3 && !isReturned,
            isFailed: isReturned && transaction.status == TransactionStatus.RETURNED_BY_HRMO,
          ),
          _buildConnectorLine(isDone: currentStep >= 4),
          _buildTrackerStep(
            stepNum: 4,
            title: 'Approved & Finalized',
            subtitle: currentStep == 4
                ? 'Transaction approved by HRMO'
                : 'Pending HRMO Final Approval',
            isDone: currentStep == 4,
            isCurrent: false,
            isFailed: false,
          ),
        ],
      ),
    );
  }

  Widget _buildConnectorLine({required bool isDone}) {
    return Container(
      margin: const EdgeInsets.only(left: 13, top: 2, bottom: 2),
      width: 2,
      height: 14,
      color: isDone ? AppTheme.emeraldGreen : const Color(0xFF30363D),
    );
  }

  Widget _buildTrackerStep({
    required int stepNum,
    required String title,
    required String subtitle,
    required bool isDone,
    required bool isCurrent,
    required bool isFailed,
  }) {
    Color iconBg = const Color(0xFF21262D);
    Color iconFg = const Color(0xFF8B949E);
    IconData icon = LucideIcons.circle;

    if (isFailed) {
      iconBg = AppTheme.statusReturned.withOpacity(0.2);
      iconFg = AppTheme.statusReturned;
      icon = LucideIcons.alertTriangle;
    } else if (isDone) {
      iconBg = AppTheme.emeraldGreen.withOpacity(0.2);
      iconFg = AppTheme.emeraldGreen;
      icon = LucideIcons.check;
    } else if (isCurrent) {
      iconBg = AppTheme.accentLime.withOpacity(0.2);
      iconFg = AppTheme.accentLime;
      icon = LucideIcons.clock;
    }

    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: iconBg,
            border: Border.all(
              color: isCurrent
                  ? AppTheme.accentLime
                  : (isDone ? AppTheme.emeraldGreen : Colors.transparent),
              width: 1.5,
            ),
          ),
          child: Icon(icon, size: 14, color: iconFg),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: (isCurrent || isDone) ? FontWeight.bold : FontWeight.w500,
                  color: isFailed
                      ? AppTheme.statusReturned
                      : (isCurrent
                          ? AppTheme.accentLime
                          : (isDone ? Colors.white : const Color(0xFF8B949E))),
                ),
              ),
              Text(
                subtitle,
                style: GoogleFonts.inter(
                  fontSize: 10,
                  color: isFailed
                      ? AppTheme.statusReturned
                      : (isCurrent ? AppTheme.accentLimeHover : const Color(0xFF6E7681)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
