import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { AsyncState } from '../../components/common/AsyncState';
import { AppIcon } from '../../components/common/AppIcon';
import { WhatToDo } from './components/WhatToDo';
import { homeTasks } from './components/homeTasks';
import { PromotionCycleItem } from './components/promotionCycle';
import { PROMOTION_STEPS, nextExpiry, promotionProgress, vacancyLine } from './components/homeSummary';
import { TransactionRecord } from '../../models/transactionState';
import { PersonnelDocumentRecord, computeReadiness } from '../../models/documentStatus';
import { applicationStage, transactionStage, stageSteps } from '../../constants/workflowStages';
import { sortVacancies } from './vacancyView';
import { filesNeedingAttention, filingReturns } from './filingReturns';
import { routeNotification, collapseRepeats, PersonnelNotification } from './notificationRoute';
import './personnel-home.css';

const day = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const monthYear = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });

/**
 * Personnel home: what needs you, what is with a reviewer, where your career and
 * any promotion stand, and recent activity. Everything shown comes from the
 * person's own records; optional panels hide rather than guess when they fail.
 */
export const PersonnelHome: React.FC = () => {
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [personnel, setPersonnel] = useState<any>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [cycles, setCycles] = useState<PromotionCycleItem[]>([]);
  const [documents, setDocuments] = useState<PersonnelDocumentRecord[]>([]);
  const [record, setRecord] = useState<Array<{ label: string; value: string }> | null>(null);
  const [notices, setNotices] = useState<PersonnelNotification[] | null>(null);

  const loadPortalData = useCallback(async () => {
    setLoadError(null);
    try {
      // Every list the task panel relies on must load; an empty fallback would
      // read as 'nothing to do' when the truth is 'could not check'.
      const [pRes, txRes, promoRes, docRes, appRes] = await Promise.all([
        apiClient.get('/personnel/me'),
        apiClient.get('/transactions/my-transactions'),
        apiClient.get('/promotions/cycles'),
        apiClient.get('/personnel/documents'),
        apiClient.get('/promotions/my-applications'),
      ]);
      setPersonnel(pRes.data?.data || null);
      setTransactions(txRes.data?.data || []);
      setCycles(promoRes.data?.data || []);
      setDocuments(docRes.data?.data || []);
      setApplications(appRes.data?.data || []);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || 'Your records could not be loaded, so your to-do list cannot be shown. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
    // Side panels: shown when they load, hidden (never faked) when they do not.
    apiClient.get('/personnel/me/service-record').then(r => setRecord(r.data?.data?.serviceRecordDetails || null)).catch(() => setRecord(null));
    apiClient.get('/notifications').then(r => setNotices(r.data?.data || [])).catch(() => setNotices(null));
  }, []);
  useRealtimeTransactions(loadPortalData);
  useEffect(() => { void loadPortalData(); }, [loadPortalData]);

  // Old links (/personnel/home?cycle=ID) open the vacancy on its own page.
  const [params] = useSearchParams();
  const legacyCycle = params.get('cycle');
  if (legacyCycle) return <Navigate to={`/personnel/vacancies?cycle=${encodeURIComponent(legacyCycle)}`} replace />;

  const readiness = computeReadiness(documents);
  const { tasks, waiting } = homeTasks({
    transactions: transactions as any, applications,
    missingRequiredFiles: readiness.missing,
    profileComplete: typeof personnel?.profileComplete === 'boolean' ? personnel.profileComplete : null,
    cycles: cycles as any,
  });

  const firstName = personnel?.firstName || user?.firstName || '';
  const position = personnel?.designation || personnel?.plantillaItem?.positionTitle || null;
  const station = personnel?.school || personnel?.station || null;
  const inProgress = applications.filter(a => !a.transactionId && !applicationStage(a).done).length
    + transactions.filter(t => !transactionStage(t.status).done).length;
  // Same count the 201 Files page shows under Needs attention.
  const fileAttention = filesNeedingAttention(documents).length + filingReturns(transactions as any, applications).length;
  const expiry = nextExpiry(documents);
  const progress = promotionProgress(applications, transactions as any);
  const recordValue = (label: string) => {
    const v = record?.find(r => r.label === label)?.value;
    if (!v || v === 'Not recorded') return null;
    return /No Promotions Yet/i.test(v) ? 'None yet' : v;
  };

  // Cases still moving: each promotion application (its appointment transaction once selected) and any other open transaction.
  const escalated = (t: any) => Boolean(t.escalatedAt && !t.escalationReviewedAt);
  const linkedTx = new Set<number>();
  const cases = [
    ...applications.map(a => {
      const tx: any = a.transactionId ? (transactions as any[]).find(t => t.id === a.transactionId) : undefined;
      if (tx) linkedTx.add(tx.id);
      const stage = tx ? transactionStage(tx.status, { escalated: escalated(tx), review: tx.review }) : applicationStage(a);
      const validator = tx ? tx.review?.validator : a.checker === 'HRMO' ? 'HRMO' : 'AO_II';
      const to = tx ? `/personnel/checklist?txId=${tx.id}` : a.canResubmit && a.cycle ? `/personnel/vacancies?cycle=${a.cycle.id}` : '/personnel/transactions';
      return { key: `app-${a.id}`, title: `Promotion to ${a.cycle?.targetPosition || a.cycle?.name || 'a new position'}`, stage, to, validator };
    }),
    ...(transactions as any[]).filter(t => !linkedTx.has(t.id)).map(t => ({
      key: `tx-${t.id}`, title: t.transactionType?.name || 'Transaction', stage: transactionStage(t.status, { escalated: escalated(t), review: t.review }), to: `/personnel/checklist?txId=${t.id}`, validator: t.review?.validator,
    })),
  ].filter(c => !c.stage.done).sort((a, b) => Number(b.stage.needsYou) - Number(a.stage.needsYou));

  const links = [
    { to: '/personnel/transactions', icon: 'transactions', title: 'Applications', line: inProgress ? `${inProgress} in progress` : 'None in progress · see vacancies to apply' },
    { to: '/personnel/documents', icon: 'document', title: '201 Files',
      line: fileAttention ? `${fileAttention} need${fileAttention === 1 ? 's' : ''} attention`
        : readiness.total ? `${readiness.total - readiness.missing} of ${readiness.total} uploaded${expiry ? ` · next expiry ${monthYear(expiry.date)}` : ''}` : 'No files listed yet' },
    { to: '/personnel/vacancies', icon: 'employment', title: 'Vacancies', line: vacancyLine(sortVacancies(cycles as any).map(v => v.view.state)) },
  ];

  const allClearHint = expiry
    ? `Your files are in order. Next to expire: ${expiry.name}, ${day(expiry.date)}.`
    : readiness.total && !readiness.missing ? `All ${readiness.total} listed 201 files are uploaded.` : undefined;

  const recent = notices ? collapseRepeats(notices).slice(0, 3) : null;
  const facts = ([['Position', position], ['Salary grade', recordValue('Latest Salary Grade')], ['Station', station],
    ['Years in service', recordValue('Years in Service')], ['Last promotion', recordValue('Latest Promotion Date')]] as Array<[string, string | null]>)
    .filter(([, v]) => v);
  // Salary grade and years of service headline the hero, so the career card skips them.
  const heroStats = ([['Salary grade', recordValue('Latest Salary Grade')], ['Years in service', recordValue('Years in Service')]] as Array<[string, string | null]>)
    .filter(([, v]) => v) as Array<[string, string]>;
  const careerFacts = facts.filter(([k]) => k !== 'Salary grade' && k !== 'Years in service');
  const uploaded = readiness.total - readiness.missing;
  const filesPct = readiness.total ? Math.round((uploaded / readiness.total) * 100) : null;
  const initials = [personnel?.firstName || user?.firstName, personnel?.lastName || user?.lastName]
    .filter(Boolean).map((n: string) => n[0]).join('').toUpperCase();

  return (
    <div className="animate-fade-in personnel-content-container ph">
      <header className="ph__hero">
        <span className="ph__avatar" aria-hidden="true">{initials || '•'}</span>
        <div className="ph__hero-text">
          <h1>{firstName ? `Hello, ${firstName}` : 'Home'}</h1>
          {(position || station) && <p>{[position, station].filter(Boolean).join(' · ')}</p>}
        </div>
        {!loading && !loadError && heroStats.length > 0 && (
          <dl className="ph__hero-facts">
            {heroStats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        {!loading && !loadError && filesPct !== null && readiness.total <= 24 && (
          <div className="ph__folder" role="img" aria-label={`${uploaded} of ${readiness.total} required 201 files uploaded`}>
            <span className="ph__folder-cells" aria-hidden="true">
              {Array.from({ length: readiness.total }, (_, i) => <i key={i} className={i < uploaded ? 'is-on' : ''} />)}
            </span>
            <span className="ph__folder-label">{uploaded === readiness.total ? '201 folder complete' : `201 folder · ${uploaded} of ${readiness.total} files`}</span>
          </div>
        )}
      </header>

      <AsyncState loading={loading} error={loadError} onRetry={() => { setLoading(true); void loadPortalData(); }} loadingText="Loading your tasks…">
        <div className="ph__grid">
          <div className="ph__main">
            <WhatToDo tasks={tasks} waiting={waiting} allClearHint={allClearHint} />

            {cases.length > 0 && (
              <section className="ph__card" aria-labelledby="ph-cases">
                <div className="ph__card-head"><h2 id="ph-cases">Your applications</h2><Link to="/personnel/transactions">See all{cases.length > 2 ? ` (${cases.length})` : ''}</Link></div>
                <ul className="ph__cases">
                  {cases.slice(0, 2).map(c => (
                    <li key={c.key} className={c.stage.needsYou ? 'is-act' : ''}>
                      <div className="ph__case-main">
                        <strong>{c.title}</strong>
                        <span>{c.stage.label}</span>
                        <ol className="ph__track" aria-label={c.stage.who ? `Who has it now: ${c.stage.who === 'You' ? 'you' : c.stage.who}` : 'No one needs to act'}>
                          {stageSteps(c.validator).map(w => <li key={w} className={c.stage.who === w ? 'is-now' : ''}>{w}</li>)}
                        </ol>
                      </div>
                      <Link className={`btn btn-sm ${c.stage.needsYou ? 'btn-primary' : 'btn-secondary'}`} to={c.to}>{c.stage.needsYou ? 'Continue' : 'Open'}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <nav className="ph__links" aria-label="Go to">
              {links.map(l => (
                <Link key={l.to} to={l.to} className="ph__link">
                  <span className="ph__link-icon" aria-hidden="true"><AppIcon name={l.icon as any} size={18} /></span>
                  <span className="ph__link-text"><strong>{l.title}</strong><span>{l.line}</span></span>
                </Link>
              ))}
            </nav>

            {recent && (
              <section className="ph__card" aria-labelledby="ph-recent">
                <div className="ph__card-head"><h2 id="ph-recent">Recent activity</h2><Link to="/personnel/notifications">See all</Link></div>
                {recent.length === 0
                  ? <p className="ph__muted">No activity yet. Reviews, returns and approvals will appear here.</p>
                  : <ul className="ph__activity">
                    {recent.map(n => {
                      const r = routeNotification(n);
                      const body = <><span className="ph__activity-kind">{r.label} · {day(n.createdAt)}</span><strong>{r.title}</strong></>;
                      return <li key={n.id} className={n.isRead ? '' : 'is-unread'}>{r.path ? <Link to={r.path}>{body}</Link> : <div>{body}</div>}</li>;
                    })}
                  </ul>}
              </section>
            )}
          </div>

          <aside className="ph__side">
            {record && careerFacts.length > 0 && (
              <section className="ph__card" aria-labelledby="ph-career">
                <div className="ph__card-head"><h2 id="ph-career">Your career</h2><Link to="/personnel/service-record">Service record</Link></div>
                <dl className="ph__facts">
                  {careerFacts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </section>
            )}

            <section className="ph__card" aria-labelledby="ph-steps">
              <div className="ph__card-head"><h2 id="ph-steps">{progress ? progress.title : 'How a promotion works'}</h2></div>
              {progress && <p className="ph__stage"><b>{progress.label}</b>{progress.needsYou ? ' · you need to act' : ''}</p>}
              <ol className="ph__steps">
                {PROMOTION_STEPS.map((s, i) => (
                  <li key={s} className={progress ? (i < progress.step ? 'is-done' : i === progress.step ? 'is-current' : '') : ''} aria-current={progress?.step === i ? 'step' : undefined}>
                    <span className="ph__dot" aria-hidden="true">{progress && i < progress.step ? '✓' : i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="ph__muted">Only HRMO approval of the appointment changes your position and service record. Being eligible or checked does not mean selected.</p>
            </section>
          </aside>
        </div>
      </AsyncState>
    </div>
  );
};
