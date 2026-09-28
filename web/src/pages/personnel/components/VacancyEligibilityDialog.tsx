import React from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { ModalPortal } from '../../../components/common/ModalPortal';
import { ModalOverlay } from '../../../components/common/ModalOverlay';
import { PromotionCycleItem } from './CareerOpportunities';

interface VacancyEligibilityDialogProps {
  cycle: PromotionCycleItem | null;
  onClose: () => void;
}

export const VacancyEligibilityDialog: React.FC<VacancyEligibilityDialogProps> = ({
  cycle,
  onClose,
}) => {
  if (!cycle) return null;

  const targetPosition =
    cycle.targetPosition ||
    (cycle.rulesConfigurationJson as any)?.targetPosition ||
    cycle.name;

  const reason =
    cycle.ineligibilityReason ||
    'Your current plantilla item does not meet the prescribed Civil Service qualification standards or exceeds the allowed salary grade jump limit for this cycle.';

  return (
    <ModalPortal>
      <ModalOverlay onDismiss={onClose}>
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: 24,
            borderRadius: 16,
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0,
                }}
              >
                <AppIcon name="warning" size={20} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  Eligibility Notice
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  DepEd Order No. 007, s. 2023 Qualification Rules
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              aria-label="Close dialog"
            >
              <AppIcon name="close" size={18} />
            </button>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Target Position</div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {targetPosition}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Cycle: {cycle.name}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
              Reason for Ineligibility:
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.04)',
                borderLeft: '3px solid #dc2626',
              }}
            >
              {reason}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ fontWeight: 700, padding: '8px 20px' }}
            >
              Understood
            </button>
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
