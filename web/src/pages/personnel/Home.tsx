import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';

type TransactionItem = {
  id: number;
  transactionType?: { name: string };
  status: string;
  createdAt: string;
  complianceScore?: number;
};

type PromotionCycleItem = {
  id: number;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  applicantCount?: number;
  hasApplied?: boolean;
};

export const PersonnelHome: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [openCycles, setOpenCycles] = useState<PromotionCycleItem[]>([]);
  const [submittingCycleId, setSubmittingCycleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Available Plantilla Items (Open for Ranking)
  const [availablePlantillaItems, setAvailablePlantillaItems] = useState<any[]>([]);
  const [showPlantillaDirectory, setShowPlantillaDirectory] = useState(false);
  const [plantillaSearch, setPlantillaSearch] = useState('');

  const fetchMyTransactions = useCallback(async () => {
    try {
      const res = await apiClient.get('/transactions/my-transactions');
      setTransactions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load active transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOpenCycles = useCallback(async () => {
    try {
      const res = await apiClient.get('/promotions/cycles?status=ACTIVE,PLANNING');
      const cycles = res.data?.data || [];
      setOpenCycles(cycles);
    } catch (err) {
      console.error('Failed to load open promotion cycles:', err);
    }
  }, []);

  const fetchAvailablePlantilla = useCallback(async () => {
    try {
      const res = await apiClient.get('/plantilla/available');
      setAvailablePlantillaItems(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load available plantilla items:', err);
    }
  }, []);

  useRealtimeTransactions(() => {
    fetchMyTransactions();
    fetchOpenCycles();
    fetchAvailablePlantilla();
  });

  useEffect(() => {
    fetchMyTransactions();
    fetchOpenCycles();
    fetchAvailablePlantilla();
  }, [fetchMyTransactions, fetchOpenCycles, fetchAvailablePlantilla, user?.id]);

  const handleApplyForCycle = async (cycle: PromotionCycleItem) => {
    setSubmittingCycleId(cycle.id);
    try {
      await apiClient.post(`/promotions/cycles/${cycle.id}/apply`);
      addToast(`Application for "${cycle.name}" submitted successfully! Your dossier is entered into evaluation.`, 'SUCCESS');
      fetchOpenCycles();
      fetchMyTransactions();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to submit application for position.', 'ERROR');
    } finally {
      setSubmittingCycleId(null);
    }
  };

  const roleLabel =
    user?.role === 'TEACHING_PERSONNEL' ? 'Teaching Personnel' :
    user?.role === 'NON_TEACHING_PERSONNEL' ? 'Non-Teaching Personnel' : 'Personnel';

  const formattedToday = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  const activeTransactions = transactions.filter(
    t => t.status !== 'APPROVED' && t.status !== 'COMPLETED'
  );

  const latestApproved = transactions.find(
    t => t.status === 'APPROVED' || t.status === 'COMPLETED'
  );

  const alertsCount = transactions.filter(
    t => t.status === 'DEFICIENCY' || t.status.includes('RETURNED')
  ).length;

  const userFullName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim()
    : 'Personnel Member';

  return (
    <div className="dashboard-editorial-root animate-fade-in">
      
      {/* ─── 1. TOP WORKSPACE HEADER BAR ───────────────────────────── */}
      <div className="workspace-top-bar">
        {/* Right: Date Badge */}
        <div className="top-controls-group">
          <div className="date-chip-pill">
            <span className="live-indicator-dot" />
            <span>Today, {formattedToday}</span>
          </div>
        </div>
      </div>

      {/* ─── 2. EDITORIAL PAGE HEADING ─────────────────────────────── */}
      <div className="editorial-heading-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h1 className="editorial-main-title" style={{ margin: 0 }}>
            Welcome back, {userFullName}!
          </h1>
          {roleLabel && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 9999,
                background: 'rgba(215, 248, 74, 0.15)',
                color: 'var(--color-primary)',
                border: '1px solid var(--glass-border-subtle)',
                letterSpacing: '0.02em',
              }}
            >
              {roleLabel}
            </span>
          )}
        </div>
        <p className="editorial-sub-title">
          Manage your digital 201 records, submission compliance, and DepEd career transactions.
        </p>
      </div>

      {/* ─── 3. METRICS ROW (Strict Database Numbers & Editorial Styling) ─── */}
      <div className="metrics-grid-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {/* Metric 1: Active Transactions */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">ACTIVE TRANSACTIONS</span>
            <span className="metric-lime-pill">{activeTransactions.length > 0 ? 'PROCESSING' : 'CLEAR'}</span>
          </div>
          <div className="metric-value-num">{loading ? '...' : activeTransactions.length}</div>
          <div className="metric-footer-note">Pending Document Verification</div>
          <div className="metric-bar-visualizer">
            <div className="bar-fill fill-lime" style={{ width: activeTransactions.length > 0 ? '100%' : '0%' }} />
          </div>
        </div>

        {/* Metric 2: 201 Master File Status */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">201 MASTER FILE</span>
            <span className="metric-lime-pill">VERIFIED</span>
          </div>
          <div className="metric-value-num">100%</div>
          <div className="metric-footer-note">DepEd CS Form 212 & WES Verified</div>
          <div className="metric-dot-matrix">
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
          </div>
        </div>

        {/* Metric 3: Compliance Alerts */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">COMPLIANCE ALERTS</span>
            <span className={alertsCount > 0 ? 'metric-lime-pill' : 'metric-gray-pill'} style={alertsCount > 0 ? { background: '#ef4444', color: '#fff' } : {}}>
              {alertsCount > 0 ? 'ACTION REQ' : 'OPTIMAL'}
            </span>
          </div>
          <div className="metric-value-num" style={{ color: alertsCount > 0 ? '#ef4444' : 'inherit' }}>
            {alertsCount}
          </div>
          <div className="metric-footer-note">{alertsCount > 0 ? 'Document deficiencies found' : 'Zero compliance deficiencies'}</div>
          <div className="metric-bar-visualizer">
            <div className="bar-fill" style={{ width: alertsCount > 0 ? '100%' : '0%', background: alertsCount > 0 ? '#ef4444' : '#D7F84A' }} />
          </div>
        </div>

        {/* Metric 4: Open Vacancies */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">CAREER VACANCIES</span>
            <span className="metric-lavender-pill">{openCycles.length} OPEN</span>
          </div>
          <div className="metric-value-num">{openCycles.length}</div>
          <div className="metric-footer-note">DepEd Promotion & Reclass Cycles</div>
          <div className="metric-dot-matrix">
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </div>

      {/* ─── 4. ASYMMETRIC MAIN GRID (2fr / 1fr) ────────────────────── */}
      <div className="asymmetric-main-grid">
        
        {/* LEFT COLUMN: Open Vacancies & Active Transactions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Section 1: Active 201 Transactions */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Active 201 Transactions</h3>
                <div className="card-heading-sub">Live submission tracking and verification stages</div>
              </div>
              <Link to="/personnel/transactions" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                View All Transactions →
              </Link>
            </div>

            {activeTransactions.length === 0 ? (
              transactions.length > 0 ? (
                /* All Filings Up to Date (with recent approved reference) */
                <div style={{
                  padding: '26px 24px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 20,
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-success)',
                        flexShrink: 0
                      }}>
                        <AppIcon name="checklist" size={24} color="var(--color-success)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                          All 201 Applications Up to Date
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          No pending submissions or bottlenecks. Your 201 records are verified and archived.
                        </div>
                      </div>
                    </div>
                    <Link
                      to="/personnel/new-transaction"
                      className="btn btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 999
                      }}
                    >
                      <AppIcon name="new-transaction" size={14} /> Start New Filing
                    </Link>
                  </div>

                  {/* Most Recent Completed Record Snapshot */}
                  {latestApproved && (
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: 14,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>
                          TRX-{latestApproved.id}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {latestApproved.transactionType?.name || 'Promotion / Appointment'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="badge badge-success" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999 }}>
                          APPROVED BY HRMO
                        </span>
                        <Link
                          to={`/personnel/checklist?txId=${latestApproved.id}`}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          View Dossier →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Truly Empty 201 State */
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '44px 28px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 20,
                  border: '1px dashed var(--color-border)',
                }}>
                  <div style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: 'var(--color-primary)'
                  }}>
                    <AppIcon name="transactions" size={28} color="var(--color-primary)" />
                  </div>
                  
                  <div style={{
                    fontWeight: 800,
                    fontSize: 17,
                    marginBottom: 8,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em'
                  }}>
                    No Active 201 Transactions
                  </div>
                  
                  <p style={{
                    maxWidth: 440,
                    margin: '0 auto 20px auto',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--color-text-secondary)'
                  }}>
                    You currently have no pending or in-review document submissions. Start a new filing to submit promotion, newly hired appointment, or 201 records to the Division Office.
                  </p>

                  {/* 3-Step Guided Workflow Pills */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 24,
                    maxWidth: 580
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>1</span>
                      Select Transaction Type
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>2</span>
                      Upload PDF Checklist
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>3</span>
                      AO II & HRMO Live Evaluation
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Link
                      to="/personnel/new-transaction"
                      className="btn btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                        padding: '10px 20px',
                        fontWeight: 700,
                        borderRadius: 999
                      }}
                    >
                      <AppIcon name="new-transaction" size={16} /> Start New 201 Application
                    </Link>
                    <Link
                      to="/personnel/transactions"
                      className="btn btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        textDecoration: 'none',
                        padding: '10px 18px',
                        borderRadius: 999
                      }}
                    >
                      View Filing Archive
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTransactions.map(tx => (
                  <Link key={tx.id} to={`/personnel/checklist?txId=${tx.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div className="card hover-lift" style={{ background: 'var(--color-bg-secondary)', margin: 0, padding: 18, borderRadius: 16, border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {tx.transactionType?.name || 'HR Transaction'}
                          </span>
                          <div className="text-xs text-muted mt-1 font-mono">Ref: TRX-{tx.id}</div>
                        </div>
                        <StatusBadge status={tx.status} />
                      </div>
                      <div className="text-xs text-muted">
                        Submitted: {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span className="text-muted">Document Compliance Score</span>
                          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {tx.complianceScore !== undefined ? `${tx.complianceScore}%` : 'In Progress'}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 999 }}>
                          <div className="progress-fill" style={{ width: `${tx.complianceScore || 50}%`, background: 'var(--color-primary)' }} />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Open Promotion & Reclassification Vacancies */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Open Promotion & Reclassification Vacancies</h3>
                <div className="card-heading-sub">DepEd Order No. 7, s. 2023 & DO 19/24, s. 2025 Career Tracks</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowPlantillaDirectory(true)}
                  className="btn btn-secondary btn-xs"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    border: '1px solid var(--color-border)',
                    fontWeight: 700,
                    fontSize: 11,
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <AppIcon name="employment" size={13} color="var(--color-primary)" />
                  Item Availability Directory ({availablePlantillaItems.length} Vacancies)
                </button>
                <span className="badge badge-success" style={{ fontSize: 11, padding: '4px 10px' }}>Live Positions</span>
              </div>
            </div>

            {openCycles.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '40px 24px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 20,
                border: '1px dashed var(--color-border)'
              }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                  color: 'var(--color-text-muted)'
                }}>
                  <AppIcon name="checklist" size={26} color="var(--color-text-muted)" />
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: 'var(--color-text-primary)' }}>
                  No Active Vacancies Right Now
                </div>
                <div style={{ maxWidth: 420, margin: '0 auto', fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  All promotion and reclassification cycles are currently closed or in evaluation. Check back soon for upcoming DepEd cycles!
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {openCycles.map(cycle => {
                  const isActive = cycle.status === 'ACTIVE';
                  const rules = (cycle as any).rulesConfigurationJson || {};
                  return (
                    <div
                      key={cycle.id}
                      className="card hover-lift"
                      style={{
                        padding: 18,
                        borderRadius: 16,
                        background: 'var(--color-bg-secondary)',
                        borderLeft: `4px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        margin: 0
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                            {cycle.name}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted" style={{ flexWrap: 'wrap' }}>
                            <span>{isActive ? 'Deadline:' : 'Starts:'} <strong>{new Date(isActive ? cycle.endDate : cycle.startDate).toLocaleDateString()}</strong></span>
                            <span>·</span>
                            <span>Applicants: <strong>{cycle.applicantCount || 0}</strong></span>
                            {rules.plantillaItemNumber && (
                              <>
                                <span>·</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>
                                  Plantilla: {rules.plantillaItemNumber}
                                </span>
                              </>
                            )}
                            {rules.school && rules.school !== 'All Schools in District' && (
                              <>
                                <span>·</span>
                                <span>Station: <strong>{rules.school}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge" style={{ background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: isActive ? '#10b981' : '#d97706', fontSize: 10, fontWeight: 700 }}>
                            {isActive ? 'OPEN NOW' : 'UPCOMING'}
                          </span>
                          <span className="badge badge-validated" style={{ fontSize: 10 }}>
                            {cycle.type}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)', flexWrap: 'wrap', gap: 8 }}>
                        <span className="text-xs text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AppIcon name="compliance" size={13} color="var(--color-text-muted)" /> DepEd DO 7 s.2023 / DO 19 s.2025 Standard
                        </span>
                        {cycle.hasApplied ? (
                          <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="approved" size={12} /> Application Submitted
                          </span>
                        ) : isActive ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={submittingCycleId === cycle.id}
                            onClick={() => handleApplyForCycle(cycle)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <AppIcon name="promotions" size={13} />
                            {submittingCycleId === cycle.id ? 'Applying...' : 'Apply for Position'}
                          </button>
                        ) : (
                          <span className="badge badge-secondary" style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600 }}>
                            Opening on {new Date(cycle.startDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Quick Actions & 201 File Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Quick Actions Bento Card */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Quick Actions</h3>
                <div className="card-heading-sub">Frequently used personnel services</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Link to="/personnel/new-transaction" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(56, 139, 253, 0.14)', color: '#388bfd' }}>
                  <AppIcon name="new-transaction" size={22} />
                </div>
                <span className="quick-action-tile-title">New Application</span>
                <span className="quick-action-sub">Start 201 filing</span>
              </Link>

              <Link to="/personnel/notifications" className="quick-action-tile" style={{ position: 'relative' }}>
                <div className="quick-action-tile-icon" style={{ background: 'rgba(139, 92, 246, 0.14)', color: '#8b5cf6' }}>
                  <AppIcon name="notifications" size={22} />
                </div>
                <span className="quick-action-tile-title">Notifications</span>
                <span className="quick-action-sub">Check status alerts</span>
                {alertsCount > 0 && (
                  <span className="badge badge-warning" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, padding: '2px 7px', borderRadius: 999 }}>
                    {alertsCount}
                  </span>
                )}
              </Link>

              <Link to="/personnel/profile-completion" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(234, 179, 8, 0.14)', color: '#eab308' }}>
                  <AppIcon name="personal" size={22} />
                </div>
                <span className="quick-action-tile-title">My 201 File</span>
                <span className="quick-action-sub">Update PDS & WES</span>
              </Link>

              <Link to="/personnel/profile" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(16, 185, 129, 0.14)', color: '#10b981' }}>
                  <AppIcon name="repository" size={22} />
                </div>
                <span className="quick-action-tile-title">Service Record</span>
                <span className="quick-action-sub">View DepEd history</span>
              </Link>
            </div>
          </div>

          {/* Personnel 201 Dossier Summary Card */}
          <div className="table-card-large" style={{ background: 'var(--color-bg-card)' }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">201 Personnel Dossier</h3>
                <div className="card-heading-sub">Master employee profile & service data</div>
              </div>
              <AppIcon name="profile" size={20} color="var(--color-primary)" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">Employee ID:</span>
                <strong className="font-mono" style={{ color: 'var(--color-primary)' }}>
                  {user?.personnelId || (user?.id ? `EMP-${user.id}` : 'CSD-KOR-2026')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">Personnel Category:</span>
                <span className="badge badge-info" style={{ fontSize: 10 }}>{roleLabel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">PRC Verification:</span>
                <span style={{ color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="approved" size={13} color="#10b981" /> Verified (LET)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="text-muted">Division Office:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>SDO Koronadal City</strong>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <Link to="/personnel/profile-completion" className="btn btn-secondary btn-sm btn-full" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <AppIcon name="edit" size={14} /> Update 201 Dossier File
              </Link>
            </div>
          </div>

        </div>

      </div>

      {/* ─── 5. ITEM AVAILABILITY / PLANTILLA DIRECTORY MODAL ─── */}
      {showPlantillaDirectory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPlantillaDirectory(false);
          }}
        >
          <div
            className="soft-card"
            style={{
              width: '100%',
              maxWidth: 920,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(215, 248, 74, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                    }}
                  >
                    <AppIcon name="employment" size={20} color="var(--color-primary)" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      DepEd Plantilla Directory & Item Availability
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      SDO Koronadal City Official Registry · Open Plantilla Positions Available for Ranking & Applications
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlantillaDirectory(false)}
                className="btn btn-secondary btn-xs"
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, alignItems: 'center', background: 'var(--color-bg-primary)' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search by position title, plantilla item #, school station, district..."
                  value={plantillaSearch}
                  onChange={(e) => setPlantillaSearch(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '9px 14px' }}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                Found <strong>{availablePlantillaItems.filter(item => {
                  if (!plantillaSearch.trim()) return true;
                  const q = plantillaSearch.toLowerCase();
                  return (
                    item.itemNumber?.toLowerCase().includes(q) ||
                    item.positionTitle?.toLowerCase().includes(q) ||
                    item.stationOrSchool?.toLowerCase().includes(q) ||
                    item.district?.toLowerCase().includes(q) ||
                    item.track?.toLowerCase().includes(q)
                  );
                }).length}</strong> vacant item(s)
              </div>
            </div>

            {/* Modal Body / Items List */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {availablePlantillaItems.filter(item => {
                if (!plantillaSearch.trim()) return true;
                const q = plantillaSearch.toLowerCase();
                return (
                  item.itemNumber?.toLowerCase().includes(q) ||
                  item.positionTitle?.toLowerCase().includes(q) ||
                  item.stationOrSchool?.toLowerCase().includes(q) ||
                  item.district?.toLowerCase().includes(q) ||
                  item.track?.toLowerCase().includes(q)
                );
              }).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                  <AppIcon name="compliance" size={32} color="var(--color-text-muted)" />
                  <p style={{ marginTop: 12, fontWeight: 600 }}>No vacant plantilla items found matching your filter.</p>
                </div>
              ) : (
                availablePlantillaItems.filter(item => {
                  if (!plantillaSearch.trim()) return true;
                  const q = plantillaSearch.toLowerCase();
                  return (
                    item.itemNumber?.toLowerCase().includes(q) ||
                    item.positionTitle?.toLowerCase().includes(q) ||
                    item.stationOrSchool?.toLowerCase().includes(q) ||
                    item.district?.toLowerCase().includes(q) ||
                    item.track?.toLowerCase().includes(q)
                  );
                }).map(item => {
                  const hasCycle = !!item.promotionCycle;
                  const cycle = item.promotionCycle;
                  const isCycleActive = cycle && cycle.status === 'ACTIVE';
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 16,
                        borderRadius: 14,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 260 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-text-primary)' }}>
                            {item.positionTitle}
                          </span>
                          <span className="badge badge-info" style={{ fontSize: 10 }}>
                            SG {item.salaryGrade}
                          </span>
                          <span className="badge badge-secondary" style={{ fontSize: 10 }}>
                            {item.track} Track
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>
                            {item.itemNumber}
                          </span>
                          <span>·</span>
                          <span>Station: <strong>{item.stationOrSchool || 'SDO Proper'}</strong></span>
                          <span>·</span>
                          <span>{item.district || 'Division-Wide'}</span>
                        </div>
                        {hasCycle && (
                          <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--color-primary)' }}>
                            <AppIcon name="promotions" size={13} color="var(--color-primary)" />
                            <span>Linked Cycle: <strong>{cycle.name}</strong> ({cycle.status})</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hasCycle && cycle.hasApplied ? (
                          <span className="badge badge-success" style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="approved" size={13} /> Applied
                          </span>
                        ) : hasCycle && isCycleActive ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={submittingCycleId === cycle.id}
                            onClick={() => {
                              handleApplyForCycle(cycle);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontWeight: 700 }}
                          >
                            <AppIcon name="promotions" size={13} />
                            {submittingCycleId === cycle.id ? 'Submitting...' : 'Apply for Position'}
                          </button>
                        ) : hasCycle ? (
                          <span className="badge badge-warning" style={{ fontSize: 11, padding: '6px 12px' }}>
                            Starts {new Date(cycle.startDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: 11, padding: '6px 12px', color: 'var(--color-text-muted)' }}>
                            Vacant (Cycle Pending)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                Regulated under Civil Service Commission (CSC) & DepEd Order No. 7, s. 2023 Guidelines
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPlantillaDirectory(false)}
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
