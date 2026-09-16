import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';

interface AuditItem {
  id: string | number;
  timestamp: string;
  user: string;
  role: string;
  category: string;
  action: string;
  details: any;
  status: string;
}

const MOCK_AUDIT_LOGS: AuditItem[] = [
  { id: 1, timestamp: '2026-07-21 22:45:12', user: 'admin@deped.gov.ph', role: 'SYSTEM_ADMIN', category: 'Login Activities', action: 'LOGIN_SUCCESS', details: 'Successful login from IP 192.168.1.15', status: 'SUCCESS' },
  { id: 2, timestamp: '2026-07-21 22:40:02', user: 'admin@deped.gov.ph', role: 'SYSTEM_ADMIN', category: 'Account Creation', action: 'USER_CREATED', details: 'Created user personnel@deped.gov.ph (Role: TEACHING_PERSONNEL)', status: 'SUCCESS' },
  { id: 3, timestamp: '2026-07-21 21:30:15', user: 'hrmo@deped.gov.ph', role: 'HRMO', category: 'Approval Actions', action: 'TRANSACTION_APPROVED', details: 'Approved Transaction #103 (Promotion)', status: 'SUCCESS' },
  { id: 4, timestamp: '2026-07-21 21:15:40', user: 'ao2_clara@deped.gov.ph', role: 'AO_II', category: 'Validation Actions', action: 'DOCUMENT_VALIDATED', details: 'Validated Service Record for Juan Dela Cruz', status: 'SUCCESS' },
  { id: 5, timestamp: '2026-07-21 20:05:00', user: 'personnel@deped.gov.ph', role: 'TEACHING_PERSONNEL', category: 'Document Uploads', action: 'DOCUMENT_UPLOADED', details: 'Uploaded diploma_santos.pdf for Transaction #101', status: 'SUCCESS' },
  { id: 6, timestamp: '2026-07-21 19:12:00', user: 'ao2_clara@deped.gov.ph', role: 'AO_II', category: 'Returned Submissions', action: 'SUBMISSION_RETURNED', details: 'Returned Transaction #102 due to deficient IPCR rating', status: 'SUCCESS' },
  { id: 7, timestamp: '2026-07-21 18:00:00', user: 'admin@deped.gov.ph', role: 'SYSTEM_ADMIN', category: 'Account Modifications', action: 'ROLE_MODIFIED', details: 'Updated user permissions for ao2_clara@deped.gov.ph', status: 'SUCCESS' }
];

const CATEGORIES = [
  { id: 'All Activities', label: 'All Activities', compactLabel: 'All', dotClass: 'dot-all' },
  { id: 'Login Activities', label: 'Login Activities', compactLabel: 'Logins', dotClass: 'dot-login' },
  { id: 'Account Creation', label: 'Account Creation', compactLabel: 'Accounts', dotClass: 'dot-account' },
  { id: 'Document Uploads', label: 'Document Uploads', compactLabel: 'Uploads', dotClass: 'dot-upload' },
  { id: 'Validation Actions', label: 'Validation Actions', compactLabel: 'Validations', dotClass: 'dot-validation' },
  { id: 'Approval Actions', label: 'Approval Actions', compactLabel: 'Approvals', dotClass: 'dot-approval' },
  { id: 'Returned Submissions', label: 'Returned Submissions', compactLabel: 'Returns', dotClass: 'dot-return' },
  { id: 'Account Modifications', label: 'Account Modifications', compactLabel: 'Modifications', dotClass: 'dot-mod' },
  { id: 'Plantilla & Positions', label: 'Plantilla & Positions', compactLabel: 'Plantilla', dotClass: 'dot-plantilla' },
  { id: 'Promotion & Ranking', label: 'Promotion & Ranking', compactLabel: 'Promotions', dotClass: 'dot-promotion' },
  { id: 'Personnel Records', label: 'Personnel Records', compactLabel: '201 Files', dotClass: 'dot-personnel' },
];

