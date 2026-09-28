import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import './audit-workspace.css';

export interface AuditItem {
  id: string | number;
  timestamp: string;
  displayTimestamp?: string;
  user: string;
  role: string;
  actorRoleLabel?: string;
  actorStation?: string | null;
  category: string;
  severity?: string;
  outcome?: string;
  action: string;
  actionLabel?: string;
  targetType?: string;
  targetId?: number;
  targetReference?: string;
  summary?: string;
  details: any;
  status: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  clientSource?: string;
  requestId?: string;
  failureReason?: string | null;
  beforeValue?: any;
  afterValue?: any;
  recordHash?: string | null;
  previousHash?: string | null;
}

interface SecurityFindingItem {
  id: string;
  title: string;
  severity: string;
  category: string;
  count: number;
  description: string;
  recommendation: string;
}

interface SummaryMetrics {
  total: number;
  criticalCount: number;
  highCount: number;
  warningCount: number;
  failedCount: number;
  deniedCount: number;
  logins24h: number;
  failedLogins24h: number;
  accessDenied24h: number;
  lockedAccounts: number;
  privilegedChanges24h: number;
  exports24h: number;
}

const CATEGORIES = [
  { id: 'All', label: 'All Activities', compactLabel: 'All' },
  { id: 'Authentication', label: 'Authentication', compactLabel: 'Logins' },
  { id: 'Account lifecycle', label: 'Account Lifecycle', compactLabel: 'Accounts' },
  { id: 'Roles and permissions', label: 'Roles & Security', compactLabel: 'Roles' },
  { id: 'Sensitive record access', label: 'Sensitive Records', compactLabel: 'Access' },
  { id: 'Documents', label: 'Document Operations', compactLabel: 'Documents' },
  { id: 'Transactions', label: 'Transactions', compactLabel: 'Transactions' },
  { id: 'Personnel records', label: 'Personnel 201 Files', compactLabel: '201 Files' },
  { id: 'Promotions and ranking', label: 'Promotions & CAR', compactLabel: 'Promotions' },
  { id: 'Reports and exports', label: 'Reports & Exports', compactLabel: 'Exports' },
  { id: 'System configuration', label: 'System Operations', compactLabel: 'System' },
];

const SEVERITY_LEVELS = ['All', 'CRITICAL', 'HIGH', 'WARNING', 'NOTICE', 'INFO'];
const OUTCOME_LEVELS = ['All', 'SUCCESS', 'FAILURE', 'DENIED'];
const ROLE_OPTIONS = [
  { id: 'All', label: 'All Roles' },
  { id: 'SYSTEM_ADMIN', label: 'System Administrator' },
  { id: 'HRMO', label: 'HRMO' },
  { id: 'AO_II', label: 'Administrative Officer II' },
  { id: 'TEACHING_PERSONNEL', label: 'Teaching Personnel' },
  { id: 'NON_TEACHING_PERSONNEL', label: 'Non-Teaching Personnel' },
];

