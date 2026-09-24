import React from 'react';
import type { TransactionStatus, DocumentStatus } from '../../types';
import { humanizeEnum, isTransactionStatus, transactionStatusLabel } from '../../constants/transactionStatus';

type StatusType = TransactionStatus | DocumentStatus | string;

// Labels for transaction statuses come from constants/transactionStatus; only
// the badge color lives here. Promotion-application statuses are listed below.
const TRANSACTION_BADGE: Record<string, string> = {
  DRAFT: 'badge-draft',
  PENDING_VALIDATION: 'badge-pending',
  DEFICIENCY: 'badge-deficiency',
  FOR_APPROVAL: 'badge-validated',
  APPROVED: 'badge-approved',
  REJECTED: 'badge-rejected',
  ESCALATED: 'badge-escalated',
  ABANDONED: 'badge-draft',
  COMPLETED: 'badge-approved',
  ARCHIVED: 'badge-draft',
};

const OTHER_STATUSES: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'Submitted', className: 'badge-pending' },
  UNDER_REVIEW: { label: 'Under Review', className: 'badge-validated' },
  RANKED: { label: 'Ranked', className: 'badge-validated' },
};

const configFor = (status: string) => {
  if (isTransactionStatus(status)) return { label: transactionStatusLabel(status), className: TRANSACTION_BADGE[status] || 'badge-draft' };
  return OTHER_STATUSES[status] || { label: humanizeEnum(status), className: 'badge-draft' };
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = configFor(String(status));
  return (
    <span className={`badge ${config.className} ${className}`}>
      {config.label}
    </span>
  );
};
