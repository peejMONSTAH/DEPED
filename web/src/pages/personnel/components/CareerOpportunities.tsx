import React, { useMemo } from 'react';
import { AppIcon } from '../../../components/common/AppIcon';

export interface PromotionCycleItem {
  id: number;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  applicantCount?: number;
  hasApplied?: boolean;
  hasChecklist?: boolean;
  myApplication?: {
    id: number;
    status: string;
    finalRank?: number | null;
    applicationDate?: string;
    hasChecklist: boolean;
    annexCChecklist?: any;
    applicantNumber?: string;
    stageStatus?: string;
    verificationStatus?: string;
    verificationRemarks?: string;
    totalScore?: number;
    disqualificationReason?: string;
    deliberationRemarks?: string;
    forAppointment?: string;
    cycleStatus?: string;
  } | null;
  targetPosition?: string;
  currentPosition?: string;
  isCurrentPosition?: boolean;
  isEligible?: boolean;
  ineligibilityReason?: string | null;
  applicationsOpen?: boolean;
  applicationsState?: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED';
  applicationsOpenOn?: string;
  applicationsCloseOn?: string;
  jumpPositions?: number | null;
  maxAllowedJump?: number;
  rulesConfigurationJson?: Record<string, any>;
}

interface CareerOpportunitiesProps {
  openCycles: PromotionCycleItem[];
  onScrollToVacancies?: () => void;
}

export const CareerOpportunities: React.FC<CareerOpportunitiesProps> = ({
  openCycles,
  onScrollToVacancies,
}) => {
  const { eligibleCount, ineligibleCount, appliedCount } = useMemo(() => {
    let eligible = 0;
    let ineligible = 0;
    let applied = 0;

    for (const c of openCycles) {
      if (c.hasApplied) applied++;
      if (c.isEligible === false) {
        ineligible++;
      } else {
        eligible++;
      }
    }

    return { eligibleCount: eligible, ineligibleCount: ineligible, appliedCount: applied };
  }, [openCycles]);

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
          <AppIcon name="award" size={18} color="var(--color-primary)" />
          <h2 style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-primary)' }}>
            Career Opportunities & Open Vacancies
          </h2>
        </div>

        {onScrollToVacancies && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onScrollToVacancies}
            style={{ fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px' }}
          >
            Browse Vacancies ({openCycles.length})
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
        {/* Eligible Vacancies */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
            Eligible to Apply
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#059669', lineHeight: 1.2 }}>
            {eligibleCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#059669', opacity: 0.9, marginTop: 2 }}>
            Meets QS criteria
          </div>
        </div>

        {/* Ineligible Vacancies */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
            Not Eligible
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
            {ineligibleCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Salary jump / tenure
          </div>
        </div>

        {/* Applied */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: appliedCount > 0 ? 'rgba(2, 132, 199, 0.08)' : 'var(--color-bg-secondary)',
            border: appliedCount > 0 ? '1px solid rgba(2, 132, 199, 0.25)' : '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: appliedCount > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
            Applications Filed
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: appliedCount > 0 ? 'var(--color-primary)' : 'var(--color-text-primary)', lineHeight: 1.2 }}>
            {appliedCount}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Active ranking cycle
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <AppIcon name="info" size={14} color="var(--color-primary)" />
        <span>
          DepEd Order No. 007, s. 2023 sets qualification standards and limits salary grade jumps to a maximum of 3 grades.
        </span>
      </div>
    </div>
  );
};
