import './document-validation.css';
import { TransactionReviewModal } from './TransactionReviewModal';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuthContext } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { accessDeniedMessage, isAccessDenied } from '../../api/access';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { transactionStatusLabel } from '../../constants/transactionStatus';
import { RefreshCw, CircleCheck } from 'lucide-react';
import './sysadmin-pages.css';
import { LoadFailure, StaleNotice } from '../../components/common/LoadFailure';
import type { ReviewState } from '../../components/common/ReviewNotice';

// ─── 201-System-Workflow.md: AO II School-Level Qualification & Validation ───
// Teaching Personnel: School-level evaluation by AO II.
//   - Natural Vacancy (Teacher I): DepEd Quality Standards under DepEd Order No. 7, s. 2023.
//   - Expanded Career Progression (ECP): DepEd Order No. 19, s. 2025 & DepEd Order No. 24, s. 2025.
//   - AO II has full authority to declare teaching applicants QUALIFIED or DISQUALIFIED (DQ).
// Non-Teaching Personnel: HRMO evaluates submitted documents and determines Qualified / Disqualified at the division level.

type DocumentItem = {
  id?: number;
  name: string;
  type: string;
  uploadDate: string;
  status?: string;
};

type HistoryLogItem = {
  id: number;
  action: string;
  timestamp: string;
  user?: { email: string; role?: { name: string } };
  detailsJson?: any;
};

type Transaction = {
  id: number;
  personnelName: string;
  employeeId: string;
  transactionType: string;
  personnelCategory: string;
  promotionTrack?: 'NATURAL_VACANCY' | 'ECP' | 'OTHER';
  policyFramework?: string;
  dateSubmitted: string;
  submittedAt?: string;
  currentPosition?: string;
  complianceScore: number;
  submissionStatus: string;
  status: string;
  remarks?: string;
  qualificationStatus?: 'PENDING_EVALUATION' | 'QUALIFIED' | 'DISQUALIFIED';
  validationHistory: string[];
  historyLogs?: HistoryLogItem[];
  documents: DocumentItem[];
  isPromotion?: boolean;
  promotionDetails?: {
    isSelected: boolean;
    cycleName: string;
    targetPosition: string;
    cycleType: string;
  } | null;
  /** Who checked it, who acts next and what this viewer can do, decided by the server. */
  review?: ReviewState | null;
};

/** A transaction from the list or detail endpoint, as the review screen shows it. */
const toReviewItem = (tx: any): Transaction => {
  const roleName = tx.personnel?.user?.role?.name || '';
  const desig = tx.personnel?.designation || '';
  const isTeaching = roleName === 'TEACHING_PERSONNEL' || desig.toLowerCase().includes('teacher') || desig.toLowerCase().includes('principal') || desig.toLowerCase().includes('master') || !tx.personnel;

  const category = isTeaching ? 'Teaching Personnel' : 'Non-Teaching Personnel';
  const policy = isTeaching ? 'DepEd Quality Standards (DO No. 7, s. 2023 / DO 19 & 24, s. 2025)' : 'Division HRMO Scope (DO No. 7, s. 2023)';

  const isPromo = tx.isPromotion || tx.transactionType?.name?.toUpperCase().includes('PROMOTION') || !!tx.promotionDetails;
  const promoDetails = tx.promotionDetails || (isPromo ? {
    isSelected: true,
    cycleName: '',
    // Unknown here: never guessed from the current post or a default rank.
    targetPosition: '',
    cycleType: 'NATURAL_VACANCY',
  } : null);

  return {
    id: tx.id,
    personnelName: tx.personnel ? `${tx.personnel.lastName}, ${tx.personnel.firstName}` : 'Personnel Staff',
    employeeId: tx.personnel?.employeeId || `EMP-${tx.personnelId}`,
    transactionType: tx.transactionType?.name || (isPromo ? 'Promotion Appointment' : 'Appointment'),
    personnelCategory: category,
    promotionTrack: tx.transactionType?.name || (isPromo ? 'Promotion' : 'Appointment'),
    policyFramework: policy,
    dateSubmitted: tx.submissionDate ? new Date(tx.submissionDate).toLocaleDateString() : new Date(tx.createdAt).toLocaleDateString(),
    complianceScore: tx.complianceScore ?? 0,
    submittedAt: tx.submissionDate || tx.createdAt,
    currentPosition: desig || undefined,
    submissionStatus: tx.status,
    status: tx.status,
    remarks: tx.remarks,
    qualificationStatus: tx.status === 'APPROVED' || tx.status === 'FOR_APPROVAL' ? 'QUALIFIED' : tx.status === 'REJECTED' ? 'DISQUALIFIED' : 'PENDING_EVALUATION',
    validationHistory: [tx.remarks ? `Remarks: ${tx.remarks}` : `Status: ${tx.status}`],
    isPromotion: isPromo,
    promotionDetails: promoDetails,
    review: tx.review ?? null,
    documents: (tx.uploadedDocuments && tx.uploadedDocuments.length > 0)
      ? tx.uploadedDocuments.map((d: any) => ({
          id: d.id,
          name: d.requirementTemplate?.name || d.fileName || 'Uploaded Document',
          type: d.fileName || 'DOCUMENT',
          uploadDate: new Date(d.createdAt || Date.now()).toLocaleDateString(),
          status: d.status || 'UPLOADED',
        }))
      : [],
  };
};

