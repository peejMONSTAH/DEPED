import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { AsyncState } from '../../components/common/AsyncState';
import { WhatToDo } from './components/WhatToDo';
import { homeTasks } from './components/homeTasks';
import { PromotionCycleItem } from './components/promotionCycle';
import { TransactionRecord } from '../../models/transactionState';
import { PersonnelDocumentRecord, computeReadiness } from '../../models/documentStatus';
import { applicationStage, transactionStage } from '../../constants/workflowStages';
import { sortVacancies } from './vacancyView';
import { filesNeedingAttention, filingReturns } from './filingReturns';
import './personnel-home.css';

/**
 * Personnel home: what needs you, what is with a reviewer, and short links to
 * the three places work happens. Everything shown comes from the person's own records.
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
  const canApply = sortVacancies(cycles as any).filter(v => v.view.state === 'can-apply' || v.view.state === 'not-checked').length;
  // Same count the 201 Files page shows under Needs attention.
  const fileAttention = filesNeedingAttention(documents).length + filingReturns(transactions as any, applications).length;
  const applied = cycles.filter(c => c.hasApplied).length;

  const links = [
    { to: '/personnel/transactions', title: 'Applications', line: inProgress ? `${inProgress} in progress` : 'None in progress' },
    { to: '/personnel/documents', title: '201 Files', line: fileAttention ? `${fileAttention} need${fileAttention === 1 ? 's' : ''} attention` : readiness.total ? 'All listed files uploaded' : 'No files listed yet' },
    { to: '/personnel/vacancies', title: 'Vacancies', line: canApply ? `${canApply} you can apply to` : applied ? `${applied} applied · none new for you` : 'None open to you now' },
  ];

  return (
    <div className="animate-fade-in personnel-content-container ph">
      <header className="ph__head">
        <h1>{firstName ? `Hello, ${firstName}` : 'Home'}</h1>
        {(position || station) && <p>{[position, station].filter(Boolean).join(' · ')}</p>}
      </header>

      <AsyncState loading={loading} error={loadError} onRetry={() => { setLoading(true); void loadPortalData(); }} loadingText="Loading your tasks…">
        <WhatToDo tasks={tasks} waiting={waiting} />

        <nav className="ph__links" aria-label="Go to">
          {links.map(l => (
            <Link key={l.to} to={l.to} className="ph__link">
              <strong>{l.title}</strong>
              <span>{l.line}</span>
            </Link>
          ))}
        </nav>

        <details className="ph__how" open={applications.length === 0 && transactions.length === 0}>
          <summary>How a promotion application becomes an appointment</summary>
          <ol>
            <li><b>You apply</b> to a vacancy and attach the Annex C requirements.</li>
            <li><b>AO II checks</b> that the requirements are complete. Returned items come back to you to fix.</li>
            <li><b>HRMO rates, ranks and selects.</b> Being eligible or checked does not mean selected.</li>
            <li><b>If selected, you submit the appointment documents.</b> AO II validates them; HRMO gives final approval.</li>
            <li><b>Only HRMO approval</b> changes your position and service record.</li>
          </ol>
        </details>
      </AsyncState>
    </div>
  );
};
