import React, { useState, useEffect } from 'react';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { getAllPages } from '../../api/pagination';
import { SkeletonStats, SkeletonTable } from '../../components/common/Skeleton';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';
import { getAutoSalaryGrade } from '../../constants/depedData';

// HRMO Compliance Monitoring — per 201-System-Workflow.md
// Dashboard Analytics: Fully Compliant, Partially Compliant, Non-Compliant Personnel
// Pending Transactions, Returned Transactions, Approved Transactions

// HRMO Years of Service Monitoring — per 201-System-Workflow.md
// System computes using: Appointment Date, PDS, Work Experience Sheet, Service Records
// Displays: Years in Service, Current Position, First Appointment Date, Latest Promotion Date, Career Timeline

type PersonnelRecord = {
  employeeId: string;
  name: string;
  position: string;
  category: string;
  complianceStatus: 'Fully Compliant' | 'Partially Compliant' | 'Non-Compliant';
  complianceScore: number;
  yearsInService: number | null;
  firstAppointmentDate: string;
  latestPromotionDate: string;
  latestSalaryGrade: string;
  appointmentDate: string;
};

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Fully Compliant': {
    bg: 'var(--color-success-light)',
    text: 'var(--color-success-text)',
    border: 'var(--color-success)',
  },
  'Partially Compliant': {
    bg: 'var(--color-warning-light)',
    text: 'var(--color-warning-text)',
    border: 'var(--color-warning)',
  },
  'Non-Compliant': {
    bg: 'var(--color-error-light)',
    text: 'var(--color-error-text)',
    border: 'var(--color-error)',
  },
};

type Tab = 'compliance' | 'years';