export const DocumentValidation: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openedTxIdRef = useRef<string | null>(null);
  const { addToast } = useToast();
  const { user } = useAuthContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load is not an empty queue: keep what was loaded, mark it stale, and offer Retry.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DEFICIENCY' | 'HISTORY'>('PENDING');

  const handleCloseModal = () => {
    setSelected(null);
    openedTxIdRef.current = null;
    if (searchParams.get('txId')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('txId');
        return next;
      }, { replace: true });
    }
  };

  const handleOpenTransactionDetails = (tx: Transaction) => {
    openedTxIdRef.current = String(tx.id);
    setSelected(tx);
  };

  // A linked id that is not in the loaded queue is asked of the server, never
  // assumed: either it is this officer's record, or nothing about it is shown.
  const openLinkedTransaction = async (txId: string) => {
    try {
      const res = await apiClient.get(`/transactions/${encodeURIComponent(txId)}`);
      const tx = res.data?.data;
      if (tx && openedTxIdRef.current === txId) handleOpenTransactionDetails(toReviewItem(tx));
    } catch (err: any) {
      // Say why a link did not open, whatever the reason; never leave the reviewer on a list that looks like the answer.
      const missing = err?.response?.status === 404;
      addToast(isAccessDenied(err) ? accessDeniedMessage('transaction')
        : missing ? `TRX-${txId} is not in your queue. It may belong to another station, or it no longer exists.`
        : `Could not open TRX-${txId}. Check your connection and try again from the notification.`, isAccessDenied(err) || missing ? 'WARNING' : 'ERROR');
      if (openedTxIdRef.current === txId) handleCloseModal();
    }
  };

  const isInitialLoad = useRef(true);

  const fetchPendingTransactions = useCallback(async () => {
    // Only show the loading spinner on the very first fetch — not on background polls
    if (isInitialLoad.current) {
      setLoading(true);
    }
    try {
      // HRMO checks its own lane (non-teaching files, and teaching files at a station with no AO II):
      // the server narrows the list to that lane in every status, so Returned and Done are complete too.
      const res = await apiClient.get(user?.role === 'HRMO' ? '/transactions?limit=1000&lane=validation' : '/transactions?limit=1000');
      const apiList = res.data?.data || [];

      const mappedApi: Transaction[] = apiList.map(toReviewItem);

      setTransactions(mappedApi);
      setLoadFailed(false);
      setLoadedAt(new Date());

      const targetTxId = searchParams.get('txId');
      if (targetTxId && openedTxIdRef.current !== targetTxId) {
        openedTxIdRef.current = targetTxId;
        const found = mappedApi.find((t: any) => t.id === parseInt(targetTxId, 10));
        if (found) {
          handleOpenTransactionDetails(found);
        } else {
          void openLinkedTransaction(targetTxId);
        }
      }
    } catch (err) {
      console.error('Failed to load transactions for validation:', err);
      // Keep whatever was already loaded (it is shown as possibly out of date); never turn a failure into "nothing to review".
      setLoadFailed(true);
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [searchParams, user?.role]);

  const retry = async () => { setRetrying(true); try { await fetchPendingTransactions(); } finally { setRetrying(false); } };

  useEffect(() => {
    fetchPendingTransactions();
  }, [fetchPendingTransactions]);

  useRealtimeTransactions(fetchPendingTransactions);

  const canValidate = user?.role === 'AO_II' || user?.role === 'SYSTEM_ADMIN';

  // Only submitted work: the server refuses to validate a DRAFT, so listing drafts here offered a Validate that always failed.
  const pending = transactions.filter(tx => tx.status === 'PENDING_VALIDATION');
  const returnedList = transactions.filter(tx => tx.status === 'DEFICIENCY');
  const processed = transactions.filter(tx => tx.status === 'FOR_APPROVAL' || tx.status === 'APPROVED' || tx.status === 'REJECTED');

  const currentList = activeTab === 'PENDING' ? pending : activeTab === 'DEFICIENCY' ? returnedList : processed;

  const tabs = [
    { key: 'PENDING' as const, label: 'To review', count: pending.length },
    { key: 'DEFICIENCY' as const, label: 'Returned for correction', count: returnedList.length },
    { key: 'HISTORY' as const, label: 'Done', count: processed.length },
  ];

  // "3 days" reads faster than a date when deciding what to open first.
  const waitingFor = (iso?: string) => {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  };

  return (
    <div className="sap animate-fade-in">
      <header className="sap-head">
        <h1>Document validation</h1>
        <button type="button" className="sap-btn sap-btn--ghost" onClick={() => void fetchPendingTransactions()}><RefreshCw size={18} aria-hidden="true" /> Refresh</button>
      </header>

      <section className="sap-stats" aria-label="Validation summary">
        {tabs.map(t => (
          <button key={t.key} type="button" className={`sap-stat sap-stat--btn${activeTab === t.key ? ' is-on' : ''}${t.key === 'PENDING' && t.count ? ' is-warn' : ''}`} aria-pressed={activeTab === t.key} onClick={() => setActiveTab(t.key)}>
            <span className="sap-stat__label">{t.label}</span>
            <span className="sap-stat__num">{loadFailed && !loadedAt ? '–' : t.count}</span>
          </button>
        ))}
      </section>

      {loadFailed && loadedAt && <StaleNotice what="the validation lists" since={loadedAt} onRetry={() => void retry()} retrying={retrying} />}
      <section className="sap-card" aria-label={tabs.find(t => t.key === activeTab)?.label}>
        {loading ? (
          <div className="sap-card__body" aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} className="sap-skel" />)}</div>
        ) : loadFailed && !loadedAt ? (
          <div className="sap-card__body"><LoadFailure what="the validation lists" onRetry={() => void retry()} retrying={retrying} /></div>
        ) : currentList.length === 0 ? (
          <div className="sap-empty">
            <CircleCheck size={40} aria-hidden="true" style={{ color: 'var(--sap-green)', display: 'block', margin: '0 auto 10px' }} />
            {activeTab === 'PENDING' ? 'Nothing to review.' : activeTab === 'DEFICIENCY' ? 'Nothing returned.' : 'Nothing validated yet.'}
            {activeTab !== 'PENDING' && pending.length > 0 && <div style={{ marginTop: 14 }}><button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={() => setActiveTab('PENDING')}>Review {pending.length} waiting</button></div>}
          </div>
        ) : (
          <ul className="sap-rows">
            {currentList.map(tx => {
              const target = tx.promotionDetails?.targetPosition;
              const complete = tx.complianceScore >= 100;
              const canReview = activeTab === 'PENDING' && tx.review?.canValidate !== false;
              return (
                <li key={tx.id} className="sap-row">
                  <span className="sap-avatar">{tx.personnelName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                  <div className="sap-who">
                    <span className="sap-who__name">{tx.personnelName}{tx.isPromotion && <span className="sap-tag">Promotion</span>}</span>
                    <span className="sap-who__line">
                      {tx.currentPosition || tx.personnelCategory}
                      {tx.isPromotion && target && target !== tx.currentPosition && <> → <b>{target}</b></>}
                    </span>
                    <span className="sap-who__mono">TRX-{tx.id} · {tx.employeeId}</span>
                    {activeTab === 'DEFICIENCY' ? <span className="sap-who__line" style={{ color: 'var(--sap-warn)' }}>{tx.remarks || 'Returned for correction.'}</span>
                      : activeTab === 'HISTORY' && tx.review ? <span className="sap-who__line">{tx.review.summary}</span>
                      : <span className="sap-files" aria-label={`Files ${tx.complianceScore}% complete`}>
                          <span className="sap-files__bar"><i className={complete ? 'is-ok' : ''} style={{ width: `${Math.min(100, tx.complianceScore)}%` }} /></span>
                          <b className={complete ? 'is-ok' : ''}>{tx.complianceScore}%</b>
                        </span>}
                  </div>
                  {activeTab === 'HISTORY'
                    ? <span className={`sap-pill ${['APPROVED', 'COMPLETED'].includes(tx.status) ? 'is-ok' : tx.status === 'REJECTED' ? 'is-bad' : 'is-muted'}`}>{transactionStatusLabel(tx.status)}</span>
                    : <span className="sap-pill is-muted no-dot" title="Time waiting">{waitingFor(tx.submittedAt)}</span>}
                  <div className="sap-row__actions">
                    <button type="button" className={`sap-btn sap-btn--sm ${canReview ? 'sap-btn--primary' : 'sap-btn--ghost'}`} onClick={() => handleOpenTransactionDetails(tx)}>
                      {canReview ? 'Review files' : 'Open'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Review: the actual uploaded files, one verdict per document */}
      {selected && (
        <TransactionReviewModal
          txId={Number(selected.id)}
          onClose={handleCloseModal}
          onDecided={() => { void fetchPendingTransactions(); handleCloseModal(); }}
        />
      )}
    </div>
  );
};
