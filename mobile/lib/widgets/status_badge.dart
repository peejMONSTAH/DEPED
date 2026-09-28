import 'package:flutter/material.dart';
import '../models/transaction_model.dart';
import '../theme/tokens.dart';
import 'ui_kit.dart';

/// Transaction status as a [StatusPill], in plain sentence case.
class StatusBadge extends StatelessWidget {
  final TransactionStatus status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final (String label, AppStatusTone tone) = switch (status) {
      TransactionStatus.DRAFT => ('Draft', AppStatusTone.neutral),
      TransactionStatus.SUBMITTED_TO_AO2 => ('With AO II', AppStatusTone.pending),
      TransactionStatus.RETURNED_BY_AO2 => ('Returned', AppStatusTone.danger),
      TransactionStatus.FORWARDED_TO_HRMO => ('With HRMO', AppStatusTone.info),
      TransactionStatus.RETURNED_BY_HRMO => ('Returned by HRMO', AppStatusTone.danger),
      TransactionStatus.APPROVED_BY_HRMO => ('Approved', AppStatusTone.success),
      TransactionStatus.REJECTED => ('Disqualified', AppStatusTone.danger),
      TransactionStatus.ABANDONED => ('Abandoned', AppStatusTone.neutral),
      TransactionStatus.ARCHIVED => ('Archived', AppStatusTone.neutral),
      TransactionStatus.UNKNOWN => ('Status unavailable', AppStatusTone.neutral),
    };
    return StatusPill(label: label, tone: tone);
  }
}
