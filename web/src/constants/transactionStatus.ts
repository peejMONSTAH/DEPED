/**
 * Readable text for every TransactionStatus in backend/prisma/schema.prisma.
 * Screens show these instead of the enum, so "PENDING_VALIDATION" never
 * reaches a user.
 */
export const TRANSACTION_STATUSES = [
  'DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'APPROVED', 'REJECTED',
  'DEFICIENCY', 'ESCALATED', 'ABANDONED', 'COMPLETED', 'ARCHIVED',
] as const;

export type TransactionStatus = typeof TRANSACTION_STATUSES[number];

// The one label table for transaction statuses: StatusBadge, filters and
// empty states all read it, so a status is never called two different names.
const TEXT: Record<TransactionStatus, { label: string; phrase: string }> = {
  DRAFT: { label: 'Draft', phrase: 'in draft' },
  PENDING_VALIDATION: { label: 'Under AO II Review', phrase: 'pending validation' },
  FOR_APPROVAL: { label: 'Under HRMO Review', phrase: 'awaiting HRMO approval' },
  APPROVED: { label: 'Approved by HRMO', phrase: 'approved' },
  REJECTED: { label: 'Rejected', phrase: 'rejected' },
  DEFICIENCY: { label: 'Returned by AO II', phrase: 'returned for correction' },
  ESCALATED: { label: 'Escalated to HRMO', phrase: 'escalated' },
  ABANDONED: { label: 'Withdrawn', phrase: 'withdrawn' },
  COMPLETED: { label: 'Completed', phrase: 'completed' },
  ARCHIVED: { label: 'Archived', phrase: 'archived' },
};

/** "SOME_VALUE" → "Some value"; the fallback for anything not in the table. */
export const humanizeEnum = (value: string): string => {
  const words = String(value || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
};

export const isTransactionStatus = (status: string): status is TransactionStatus => (TRANSACTION_STATUSES as readonly string[]).includes(status);

export const transactionStatusLabel = (status: string): string =>
  isTransactionStatus(status) ? TEXT[status].label : humanizeEnum(status);

export const transactionEmptyTitle = (status: string): string =>
  `No transactions are ${isTransactionStatus(status) ? TEXT[status].phrase : humanizeEnum(status).toLowerCase()}.`;
