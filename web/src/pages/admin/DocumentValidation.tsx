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

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="topbar-title" style={{ margin: 0 }}>AO II Document Validation & Initial Qualification</h1>
        </div>
      </div>

      <div className="page-content">
        {/* Tab Filter Bar for AO II */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${activeTab === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('PENDING')}
          >
            Submissions Awaiting Validation ({pending.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'DEFICIENCY' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('DEFICIENCY')}
          >
            Returned / Deficient ({returnedList.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'HISTORY' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('HISTORY')}
          >
            Validated & Processed ({processed.length})
          </button>
        </div>

        {/* Dynamic Queue Table */}
        <div className="card mb-6">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="card-title">
              {activeTab === 'PENDING' ? `Awaiting Validation (${pending.length})` : activeTab === 'DEFICIENCY' ? `Returned for Correction / Deficiency (${returnedList.length})` : `Validated & Processed History (${processed.length})`}
            </h3>
            <span className={`badge ${activeTab === 'PENDING' ? 'badge-pending' : activeTab === 'DEFICIENCY' ? 'badge-deficiency' : 'badge-approved'}`}>
              {currentList.length} Items
            </span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <SkeletonTable rows={5} columns={7} />
          ) : currentList.length === 0 ? (
            <div style={{ padding: '24px' }}>
              <SmartEmptyState
                type={activeTab === 'PENDING' ? 'queue-cleared' : activeTab === 'DEFICIENCY' ? 'deficiency-cleared' : 'no-records'}
                title={
                  activeTab === 'PENDING'
                    ? 'No Pending Validation Requests'
                    : activeTab === 'DEFICIENCY'
                    ? 'Zero Deficiencies Recorded'
                    : 'No Validated Transactions Yet'
                }
                description={
                  activeTab === 'PENDING'
                    ? 'All applicant and personnel submissions under your school jurisdiction have been evaluated.'
                    : activeTab === 'DEFICIENCY'
                    ? 'All submitted documents meet official DepEd Quality Standards. No deficient records found.'
                    : 'Validated transactions forwarded to HRMO will be listed here.'
                }
                primaryAction={
                  activeTab !== 'PENDING' && pending.length > 0
                    ? {
                        label: `Back to Pending Queue (${pending.length})`,
                        onClick: () => setActiveTab('PENDING'),
                        icon: 'pending',
                      }
                    : undefined
                }
                secondaryAction={{
                  label: 'Refresh List',
                  onClick: fetchPendingTransactions,
                }}
              />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ref ID</th>
                    <th>Personnel Name</th>
                    <th>Category & Track</th>
                    {activeTab === 'DEFICIENCY' ? <th>Deficiency Remarks / Reason</th> : <th>Prescribed Policy Standard</th>}
                    <th>Compliance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.map(tx => (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#007bff' }}>TRX-{tx.id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{tx.personnelName}</div>
                        <div className="text-xs text-muted">{tx.employeeId}</div>
                      </td>
                      <td>
                        <span className="badge badge-info">{tx.personnelCategory}</span>
                        <div className="text-xs text-muted mt-1 font-semibold">
                          • {tx.promotionTrack || tx.transactionType || 'Promotion'}
                        </div>
                        {tx.isPromotion && (
                          <div className="mt-1.5">
                            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c79a2e', border: '1px solid rgba(139, 92, 246, 0.3)', fontWeight: 700, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AppIcon name="promotions" size={11} color="#c79a2e" /> Selected for Promotion
                            </span>
                            {tx.promotionDetails?.targetPosition && (
                              <div className="text-xs font-semibold mt-0.5" style={{ color: '#c79a2e' }}>
                                Target: {tx.promotionDetails.targetPosition}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {activeTab === 'DEFICIENCY' ? (
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-text)', fontWeight: 600, maxWidth: 280 }}>
                          {tx.remarks || 'Returned due to document deficiencies requiring re-upload.'}
                        </td>
                      ) : (
                        <td style={{ fontSize: 'var(--text-xs)' }}>
                          <span className="badge badge-secondary">
                            {tx.promotionTrack === 'ECP' ? 'DO 19 & 24, s. 2025' : tx.personnelCategory === 'Teaching Personnel' ? 'DO 7, s. 2023 (QS)' : 'Division HRMO Scope'}
                          </span>
                        </td>
                      )}
                      <td>
                        <div style={{ fontWeight: 700, color: tx.complianceScore >= 100 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          {tx.complianceScore}%
                        </div>
                      </td>
                      <td><StatusBadge status={tx.status} /></td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => handleOpenTransactionDetails(tx)}>
                          {activeTab === 'DEFICIENCY' ? 'View Deficiency & History' : 'Review & Evaluate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>

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
