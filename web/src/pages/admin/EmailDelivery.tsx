import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import { useToast } from '../../contexts/ToastContext';
import './system-operations.css';
import './review-list.css';

type Message = { id: string; kind: string; category: string; state: 'PENDING' | 'RETRYING' | 'FAILED' | 'SENT'; attempts: number; recipient: string | null; createdAt: string; nextAttemptAt: string | null; sentAt: string | null; error: string | null; deliveryConfirmation: string | null };

const STATES = [['ATTENTION', 'Needs attention'], ['FAILED', 'Failed'], ['RETRYING', 'Retrying'], ['PENDING', 'Pending'], ['SENT', 'Sent'], ['ALL', 'All']] as const;
const LABEL: Record<Message['state'], string> = { PENDING: 'Pending', RETRYING: 'Retrying', FAILED: 'Failed', SENT: 'Accepted by provider' };
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

  return <div className="animate-fade-in sysops-page">
    <header className="sysops-header"><div><p className="sysops-eyebrow">System operations</p><h1>Email delivery</h1><p>Workflow and account emails. "Accepted by provider" means the provider took the message; inbox delivery is not confirmed.</p></div>
      <button type="button" className="btn btn-secondary" onClick={() => void load()}><AppIcon name="refresh" size={16} /> Refresh</button></header>
    <nav className="rv-tabs" aria-label="Filter by state" style={{ margin: '1rem 0' }}>
      {STATES.map(([k, l]) => <button key={k} type="button" aria-current={state === k ? 'page' : undefined} onClick={() => setState(k)}>{l}</button>)}
    </nav>
    {error ? <section className="sysops-error" role="alert"><div><strong>Queue unavailable</strong><span>{error}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Try again</button></section>
    : !rows ? <div className="sysops-loading" aria-busy="true">Loading…</div>
    : rows.length === 0 ? <div className="sysops-empty">{state === 'ATTENTION' ? 'No failed or retrying messages.' : 'No messages in this view.'}</div>
    : <section className="sysops-panel"><ul className="adm-list">{rows.map(m => <li key={m.id}>
      <div className="adm-list__main">
        <strong>{words(m.category)} <span className={`adm-state is-${m.state.toLowerCase()}`}>{LABEL[m.state]}</span></strong>
        <span>To {m.recipient || 'unknown'} · created {when(m.createdAt)} · {m.attempts} attempt{m.attempts === 1 ? '' : 's'}</span>
        {m.state === 'RETRYING' && <span>Next attempt {when(m.nextAttemptAt)}</span>}
        {m.state === 'SENT' && <span>Accepted {when(m.sentAt)}</span>}
        {m.error && <span className="adm-error">{m.error}</span>}
      </div>
      {m.state === 'FAILED' && <div className="adm-list__actions"><button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => void retry(m)}>{busy === m.id ? 'Queuing…' : 'Retry'}</button></div>}
    </li>)}</ul></section>}
  </div>;
};
