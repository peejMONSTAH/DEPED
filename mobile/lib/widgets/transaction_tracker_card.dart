import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../models/transaction_model.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.dart';

/// Where a transaction is, as four short steps in one row.
class TransactionTrackerCard extends StatelessWidget {
  final TransactionModel transaction;

  const TransactionTrackerCard({super.key, required this.transaction});

  @override
  Widget build(BuildContext context) {
    final s = transaction.status;
    if ([
      TransactionStatus.REJECTED,
      TransactionStatus.ABANDONED,
      TransactionStatus.ARCHIVED,
      TransactionStatus.UNKNOWN,
    ].contains(s)) {
      return const SizedBox.shrink();
    }

    final current = switch (s) {
      TransactionStatus.SUBMITTED_TO_AO2 || TransactionStatus.RETURNED_BY_AO2 => 1,
      TransactionStatus.FORWARDED_TO_HRMO || TransactionStatus.RETURNED_BY_HRMO => 2,
      TransactionStatus.APPROVED_BY_HRMO => 4,
      _ => 0,
    };
    final failedAt = s == TransactionStatus.RETURNED_BY_AO2
        ? 1
        : s == TransactionStatus.RETURNED_BY_HRMO
            ? 2
            : -1;
    const labels = ['Documents', 'AO II', 'HRMO', 'Approved'];

    return Row(
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          Expanded(
            child: _Step(
              label: labels[i],
              done: i < current && i != failedAt,
              active: i == current && failedAt < 0,
              failed: i == failedAt,
            ),
          ),
        ],
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.done,
    required this.active,
    required this.failed,
  });

  final String label;
  final bool done;
  final bool active;
  final bool failed;

  @override
  Widget build(BuildContext context) {
    final color = failed
        ? AppTheme.statusReturned
        : done
            ? AppTheme.statusApproved
            : active
                ? AppTheme.primaryLight
                : AppTheme.lightBorder;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: color,
              borderRadius: AppRadius.pillAll,
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              if (done || failed) ...[
                Icon(failed ? LucideIcons.alertCircle : LucideIcons.check,
                    size: 12, color: color),
                const SizedBox(width: 3),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.caption.copyWith(
                    color: (done || active || failed)
                        ? AppTheme.textPrimary
                        : AppTheme.textMuted,
                    fontWeight: active || failed ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
