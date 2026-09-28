import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthContext } from '../../contexts/AuthContext';
import './system-operations.css';
import './review-list.css';

type Session = { id: number; client: string; createdAt: string; lastUsedAt: string; expiresAt: string; state: string; account: { id: number; email: string; role: string } };
type Device = { id: number; label: string; ipAddress: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; state: string; account: { id: number; email: string } };
type Page<T> = { rows: T[]; total: number; extra: any };

const when = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const role = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()).replace('Ao Ii', 'AO II').replace('Hrmo', 'HRMO');

/** Sessions and trusted devices. Tokens and hashes never reach this page. */
export const AccessSessions: React.FC = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { user } = useAuthContext();
  const [tab, setTab] = useState<'sessions' | 'devices'>('sessions');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Session | Device> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiClient.get(`/admin/${tab}`, { params: { page, limit: 25, ...(tab === 'sessions' && client && { client }) } });
      setData({ rows: res.data.data, total: res.data.pagination?.totalItems ?? 0, extra: res.data });
    } catch (err: any) { setData(null); setError(err?.response?.data?.message || 'Could not load.'); }
  }, [tab, client, page]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const act = async (title: string, message: string, request: (reason: string) => Promise<any>, own = false) => {
    const { confirmed, reason } = await confirm({ title, message, confirmLabel: title, tone: 'danger', reason: { label: 'Reason (recorded in the audit trail)', required: true } } as any);
    if (!confirmed) return;
    if (!reason || reason.trim().length < 5) { addToast('Enter a reason.', 'ERROR'); return; }
    setBusy(true);
    try {
      await request(reason.trim());
      addToast(own ? 'Done. You may need to sign in again.' : 'Done.', 'SUCCESS');
      await load();
    } catch (err: any) { addToast(err?.response?.data?.message || 'The action failed.', 'ERROR'); }
    finally { setBusy(false); }
  };

  const overLimit: { userId: number; sessions: number }[] = data?.extra?.accountsOverLimit || [];
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 25));

  return <div className="animate-fade-in sysops-page">
    <header className="sysops-header"><div><p className="sysops-eyebrow">Access management</p><h1>Sessions & devices</h1><p>Who is signed in, from which devices. Signing someone out takes effect on the server immediately.</p></div>
      <button type="button" className="btn btn-secondary" onClick={() => void load()}><AppIcon name="refresh" size={16} /> Refresh</button></header>

    <nav className="rv-tabs" aria-label="View" style={{ margin: '1rem 0' }}>
      {(['sessions', 'devices'] as const).map(t => <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setPage(1); }}>{t === 'sessions' ? 'Active sessions' : 'Trusted devices'}</button>)}
    </nav>

    {tab === 'sessions' && overLimit.length > 0 && <section className="sysops-error" role="status" style={{ borderLeftColor: '#d97706', background: '#fff8eb' }}><div><strong>{overLimit.length} account{overLimit.length === 1 ? '' : 's'} above the session limit ({data?.extra?.policy?.maximumConcurrentSessions})</strong><span>Account IDs: {overLimit.map(o => `${o.userId} (${o.sessions})`).join(', ')}</span></div></section>}
    {tab === 'devices' && data?.extra?.challenges && <p className="text-muted" style={{ fontSize: '.9rem' }}>Pending sign-in codes: {data.extra.challenges.pending} · with 5+ wrong attempts: {data.extra.challenges.tooManyAttempts}</p>}

    {tab === 'sessions' && <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
      <select aria-label="Client" className="form-input" style={{ maxWidth: 200 }} value={client} onChange={e => { setClient(e.target.value); setPage(1); }}>
        <option value="">Web and phone</option><option value="web">Web only</option><option value="app">Phone app only</option>
      </select></div>}

    {error ? <section className="sysops-error" role="alert"><div><strong>Could not load</strong><span>{error}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Try again</button></section>
    : !data ? <div className="sysops-loading" aria-busy="true">Loading…</div>
    : data.rows.length === 0 ? <div className="sysops-empty">{tab === 'sessions' ? 'No active sessions.' : 'No trusted devices.'}</div>
    : <section className="sysops-panel"><ul className="adm-list">
      {tab === 'sessions' ? (data.rows as Session[]).map(s => <li key={s.id}>
        <div className="adm-list__main"><strong>{s.account.email}</strong><span>{role(s.account.role)} · {s.client === 'app' ? 'Phone app' : 'Web'} · signed in {when(s.createdAt)}</span><span>Last used {when(s.lastUsedAt)} · expires {when(s.expiresAt)}</span></div>
        <div className="adm-list__actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act('Sign out this session', `End this ${s.client === 'app' ? 'phone' : 'web'} session for ${s.account.email}?`, reason => apiClient.delete(`/admin/sessions/${s.id}`, { data: { reason, confirmOwn: s.account.id === user?.id } }), s.account.id === user?.id)}>Sign out</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act('Sign out everywhere', `End every session for ${s.account.email}?`, reason => apiClient.delete(`/admin/accounts/${s.account.id}/sessions`, { data: { reason, confirmOwn: s.account.id === user?.id } }), s.account.id === user?.id)}>All sessions</button>
        </div></li>)
      : (data.rows as Device[]).map(d => <li key={d.id}>
        <div className="adm-list__main"><strong>{d.label}</strong><span>{d.account.email}{d.ipAddress ? ` · ${d.ipAddress}` : ''}</span><span>Trusted {when(d.createdAt)} · last used {when(d.lastUsedAt)}</span></div>
        <div className="adm-list__actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act('Remove device', `Remove "${d.label}"? It will need an emailed code at the next sign-in.`, reason => apiClient.delete(`/admin/devices/${d.id}`, { data: { reason } }))}>Remove</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act('Require codes on every device', `Remove all trusted devices for ${d.account.email} and require an emailed code at every new sign-in?`, reason => apiClient.post(`/admin/accounts/${d.account.id}/require-device-verification`, { reason }))}>Require codes</button>
        </div></li>)}
    </ul>
    {pages > 1 && <div className="adm-pager"><button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    </section>}
  </div>;
};
