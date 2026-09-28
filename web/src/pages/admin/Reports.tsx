import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import './system-operations.css';

type AuditEvent = { id: number; timestamp: string; userEmail: string; userRole: string; category: string; action: string; resourceType: string; resourceId: number; ipAddress?: string; status: string };
type Operations = {
  generatedAt: string;
  accounts: { total: number; active: number; pending: number; locked: number; passwordChangeRequired: number; deviceVerificationDisabled: number };
  access: { activeSessions: number; activeTrustedDevices: number; pendingChallenges: number };
  securityEvents: { failedLogins24h: number; accessDenied24h: number; failedOperations24h: number };
  delivery: { pending: number; retrying: number; failed: number; delivered24h: number };
  recentDeliveryFailures: Array<{ id: string; kind: string; attempts: number; availableAt: string; createdAt: string; error: string | null }>;
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const downloadCsv = (name: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  URL.revokeObjectURL(url);
};

export const Reports: React.FC = () => {
  const [operations, setOperations] = useState<Operations | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [operationsResponse, auditResponse] = await Promise.all([apiClient.get('/dashboard/system-operations'), apiClient.get('/audit-logs?limit=500')]);
      setOperations(operationsResponse.data?.data || null);
      setEvents(Array.isArray(auditResponse.data?.data) ? auditResponse.data.data : []);
    } catch (err: any) { setError(err?.response?.data?.message || 'Administrator reports could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const securityEvents = useMemo(() => events.filter(event => event.status === 'FAILED' || /LOGIN|LOGOUT|PASSWORD|ACCESS_DENIED|DEVICE/.test(event.action)), [events]);
  const exportAccounts = () => operations && downloadCsv('system-account-summary', ['Metric', 'Count'], Object.entries(operations.accounts));
  const exportSecurity = () => downloadCsv('security-events', ['Timestamp', 'Account', 'Role', 'Action', 'Resource', 'Resource ID', 'IP address', 'Status'], securityEvents.map(e => [e.timestamp, e.userEmail, e.userRole, e.action, e.resourceType, e.resourceId, e.ipAddress, e.status]));
  const exportAudit = () => downloadCsv('system-audit-register', ['Timestamp', 'Account', 'Role', 'Category', 'Action', 'Resource', 'Resource ID', 'Status'], events.map(e => [e.timestamp, e.userEmail, e.userRole, e.category, e.action, e.resourceType, e.resourceId, e.status]));
  const exportDelivery = () => {
    if (!operations) return;
    const summary = Object.entries(operations.delivery).map(([name, value]) => ['Summary', name, value, '', '', '']);
    const failures = operations.recentDeliveryFailures.map(f => ['Failure', f.kind, '', f.attempts, f.createdAt, f.error]);
    downloadCsv('email-delivery-operations', ['Record type', 'Kind or metric', 'Count', 'Attempts', 'Created', 'Last error'], [...summary, ...failures]);
  };
  const reports = operations ? [
    { title: 'Account access summary', description: 'Activation, lockout, temporary-password, and device-verification totals.', detail: `${operations.accounts.active} active · ${operations.accounts.locked} locked`, action: exportAccounts },
    { title: 'Security event register', description: 'Authentication, password, device, and denied-access activity from the audit trail.', detail: `${securityEvents.length} events in the loaded register`, action: exportSecurity },
    { title: 'Email delivery operations', description: 'Pending, retrying, exhausted, and recently delivered workflow messages.', detail: `${operations.delivery.failed} failed · ${operations.delivery.retrying} retrying`, action: exportDelivery },
    { title: 'System audit register', description: 'Administrative and automated operations retained by Digital 201.', detail: `${events.length} most recent records`, action: exportAudit },
  ] : [];

  return <div className="animate-fade-in sysops-page">
    <header className="sysops-header"><div><p className="sysops-eyebrow">System administration</p><h1>Operational reports</h1><p>Export evidence for access reviews, incident investigation, and delivery monitoring.</p></div><button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}><AppIcon name="refresh" size={16} /> {loading ? 'Refreshing…' : 'Refresh data'}</button></header>
    {error ? <section className="sysops-error" role="alert"><div><strong>Reports unavailable</strong><span>{error}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Try again</button></section>
    : loading && !operations ? <div className="sysops-loading" aria-busy="true">Preparing administrator reports…</div>
    : operations ? <>
      <section className="report-purpose" aria-label="Reporting scope"><AppIcon name="reports" size={22} /><div><strong>These reports describe system operation—not HR decisions.</strong><span>Personnel compliance, plantilla, and promotion reports belong to HRMO workflows. System Administrators receive access, security, delivery, and audit evidence.</span></div></section>
      <section className="report-grid">{reports.map(report => <article className="report-card" key={report.title}><div><span className="report-kicker">CSV export</span><h2>{report.title}</h2><p>{report.description}</p></div><div className="report-card-footer"><span>{report.detail}</span><button type="button" className="btn btn-secondary btn-sm" onClick={report.action}><AppIcon name="download" size={15} /> Download</button></div></article>)}</section>
      <section className="report-guidance"><div><h2>Administrator review cadence</h2><p>Use reports as evidence for operational review, not as a substitute for the permanent audit trail.</p></div><ul><li><strong>Daily:</strong> failed email deliveries and locked accounts</li><li><strong>Weekly:</strong> denied access and failed sign-ins</li><li><strong>Monthly:</strong> active access, device verification, and complete audit export</li></ul><Link to="/admin/audit" className="btn btn-secondary btn-sm">Open audit trail</Link></section>
      <footer className="sysops-updated">Report snapshot generated {new Date(operations.generatedAt).toLocaleString()}</footer>
    </> : null}
  </div>;
};
