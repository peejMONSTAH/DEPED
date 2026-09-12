import React from 'react';
import type { TransactionStatus, DocumentStatus } from '../../types';

type StatusType = TransactionStatus | DocumentStatus | string;

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT:                    { label: 'Draft',               className: 'badge-draft' },
  PENDING_VALIDATION:       { label: 'Under AO II Review',  className: 'badge-pending' },
  SUBMITTED_TO_AO2:         { label: 'Under AO II Review',  className: 'badge-pending' },
  SUBMITTED:                { label: 'Under AO II Review',  className: 'badge-pending' },
  DEFICIENCY:               { label: 'Returned by AO II',   className: 'badge-deficiency' },
  RETURNED_BY_AO2:          { label: 'Returned by AO II',   className: 'badge-deficiency' },
  FOR_APPROVAL:             { label: 'Under HRMO Review',   className: 'badge-validated' },
  FORWARDED_TO_HRMO:        { label: 'Under HRMO Review',   className: 'badge-validated' },
  RETURNED_BY_HRMO:         { label: 'Returned by HRMO',    className: 'badge-deficiency' },
  APPROVED:                 { label: 'Approved by HRMO',    className: 'badge-approved' },
  APPROVED_BY_HRMO:         { label: 'Approved by HRMO',    className: 'badge-approved' },
  REJECTED:                 { label: 'Rejected',            className: 'badge-rejected' },
  ESCALATED:                { label: 'Escalated to HRMO',   className: 'badge-escalated' },
  UNDER_REVIEW:             { label: 'Under Review',        className: 'badge-validated' },
  RANKED:                   { label: 'Ranked',              className: 'badge-validated' },
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = statusConfig[status] || { label: status, className: 'badge-draft' };
  return (
    <span className={`badge ${config.className} ${className}`}>
      {config.label}
    </span>
  );
};
