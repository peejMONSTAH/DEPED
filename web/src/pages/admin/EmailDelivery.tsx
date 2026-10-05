import React, { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, RotateCcw } from 'lucide-react';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import './sysadmin-pages.css';

type Message = { id: string; kind: string; category: string; state: 'PENDING' | 'RETRYING' | 'FAILED' | 'SENT'; attempts: number; recipient: string | null; createdAt: string; nextAttemptAt: string | null; sentAt: string | null; error: string | null; deliveryConfirmation: string | null };

const STATES = [['ATTENTION', 'Needs attention'], ['FAILED', 'Failed'], ['RETRYING', 'Retrying'], ['PENDING', 'Pending'], ['SENT', 'Sent'], ['ALL', 'All']] as const;
const LABEL: Record<Message['state'], string> = { PENDING: 'Pending', RETRYING: 'Retrying', FAILED: 'Failed', SENT: 'Sent' };
const TONE: Record<Message['state'], string> = { PENDING: 'is-muted', RETRYING: 'is-warn', FAILED: 'is-bad', SENT: 'is-ok' };
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const words = (s: string) => s.replace(/[_-]/g, ' ').toLowerCase().replace(/^\S/, c => c.toUpperCase());

/** The workflow email outbox. Recipients are masked; message contents never leave the server. */
export const EmailDelivery: React.FC = () => {
  const { addToast } = useToast();
  const [state, setState] = useState<(typeof STATES)[number][0]>('ATTENTION');
  const [rows, setRows] = useState<Message[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { const res = await apiClient.get('/admin/operations/email', { params: { state, limit: 50 } }); setRows(res.data.data); }
    catch (err: any) { setRows(null); setError(err?.response?.data?.message || 'Could not load the email queue.'); }
  }, [state]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const retry = async (m: Message) => {
    setBusy(m.id);
    try {
      const res = await apiClient.post(`/admin/operations/email/${m.id}/retry`);
      addToast(res.data.data.result === 'REQUEUED' ? 'Queued for another attempt.' : 'Nothing to retry.', 'SUCCESS');
      await load();
    } catch (err: any) { addToast(err?.response?.data?.message || 'Retry failed.', 'ERROR'); }
    finally { setBusy(null); }
  };

  return <div className="sap animate-fade-in">
    <header className="sap-head">
      <h1>Email delivery</h1>
      <button type="button" className="sap-btn sap-btn--ghost" onClick={() => void load()}><RefreshCw size={18} aria-hidden="true" /> Refresh</button>
    </header>
    <div className="sap-seg" role="group" aria-label="Filter by state" style={{ justifySelf: 'start' }}>
      {STATES.map(([k, l]) => <button key={k} type="button" aria-pressed={state === k} onClick={() => setState(k)}>{l}</button>)}
    </div>
    {error ? <div className="sap-strip is-bad" role="alert"><span>{error}</span><button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => void load()}>Try again</button></div>
    : !rows ? <div aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} className="sap-skel" />)}</div>
    : <section className="sap-card" aria-label="Messages">
      {rows.length === 0 ? <div className="sap-empty">{state === 'ATTENTION' ? 'No failed or retrying emails.' : 'No emails here.'}</div>
      : <ul className="sap-rows">{rows.map(m => <li key={m.id} className="sap-row">
        <span className="sap-avatar is-icon"><Mail size={24} aria-hidden="true" /></span>
        <div className="sap-who">
          <span className="sap-who__name">{words(m.category)}</span>
          <span className="sap-who__line">To {m.recipient || 'unknown'} · {when(m.createdAt)} · {m.attempts} attempt{m.attempts === 1 ? '' : 's'}</span>
          {m.state === 'RETRYING' && <span className="sap-who__line">Next try {when(m.nextAttemptAt)}</span>}
          {m.state === 'SENT' && <span className="sap-who__line">Sent {when(m.sentAt)}</span>}
          {m.error && <span className="sap-who__line" style={{ color: 'var(--sap-bad)' }}>{m.error}</span>}
        </div>
        <span className={`sap-pill ${TONE[m.state]}`}>{LABEL[m.state]}</span>
        <div className="sap-row__actions">
          {m.state === 'FAILED' && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={busy !== null} onClick={() => void retry(m)}>
            <RotateCcw size={17} aria-hidden="true" /> {busy === m.id ? 'Queuing…' : 'Retry'}
          </button>}
        </div>
      </li>)}</ul>}
    </section>}
  </div>;
};
