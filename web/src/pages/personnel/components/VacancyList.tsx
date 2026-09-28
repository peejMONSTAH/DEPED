import React, { useState, useMemo } from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { PromotionCycleItem } from './CareerOpportunities';
import { transactionStatusLabel } from '../../../constants/transactionStatus';

interface VacancyListProps {
  openCycles: PromotionCycleItem[];
  availablePlantillaItems?: any[];
  onApplyCycle: (cycle: PromotionCycleItem) => void;
  onViewIneligible: (cycle: PromotionCycleItem) => void;
  onOpenPlantillaDirectory: () => void;
}

export type VacancyTab = 'ALL' | 'ELIGIBLE' | 'INELIGIBLE' | 'MY_APPLICATIONS';

export const VacancyList: React.FC<VacancyListProps> = ({
  openCycles,
  availablePlantillaItems = [],
  onApplyCycle,
  onViewIneligible,
  onOpenPlantillaDirectory,
}) => {
  const [tab, setTab] = useState<VacancyTab>('ALL');
  const [search, setSearch] = useState('');

  const filteredCycles = useMemo(() => {
    return openCycles.filter(cycle => {
      // Tab filter
      if (tab === 'ELIGIBLE' && cycle.isEligible === false) return false;
      if (tab === 'INELIGIBLE' && cycle.isEligible !== false) return false;
      if (tab === 'MY_APPLICATIONS' && !cycle.hasApplied) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const target = (cycle.targetPosition || (cycle.rulesConfigurationJson as any)?.targetPosition || '').toLowerCase();
        const name = (cycle.name || '').toLowerCase();
        return target.includes(q) || name.includes(q);
      }
      return true;
    });
  }, [openCycles, tab, search]);

  const eligibleCount = openCycles.filter(c => c.isEligible !== false).length;
  const ineligibleCount = openCycles.filter(c => c.isEligible === false).length;
  const appliedCount = openCycles.filter(c => c.hasApplied).length;

  return (
    <div id="vacancies" className="card" style={{ borderRadius: 16, padding: 24, border: '1px solid var(--color-border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
            DepEd Promotion & Reclassification Vacancies
          </h2>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Official qualification ranking cycles published by the Division Promotion Board
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenPlantillaDirectory}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
        >
          <AppIcon name="employment" size={14} color="var(--color-primary)" />
          <span>Plantilla Item Directory ({availablePlantillaItems.length})</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('ALL')}
            style={{ fontWeight: 700 }}
          >
            All Vacancies ({openCycles.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'ELIGIBLE' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('ELIGIBLE')}
            style={{ fontWeight: 700 }}
          >
            Eligible to Apply ({eligibleCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'INELIGIBLE' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setTab('INELIGIBLE')}
            style={{ fontWeight: 600, fontSize: '0.8125rem' }}
          >
            Ineligible ({ineligibleCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'MY_APPLICATIONS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('MY_APPLICATIONS')}
            style={{ fontWeight: 700 }}
          >
            My Applications ({appliedCount})
          </button>
        </div>

        <div style={{ minWidth: 220 }}>
          <input
            type="search"
            className="form-control"
            placeholder="Search vacancies by position…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: '0.8125rem', padding: '6px 12px', borderRadius: 8, width: '100%' }}
          />
        </div>
      </div>

      {/* Vacancies Grid */}
      {filteredCycles.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--color-bg-secondary)', borderRadius: 12, border: '1px dashed var(--color-border)' }}>
          <AppIcon name="inbox" size={32} color="var(--color-text-muted)" />
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginTop: 8, color: 'var(--color-text-primary)' }}>
            No Vacancies Found
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            {tab === 'MY_APPLICATIONS'
              ? 'You have not submitted an application to any active cycle.'
              : 'There are no open cycles matching the selected criteria.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredCycles.map(cycle => {
            const isEligible = cycle.isEligible !== false;
            const targetPosition =
              cycle.targetPosition ||
              (cycle.rulesConfigurationJson as any)?.targetPosition ||
              cycle.name;
            const hasApplied = Boolean(cycle.hasApplied);
            const isOpen = cycle.applicationsOpen !== false && cycle.applicationsState !== 'CLOSED';

            return (
              <div
                key={cycle.id}
                style={{
                  borderRadius: 14,
                  padding: 18,
                  border: isEligible ? '1px solid var(--color-border)' : '1px solid rgba(239, 68, 68, 0.25)',
                  background: isEligible ? 'var(--color-bg-card)' : 'rgba(239, 68, 68, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(2, 132, 199, 0.1)',
                        color: 'var(--color-primary)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {cycle.type || 'Natural Vacancy'}
                    </span>

                    {/* Eligibility Badge */}
                    {isEligible ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 9999,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        Eligible
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onViewIneligible(cycle)}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 9999,
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#dc2626',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Click to view why you are ineligible"
                      >
                        <span>Ineligible</span>
                        <AppIcon name="info" size={11} color="#dc2626" />
                      </button>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
                    {targetPosition}
                  </h3>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    Cycle: {cycle.name}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>Filing window: {new Date(cycle.startDate).toLocaleDateString()} – {new Date(cycle.endDate).toLocaleDateString()}</span>
                    {cycle.applicantCount !== undefined && <span>· {cycle.applicantCount} Applicant{cycle.applicantCount === 1 ? '' : 's'}</span>}
                  </div>

                  {hasApplied && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#059669',
                      }}
                    >
                      Application on File: {cycle.myApplication?.status ? transactionStatusLabel(cycle.myApplication.status) : 'Submitted'}
                      {cycle.myApplication?.applicantNumber && ` (${cycle.myApplication.applicantNumber})`}
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                  {hasApplied ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onApplyCycle(cycle)}
                      style={{ width: '100%', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <AppIcon name="checklist" size={14} /> View Application Checklist
                    </button>
                  ) : isEligible && isOpen ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onApplyCycle(cycle)}
                      style={{ width: '100%', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <AppIcon name="upload" size={14} /> Apply with Annex C Checklist
                    </button>
                  ) : !isOpen ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled
                      style={{ width: '100%', opacity: 0.6 }}
                    >
                      Applications Closed
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onViewIneligible(cycle)}
                      style={{ width: '100%', color: '#dc2626', fontWeight: 600 }}
                    >
                      Ineligible — View Details
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