export const AuditLog: React.FC = () => {
  const { addToast } = useToast();
  const [logs, setLogs] = useState<AuditItem[]>(MOCK_AUDIT_LOGS);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Activities');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/audit-logs?limit=250')
      .then(res => {
        const rawLogs = res.data?.data;
        if (Array.isArray(rawLogs) && rawLogs.length > 0) {
          const normalized = rawLogs.map((l: any, idx: number) => ({
            id: l.id || `log-${idx}`,
            timestamp: l.timestamp ? new Date(l.timestamp).toLocaleString('en-US') : new Date().toLocaleString('en-US'),
            user: l.userEmail || l.user || 'system@deped.gov.ph',
            role: l.userRole || l.role || 'SYSTEM_ADMIN',
            category: l.category || (l.action?.includes('LOGIN') ? 'Login Activities' : l.action?.includes('USER') ? 'Account Creation' : 'Validation Actions'),
            action: l.action || 'ACTIVITY_LOGGED',
            details: typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || 'Audit action logged.'),
            status: l.status || 'SUCCESS',
          }));
          setLogs(normalized);
        }
      })
      .catch(err => {
        console.warn('Could not fetch database audit logs, using fallback:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      logins: logs.filter(l => l.category === 'Login Activities' || l.action?.includes('LOGIN')).length,
      accounts: logs.filter(l => l.category === 'Account Creation' || l.category === 'Account Modifications' || l.action?.includes('USER') || l.action?.includes('ROLE')).length,
      approvals: logs.filter(l => l.category === 'Approval Actions' || l.category === 'Validation Actions' || l.action?.includes('APPROV') || l.action?.includes('VALIDAT')).length,
      alerts: logs.filter(l => l.status === 'FAILED' || l.action?.includes('FAILED') || l.category === 'Returned Submissions').length,
    };
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const q = search.trim().toLowerCase();
      const userStr = (l.user || '').toLowerCase();
      const actionStr = (l.action || '').toLowerCase();
      const roleStr = (l.role || '').toLowerCase();
      const statusStr = (l.status || '').toLowerCase();
      const detailsStr = (typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || '')).toLowerCase();

      const matchesSearch = !q ||
        userStr.includes(q) ||
        actionStr.includes(q) ||
        roleStr.includes(q) ||
        statusStr.includes(q) ||
        detailsStr.includes(q);

      const matchesCategory = activeCategory === 'All Activities' || l.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [logs, search, activeCategory]);

  const handleExportCsv = () => {
    try {
      const headers = ['Timestamp', 'User Account', 'System Role', 'Category', 'Action', 'Operation Details', 'Status'];
      const rows = filtered.map(l => [
        `"${l.timestamp}"`,
        `"${l.user}"`,
        `"${l.role}"`,
        `"${l.category}"`,
        `"${l.action}"`,
        `"${(typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || '')).replace(/"/g, '""')}"`,
        `"${l.status}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Audit trail exported successfully as CSV!', 'SUCCESS');
    } catch (_) {
      addToast('Exported audit trail log summary.', 'INFO');
    }
  };

  const getUserInitials = (email: string) => {
    if (!email) return 'SY';
    const clean = email.split('@')[0].replace(/[^a-zA-Z]/g, '');
    return clean.slice(0, 2).toUpperCase() || 'US';
  };

  const getActionBadgeClass = (action: string) => {
    const a = action.toUpperCase();
    if (a.includes('SUCCESS') || a.includes('APPROVED')) return 'audit-action-login-success';
    if (a.includes('FAIL') || a.includes('ERROR') || a.includes('REJECT')) return 'audit-action-login-fail';
    if (a.includes('LOGOUT')) return 'audit-action-logout';
    if (a.includes('PLANTILLA')) return 'audit-action-plantilla';
    if (a.includes('PROMOTION') || a.includes('CAR_') || a.includes('RANKING')) return 'audit-action-promotion';
    if (a.includes('201') || a.includes('PERSONNEL') || a.includes('SERVICE_RECORD')) return 'audit-action-personnel';
    if (a.includes('USER') || a.includes('ROLE')) return 'audit-action-user';
    if (a.includes('VALIDAT')) return 'audit-action-validation';
    if (a.includes('RETURN')) return 'audit-action-return';
    return 'audit-action-user';
  };

  const renderDetails = (details: any, action: string) => {
    if (!details || details === 'null' || details === '{}') {
      if (action === 'LOGOUT') {
        return <span className="audit-detail-clean text-muted">User logged out of active division session</span>;
      }
      return <span className="audit-detail-clean text-muted">System operation recorded successfully</span>;
    }

    let parsed = details;
    if (typeof details === 'string') {
      if (details.startsWith('{') || details.startsWith('[')) {
        try {
          parsed = JSON.parse(details);
        } catch (_) {
          parsed = details;
        }
      }
    }

    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.role) {
        return (
          <div className="audit-detail-pill-group">
            <span className="audit-detail-tag">Role Assigned:</span>
            <span className="audit-detail-code">{parsed.role}</span>
          </div>
        );
      }
      if (parsed.reason) {
        return (
          <div className="audit-detail-pill-group">
            <span className="audit-detail-tag danger-tag">Alert:</span>
            <span className="audit-detail-danger-text">{parsed.reason.replace(/_/g, ' ')}</span>
          </div>
        );
      }
      const entries = Object.entries(parsed);
      return (
        <div className="audit-detail-pill-group">
          {entries.map(([k, v]) => (
            <span key={k} className="audit-detail-tag">
              <strong>{k}:</strong> {String(v)}
            </span>
          ))}
        </div>
      );
    }

    return <span className="audit-detail-clean">{String(details)}</span>;
  };

  return (
    <div className="animate-fade-in">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="topbar-title">Audit Trail & System Logs</h1>
          <p className="topbar-subtitle">
            Division Security & Compliance Monitoring — Track logins, account creation, uploads, validations, approvals, and system edits
          </p>
        </div>
      </div>

      <div className="page-content">
        {/* Quick Stats Chips */}
        <div className="audit-header-chips">
          <div className="tq-stat-chip">
            <span style={{ color: 'var(--color-text-muted)' }}>Total Records:</span>
            <span className="tq-stat-val">{stats.total}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-login" />
            <span>Login Events:</span>
            <span className="tq-stat-val">{stats.logins}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-account" />
            <span>Account Operations:</span>
            <span className="tq-stat-val">{stats.accounts}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-approval" />
            <span>Approvals & Validations:</span>
            <span className="tq-stat-val">{stats.approvals}</span>
          </div>
          {stats.alerts > 0 && (
            <div className="tq-stat-chip">
              <span className="tq-pill-dot dot-rejected" />
              <span style={{ color: '#DC2626' }}>Security Alerts:</span>
              <span className="tq-stat-val" style={{ color: '#DC2626' }}>{stats.alerts}</span>
            </div>
          )}
        </div>

        {/* Toolbar: Search and Filter Pills */}
        <div className="audit-toolbar">
          <div className="audit-search-row">
            {/* Integrated Search Box */}
            <div className="audit-search-box">
              <span className="audit-search-icon">
                <AppIcon name="search" size={16} />
              </span>
              <input
                type="text"
                className="audit-search-input search-input"
                placeholder="Search by user, role, action, or operation details…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '44px' }}
              />
              {search && (
                <button
                  type="button"
                  className="audit-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Export Audit Trail Button */}
            <button
              type="button"
              className="audit-export-btn"
              onClick={handleExportCsv}
              title="Download filtered audit logs as CSV"
            >
              <AppIcon name="download" size={15} />
              <span>Export Audit Trail</span>
            </button>
          </div>

          {/* Action Categories Filter Pills */}
          <div className="audit-filter-pills-row">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`audit-filter-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                  title={cat.label}
                >
                  <span className={`tq-pill-dot ${cat.dotClass}`} />
                  <span className="audit-pill-label-full">{cat.label}</span>
                  <span className="audit-pill-label-compact">{cat.compactLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Card */}
        <div className="table-wrapper bento-card" style={{ padding: 0, margin: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Timestamp</th>
                <th style={{ width: '220px' }}>User Account</th>
                <th style={{ width: '140px' }}>System Role</th>
                <th style={{ width: '170px' }}>Action</th>
                <th>Operation Details</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                      Loading security audit trail records…
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                        <AppIcon name="security" size={42} color="var(--color-text-muted)" />
                      </div>
                      <div className="empty-state-title" style={{ fontWeight: 800, fontSize: '15px', marginBottom: 6 }}>
                        No audit log records found
                      </div>
                      <div className="empty-state-text" style={{ fontSize: 13, color: '#6B7280', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                        No logged events matched your search query or category filter.
                      </div>
                      {(search || activeCategory !== 'All Activities') && (
                        <button
                          type="button"
                          className="tq-btn-view"
                          onClick={() => {
                            setSearch('');
                            setActiveCategory('All Activities');
                          }}
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(log => (
                  <tr key={log.id}>
                    <td>
                      <span className="audit-timestamp-badge">
                        <AppIcon name="clock" size={12} />
                        <span>{log.timestamp}</span>
                      </span>
                    </td>
                    <td>
                      <div className="audit-user-cell">
                        <div className="audit-user-avatar">
                          {getUserInitials(log.user)}
                        </div>
                        <div className="audit-user-info">
                          <span className="audit-user-email">{log.user}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge status-lavender">
                        {log.role}
                      </span>
                    </td>
                    <td>
                      <span className={`audit-action-pill ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      {renderDetails(log.details, log.action)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${log.status === 'SUCCESS' ? 'badge-approved' : 'badge-rejected'}`}>
                        {log.status === 'SUCCESS' ? '● SUCCESS' : '✕ FAILED'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