export const ComplianceMonitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('compliance');
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [personnelList, setPersonnelList] = useState<PersonnelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTx, setPendingTx] = useState(0);
  const [returnedTx, setReturnedTx] = useState(0);
  const [approvedTx, setApprovedTx] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [personnelRes, transRes] = await Promise.allSettled([
        getAllPages('/personnel?excludeAdmin=true').then(data => ({ data: { data } })),
        apiClient.get('/transactions')
      ]);

      if (personnelRes.status === 'fulfilled') {
        const rawList = personnelRes.value.data?.data || (Array.isArray(personnelRes.value.data) ? personnelRes.value.data : []);
        // Strictly filter out system and administrative accounts
        const list = rawList.filter((p: any) => {
          const roleName = p.user?.role?.name;
          if (roleName === 'SYSTEM_ADMIN' || roleName === 'HRMO' || roleName === 'AO_II') return false;
          const desig = (p.designation || '').toLowerCase();
          if (desig.includes('system administrator') || desig.includes('hrmo manager') || desig.includes('administrative officer ii')) return false;
          return true;
        });

        const now = new Date();
        setPersonnelList(list.map((p: any) => {
          const hired = p.dateHired ? new Date(p.dateHired) : null;
          let years = hired ? now.getFullYear() - hired.getFullYear() : 0;
          const m = hired ? now.getMonth() - hired.getMonth() : 0;
          if (hired && (m < 0 || (m === 0 && now.getDate() < hired.getDate()))) {
            years--;
          }
          years = Math.max(0, years);
          let required = 0;
          let validated = 0;
          for (const tx of p.transactions || []) {
            if (['REJECTED', 'CANCELLED'].includes(tx.status)) continue;
            const ids = new Set((tx.transactionType?.requirementTemplates || []).map((r: any) => r.id));
            required += ids.size;
            const done = new Set((tx.uploadedDocuments || []).filter((d: any) => d.status === 'VALIDATED' && ids.has(d.requirementTemplateId)).map((d: any) => d.requirementTemplateId));
            validated += done.size;
          }
          const score = required ? Math.round(validated / required * 100) : 0;

          // Find authentic latest promotion
          const promoEntries = (p.careerHistoryEntries || []).filter((e: any) => e.eventType === 'PROMOTION');
          const approvedPromoTx = (p.transactions || []).filter((t: any) =>
            t.status === 'APPROVED' && t.transactionType?.name?.toLowerCase().includes('promotion')
          );
          let latestPromoStr = 'None (Entry Level)';
          if (promoEntries.length > 0) {
            latestPromoStr = new Date(promoEntries[0].eventDate).toLocaleDateString();
          } else if (approvedPromoTx.length > 0) {
            const d = approvedPromoTx[0].approvalDate ? new Date(approvedPromoTx[0].approvalDate) : new Date(approvedPromoTx[0].createdAt);
            latestPromoStr = d.toLocaleDateString();
          }

          const sgNum = p.plantillaItem?.salaryGrade || getAutoSalaryGrade(p.designation);

          return {
            employeeId: p.employeeId || 'EMP-000',
            name: `${p.lastName || ''}, ${p.firstName || ''}`.trim() || 'Personnel',
            position: p.designation || 'Staff',
            category: p.designation?.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching',
            complianceStatus: required > 0 && validated === required ? 'Fully Compliant' : validated > 0 ? 'Partially Compliant' : 'Non-Compliant',
            complianceScore: score,
            yearsInService: hired ? years : null,
            firstAppointmentDate: hired ? hired.toLocaleDateString() : 'Not recorded',
            latestPromotionDate: latestPromoStr,
            latestSalaryGrade: sgNum ? `SG ${sgNum}` : 'Not recorded',
            appointmentDate: p.dateHired || '',
          };
        }));
      }

      if (transRes.status === 'fulfilled') {
        const txList: any[] = transRes.value.data?.data || (Array.isArray(transRes.value.data) ? transRes.value.data : []);
        const pending = txList.filter(t => t.status === 'PENDING' || t.status === 'SUBMITTED' || t.status === 'VALIDATED_AO2').length;
        const returned = txList.filter(t => t.status === 'DEFICIENCY').length;
        const approved = txList.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED').length;
        setPendingTx(pending);
        setReturnedTx(returned);
        setApprovedTx(approved);
      }
    } catch (err) {
      console.error('Failed to load compliance records:', err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time counts for analytics
  const fullCount    = personnelList.filter(p => p.complianceStatus === 'Fully Compliant').length;
  const partialCount = personnelList.filter(p => p.complianceStatus === 'Partially Compliant').length;
  const nonCount     = personnelList.filter(p => p.complianceStatus === 'Non-Compliant').length;
  const totalCount   = personnelList.length;

  const fullPct    = totalCount > 0 ? `${Math.round((fullCount / totalCount) * 100)}%` : '0%';
  const partialPct = totalCount > 0 ? `${Math.round((partialCount / totalCount) * 100)}%` : '0%';
  const nonPct     = totalCount > 0 ? `${Math.round((nonCount / totalCount) * 100)}%` : '0%';

  const filtered = personnelList.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      p.position.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'All' || p.complianceStatus === filterStatus;
    return matchSearch && matchStatus;
  });

  const sortedByService = [...filtered].sort((a, b) => (b.yearsInService ?? -1) - (a.yearsInService ?? -1));

  return (
    <div className="animate-fade-in">
      {/* Topbar */}
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0 }}>HRMO — Compliance & Years of Service</h1>
      </div>

      <div className="page-content">
        {/* Segmented Pill Tab Bar */}
        <div style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          maxWidth: '100%',
          alignItems: 'center',
          background: 'var(--glass-bg-subtle)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: '9999px',
          padding: '4px',
          gap: '4px',
          marginBottom: '24px',
          boxShadow: 'var(--glass-shadow)'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('compliance')}
            aria-pressed={activeTab === 'compliance'}
            style={{
              padding: '8px 20px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'compliance' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'compliance' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'compliance' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="compliance" size={15} color={activeTab === 'compliance' ? 'currentColor' : undefined} />
            <span>Compliance Monitoring</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('years')}
            aria-pressed={activeTab === 'years'}
            style={{
              padding: '8px 20px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'years' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'years' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'years' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="pending" size={15} color={activeTab === 'years' ? 'currentColor' : undefined} />
            <span>Years of Service</span>
          </button>
        </div>

        {/* ── Compliance Monitoring Dashboard ── */}
        {activeTab === 'compliance' && (
          <>
            {/* Structured Glassmorphic Metric Cards */}
            {loading ? (
              <SkeletonStats count={6} columns={6} />
            ) : (
              <div className="compliance-stats-grid">
                {[
                  { label: 'Fully Compliant Personnel',  value: fullCount,    color: '#10B981', icon: 'compliant', pct: fullPct },
                  { label: 'Partially Compliant',         value: partialCount, color: '#F59E0B', icon: 'warning',   pct: partialPct },
                  { label: 'Non-Compliant Personnel',     value: nonCount,     color: '#EF4444', icon: 'error',     pct: nonPct },
                  { label: 'Pending Transactions',        value: pendingTx,    color: '#3F9265', icon: 'pending',   pct: '' },
                  { label: 'Returned Transactions',       value: returnedTx,   color: '#F97316', icon: 'returned',  pct: '' },
                  { label: 'Approved Transactions',       value: approvedTx,   color: '#C79A2E', icon: 'approved',  pct: '' },
                ].map(card => (
                  <div key={card.label} className="compliance-stat-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: '12px',
                        background: `${card.color}18`,
                        border: `1px solid ${card.color}33`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: card.color,
                        flexShrink: 0
                      }}>
                        <AppIcon name={card.icon} size={20} color={card.color} />
                      </div>
                      {card.pct && (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: card.color,
                          background: `${card.color}15`,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          border: `1px solid ${card.color}30`
                        }}>
                          {card.pct}
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{
                        fontSize: '1.9rem',
                        fontWeight: 800,
                        color: 'var(--color-text-primary)',
                        lineHeight: 1.1,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                        marginBottom: 4
                      }}>
                        {card.value.toLocaleString()}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--color-text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        {card.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Filter Bar */}
            <div className="compliance-filter-bar">
              <div className="search-bar" style={{ flex: '1 1 320px', maxWidth: 420 }}>
                <span className="search-icon">
                  <AppIcon name="search" size={15} color="var(--color-text-muted)" />
                </span>
                <input
                  aria-label="Search personnel by name or employee ID"
                  type="text"
                  className="search-input"
                  style={{ paddingLeft: '44px' }}
                  placeholder="Search personnel by name or employee ID…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="tq-search-clear"
                    onClick={() => setSearch('')}
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {['All', 'Fully Compliant', 'Partially Compliant', 'Non-Compliant'].map(s => {
                  const isActive = filterStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilterStatus(s)}
                      className={`tq-filter-pill ${isActive ? 'is-active' : ''}`}
                    >
                      <span>{s}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Personnel Compliance Table */}
            {loading ? (
              <SkeletonTable rows={6} columns={5} />
            ) : filtered.length === 0 ? (
              search ? (
                <SmartEmptyState
                  type="no-search-results"
                  query={search}
                  primaryAction={{
                    label: 'Clear Search',
                    onClick: () => setSearch(''),
                    icon: 'search',
                  }}
                  secondaryAction={filterStatus !== 'All' ? {
                    label: 'Reset Status Filter',
                    onClick: () => setFilterStatus('All'),
                  } : undefined}
                />
              ) : filterStatus !== 'All' ? (
                <SmartEmptyState
                  type="no-filter-match"
                  category={filterStatus}
                  primaryAction={{
                    label: 'Show All Personnel',
                    onClick: () => setFilterStatus('All'),
                  }}
                />
              ) : (
                <SmartEmptyState
                  type="no-records"
                  title="No Personnel Records Found"
                  description="There are currently no active personnel records registered in the compliance ledger."
                />
              )
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name & Position</th>
                      <th>Category</th>
                      <th>Compliance Score</th>
                      <th>Compliance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const colorInfo = STATUS_COLOR[p.complianceStatus] || STATUS_COLOR['Partially Compliant'];
                      return (
                        <tr key={p.employeeId}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {p.employeeId}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.name}</div>
                            <div className="text-xs text-muted">{p.position}</div>
                          </td>
                          <td>
                            <span className={p.category === 'Teaching' ? 'badge badge-info' : 'badge badge-secondary'}>
                              {p.category}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden', minWidth: 90 }}>
                                <div style={{
                                  width: `${p.complianceScore}%`,
                                  height: '100%',
                                  background: colorInfo.border,
                                  borderRadius: 3,
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                              <span style={{ fontWeight: 800, fontSize: 12, color: colorInfo.border, minWidth: 38 }}>
                                {p.complianceScore}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{
                              background: colorInfo.bg,
                              color: colorInfo.text,
                              border: `1px solid ${colorInfo.border}`,
                              padding: '3px 10px',
                              borderRadius: 9999,
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colorInfo.border }} />
                              {p.complianceStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Years of Service Monitoring ── */}
        {activeTab === 'years' && (
          <>
            {/* Regulatory Info Card */}
            <div className="card mb-4" style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)',
              borderLeft: '4px solid var(--color-primary)',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--glass-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: '10px', background: 'rgba(215, 248, 74, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AppIcon name="compliance" size={20} color="var(--color-primary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    Service Computation Engine Active
                  </div>
                  <div className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
                    The system computes authoritative tenure using <strong>Appointment Date</strong>, <strong>Personal Data Sheet (PDS)</strong>, <strong>Work Experience Sheet (WES)</strong>, and certified <strong>Service Records</strong>.<br />
                    Outputs: Accumulated Years in Service &bull; Current Position &bull; Original Appointment Date &bull; Latest Promotion Date &bull; Career Timeline visualizer.
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Bar for Years of Service */}
            <div className="compliance-filter-bar">
              <div className="search-bar" style={{ flex: '1 1 320px', maxWidth: 420 }}>
                <span className="search-icon">
                  <AppIcon name="search" size={15} color="var(--color-text-muted)" />
                </span>
                <input
                  aria-label="Search personnel by name or employee ID"
                  type="text"
                  className="search-input"
                  style={{ paddingLeft: '44px' }}
                  placeholder="Search personnel by name or employee ID…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="tq-search-clear"
                    onClick={() => setSearch('')}
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                Showing <strong style={{ color: 'var(--color-text-primary)' }}>{sortedByService.length}</strong> Personnel sorted by tenure
              </div>
            </div>

            {/* Years of Service Table */}
            {loading ? (
              <SkeletonTable rows={6} columns={7} />
            ) : sortedByService.length === 0 ? (
              search ? (
                <SmartEmptyState
                  type="no-search-results"
                  query={search}
                  primaryAction={{
                    label: 'Clear Search',
                    onClick: () => setSearch(''),
                    icon: 'search',
                  }}
                />
              ) : (
                <SmartEmptyState
                  type="no-records"
                  title="No Tenure Records"
                  description="No personnel records are available for service timeline computation."
                />
              )
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name & Position</th>
                      <th>Years in Service</th>
                      <th>First Appointment Date</th>
                      <th>Latest Promotion Date</th>
                      <th>Latest Salary Grade</th>
                      <th>Career Timeline (40y Scale)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByService.map(p => (
                      <tr key={p.employeeId}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {p.employeeId}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.name}</div>
                          <div className="text-xs text-muted">{p.position}</div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>
                            {p.yearsInService == null ? 'Not recorded' : `${p.yearsInService} ${p.yearsInService === 1 ? 'yr' : 'yrs'}`}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{p.firstAppointmentDate}</td>
                        <td style={{ fontSize: 13, color: p.latestPromotionDate.includes('None') ? 'var(--color-text-muted)' : 'var(--color-primary)', fontWeight: p.latestPromotionDate.includes('None') ? 400 : 700 }}>
                          {p.latestPromotionDate}
                        </td>
                        <td>
                          <span className="badge badge-secondary" style={{ fontWeight: 800 }}>{p.latestSalaryGrade}</span>
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ position: 'relative', height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: `${p.yearsInService == null ? 0 : Math.min(Math.max((p.yearsInService / 40) * 100, 2), 100)}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #10B981 0%, #3F9265 100%)',
                              borderRadius: 4,
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
