import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, CircleCheck, TriangleAlert } from 'lucide-react';
import apiClient from '../../api/client';
import './sysadmin-pages.css';

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
const when = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const tone = (n: number, kind: 'warn' | 'bad') => (n ? `is-${kind}` : '');

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

  const attention = data ? data.accounts.locked + data.accounts.pending + data.accounts.passwordChangeRequired + data.delivery.failed + data.securityEvents.accessDenied24h : 0;

  return <div className="sap animate-fade-in">
    <header className="sap-head">
      <h1>Security overview</h1>
      <button type="button" className="sap-btn sap-btn--ghost" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={18} className={loading ? 'sap-spin' : ''} aria-hidden="true" /> Refresh
      </button>
    </header>

    {error ? <div className="sap-strip is-bad" role="alert"><span>{error}</span><button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => void load()}>Try again</button></div>
    : loading && !data ? <div aria-busy="true" style={{ display: 'grid', gap: 16 }}><div className="sap-skel" /><div className="sap-skel" style={{ height: 300 }} /></div>
    : data ? <>
      <section className={`sap-hero ${attention ? 'is-warn' : 'is-ok'}`} role="status">
        <span className="sap-hero__icon">{attention ? <TriangleAlert size={30} aria-hidden="true" /> : <CircleCheck size={30} aria-hidden="true" />}</span>
        <div className="sap-hero__text"><strong>{attention ? `${attention} item${attention === 1 ? '' : 's'} to review` : 'Nothing to review'}</strong><span>Updated {when(data.generatedAt)}</span></div>
      </section>

      <section className="sap-stats" aria-label="Summary">
        <div className="sap-stat"><span className="sap-stat__label">Active accounts</span><span className="sap-stat__num">{data.accounts.active}<small> / {data.accounts.total}</small></span></div>
        <div className="sap-stat"><span className="sap-stat__label">Sessions</span><span className="sap-stat__num">{data.access.activeSessions}</span></div>
        <div className="sap-stat"><span className="sap-stat__label">Trusted devices</span><span className="sap-stat__num">{data.access.activeTrustedDevices}</span></div>
        <div className={`sap-stat${data.delivery.failed ? ' is-bad' : ''}`}><span className="sap-stat__label">Failed emails</span><span className="sap-stat__num">{data.delivery.failed}</span></div>
      </section>

      <div className="sap-grid2">
        <section className="sap-card" aria-labelledby="so-access">
          <div className="sap-card__head"><h2 id="so-access">Accounts & sign-in</h2><Link to="/admin/credentials" className="sap-link">Accounts →</Link></div>
          <ul className="sap-kv">
            <li><span>Locked</span><strong className={tone(data.accounts.locked, 'bad')}>{data.accounts.locked}</strong></li>
            <li><span>Pending activation</span><strong className={tone(data.accounts.pending, 'warn')}>{data.accounts.pending}</strong></li>
            <li><span>Must change password</span><strong>{data.accounts.passwordChangeRequired}</strong></li>
            <li><span>Device codes turned off</span><strong className={tone(data.accounts.deviceVerificationDisabled, 'warn')}>{data.accounts.deviceVerificationDisabled}</strong></li>
            <li><span>Codes waiting</span><strong>{data.access.pendingChallenges}</strong></li>
            <li><span>Failed sign-ins, 24 h</span><strong className={tone(data.securityEvents.failedLogins24h, 'warn')}>{data.securityEvents.failedLogins24h}</strong></li>
            <li><span>Denied access, 24 h</span><strong className={tone(data.securityEvents.accessDenied24h, 'bad')}>{data.securityEvents.accessDenied24h}</strong></li>
          </ul>
        </section>

        <section className="sap-card" aria-labelledby="so-controls">
          <div className="sap-card__head"><h2 id="so-controls">Enforced rules</h2></div>
          <ul className="sap-kv">
            <li><span>New-device codes</span><strong className={data.controls.newDeviceVerification ? '' : 'is-bad'}>{data.controls.newDeviceVerification ? 'On' : 'Off'}</strong></li>
            <li><span>Lockout</span><strong>{data.controls.maximumFailedAttempts} tries · {data.controls.lockoutMinutes} min</strong></li>
            <li><span>Sessions per account</span><strong>{data.controls.maximumConcurrentSessions}</strong></li>
            <li><span>Web idle sign-out</span><strong>{data.controls.webIdleMinutes} min</strong></li>
            <li><span>Uploads</span><strong>{data.controls.acceptedDocumentTypes.join(', ')} · {data.controls.uploadLimitMb} MB</strong></li>
            <li><span>File storage</span><strong>{data.controls.storage}</strong></li>
            <li><span>Email provider</span><strong>{data.controls.email}</strong></li>
          </ul>
        </section>
      </div>

      <section className="sap-card" aria-labelledby="so-events">
        <div className="sap-card__head"><h2 id="so-events">Recent security events</h2><Link to="/admin/audit" className="sap-link">Audit trail →</Link></div>
        {data.recentSecurityEvents.length ? <ul className="sap-rows">{data.recentSecurityEvents.map(e => <li key={e.id} className="sap-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <div className="sap-who"><span className="sap-who__name">{humanize(e.action)}</span><span className="sap-who__line">{e.account} · {e.resource}</span><span className="sap-who__mono">{e.ipAddress}</span></div>
          <span className="sap-pill is-bad no-dot">{when(e.timestamp)}</span>
        </li>)}</ul> : <div className="sap-empty">No failed security operations.</div>}
      </section>

      <section className="sap-card" aria-labelledby="so-email">
        <div className="sap-card__head"><h2 id="so-email">Email queue</h2><Link to="/admin/health?tab=email" className="sap-link">Email delivery →</Link></div>
        <dl className="sap-facts">
          <div className="sap-fact"><dt>Pending</dt><dd>{data.delivery.pending}</dd></div>
          <div className="sap-fact"><dt>Retrying</dt><dd className={data.delivery.retrying ? 'is-warn' : ''}>{data.delivery.retrying}</dd></div>
          <div className="sap-fact"><dt>Failed</dt><dd className={data.delivery.failed ? 'is-bad' : ''}>{data.delivery.failed}</dd></div>
          <div className="sap-fact"><dt>Sent, 24 h</dt><dd className="is-ok">{data.delivery.delivered24h}</dd></div>
        </dl>
        {data.recentDeliveryFailures.length > 0 && <ul className="sap-rows" style={{ borderTop: '1px solid var(--sap-line)' }}>{data.recentDeliveryFailures.map(f => <li key={f.id} className="sap-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <div className="sap-who"><span className="sap-who__name">{humanize(f.kind)}</span><span className="sap-who__line">{f.error || 'No provider response'}</span></div>
          <span className="sap-pill is-warn no-dot">{f.attempts} attempt{f.attempts === 1 ? '' : 's'}</span>
        </li>)}</ul>}
      </section>
    </> : null}
  </div>;
};
