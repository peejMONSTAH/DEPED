import 'package:flutter/material.dart';
import '../models/transaction_model.dart';
import '../theme/app_theme.dart';

class StatusBadge extends StatelessWidget {
  final TransactionStatus status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String text;

    switch (status) {
      case TransactionStatus.DRAFT:
        bg = AppTheme.statusDraft.withOpacity(0.15);
        fg = AppTheme.statusDraft;
        text = 'DRAFT';
      case TransactionStatus.SUBMITTED_TO_AO2:
        bg = AppTheme.statusPending.withOpacity(0.15);
        fg = AppTheme.statusPending;
        text = 'UNDER AO II REVIEW';
      case TransactionStatus.RETURNED_BY_AO2:
        bg = AppTheme.statusReturned.withOpacity(0.15);
        fg = AppTheme.statusReturned;
        text = 'RETURNED BY AO II';
      case TransactionStatus.FORWARDED_TO_HRMO:
        bg = AppTheme.statusValidated.withOpacity(0.15);
        fg = AppTheme.statusValidated;
        text = 'UNDER HRMO REVIEW';
      case TransactionStatus.RETURNED_BY_HRMO:
        bg = AppTheme.statusReturned.withOpacity(0.15);
        fg = AppTheme.statusReturned;
        text = 'RETURNED BY HRMO';
      case TransactionStatus.APPROVED_BY_HRMO:
        bg = AppTheme.statusApproved.withOpacity(0.15);
        fg = AppTheme.statusApproved;
        text = 'APPROVED BY HRMO';
      case TransactionStatus.REJECTED:
        bg = AppTheme.statusReturned.withOpacity(0.15);
        fg = AppTheme.statusReturned;
        text = 'REJECTED';
      case TransactionStatus.ABANDONED:
      case TransactionStatus.ARCHIVED:
      case TransactionStatus.UNKNOWN:
        bg = AppTheme.statusDraft.withOpacity(0.15);
        fg = AppTheme.statusDraft;
        text = status == TransactionStatus.UNKNOWN ? 'STATUS UNAVAILABLE' : status.name;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: fg.withOpacity(0.3)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
