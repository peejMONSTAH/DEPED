import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, RefreshCw, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthContext } from '../../contexts/AuthContext';
import './sysadmin-pages.css';

type Session = { id: number; client: string; createdAt: string; lastUsedAt: string; expiresAt: string; state: string; account: { id: number; email: string; role: string } };
type Device = { id: number; label: string; ipAddress: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; state: string; account: { id: number; email: string } };
type Page<T> = { rows: T[]; total: number; extra: any };

const when = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return when(d);
};
/** One row per account: an administrator acts on a person, not on each browser tab. */
const byAccount = (rows: Session[]) => {
  const map = new Map<number, { account: Session['account']; list: Session[] }>();
  for (const s of rows) {
    const g = map.get(s.account.id) ?? { account: s.account, list: [] };
    g.list.push(s); map.set(s.account.id, g);
  }
  return [...map.values()].sort((a, b) => (latest(b.list) > latest(a.list) ? 1 : -1));
};
const latest = (list: Session[]) => list.reduce((a, s) => (s.lastUsedAt > a ? s.lastUsedAt : a), list[0].lastUsedAt);
const role = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()).replace('Ao Ii', 'AO II').replace('Hrmo', 'HRMO');
const initials = (email: string) => email.slice(0, 2).toUpperCase();

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
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const res = await apiClient.get(`/admin/${tab}`, { params: { page, limit: tab === 'sessions' ? 100 : 25, ...(tab === 'sessions' && client && { client }) } });
      setData({ rows: res.data.data, total: res.data.pagination?.totalItems ?? 0, extra: res.data });
    } catch (err: any) { setData(null); setError(err?.response?.data?.message || 'Could not load.'); }
    finally { setLoading(false); }
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
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (tab === 'sessions' ? 100 : 25)));
  const sessions = tab === 'sessions' && data ? data.rows as Session[] : [];
  const groups = byAccount(sessions);
  const webCount = sessions.filter(s => s.client !== 'app').length;
  const challenges = tab === 'devices' ? data?.extra?.challenges : null;

  return <div className="sap animate-fade-in">
    <header className="sap-head">
      <h1>Sessions & devices</h1>
      <button type="button" className="sap-btn sap-btn--ghost" disabled={loading} onClick={() => void load()}>
        <RefreshCw size={18} className={loading ? 'sap-spin' : ''} aria-hidden="true" /> Refresh
      </button>
    </header>

    <div className="sap-toolbar">
      <div className="sap-seg" role="group" aria-label="View">
        {(['sessions', 'devices'] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => { setTab(t); setPage(1); }}>
          {t === 'sessions' ? 'Signed in' : 'Trusted devices'}
        </button>)}
      </div>
      {tab === 'sessions' && <div className="sap-seg" role="group" aria-label="Where">
        {[['', 'All'], ['web', 'Web'], ['app', 'Phone']].map(([v, l]) => <button key={v} type="button" aria-pressed={client === v} onClick={() => { setClient(v); setPage(1); }}>{l}</button>)}
      </div>}
    </div>

    {tab === 'sessions' && data && <section className="sap-stats" aria-label="Summary">
      <div className="sap-stat"><span className="sap-stat__label">People signed in</span><span className="sap-stat__num">{groups.length}</span></div>
      <div className="sap-stat"><span className="sap-stat__label">Web browsers</span><span className="sap-stat__num">{webCount}</span></div>
      <div className="sap-stat"><span className="sap-stat__label">Phone apps</span><span className="sap-stat__num">{sessions.length - webCount}</span></div>
      <div className={`sap-stat${overLimit.length ? ' is-warn' : ''}`}><span className="sap-stat__label">Over the session limit</span><span className="sap-stat__num">{overLimit.length}</span></div>
    </section>}
    {challenges && <section className="sap-stats" aria-label="Summary">
      <div className="sap-stat"><span className="sap-stat__label">Trusted devices</span><span className="sap-stat__num">{data?.total ?? 0}</span></div>
      <div className="sap-stat"><span className="sap-stat__label">Codes waiting</span><span className="sap-stat__num">{challenges.pending}</span></div>
      <div className={`sap-stat${challenges.tooManyAttempts ? ' is-bad' : ''}`}><span className="sap-stat__label">5+ wrong codes</span><span className="sap-stat__num">{challenges.tooManyAttempts}</span></div>
    </section>}

    {error ? <div className="sap-strip is-bad" role="alert"><span>{error}</span><button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => void load()}>Try again</button></div>
    : !data ? <div aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} className="sap-skel" />)}</div>
    : <section className="sap-card" aria-label={tab === 'sessions' ? 'Signed-in accounts' : 'Trusted devices'}>
      {data.rows.length === 0 ? <div className="sap-empty">{tab === 'sessions' ? 'Nobody is signed in.' : 'No trusted devices.'}</div>
      : <ul className="sap-rows">
        {tab === 'sessions' ? groups.map(({ account, list }) => {
          const own = account.id === user?.id;
          const web = list.filter(s => s.client !== 'app').length, app = list.length - web;
          const where = [web && `${web} web browser${web === 1 ? '' : 's'}`, app && `${app} phone app${app === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
          const over = overLimit.some(o => o.userId === account.id);
          return <li key={account.id} className="sap-row">
            <span className="sap-avatar">{initials(account.email)}</span>
            <div className="sap-who">
              <span className="sap-who__name">{account.email}{own && <span className="sap-tag">You</span>}</span>
              <span className="sap-who__line" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{role(account.role)}</span>
                {web > 0 && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Monitor size={17} aria-hidden="true" />{web}<span className="sr-only"> web</span></span>}
                {app > 0 && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Smartphone size={17} aria-hidden="true" />{app}<span className="sr-only"> phone</span></span>}
              </span>
            </div>
            <span className={`sap-pill ${over ? 'is-warn' : 'is-ok'}`} title={`Last used ${when(latest(list))}`}>{over ? 'Over limit' : ago(latest(list))}</span>
            <div className="sap-row__actions">
              <button type="button" className="sap-btn sap-btn--danger sap-btn--sm" disabled={busy}
                onClick={() => void act('Sign out everywhere', `End every session for ${account.email} (${where})?`, reason => apiClient.delete(`/admin/accounts/${account.id}/sessions`, { data: { reason, confirmOwn: own } }), own)}>
                <LogOut size={17} aria-hidden="true" /> Sign out
              </button>
            </div>
          </li>;
        })
        : (data.rows as Device[]).map(d => <li key={d.id} className="sap-row">
          <span className="sap-avatar is-icon">{/phone|android|iphone|mobile|app/i.test(d.label) ? <Smartphone size={24} aria-hidden="true" /> : <Monitor size={24} aria-hidden="true" />}</span>
          <div className="sap-who">
            <span className="sap-who__name">{d.label}</span>
            <span className="sap-who__line">{d.account.email}</span>
            {d.ipAddress && <span className="sap-who__mono">{d.ipAddress}</span>}
          </div>
          <span className="sap-pill is-ok" title={`Trusted ${when(d.createdAt)}`}>{ago(d.lastUsedAt)}</span>
          <div className="sap-row__actions">
            <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={busy} onClick={() => void act('Remove device', `Remove "${d.label}"? It will need an emailed code at the next sign-in.`, reason => apiClient.delete(`/admin/devices/${d.id}`, { data: { reason } }))}>
              <Trash2 size={17} aria-hidden="true" /> Remove
            </button>
            <button type="button" className="sap-btn sap-btn--danger sap-btn--sm" disabled={busy} onClick={() => void act('Require codes on every device', `Remove all trusted devices for ${d.account.email} and require an emailed code at every new sign-in?`, reason => apiClient.post(`/admin/accounts/${d.account.id}/require-device-verification`, { reason }))}>
              <ShieldCheck size={17} aria-hidden="true" /> Require codes
            </button>
          </div>
        </li>)}
      </ul>}
      {pages > 1 && <div className="sap-pager"><button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    </section>}
  </div>;
};
