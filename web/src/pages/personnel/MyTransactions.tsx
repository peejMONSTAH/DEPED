import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { TransactionTimeline } from '../../components/personnel/TransactionTimeline';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { TransactionRecord } from '../../models/transactionState';
import { applicationStage, transactionStage, Stage } from '../../constants/workflowStages';
import './my-applications.css';

type Application = {
  id: number; applicantNumber?: string | null; status?: string; stageStatus?: string | null; applicationDate?: string;
  canResubmit?: boolean; transactionId?: number | null; requirementsCheck?: { status?: string | null; remarks?: string | null } | null;
  cycle?: { id: number; name?: string; status?: string | null; targetPosition?: string | null } | null;
  items?: Array<{ code: string; title?: string; verificationStatus?: string | null; verificationRemarks?: string | null; submitted?: boolean }>;
};

/** One entry per promotion: the application and, once selected, its appointment transaction. */
type Entry = {
  key: string; kind: 'promotion' | 'appointment'; title: string; references: string[]; submitted?: string | null;
  stage: Stage; action?: { label: string; to: string }; app?: Application; tx?: TransactionRecord;
};

const when = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export const MyTransactions: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Both lists must load: a missing one would hide records, not show "none".
      const [a, t] = await Promise.all([apiClient.get('/promotions/my-applications'), apiClient.get('/transactions/my-transactions')]);
      setApplications(a.data?.data || []);
      setTransactions(t.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Your applications could not be loaded. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useRealtimeTransactions(load);
  React.useEffect(() => { void load(); }, [load]);

  const entries = useMemo<Entry[]>(() => {
    const txById = new Map(transactions.map(t => [t.id, t]));
    const linked = new Set<number>();
    const out: Entry[] = applications.map(a => {
      const tx = a.transactionId ? txById.get(a.transactionId) : undefined;
      if (tx) linked.add(tx.id);
      const position = a.cycle?.targetPosition || a.cycle?.name || 'Promotion';
      // Once selected, the appointment transaction is where the work is.
      const stage = tx ? transactionStage(tx.status, { escalated: Boolean((tx as any).escalatedAt && !(tx as any).escalationReviewedAt) }) : applicationStage(a);
      const action = tx
        ? { label: stage.needsYou ? (tx.status === 'DEFICIENCY' ? 'Fix and resubmit' : 'Continue') : 'Open checklist', to: `/personnel/checklist?txId=${tx.id}` }
        : a.canResubmit && a.cycle ? { label: 'Fix and resubmit', to: `/personnel/home?cycle=${a.cycle.id}` } : undefined;
      return {
        key: `app-${a.id}`, kind: 'promotion', title: `Promotion to ${position}`,
        references: [a.applicantNumber || `Application #${a.id}`, ...(tx ? [`TRX-${tx.id}`] : [])],
        submitted: a.applicationDate, stage, action, app: a, tx,
      };
    });
    for (const t of transactions) {
      if (linked.has(t.id)) continue;
      const stage = transactionStage(t.status, { escalated: Boolean((t as any).escalatedAt && !(t as any).escalationReviewedAt) });
      out.push({
        key: `tx-${t.id}`, kind: 'appointment', title: t.transactionType?.name || 'Transaction', references: [`TRX-${t.id}`],
        submitted: (t as any).submissionDate, stage,
        action: { label: stage.needsYou ? (t.status === 'DEFICIENCY' ? 'Fix and resubmit' : 'Continue') : 'Open checklist', to: `/personnel/checklist?txId=${t.id}` }, tx: t,
      });
    }
    return out;
  }, [applications, transactions]);

  const groups = [
    { id: 'act', title: 'You need to act', rows: entries.filter(e => e.stage.needsYou) },
    { id: 'wait', title: 'Waiting for review', rows: entries.filter(e => !e.stage.needsYou && !e.stage.done) },
    { id: 'done', title: 'History', rows: entries.filter(e => e.stage.done) },
  ];

  return (
    <div className="animate-fade-in personnel-content-container">
      <PageHeader title="Applications" subtitle="Your promotion applications and appointments, and who has each one now" />
      {loading ? <p className="mya__muted" aria-busy="true">Loading your applications…</p>
        : error ? <div className="mya__error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>
        : entries.length === 0 ? <div className="mya__empty"><p>You have no applications yet.</p><Link className="btn btn-primary btn-sm" to="/personnel/home#vacancies">See open vacancies</Link></div>
        : groups.filter(g => g.rows.length).map(g => (
          <section key={g.id} className="mya__group" aria-labelledby={`mya-${g.id}`}>
            <h2 id={`mya-${g.id}`}>{g.title} <span>{g.rows.length}</span></h2>
            <ul>
              {g.rows.map(e => (
                <li key={e.key} className={`mya__row${e.stage.needsYou ? ' is-act' : ''}`}>
                  <div className="mya__main">
                    <span className="mya__kind">{e.kind === 'promotion' ? 'Promotion application' : 'Appointment'}</span>
                    <strong>{e.title}</strong>
                    <span className="mya__meta">{e.references.join(' · ')} · submitted {when(e.submitted)}</span>
                    <span className="mya__stage"><b>{e.stage.label}</b>{e.stage.who ? ` · with ${e.stage.who === 'You' ? 'you' : e.stage.who}` : ''}</span>
                    {e.stage.next && <span className="mya__next">{e.stage.next}</span>}
                    {e.app?.canResubmit && e.app.requirementsCheck?.remarks && <span className="mya__note">AO II note: {e.app.requirementsCheck.remarks}</span>}
                  </div>
                  <div className="mya__actions">
                    {e.action && <Link className={`btn btn-sm ${e.stage.needsYou ? 'btn-primary' : 'btn-secondary'}`} to={e.action.to}>{e.action.label}</Link>}
                    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === e.key} onClick={() => setOpen(o => (o === e.key ? null : e.key))}>{open === e.key ? 'Hide details' : 'Details'}</button>
                  </div>
                  {open === e.key && (
                    <div className="mya__details">
                      {e.app && (
                        <ul className="mya__items" aria-label="Requirements">
                          {(e.app.items || []).filter(i => i.submitted).map(i => (
                            <li key={i.code}>
                              <span>{i.title || i.code}</span>
                              <span className={`mya__verdict v-${(i.verificationStatus || 'pending').toLowerCase()}`}>
                                {i.verificationStatus === 'VERIFIED' ? 'Checked by AO II' : i.verificationStatus === 'INCOMPLETE' ? 'Returned for correction' : i.verificationStatus === 'NOT_APPLICABLE' ? 'Not applicable' : 'Not checked yet'}
                              </span>
                              {i.verificationRemarks && <span className="mya__note">{i.verificationRemarks}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {e.tx && <TransactionTimeline transaction={e.tx} />}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
};