export const AuditLog: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuthContext();

  // State required by test suite (web/tests/gap-fixes.cjs:83)
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('All');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('All');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [dateRangePreset, setDateRangePreset] = useState<string>('all');

  // Expanded row details
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  // Summary Metrics & Findings
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [findings, setFindings] = useState<SecurityFindingItem[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(new Date().toLocaleTimeString('en-US'));

  // Determine date boundaries from preset
  const dateParams = useMemo(() => {
    const now = new Date();
    if (dateRangePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    return {};
  }, [dateRangePreset]);

  // Load audit records from server
  const loadRecords = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const params: Record<string, any> = {
        page,
        limit,
        ...dateParams,
      };

      if (search.trim()) params.search = search.trim();
      if (activeCategory !== 'All') params.category = activeCategory;
      if (selectedSeverity !== 'All') params.severity = selectedSeverity;
      if (selectedOutcome !== 'All') params.outcome = selectedOutcome;
      if (selectedRole !== 'All') params.role = selectedRole;

      const [res, summaryRes] = await Promise.all([
        apiClient.get('/audit-logs', { params }),
        apiClient.get('/audit-logs/summary').catch(() => null),
      ]);

      const rawLogs = res.data?.data;
      const normalized: AuditItem[] = (Array.isArray(rawLogs) ? rawLogs : []).map((l: any, idx: number) => ({
        id: l.id ?? `log-${idx}`,
        timestamp: l.timestamp ? new Date(l.timestamp).toLocaleString('en-US') : '—',
        displayTimestamp: l.displayTimestamp || (l.timestamp ? new Date(l.timestamp).toLocaleString('en-US') : '—'),
        user: l.userEmail || l.actorEmail || '—',
        role: l.userRole || l.actorRole || '—',
        actorRoleLabel: l.actorRoleLabel || l.userRole || '—',
        actorStation: l.actorStation || null,
        category: l.category || 'System configuration',
        severity: l.severity || (l.status === 'FAILED' ? 'WARNING' : 'INFO'),
        outcome: l.outcome || (l.status === 'FAILED' ? 'FAILURE' : 'SUCCESS'),
        action: l.action || '—',
        actionLabel: l.actionLabel || l.action || '—',
        targetType: l.targetType || l.resourceType || 'General',
        targetId: l.targetId || l.resourceId || 0,
        targetReference: l.targetReference || (l.resourceId ? `${l.resourceType || 'Record'} #${l.resourceId}` : 'General'),
        summary: l.summary || '',
        details: l.details == null ? null : typeof l.details === 'object' ? l.details : String(l.details),
        status: l.status || (l.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED'),
        ipAddress: l.ipAddress || null,
        userAgent: l.userAgent || null,
        clientSource: l.clientSource || 'web',
        requestId: l.requestId || null,
        failureReason: l.failureReason || null,
        beforeValue: l.beforeValue || null,
        afterValue: l.afterValue || null,
        recordHash: l.recordHash || null,
        previousHash: l.previousHash || null,
      }));

      setLogs(normalized);
      setTotalCount(res.data?.pagination?.total || normalized.length);

      if (summaryRes?.data?.data) {
        setSummary(summaryRes.data.data);
      }
      setLastRefreshedAt(new Date().toLocaleTimeString('en-US'));
    } catch (err: any) {
      setLogs([]);
      setLoadError(err?.response?.data?.message || 'The audit trail could not be loaded. Audit trail unavailable. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, limit, search, activeCategory, selectedSeverity, selectedOutcome, selectedRole, dateParams]);

  // Load security findings for administrative roles
  useEffect(() => {
    if (user?.role === 'SYSTEM_ADMIN' || user?.role === 'HRMO') {
      apiClient.get('/audit-logs/security-findings')
        .then(res => setFindings(res.data?.data || []))
        .catch(() => setFindings([]));
    }
  }, [user]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // Database-backed CSV Export
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = { ...dateParams };
      if (search.trim()) params.search = search.trim();
      if (activeCategory !== 'All') params.category = activeCategory;
      if (selectedSeverity !== 'All') params.severity = selectedSeverity;
      if (selectedOutcome !== 'All') params.outcome = selectedOutcome;
      if (selectedRole !== 'All') params.role = selectedRole;

      const response = await apiClient.get('/audit-logs/export/csv', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Digital201_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      const checksum = response.headers['x-content-checksum'];
      addToast(`Audit trail exported successfully! ${checksum ? `Checksum: ${checksum.slice(0, 12)}...` : ''}`, 'SUCCESS');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Failed to export audit register. Please try again.', 'ERROR');
    } finally {
      setExporting(false);
    }
  };

  // Database-backed JSON Export
  const handleExportJson = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = { ...dateParams };
      if (search.trim()) params.search = search.trim();
      if (activeCategory !== 'All') params.category = activeCategory;
      if (selectedSeverity !== 'All') params.severity = selectedSeverity;
      if (selectedOutcome !== 'All') params.outcome = selectedOutcome;
      if (selectedRole !== 'All') params.role = selectedRole;

      const response = await apiClient.get('/audit-logs/export/json', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/json;charset=utf-8;' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Digital201_Audit_Trail_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      addToast('Forensic JSON audit log exported successfully!', 'SUCCESS');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Failed to export JSON audit register.', 'ERROR');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = Boolean(
    search ||
    activeCategory !== 'All' ||
    selectedSeverity !== 'All' ||
    selectedOutcome !== 'All' ||
    selectedRole !== 'All' ||
    dateRangePreset !== 'all'
  );

  const resetFilters = () => {
    setSearch('');
    setActiveCategory('All');
    setSelectedSeverity('All');
    setSelectedOutcome('All');
    setSelectedRole('All');
    setDateRangePreset('all');
    setPage(1);
  };

  const moreCount = [selectedSeverity, selectedOutcome, selectedRole].filter(v => v !== 'All').length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="animate-fade-in audit-workspace">
      {/* Screen Reader Announcement */}
      <div className="sr-only" aria-live="polite" role="status">
        {loading ? 'Loading audit records…' : `${logs.length} audit records displayed. Total records: ${totalCount}.`}
      </div>

      {/* Header: title, one line of context, two actions */}
      <header className="aw-head">
        <div>
          <h1 className="aw-title">Audit trail</h1>
          <p className="aw-sub">Every sign-in, change and document action, newest first. Philippine time · updated {lastRefreshedAt}.</p>
        </div>
        <div className="aw-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRecords(true)} disabled={refreshing || loading} aria-label="Refresh audit records">
            <AppIcon name="refresh" size={15} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleExportCsv} disabled={exporting || loading || logs.length === 0} aria-label="Export audit trail as CSV">
            <AppIcon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button type="button" className="aw-link" onClick={handleExportJson} disabled={exporting || loading || logs.length === 0} aria-label="Export forensic JSON">JSON</button>
        </div>
      </header>

      {/* Last 24 hours at a glance, colored only when a number needs a look */}
      {summary && (
        <section className="aw-stats" aria-label="Last 24 hours">
          {[
            { label: 'Sign-ins', value: summary.logins24h, tone: '' },
            { label: 'Failed sign-ins', value: summary.failedLogins24h, tone: summary.failedLogins24h > 0 ? 'warn' : '' },
            { label: 'Access denied', value: summary.accessDenied24h, tone: summary.accessDenied24h > 0 ? 'bad' : '' },
            { label: 'High-risk events', value: summary.criticalCount + summary.highCount, tone: summary.criticalCount + summary.highCount > 0 ? 'bad' : '' },
            { label: 'Locked accounts', value: summary.lockedAccounts, tone: summary.lockedAccounts > 0 ? 'bad' : '' },
          ].map(st => (
            <div key={st.label} className={`aw-stat${st.tone ? ` is-${st.tone}` : ''}`}>
              <strong>{st.value}</strong><span>{st.label}</span>
            </div>
          ))}
          <span className="aw-stats-note">Last 24 hours</span>
        </section>
      )}

      {/* Findings: one line each; the suggested fix opens on click */}
      {findings.length > 0 && (
        <section className="aw-findings" aria-label="Worth a look">
          <h2>Worth a look ({findings.length})</h2>
          <ul>
            {findings.map(f => (
              <li key={f.id}>
                <details>
                  <summary>
                    <span className={`aw-dot sev-${f.severity.toLowerCase()}`} title={f.severity} />
                    <strong>{f.title}</strong>
                    <span className="aw-finding-desc">{f.description}</span>
                  </summary>
                  <p>{f.recommendation}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search and filters on one row; rarely used filters fold away */}
      <section className="aw-filters" aria-label="Search and filter">
        <div className="audit-ws-search aw-search">
          <span className="audit-ws-search-icon"><AppIcon name="search" size={16} /></span>
          <input
            type="text"
            className="audit-ws-search-input"
            placeholder="Search name, email, action or IP…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search audit records"
          />
          {search && (
            <button type="button" className="audit-ws-search-clear" onClick={() => { setSearch(''); setPage(1); }} aria-label="Clear search input">×</button>
          )}
        </div>
        <select className="audit-ws-select" value={activeCategory} onChange={e => { setActiveCategory(e.target.value); setPage(1); }} aria-label="Filter by activity">
          {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.id === 'All' ? 'All activity' : cat.label}</option>)}
        </select>
        <select className="audit-ws-select" value={dateRangePreset} onChange={e => { setDateRangePreset(e.target.value); setPage(1); }} aria-label="Filter by date range">
          <option value="all">Any time</option>
          <option value="today">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <details className="aw-more">
          <summary>More filters{moreCount ? ` (${moreCount})` : ''}</summary>
          <div className="aw-more-body">
            <select className="audit-ws-select" value={selectedSeverity} onChange={e => { setSelectedSeverity(e.target.value); setPage(1); }} aria-label="Filter by severity">
              {SEVERITY_LEVELS.map(s => <option key={s} value={s}>{s === 'All' ? 'Any severity' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
            <select className="audit-ws-select" value={selectedOutcome} onChange={e => { setSelectedOutcome(e.target.value); setPage(1); }} aria-label="Filter by outcome">
              {OUTCOME_LEVELS.map(o => <option key={o} value={o}>{o === 'All' ? 'Any result' : o === 'FAILURE' ? 'Failed' : o.charAt(0) + o.slice(1).toLowerCase()}</option>)}
            </select>
            <select className="audit-ws-select" value={selectedRole} onChange={e => { setSelectedRole(e.target.value); setPage(1); }} aria-label="Filter by role">
              {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.id === 'All' ? 'Any role' : r.label}</option>)}
            </select>
          </div>
        </details>
        {hasActiveFilters && <button type="button" className="aw-link" onClick={resetFilters} aria-label="Clear all active filters">Clear</button>}
        <span className="aw-count">{loading ? '' : `${totalCount} record${totalCount === 1 ? '' : 's'}`}</span>
      </section>

      {/* Main Audit Table Card */}
      <div className="audit-table-wrapper">
        {/* Desktop Table View */}
        <div className="audit-table-scroll">
          <table className="audit-table">
            <caption className="sr-only">Official DepEd Digital 201 Audit Trail Records</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: '170px' }}>Timestamp</th>
                <th scope="col" style={{ width: '220px' }}>Actor</th>
                <th scope="col" style={{ width: '240px' }}>Operation</th>
                <th scope="col" style={{ width: '180px' }}>Target / Entity</th>
                <th scope="col" style={{ width: '130px' }}>Result</th>
                <th scope="col" style={{ width: '80px' }}>Source</th>
                <th scope="col" style={{ width: '90px', textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>
                      Loading security audit trail records…
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} role="alert" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#dc2626', marginBottom: 6 }}>
                      Audit trail unavailable
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                      {loadError}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRecords()}>
                      Try again
                    </button>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                        <AppIcon name="security" size={40} color="var(--color-text-muted)" />
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6, color: '#111827' }}>
                        No audit log records found
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', maxWidth: '440px', margin: '0 auto 16px auto' }}>
                        No recorded events matched your search query or selected filter criteria.
                      </div>
                      {hasActiveFilters && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isExpanded = expandedId === log.id;
                  const outcomeClass =
                    log.outcome === 'SUCCESS' ? 'outcome-success' :
                    log.outcome === 'DENIED' ? 'outcome-denied' : 'outcome-failure';

                  return (
                    <React.Fragment key={log.id}>
                      <tr className={isExpanded ? 'is-expanded' : ''}>
                        <td>
                          <div className="audit-cell-time">
                            <strong>{log.displayTimestamp}</strong>
                            <span>ID: #{log.id}</span>
                          </div>
                        </td>

                        <td>
                          <div className="audit-cell-actor">
                            <span className="audit-cell-actor-email" title={log.user}>
                              {log.user}
                            </span>
                            <span className="audit-cell-actor-role">
                              <strong>{log.actorRoleLabel || log.role}</strong>
                              {log.actorStation && <span>· {log.actorStation}</span>}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="audit-cell-event">
                            <span className="audit-cell-event-label">{log.actionLabel}</span>
                            <span className="audit-cell-event-code">{log.action}</span>
                          </div>
                        </td>

                        <td>
                          <div className="audit-cell-target">
                            <span className="audit-cell-target-ref" title={log.targetReference}>
                              {log.targetReference}
                            </span>
                            <span className="audit-cell-target-type">{log.targetType}</span>
                          </div>
                        </td>

                        <td>
                          <div className="audit-cell-result">
                            <span className={`audit-outcome-badge ${outcomeClass}`}>
                              {log.outcome === 'SUCCESS' ? '● SUCCESS' : log.outcome === 'DENIED' ? '⊘ DENIED' : '✕ FAILED'}
                            </span>
                            {log.severity && (
                              <span className={`audit-severity-pill sev-${log.severity.toLowerCase()}`}>
                                {log.severity}
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <span className="audit-source-pill">
                            {log.clientSource}
                          </span>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="audit-expand-btn"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Close' : 'Inspect'} details for event #${log.id}`}
                          >
                            <span>{isExpanded ? 'Close' : 'Inspect'}</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Forensic Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div className="audit-detail-pane">
                              {/* Narrative Summary Bar */}
                              {log.summary && (
                                <div className="audit-detail-summary-bar">
                                  <strong>Event Summary:</strong> {log.summary}
                                </div>
                              )}

                              {/* Forensic Details Grid */}
                              <div className="audit-forensic-grid">
                                <div className="audit-forensic-card">
                                  <span className="audit-forensic-label">Event Identification</span>
                                  <span className="audit-forensic-val">Event #{log.id}</span>
                                  <span className="audit-forensic-label" style={{ marginTop: '0.4rem' }}>Category</span>
                                  <span className="audit-forensic-val">{log.category}</span>
                                </div>

                                <div className="audit-forensic-card">
                                  <span className="audit-forensic-label">Actor Credentials</span>
                                  <span className="audit-forensic-val">{log.user}</span>
                                  <span className="audit-forensic-label" style={{ marginTop: '0.4rem' }}>Role & Station</span>
                                  <span className="audit-forensic-val">{log.actorRoleLabel || log.role} {log.actorStation ? `(${log.actorStation})` : ''}</span>
                                </div>

                                <div className="audit-forensic-card">
                                  <span className="audit-forensic-label">Network & Device</span>
                                  <span className="audit-forensic-val mono">{log.ipAddress || 'Not recorded'}</span>
                                  <span className="audit-forensic-label" style={{ marginTop: '0.4rem' }}>Client Source</span>
                                  <span className="audit-forensic-val">{log.clientSource}</span>
                                </div>

                                <div className="audit-forensic-card">
                                  <span className="audit-forensic-label">Request Correlation ID</span>
                                  <span className="audit-forensic-val mono">{log.requestId || 'Not supplied'}</span>
                                  <span className="audit-forensic-label" style={{ marginTop: '0.4rem' }}>Tamper-Evident Hash</span>
                                  <span className="audit-forensic-val mono" title={log.recordHash || ''}>
                                    {log.recordHash ? `${log.recordHash.slice(0, 16)}...` : 'Pre-baseline record'}
                                  </span>
                                </div>
                              </div>

                              {/* Failure or Denial Reason */}
                              {log.failureReason && (
                                <div className="audit-finding-item severity-warning" style={{ background: '#fffbeb' }}>
                                  <strong style={{ color: '#b45309', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                    Failure / Denial Context
                                  </strong>
                                  <span style={{ fontSize: '0.8125rem', color: '#1f2937' }}>
                                    {log.failureReason}
                                  </span>
                                </div>
                              )}

                              {/* Before / After Diff Viewer */}
                              {(log.beforeValue || log.afterValue) && (
                                <div className="audit-diff-viewer">
                                  <div className="audit-diff-col before">
                                    <div className="audit-diff-heading">Previous State (Before)</div>
                                    <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                                      {JSON.stringify(log.beforeValue, null, 2)}
                                    </pre>
                                  </div>
                                  <div className="audit-diff-col after">
                                    <div className="audit-diff-heading">Applied Changes (After)</div>
                                    <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                                      {JSON.stringify(log.afterValue, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Structured Metadata Viewer */}
                              {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                                <div className="audit-payload-box">
                                  <h4>Structured Metadata (Sanitized)</h4>
                                  <dl className="audit-payload-items">
                                    {Object.entries(log.details).map(([key, val]) => (
                                      <div key={key} className="audit-payload-item">
                                        <dt>{key}</dt>
                                        <dd>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Feed View (<= 768px) */}
        <div className="audit-mobile-feed">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px' }}>Loading audit records…</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#dc2626' }}>
              <strong>Audit trail unavailable</strong>
              <div>{loadError}</div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
              No audit records match your filters.
            </div>
          ) : (
            logs.map(log => {
              const isExpanded = expandedId === log.id;
              return (
                <article key={log.id} className="audit-mobile-card">
                  <div className="audit-mobile-card-top">
                    <div>
                      <strong style={{ fontSize: '0.875rem', color: '#111827' }}>{log.actionLabel}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{log.displayTimestamp}</div>
                    </div>
                    <span className={`audit-outcome-badge ${log.outcome === 'SUCCESS' ? 'outcome-success' : log.outcome === 'DENIED' ? 'outcome-denied' : 'outcome-failure'}`}>
                      {log.outcome}
                    </span>
                  </div>

                  <div className="audit-mobile-card-meta">
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{log.user}</span>
                    <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>{log.actorRoleLabel || log.role} · {log.targetType}: {log.targetReference}</span>
                  </div>

                  <div className="audit-mobile-card-actions">
                    <span className="audit-source-pill">{log.clientSource} · IP: {log.ipAddress || '—'}</span>
                    <button
                      type="button"
                      className="audit-expand-btn"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: 6, fontSize: '0.75rem' }}>
                      <div><strong>Action Code:</strong> {log.action}</div>
                      <div><strong>Category:</strong> {log.category}</div>
                      <div><strong>Request ID:</strong> {log.requestId || '—'}</div>
                      {log.failureReason && <div style={{ color: '#dc2626', marginTop: 4 }}><strong>Failure:</strong> {log.failureReason}</div>}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="audit-pagination">
          <div className="audit-pagination-info">
            Showing {logs.length} of {totalCount} records (Page {page} of {totalPages})
          </div>

          <div className="audit-pagination-controls">
            <button
              type="button"
              className="audit-page-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Go to previous page"
            >
              Previous
            </button>

            <span style={{ fontSize: '0.8125rem', fontWeight: 600, padding: '0 0.5rem' }}>
              Page {page}
            </span>

            <button
              type="button"
              className="audit-page-btn"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Go to next page"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
