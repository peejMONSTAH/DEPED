import './document-validation.css';
import { TransactionReviewModal } from './TransactionReviewModal';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { accessDeniedMessage, isAccessDenied } from '../../api/access';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { SkeletonTable } from '../../components/common/Skeleton';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';

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
    cycleName: 'DepEd Promotion Cycle',
    targetPosition: tx.personnel?.designation || 'Master Teacher I',
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
    } catch (err) {
      if (!isAccessDenied(err)) return;
      addToast(accessDeniedMessage('transaction'), 'ERROR');
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
      const res = await apiClient.get('/transactions?limit=1000');
      const apiList = res.data?.data || [];

      const mappedApi: Transaction[] = apiList.map(toReviewItem);

      setTransactions(mappedApi);

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
      setTransactions([]);
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [searchParams]);

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
    <div className="animate-fade-in">
      <div className="topbar">
        <div>
          <h1 className="topbar-title" style={{ margin: 0 }}>Document validation</h1>
          <p className="dv-lede">Check each person's uploaded files, then pass them to HR or return them for correction.</p>
        </div>
      </div>

      <div className="page-content">
        <nav className="dv-tabs" aria-label="Validation lists">
          {tabs.map(t => (
            <button key={t.key} type="button" aria-current={activeTab === t.key ? 'page' : undefined} onClick={() => setActiveTab(t.key)}>
              {t.label}<span className="dv-tabs__count">{t.count}</span>
            </button>
          ))}
        </nav>

        {loading ? (
          <SkeletonTable rows={4} columns={4} />
        ) : currentList.length === 0 ? (
          <div className="dv-empty">
            <SmartEmptyState
              type={activeTab === 'PENDING' ? 'queue-cleared' : activeTab === 'DEFICIENCY' ? 'deficiency-cleared' : 'no-records'}
              title={activeTab === 'PENDING' ? 'Nothing to review' : activeTab === 'DEFICIENCY' ? 'Nothing returned' : 'Nothing validated yet'}
              description={
                activeTab === 'PENDING'
                  ? 'New submissions from your school appear here as soon as they are sent.'
                  : activeTab === 'DEFICIENCY'
                  ? 'Submissions you return for correction wait here until the person resubmits.'
                  : 'Submissions you pass to HR are listed here.'
              }
              primaryAction={activeTab !== 'PENDING' && pending.length > 0
                ? { label: `Review ${pending.length} waiting`, onClick: () => setActiveTab('PENDING'), icon: 'pending' }
                : undefined}
              secondaryAction={{ label: 'Refresh', onClick: fetchPendingTransactions }}
            />
          </div>
        ) : (
          <ul className="dv-list">
            {currentList.map(tx => {
              const target = tx.promotionDetails?.targetPosition;
              const complete = tx.complianceScore >= 100;
              return (
                <li key={tx.id} className="dv-row">
                  <div className="dv-row__who">
                    <strong className="dv-row__name">{tx.personnelName}</strong>
                    <span className="dv-row__move">
                      {tx.currentPosition || tx.personnelCategory}
                      {tx.isPromotion && target && <> <span aria-hidden="true">›</span> <b>{target}</b></>}
                    </span>
                    <span className="dv-row__meta">
                      {tx.isPromotion ? 'Promotion' : tx.transactionType} · TRX-{tx.id} · {tx.employeeId}
                    </span>
                  </div>

                  {activeTab === 'DEFICIENCY' ? (
                    <p className="dv-row__note">{tx.remarks || 'Returned for correction.'}</p>
                  ) : (
                    <div className="dv-row__files" aria-label={`Files ${tx.complianceScore}% complete`}>
                      <span className={`dv-row__pct ${complete ? 'is-complete' : ''}`}>{tx.complianceScore}%</span>
                      <span className="dv-row__label">{complete ? 'All required files in' : 'Files missing'}</span>
                      <span className="dv-meter"><span style={{ width: `${Math.min(100, tx.complianceScore)}%` }} /></span>
                    </div>
                  )}

                  <div className="dv-row__when">
                    {activeTab === 'HISTORY'
                      ? <StatusBadge status={tx.status} />
                      : <><span>Waiting</span><strong>{waitingFor(tx.submittedAt)}</strong></>}
                  </div>

                  <div className="dv-row__act">
                    <button className={`btn btn-sm ${activeTab === 'PENDING' ? 'btn-primary' : 'btn-secondary'} dv-btn`} onClick={() => handleOpenTransactionDetails(tx)}>
                      {activeTab === 'PENDING' ? 'Review files' : 'Open'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* AO II review: the actual uploaded files, one verdict per document */}
        {selected && (
          <TransactionReviewModal
            txId={Number(selected.id)}
            onClose={handleCloseModal}
            onDecided={() => { void fetchPendingTransactions(); handleCloseModal(); }}
          />
        )}
      </div>
    </div>
  );
};
