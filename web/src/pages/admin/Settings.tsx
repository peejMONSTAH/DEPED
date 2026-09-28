import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import './system-operations.css';

type Operations = {
  generatedAt: string;
  environment: string;
  accounts: { total: number; active: number; pending: number; locked: number; passwordChangeRequired: number; deviceVerificationDisabled: number };
  access: { activeSessions: number; activeTrustedDevices: number; pendingChallenges: number };
  securityEvents: { failedLogins24h: number; accessDenied24h: number; failedOperations24h: number };
  delivery: { pending: number; retrying: number; failed: number; delivered24h: number };
  controls: { newDeviceVerification: boolean; maximumFailedAttempts: number; lockoutMinutes: number; maximumConcurrentSessions: number; webIdleMinutes: number; uploadLimitMb: number; acceptedDocumentTypes: string[]; storage: string; email: string };
  recentSecurityEvents: Array<{ id: number; action: string; resource: string; timestamp: string; account: string; ipAddress: string }>;
  recentDeliveryFailures: Array<{ id: string; kind: string; attempts: number; availableAt: string; error: string | null }>;
};

const humanize = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());

export const Settings: React.FC = () => {
  const [data, setData] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await apiClient.get('/dashboard/system-operations'); setData(response.data?.data || null); }
    catch (err: any) { setError(err?.response?.data?.message || 'System operations could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const attentionCount = data ? data.accounts.locked + data.accounts.pending + data.accounts.passwordChangeRequired + data.delivery.failed + data.securityEvents.accessDenied24h : 0;

  return <div className="animate-fade-in sysops-page">
    <header className="sysops-header">
      <div><p className="sysops-eyebrow">System administration</p><h1>System operations</h1><p>Monitor account access, authentication safeguards, and notification delivery from live system records.</p></div>
      <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}><AppIcon name="refresh" size={16} /> {loading ? 'Refreshing…' : 'Refresh status'}</button>
    </header>

    {error ? <section className="sysops-error" role="alert"><div><strong>Operational status unavailable</strong><span>{error}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Try again</button></section>
    : loading && !data ? <div className="sysops-loading" aria-busy="true">Loading live system status…</div>
    : data ? <>
      <section className="sysops-summary" aria-label="System status summary">
        <article className={`sysops-priority ${attentionCount ? 'needs-attention' : 'healthy'}`}><span className="sysops-priority-icon"><AppIcon name={attentionCount ? 'warning' : 'approved'} size={22} /></span><div><span className="sysops-label">Administrator attention</span><strong>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need review` : 'No urgent operational issues'}</strong><small>Locked or pending accounts, password changes, denied access, and exhausted deliveries</small></div></article>
        <article><span className="sysops-label">Active accounts</span><strong>{data.accounts.active}<small> / {data.accounts.total}</small></strong><span>{data.accounts.pending} pending activation</span></article>
        <article><span className="sysops-label">Active sessions</span><strong>{data.access.activeSessions}</strong><span>{data.access.activeTrustedDevices} trusted devices</span></article>
        <article><span className="sysops-label">Email delivery</span><strong>{data.delivery.failed ? `${data.delivery.failed} failed` : 'Operational'}</strong><span>{data.delivery.delivered24h} delivered in 24 hours</span></article>
      </section>

      <div className="sysops-grid">
        <section className="sysops-panel">
          <div className="sysops-panel-heading"><div><h2>Account and access health</h2><p>Items that affect a user's ability to sign in and work.</p></div><Link to="/admin/credentials">Manage credentials</Link></div>
          <div className="sysops-metric-list">
            <div><span>Locked accounts</span><strong className={data.accounts.locked ? 'danger' : ''}>{data.accounts.locked}</strong></div>
            <div><span>Temporary password change required</span><strong>{data.accounts.passwordChangeRequired}</strong></div>
            <div><span>Device verification disabled</span><strong className={data.accounts.deviceVerificationDisabled ? 'warning' : ''}>{data.accounts.deviceVerificationDisabled}</strong></div>
            <div><span>Pending sign-in challenges</span><strong>{data.access.pendingChallenges}</strong></div>
            <div><span>Failed sign-ins, last 24 hours</span><strong className={data.securityEvents.failedLogins24h ? 'warning' : ''}>{data.securityEvents.failedLogins24h}</strong></div>
            <div><span>Denied access, last 24 hours</span><strong className={data.securityEvents.accessDenied24h ? 'danger' : ''}>{data.securityEvents.accessDenied24h}</strong></div>
          </div>
        </section>

        <section className="sysops-panel">
          <div className="sysops-panel-heading"><div><h2>Enforced controls</h2><p>Read-only values currently enforced by the server.</p></div></div>
          <dl className="sysops-control-list">
            <div><dt>New-device verification</dt><dd>{data.controls.newDeviceVerification ? 'Enabled' : 'Disabled'}</dd></div>
            <div><dt>Account lockout</dt><dd>{data.controls.maximumFailedAttempts} failed attempts · {data.controls.lockoutMinutes} minutes</dd></div>
            <div><dt>Concurrent sessions</dt><dd>Maximum {data.controls.maximumConcurrentSessions} per account</dd></div>
            <div><dt>Web inactivity limit</dt><dd>{data.controls.webIdleMinutes} minutes</dd></div>
            <div><dt>Document validation</dt><dd>{data.controls.acceptedDocumentTypes.join(', ')} · {data.controls.uploadLimitMb} MB maximum</dd></div>
            <div><dt>Private file storage</dt><dd>{data.controls.storage}</dd></div>
            <div><dt>Email provider</dt><dd>{data.controls.email}</dd></div>
          </dl>
        </section>

        <section className="sysops-panel sysops-span">
          <div className="sysops-panel-heading"><div><h2>Recent security events</h2><p>Failed operations are shown without credentials or sensitive payloads.</p></div><Link to="/admin/audit">Open audit trail</Link></div>
          {data.recentSecurityEvents.length ? <div className="sysops-event-list">{data.recentSecurityEvents.map(event => <article key={event.id}><span className="sysops-event-mark danger" /><div><strong>{humanize(event.action)}</strong><span>{event.account} · {event.resource} · IP {event.ipAddress}</span></div><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></article>)}</div> : <div className="sysops-empty">No failed security operations are recorded.</div>}
        </section>

        <section className="sysops-panel sysops-span">
          <div className="sysops-panel-heading"><div><h2>Email delivery queue</h2><p>Messages retry automatically; exhausted deliveries require configuration or recipient review.</p></div><Link to="/admin/reports">Export report</Link></div>
          <div className="sysops-delivery-strip"><div><span>Pending</span><strong>{data.delivery.pending}</strong></div><div><span>Retrying</span><strong>{data.delivery.retrying}</strong></div><div><span>Failed</span><strong className={data.delivery.failed ? 'danger' : ''}>{data.delivery.failed}</strong></div><div><span>Delivered, 24h</span><strong>{data.delivery.delivered24h}</strong></div></div>
          {data.recentDeliveryFailures.length > 0 && <div className="sysops-event-list compact">{data.recentDeliveryFailures.map(item => <article key={item.id}><span className="sysops-event-mark warning" /><div><strong>{humanize(item.kind)}</strong><span>{item.error || 'Delivery failed without a provider response.'}</span></div><span>{item.attempts} attempt{item.attempts === 1 ? '' : 's'}</span></article>)}</div>}
        </section>
      </div>
      <footer className="sysops-updated">Snapshot generated {new Date(data.generatedAt).toLocaleString()} · Environment: {data.environment}</footer>
    </> : null}
  </div>;
};
