import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../components/common/AppIcon';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import {
  TransactionRecord,
  isActiveTransaction,
  getTransactionStageSummary,
} from '../../../models/transactionState';

interface CurrentTransactionProps {
  transactions: TransactionRecord[];
  /** Promotion applications still under review (not yet an appointment). */
  pendingApplications?: Array<{ label: string; who: string | null }>;
  onOpenChecklist?: (txId: number) => void;
}

export const CurrentTransaction: React.FC<CurrentTransactionProps> = ({
  transactions,
  pendingApplications = [],
  onOpenChecklist,
}) => {
  // Only genuinely active transactions (strictly excludes APPROVED, COMPLETED, REJECTED, etc.)
  const activeTransactions = useMemo(
    () => transactions.filter(tx => isActiveTransaction(tx.status)),
    [transactions]
  );

  const primaryTx = activeTransactions[0];

  return (
    <div
      className="card"
      style={{
        borderRadius: 16,
        padding: 20,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppIcon name="transactions" size={18} color="var(--color-primary)" />
          <h2 style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-primary)' }}>
            Appointment in progress
          </h2>
        </div>

        <Link
          to="/personnel/transactions"
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>All applications</span>
          <AppIcon name="chevron-right" size={12} />
        </Link>
      </div>

      {!primaryTx ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            borderRadius: 12,
            background: 'var(--color-bg-secondary)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <AppIcon name="check" size={24} color="#059669" />
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginTop: 8, color: 'var(--color-text-primary)' }}>
            No appointment in progress
          </div>
          <p style={{ margin: '4px 0 12px 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            {pendingApplications.length
              ? `Your promotion application${pendingApplications.length === 1 ? ' is' : 's are'} still under review: ${pendingApplications.map(a => a.label + (a.who ? ` (with ${a.who})` : '')).join('; ')}. An appointment starts only if you are selected.`
              : 'An appointment starts when HRMO selects you for a promotion.'}
          </p>
          <Link
            to="/personnel/transactions"
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <AppIcon name="history" size={14} /> View applications
          </Link>
        </div>
      ) : (
        (() => {
          const summary = getTransactionStageSummary(primaryTx);
          const isDeficiency = primaryTx.status === 'DEFICIENCY';

          return (
            <div
              style={{
                borderRadius: 12,
                padding: 16,
                background: isDeficiency ? 'rgba(239, 68, 68, 0.03)' : 'var(--color-bg-secondary)',
                border: isDeficiency ? '1.5px solid #ef4444' : '1px solid var(--color-border)',
              }}
            >
              {/* Transaction Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      className="font-mono"
                      style={{
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        color: 'var(--color-primary)',
                        background: 'rgba(2, 132, 199, 0.08)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      TRX-{String(primaryTx.id).padStart(4, '0')}
                    </span>
                    <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                      {primaryTx.transactionType?.name || 'HR Filing'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Filed: {new Date(primaryTx.createdAt).toLocaleDateString()} · Last updated: {new Date(primaryTx.updatedAt || primaryTx.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <StatusBadge status={primaryTx.status} />
              </div>

              {/* Stage & Reviewer Info */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 10,
                  margin: '12px 0',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.8125rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Current Stage:</span>
                  <div style={{ fontWeight: 700, color: summary.stageColor }}>
                    {summary.stageTitle}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Reviewer / Assignee:</span>
                  <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {summary.ownerLabel}
                  </div>
                </div>
              </div>

              {/* Next Action Note */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                <strong>Next Expected Action:</strong> {summary.nextExpectedAction}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Link
                  to={`/personnel/checklist?txId=${primaryTx.id}`}
                  className={`btn btn-sm ${isDeficiency ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={onOpenChecklist ? () => onOpenChecklist(primaryTx.id) : undefined}
                  style={{
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    textDecoration: 'none',
                    background: isDeficiency ? '#dc2626' : undefined,
                    borderColor: isDeficiency ? '#dc2626' : undefined,
                    color: isDeficiency ? '#fff' : undefined,
                  }}
                >
                  <AppIcon name={isDeficiency ? 'upload' : 'checklist'} size={14} color={isDeficiency ? '#fff' : 'currentColor'} />
                  <span>{isDeficiency ? 'Replace Deficient Document' : 'Open Filing Checklist'}</span>
                </Link>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
