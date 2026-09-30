import React from 'react';

/** What the server says about who checked a transaction, who acts next, and what this viewer can do. */
export interface ReviewState {
  validator: 'AO_II' | 'HRMO';
  validatedBy: { userId: number; role: string; name: string } | null;
  approver: 'HRMO' | 'SYSTEM_ADMIN' | null;
  canValidate: boolean;
  canApprove: boolean;
  owner: { role: 'APPLICANT' | 'AO_II' | 'HRMO' | 'SYSTEM_ADMIN' | null; label: string };
  summary: string;
  youCan: string;
}

export const REVIEWER_NAMES: Record<string, string> = { AO_II: 'AO II', HRMO: 'HRMO', SYSTEM_ADMIN: 'System Administrator' };
export const reviewerName = (role?: string | null): string => (role ? REVIEWER_NAMES[role] || role : 'reviewer');

/**
 * The three questions every screen owes the reader: what happened, who acts next, what can I do.
 * The words come from the server (`review`), so web and phone say the same thing.
 */
export const ReviewNotice: React.FC<{ review?: ReviewState | null; compact?: boolean }> = ({ review, compact }) => {
  if (!review) return null;
  return (
    <div className="review-notice" style={{
      display: 'grid', gap: 4, padding: compact ? '8px 12px' : '12px 16px', borderRadius: 12,
      border: '1px solid var(--color-border)', borderLeft: '4px solid var(--color-primary)', background: 'var(--color-bg-secondary)',
      fontSize: '.875rem', color: 'var(--color-text-primary)',
    }}>
      <span><strong>What happened:</strong> {review.summary}</span>
      {review.owner.role && <span><strong>Next:</strong> {review.owner.label} acts.</span>}
      {review.youCan && <span><strong>You:</strong> {review.youCan}</span>}
    </div>
  );
};
