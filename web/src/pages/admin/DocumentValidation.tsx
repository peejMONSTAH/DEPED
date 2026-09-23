import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { accessDeniedMessage, isAccessDenied, refusalMessage } from '../../api/access';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { SkeletonTable } from '../../components/common/Skeleton';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';
import { RotateCw, ZoomIn, ZoomOut, CheckCircle2, AlertTriangle, FileText, Check, ShieldCheck, ChevronRight, ChevronLeft, X, ArrowRight, ArrowLeft } from 'lucide-react';

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

const PROMOTION_DOCUMENTS: DocumentItem[] = [
  { name: 'Oath of Office (REVISED 2025)', type: 'Oath of Office', uploadDate: new Date().toLocaleDateString() },
  { name: 'Omnibus Certification of Authenticity & Veracity', type: 'Omnibus', uploadDate: new Date().toLocaleDateString() },
  { name: 'Personal Data Sheet (CSC Form 212 Revised 2025)', type: 'PDS', uploadDate: new Date().toLocaleDateString() },
  { name: 'Work Experience Sheet (CS Form 212 Attachment)', type: 'WES', uploadDate: new Date().toLocaleDateString() },
  { name: 'PRC ID / CSC Eligibility Verification', type: 'Verification', uploadDate: new Date().toLocaleDateString() },
  { name: 'VALID PRC ID Card', type: 'PRC ID', uploadDate: new Date().toLocaleDateString() },
  { name: 'PRC Board Rating', type: 'Board Rating', uploadDate: new Date().toLocaleDateString() },
  { name: 'CSC Certificate of Eligibility', type: 'Eligibility', uploadDate: new Date().toLocaleDateString() },
  { name: 'Principal\'s Test Certificate of Rating', type: 'Principal Test', uploadDate: new Date().toLocaleDateString() },
  { name: 'CAV, Special Order, AND Official Transcript of Records (TOR)', type: 'TOR & CAV', uploadDate: new Date().toLocaleDateString() },
  { name: 'VALID NC II / NC III / TMC / NTTC Certificate', type: 'NC Certificate', uploadDate: new Date().toLocaleDateString() },
  { name: 'Latest SALN (Revised 2025)', type: 'SALN', uploadDate: new Date().toLocaleDateString() },
  { name: 'SALN Justification Letter', type: 'SALN Letter', uploadDate: new Date().toLocaleDateString() },
  { name: 'PSA Marriage Certificate', type: 'Marriage Cert', uploadDate: new Date().toLocaleDateString() },
  { name: 'PSA Birth Certificate', type: 'Birth Cert', uploadDate: new Date().toLocaleDateString() },
  { name: 'Latest Service Record', type: 'Service Record', uploadDate: new Date().toLocaleDateString() },
  { name: 'Latest DepEd Payslip', type: 'Payslip', uploadDate: new Date().toLocaleDateString() },
  { name: 'Latest Performance Rating (IPCRF / OPCRF)', type: 'IPCRF', uploadDate: new Date().toLocaleDateString() },
];

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
      : PROMOTION_DOCUMENTS,
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
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null);
  const [selectedDocNames, setSelectedDocNames] = useState<string[]>([]);
  const [docStatuses, setDocStatuses] = useState<Record<string, 'PENDING' | 'VERIFIED' | 'DEFICIENT'>>({});
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [docDeficiencyNotes, setDocDeficiencyNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DEFICIENCY' | 'HISTORY'>('PENDING');

  const handleCloseModal = () => {
    setSelected(null);
    setSelectedDocNames([]);
    openedTxIdRef.current = null;
    if (searchParams.get('txId')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('txId');
        return next;
      }, { replace: true });
    }
  };

  const toggleSelectAllDocs = (docs: DocumentItem[]) => {
    if (selectedDocNames.length === docs.length) {
      setSelectedDocNames([]);
    } else {
      setSelectedDocNames(docs.map(d => d.name));
    }
  };

  const toggleSelectDoc = (name: string) => {
    setSelectedDocNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleBulkVerify = (docNames: string[]) => {
    if (docNames.length === 0) return;
    setDocStatuses(prev => {
      const updated = { ...prev };
      docNames.forEach(name => {
        updated[name] = 'VERIFIED';
      });
      return updated;
    });
    addToast(`Marked ${docNames.length} document(s) as verified in this review. Submit the review to save it.`, 'INFO');
  };

  const handleBulkReject = (docNames: string[]) => {
    if (docNames.length === 0) return;
    setDocStatuses(prev => {
      const updated = { ...prev };
      docNames.forEach(name => {
        updated[name] = 'DEFICIENT';
      });
      return updated;
    });
    addToast(`Flagged ${docNames.length} document(s) as DEFICIENT.`, 'WARNING');
  };

  const handleOpenTransactionDetails = async (tx: Transaction) => {
    openedTxIdRef.current = String(tx.id);
    setSelected(tx);
    setSelectedDocNames([]);
    try {
      const res = await apiClient.get(`/transactions/${tx.id}`);
      const detailed = res.data?.data;
      if (detailed) {
        const initialDocStatuses: Record<string, 'PENDING' | 'VERIFIED' | 'DEFICIENT'> = {};
        const docsList = (detailed.uploadedDocuments && detailed.uploadedDocuments.length > 0)
          ? detailed.uploadedDocuments.map((d: any) => {
              const docName = d.requirementTemplate?.name || d.fileName || 'Uploaded Document';
              const isDef = d.status === 'REJECTED' || d.status === 'DEFICIENT';
              initialDocStatuses[docName] = isDef ? 'DEFICIENT' : d.status === 'VALIDATED' ? 'VERIFIED' : 'PENDING';
              return {
                id: d.id,
                name: docName,
                type: d.fileName || 'DOCUMENT',
                uploadDate: new Date(d.createdAt || Date.now()).toLocaleDateString(),
                status: d.status || 'UPLOADED',
              };
            })
          : tx.documents;

        setDocStatuses(initialDocStatuses);
        setSelected(prev => prev && prev.id === tx.id ? {
          ...prev,
          remarks: detailed.remarks || prev.remarks,
          status: detailed.status || prev.status,
          submissionStatus: detailed.status || prev.submissionStatus,
          historyLogs: detailed.history || [],
          documents: docsList,
          isPromotion: detailed.isPromotion !== undefined ? detailed.isPromotion : prev.isPromotion,
          promotionDetails: detailed.promotionDetails || prev.promotionDetails,
        } : prev);
      }
    } catch (err) {
      if (isAccessDenied(err)) {
        // The server no longer shows this record to this account. Nothing from
        // the list row may stay on screen, and the queue is reloaded.
        if (openedTxIdRef.current === String(tx.id)) handleCloseModal();
        addToast(accessDeniedMessage('transaction'), 'ERROR');
        void fetchPendingTransactions();
      } else {
        console.error('Failed to load transaction history details:', err);
      }
    }
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

  // Return for Correction State
  const [returnRemarks, setReturnRemarks] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Disqualification State
  const [dqReason, setDqReason] = useState('');
  const [showDqModal, setShowDqModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const canValidate = user?.role === 'AO_II' || user?.role === 'SYSTEM_ADMIN';

  /**
   * Handles a decision the server refused. A 404 means the transaction is no
   * longer this officer's to see (another station, or gone): everything showing
   * it closes and the queue reloads. A 403 is about the officer's own
   * permissions, e.g. their own transaction, and keeps the server's reason.
   */
  const handleRefusedDecision = (err: unknown): boolean => {
    if (!isAccessDenied(err)) return false;
    addToast(refusalMessage(err, 'transaction'), 'ERROR');
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      setShowDqModal(false);
      setShowReturnModal(false);
      handleCloseModal();
      void fetchPendingTransactions();
    }
    return true;
  };

  // Step 5: Declare QUALIFIED & Validate Submission → Status: Validated by AO II → FOR_APPROVAL to HRMO
  const handleValidate = async (txId: number) => {
    if (!selected) return;
    if (selected.documents.some(doc => docStatuses[doc.name] !== 'VERIFIED')) {
      addToast('Review every document and mark each one verified before declaring the transaction qualified.', 'ERROR');
      return;
    }
    setIsSubmitting(true);

    const documentValidations = selected.documents.map((doc: any) => ({
      documentId: doc.id,
      isValid: docStatuses[doc.name] === 'VERIFIED',
      feedback: 'Declared QUALIFIED & Validated by AO II',
    })).filter(d => d.documentId !== undefined);

    try {
      await apiClient.post(`/transactions/${txId}/validate`, {
        targetStatus: 'FOR_APPROVAL',
        remarks: 'Declared QUALIFIED & Validated by AO II',
        documentValidations,
      });
      addToast(`Transaction #${txId} declared QUALIFIED and validated. Forwarded to HRMO for final approval/ranking.`, 'SUCCESS');
      fetchPendingTransactions();
      handleCloseModal();
    } catch (err: any) {
      if (!handleRefusedDecision(err)) addToast(err.response?.data?.message || 'Failed to validate transaction.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 5: Declare DISQUALIFIED (DQ) — AO II Authority for Teaching Personnel
  const handleDisqualify = async () => {
    if (!dqReason.trim()) {
      addToast('Please enter the disqualification criteria failure reason under prescribed DepEd Order.', 'ERROR');
      return;
    }
    if (!selected) return;
    if (selected.documents.some(doc => !docStatuses[doc.name] || docStatuses[doc.name] === 'PENDING')) {
      addToast('Review every document before recording disqualification.', 'ERROR'); return;
    }
    setIsSubmitting(true);

    const policyRef = selected.promotionTrack === 'ECP' 
      ? 'DO No. 19 & 24, s. 2025 (ECP)' 
      : 'DO No. 7, s. 2023 (Natural Vacancy QS)';

    try {
      await apiClient.post(`/transactions/${selected.id}/validate`, {
        targetStatus: 'REJECTED',
        remarks: `Declared DISQUALIFIED (DQ) under ${policyRef}: ${dqReason}`,
        documentValidations: selected.documents.filter(doc => doc.id !== undefined).map(doc => ({ documentId: doc.id, isValid: docStatuses[doc.name] === 'VERIFIED', feedback: docStatuses[doc.name] === 'DEFICIENT' ? dqReason : 'Document reviewed by AO II' })),
      });
      addToast(`Applicant ${selected.personnelName} declared DISQUALIFIED (DQ) under ${policyRef}. Notice generated.`, 'WARNING');
      fetchPendingTransactions();
      setShowDqModal(false);
      handleCloseModal();
      setDqReason('');
    } catch (err: any) {
      if (!handleRefusedDecision(err)) addToast(err.response?.data?.message || 'Failed to disqualify applicant.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 5: Return for Correction → Status: Returned by AO II
  const handleReturn = async () => {
    if (!returnRemarks.trim()) {
      addToast('Please enter remarks/deficiency details before returning.', 'ERROR');
      return;
    }
    if (!selected) return;
    if (selected.documents.some(doc => !docStatuses[doc.name] || docStatuses[doc.name] === 'PENDING') || !selected.documents.some(doc => docStatuses[doc.name] === 'DEFICIENT')) {
      addToast('Review every document and flag at least one deficient item before returning the transaction.', 'ERROR'); return;
    }
    setIsSubmitting(true);

    const documentValidations = selected.documents.map((doc: any) => {
      const isDef = docStatuses[doc.name] === 'DEFICIENT';
      return {
        documentId: doc.id,
        isValid: !isDef,
        feedback: isDef ? returnRemarks : 'Verified by AO II',
      };
    }).filter(d => d.documentId !== undefined);

    try {
      await apiClient.post(`/transactions/${selected.id}/validate`, {
        targetStatus: 'DEFICIENCY',
        remarks: `Returned for correction by AO II: ${returnRemarks}`,
        documentValidations,
      });
      addToast(`Transaction #${selected.id} returned for correction. Remarks and document statuses sent to ${selected.personnelName}.`, 'WARNING');
      fetchPendingTransactions();
      setShowReturnModal(false);
      handleCloseModal();
      setReturnRemarks('');
    } catch (err: any) {
      if (!handleRefusedDecision(err)) addToast(err.response?.data?.message || 'Failed to return transaction for correction.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pending = transactions.filter(tx => tx.status === 'PENDING_VALIDATION' || tx.status === 'DRAFT' || tx.status === 'SUBMITTED' || tx.status === 'SUBMITTED_TO_AO2');
  const returnedList = transactions.filter(tx => tx.status === 'DEFICIENCY' || tx.status === 'RETURNED_BY_AO2' || tx.status === 'RETURNED');
  const processed = transactions.filter(tx => tx.status === 'FOR_APPROVAL' || tx.status === 'APPROVED' || tx.status === 'REJECTED');

  const currentList = activeTab === 'PENDING' ? pending : activeTab === 'DEFICIENCY' ? returnedList : processed;

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="topbar-title" style={{ margin: 0 }}>AO II Document Validation & Initial Qualification</h1>
          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
            DepEd Order No. 7, s. 2023 & DO 19/24, s. 2025
          </span>
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
                            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', fontWeight: 700, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AppIcon name="promotions" size={11} color="#8b5cf6" /> Selected for Promotion
                            </span>
                            {tx.promotionDetails?.targetPosition && (
                              <div className="text-xs font-semibold mt-0.5" style={{ color: '#8b5cf6' }}>
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

        {/* Review & Qualification Evaluation Modal */}
        {selected && (
          <ModalOverlay onDismiss={handleCloseModal} className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '92vw' }}>
              <div className="modal-header">
                <h3 className="modal-title">Evaluate & Validate — TRX-{selected.id}</h3>
                <button className="modal-close" onClick={handleCloseModal}>×</button>
              </div>

              <div className="modal-body">
                {/* Promotion Candidate Selected Notification Banner */}
                {selected.isPromotion && (
                  <div className="card mb-4" style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.09) 0%, rgba(59, 130, 246, 0.09) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ padding: 8, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AppIcon name="promotions" size={20} color="#7c3aed" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AppIcon name="promotions" size={14} color="#6d28d9" />
                          <span>Promotion Candidate Verification Active (Selected by HRMO)</span>
                        </div>
                        <div style={{ marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                          Applicant <strong style={{ color: 'var(--color-text-primary)' }}>{selected.personnelName}</strong> was <strong style={{ color: 'var(--color-text-primary)' }}>selected for promotion</strong> under <strong>{selected.promotionDetails?.cycleName || 'DepEd Promotion Cycle'}</strong> for target position: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.promotionDetails?.targetPosition || 'Promoted Rank'}</strong>. Please validate all submitted appointment documents to certify initial qualification before forwarding to HRMO for final approval.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Personnel Category & Evaluation Scope Header */}
                <div className={`alert ${selected.personnelCategory === 'Teaching Personnel' ? 'alert-info' : 'alert-warning'} mb-4`} style={{ fontSize: 13, padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                  <AppIcon name="compliance" size={16} />
                  <span>
                    <strong>{selected.personnelCategory} Evaluation Scope:</strong>{' '}
                    {selected.personnelCategory === 'Teaching Personnel'
                      ? `School-level evaluation by AO II under ${selected.policyFramework}. AO II has full authority to declare Qualified or Disqualified (DQ).`
                      : 'For non-teaching personnel, documentary evaluation and qualification/disqualification determination is handled by HRMO.'
                    }
                  </span>
                </div>

                {/* Personnel & Policy Details */}
                <div className="card mb-4" style={{ padding: '14px 18px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', boxShadow: 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 13 }}>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Applicant:</span> <strong style={{ color: 'var(--color-text-primary)' }}>{selected.personnelName}</strong></div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Employee ID:</span> <strong className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{selected.employeeId}</strong></div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Transaction:</span> <strong style={{ color: 'var(--color-text-primary)' }}>{selected.transactionType}</strong></div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Submitted Date:</span> <strong style={{ color: 'var(--color-text-primary)' }}>{selected.dateSubmitted}</strong></div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Prescribed Policy:</span>{' '}
                      <strong style={{ color: 'var(--color-primary)' }}>{selected.policyFramework}</strong>
                    </div>
                  </div>
                </div>

                {/* Transaction Audit Trail & Deficiency Log */}
                <div className="card mb-4" style={{ padding: '14px 18px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--color-warning)', boxShadow: 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-primary)' }}>
                    <AppIcon name="history" size={14} /> Transaction Audit Trail & History Log
                  </div>

                  {selected.remarks && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '10px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                      <strong style={{ color: 'var(--color-warning-text)' }}>Latest Remarks / Deficiency Notes:</strong>
                      <div style={{ marginTop: 3, color: 'var(--color-text-primary)', fontWeight: 600 }}>Remarks: {selected.remarks}</div>
                    </div>
                  )}

                  {selected.historyLogs && selected.historyLogs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                      {selected.historyLogs.map(log => (
                        <div
                          key={log.id}
                          style={{
                            fontSize: 11,
                            padding: '8px 12px',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 8,
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                            <span style={{ color: 'var(--color-text-primary)' }}>{log.action.replace(/_/g, ' ')}</span>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                            By: {log.user?.email || 'System'} ({log.user?.role?.name || 'User'})
                          </div>
                          {log.detailsJson?.remarks && (
                            <div style={{ color: 'var(--color-warning-text)', fontWeight: 600, marginTop: 4 }}>
                              Notes: "{log.detailsJson.remarks}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">No historical audit logs recorded yet for this transaction.</div>
                  )}
                </div>

                {/* Compliance Score */}
                <div className="card mb-4" style={{ padding: '14px 18px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', boxShadow: 'none' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Compliance Score</span>
                    <span className={`badge ${selected.complianceScore >= 100 ? 'badge-approved' : 'badge-deficiency'}`}>
                      {selected.submissionStatus}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: selected.complianceScore >= 100 ? 'var(--color-success)' : 'var(--color-warning)', marginBottom: 6 }}>
                    {selected.complianceScore}% Complete
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${selected.complianceScore}%`, height: '100%', background: selected.complianceScore >= 100 ? 'var(--color-success)' : 'var(--color-warning)' }} />
                  </div>
                </div>

                {/* Submitted Documents Section with Checkboxes & Bulk Action Bar */}
                <div className="card mb-4" style={{ padding: '14px 18px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', boxShadow: 'none' }}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="select-all-docs"
                        checked={selected.documents.length > 0 && selectedDocNames.length === selected.documents.length}
                        onChange={() => toggleSelectAllDocs(selected.documents)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                      <label htmlFor="select-all-docs" className="text-xs text-muted font-semibold uppercase" style={{ cursor: 'pointer' }}>
                        Submitted Documents ({selected.documents.length})
                      </label>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: 10 }}>v2.0 Delta Diff Tracker Active</span>
                  </div>

                  {/* Bulk Actions Bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
                    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                    marginBottom: 12, flexWrap: 'wrap', gap: 8
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      Selected: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedDocNames.length}</strong> / {selected.documents.length}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-success btn-sm"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        disabled={selectedDocNames.length === 0}
                        onClick={() => handleBulkVerify(selectedDocNames)}
                      >
                        Bulk Verify Selected ({selectedDocNames.length})
                      </button>
                      <button
                        className="btn btn-warning btn-xs"
                        style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.4)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        disabled={selectedDocNames.length === 0}
                        onClick={() => handleBulkReject(selectedDocNames)}
                      >
                        Bulk Flag Deficient ({selectedDocNames.length})
                      </button>
                    </div>
                  </div>

                  {/* Document Item List */}
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {selected.documents.map((doc, idx) => {
                      const status = docStatuses[doc.name];
                      const isChecked = selectedDocNames.includes(doc.name);
                      const checkboxId = `doc-check-${doc.id || idx}`;

                      return (
                        <div key={doc.id || doc.name || idx} style={{
                          padding: '10px 8px', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-sm)',
                          background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'transparent', borderRadius: 6, margin: '2px 0'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id={checkboxId}
                                checked={isChecked}
                                onChange={() => toggleSelectDoc(doc.name)}
                                style={{ cursor: 'pointer', width: 16, height: 16 }}
                              />
                              <label htmlFor={checkboxId} style={{ fontWeight: 500, color: 'var(--color-text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                                {doc.name}
                              </label>
                              {status === 'VERIFIED' && <span className="badge badge-approved" style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3 }}>VERIFIED</span>}
                              {status === 'DEFICIENT' && <span className="badge badge-deficiency" style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3 }}>DEFICIENT</span>}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={`btn btn-xs ${status === 'VERIFIED' ? 'btn-success' : 'btn-ghost'}`}
                                style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                onClick={() => setDocStatuses(prev => ({ ...prev, [doc.name]: 'VERIFIED' }))}
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                className={`btn btn-xs ${status === 'DEFICIENT' ? 'btn-danger' : 'btn-ghost'}`}
                                style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--color-danger)', color: status === 'DEFICIENT' ? 'white' : '#f85149', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                onClick={() => setDocStatuses(prev => ({ ...prev, [doc.name]: 'DEFICIENT' }))}
                              >
                                Flag Deficient
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: 11 }}
                                onClick={() => setViewingDoc(doc)}
                              >
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                {canValidate && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selected.personnelCategory === 'Teaching Personnel' ? (
                      <>
                        <button
                          className="btn btn-success"
                          onClick={() => handleValidate(selected.id)}
                          disabled={isSubmitting}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Declare QUALIFIED & Validate → Forward to HRMO
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => setShowDqModal(true)}
                          disabled={isSubmitting}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Declare DISQUALIFIED (DQ) under {selected.promotionTrack === 'ECP' ? 'DO 19/24, s. 2025' : 'DO 7, s. 2023'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-success"
                        onClick={() => handleValidate(selected.id)}
                        disabled={isSubmitting}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        Validate Document Completeness → Forward to HRMO
                      </button>
                    )}

                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowReturnModal(true)}
                      disabled={isSubmitting}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      Return for Correction (Deficiency)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* Full Document Inspector & Verification Workstation for AO II */}
        {viewingDoc && selected && (() => {
          const currentIndex = selected.documents.findIndex(d => d.name === viewingDoc.name);
          const totalDocs = selected.documents.length;
          const hasPrev = currentIndex > 0;
          const hasNext = currentIndex >= 0 && currentIndex < totalDocs - 1;
          const prevDoc = hasPrev ? selected.documents[currentIndex - 1] : null;
          const nextDoc = hasNext ? selected.documents[currentIndex + 1] : null;
          const currentStatus = docStatuses[viewingDoc.name];
          const rawFileName = viewingDoc.type || `${viewingDoc.name.replace(/\s+/g, '_')}.pdf`;
          const displayFileName = rawFileName.length > 38
            ? `${rawFileName.slice(0, 24)}...${rawFileName.slice(-10)}`
            : rawFileName;

          const quickDeficiencyReasons = [
            'Missing signature of affiant/officer',
            'Blurred or unreadable scan resolution',
            'Incomplete pages / missing attachment',
            'Expired PRC license card',
            'Outdated or incorrect CSC Form edition',
            'Missing official DepEd dry seal'
          ];

          return (
            <ModalOverlay onDismiss={() => { setViewingDoc(null); setRotation(0); }} className="modal-overlay" style={{ zIndex: 1100, padding: 16 }} onClick={() => { setViewingDoc(null); setRotation(0); }}>
              <div
                className="modal animate-scale-in"
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: 'min(1500px, 96vw)',
                  width: '96vw',
                  height: '92vh',
                  maxHeight: '94vh',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--color-bg-card, #ffffff)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: 16,
                  boxShadow: '0 25px 80px rgba(0, 0, 0, 0.85)',
                  overflow: 'hidden'
                }}
              >
                {/* Executive Workstation Header */}
                <div
                  className="modal-header"
                  style={{
                    padding: '14px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    flexShrink: 0
                  }}
                >
                  {/* Left: Document Info - Fully protected from squishing */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: 'var(--color-primary)'
                    }}>
                      <FileText size={22} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                        <h3
                          className="modal-title"
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            color: 'var(--color-text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 540
                          }}
                          title={viewingDoc.name}
                        >
                          {viewingDoc.name}
                        </h3>

                        {currentStatus === 'VERIFIED' ? (
                          <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            <Check size={12} /> VERIFIED
                          </span>
                        ) : currentStatus === 'DEFICIENT' ? (
                          <span className="badge badge-deficiency" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            <AlertTriangle size={12} /> DEFICIENT
                          </span>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                            Pending AO II Check
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11.5, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            background: 'var(--color-bg-tertiary)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 600
                          }}
                          title={rawFileName}
                        >
                          📄 {displayFileName}
                        </span>
                        <span>•</span>
                        <span>Applicant: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.personnelName}</strong></span>
                        <span>•</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>ID: {selected.employeeId}</span>
                        <span>•</span>
                        <span>TRX #{selected.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Inspection Controls & Document Navigation */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Document Switcher Counter */}
                    {totalDocs > 1 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'var(--color-bg-tertiary)', padding: '4px 10px',
                        borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12
                      }}>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          Document <strong style={{ color: 'var(--color-text-primary)' }}>{currentIndex + 1}</strong> of {totalDocs}
                        </span>
                        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={!hasPrev}
                            onClick={() => { if (prevDoc) { setViewingDoc(prevDoc); setRotation(0); } }}
                            style={{ padding: '2px 6px', opacity: hasPrev ? 1 : 0.3 }}
                            title={prevDoc ? `Previous: ${prevDoc.name}` : 'No previous document'}
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={!hasNext}
                            onClick={() => { if (nextDoc) { setViewingDoc(nextDoc); setRotation(0); } }}
                            style={{ padding: '2px 6px', opacity: hasNext ? 1 : 0.3 }}
                            title={nextDoc ? `Next: ${nextDoc.name}` : 'No next document'}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Zoom Toolbar */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'var(--color-bg-tertiary)', padding: '3px 8px',
                      borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12
                    }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 6px', height: 26 }}
                        onClick={() => setZoomLevel(z => Math.max(50, z - 20))}
                        title="Zoom Out"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 44, textAlign: 'center', fontWeight: 700, fontSize: 11.5 }}>
                        {zoomLevel}%
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 6px', height: 26 }}
                        onClick={() => setZoomLevel(z => Math.min(220, z + 20))}
                        title="Zoom In"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ padding: '2px 6px', marginLeft: 4, fontSize: 10 }}
                        onClick={() => setZoomLevel(100)}
                        title="Reset Zoom to 100%"
                      >
                        100%
                      </button>
                    </div>

                    {/* Rotation Button */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => setRotation(r => (r + 90) % 360)}
                      title="Rotate Document 90 Degrees"
                    >
                      <RotateCw size={13} />
                      <span>{rotation > 0 ? `${rotation}°` : 'Rotate'}</span>
                    </button>

                    {/* Close Button */}
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => { setViewingDoc(null); setRotation(0); }}
                      title="Close Inspector"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Executive Body Grid: Left Viewer Canvas (1fr) + Right Inspection & Action Station (420px) */}
                <div className="document-inspector-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {/* Left: Document View Canvas */}
                  <div style={{
                    background: '#0a0a0f',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRight: '1px solid var(--color-border)'
                  }}>
                    {/* Canvas Sub-Header Bar */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 18px', background: 'rgba(18, 18, 24, 0.9)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.07)', fontSize: 11,
                      color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-success)', fontWeight: 700 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
                          LIVE ARCHIVAL SPECIMEN
                        </span>
                        <span>•</span>
                        <span>PAGE 1 OF 1</span>
                        <span>•</span>
                        <span>300 DPI OPTICAL STANDARD</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
                        <ShieldCheck size={13} color="var(--color-primary)" />
                        <span>DEPED SDO KORONADAL HRMIS 201 REPOSITORY</span>
                      </div>
                    </div>

                    {/* Scrollable Document Stage */}
                    <div style={{
                      flex: 1,
                      overflow: 'auto',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      padding: '36px 24px',
                      background: 'radial-gradient(ellipse at center, #151620 0%, #08080c 100%)',
                    }}>
                      <div style={{
                        transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.15s ease-out',
                        marginBottom: 60,
                      }}>
                        {/* High-Fidelity DepEd Legal Paper Document Simulation */}
                        <div
                          style={{
                            width: 620,
                            minHeight: 880,
                            background: '#ffffff',
                            color: '#09090b',
                            borderRadius: 4,
                            padding: '36px 42px',
                            boxShadow: '0 25px 65px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            fontFamily: 'Arial, Helvetica, sans-serif',
                            fontSize: 12,
                            position: 'relative',
                            userSelect: 'none'
                          }}
                        >
                          {/* Top Header - Republic of the Philippines DepEd Official Letterhead */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 8 }}>
                              <div style={{
                                width: 44, height: 44, borderRadius: '50%', border: '2px solid #0f172a',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: 10, color: '#0f172a', textAlign: 'center', lineHeight: 1.1
                              }}>
                                DEPED<br />SEAL
                              </div>
                              <div style={{ textAlign: 'center', color: '#0f172a' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em' }}>REPUBLIC OF THE PHILIPPINES</div>
                                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.02em', margin: '1px 0' }}>DEPARTMENT OF EDUCATION</div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#334155' }}>REGION XII • DIVISION OF KORONADAL CITY</div>
                                <div style={{ fontSize: 9.5, color: '#475569' }}>KORONADAL CENTRAL DISTRICT • CODE: 101092</div>
                              </div>
                              <div style={{
                                width: 44, height: 44, borderRadius: '50%', border: '2px solid #0f172a',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: 9, color: '#0f172a', textAlign: 'center', lineHeight: 1.1
                              }}>
                                CSC<br />VERIFIED
                              </div>
                            </div>

                            {/* Official Double Dividing Rule */}
                            <div style={{ borderTop: '2.5px solid #0f172a', borderBottom: '1px solid #0f172a', height: 4, margin: '8px 0 16px 0' }} />

                            {/* Official Document Form Title */}
                            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 900, color: '#0f172a', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                {viewingDoc.name}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 3 }}>
                                OFFICIAL CIVIL SERVICE ATTESTATION & 201 REQUIREMENT ARCHIVE
                              </div>
                            </div>

                            {/* Form Sections Grid Table */}
                            <div style={{ border: '1.5px solid #0f172a', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
                              {/* Row 1: Section Banner */}
                              <div style={{ background: '#0f172a', color: '#ffffff', padding: '4px 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em' }}>
                                I. APPOINTEE IDENTIFICATION & POSITION PROFILE
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', borderBottom: '1px solid #cbd5e1', fontSize: 11 }}>
                                <div style={{ padding: '6px 8px', background: '#f8fafc', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>FULL LEGAL NAME</div>
                                <div style={{ padding: '6px 8px', fontWeight: 800, color: '#0f172a' }}>{selected.personnelName.toUpperCase()}</div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px 1fr', borderBottom: '1px solid #cbd5e1', fontSize: 11 }}>
                                <div style={{ padding: '6px 8px', background: '#f8fafc', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>DEPED EMPLOYEE ID</div>
                                <div style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>{selected.employeeId}</div>
                                <div style={{ padding: '6px 8px', background: '#f8fafc', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>CATEGORY</div>
                                <div style={{ padding: '6px 8px', fontWeight: 700 }}>{selected.personnelCategory}</div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', borderBottom: '1px solid #cbd5e1', fontSize: 11 }}>
                                <div style={{ padding: '6px 8px', background: '#f8fafc', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>TRANSACTION TYPE</div>
                                <div style={{ padding: '6px 8px', fontWeight: 700 }}>{selected.transactionType}</div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: 11 }}>
                                <div style={{ padding: '6px 8px', background: '#f8fafc', fontWeight: 700, borderRight: '1px solid #cbd5e1' }}>STATION ASSIGNMENT</div>
                                <div style={{ padding: '6px 8px' }}>Koronadal Central Elementary School — District II</div>
                              </div>
                            </div>

                            {/* Form Section II: DepEd Governance & Policy Framework */}
                            <div style={{ border: '1.5px solid #0f172a', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
                              <div style={{ background: '#0f172a', color: '#ffffff', padding: '4px 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em' }}>
                                II. REGULATORY COMPLIANCE & LEGAL ATTESTATION
                              </div>

                              <div style={{ padding: '10px 12px', fontSize: 10.5, lineHeight: 1.6, color: '#1e293b' }}>
                                • This document has been officially submitted by the appointee under the prescribed guidelines of <strong>{selected.policyFramework || 'DepEd Order No. 7, s. 2023'}</strong>.<br />
                                • Under official DepEd SDO Koronadal standards, school-level evaluation is conducted by the <strong>Administrative Officer II (AO II)</strong> to confirm document completeness, dry seal authentication, and administrative validity before division elevation.<br />
                                • <strong>Archival Ref:</strong> ARC-2026-{selected.id}-DEPED-KOR • <strong>Uploaded:</strong> {viewingDoc.uploadDate}
                              </div>
                            </div>

                            {/* Simulated Watermark Stamp Overlay */}
                            <div style={{
                              margin: '24px auto',
                              width: 220,
                              height: 60,
                              border: '2.5px solid #16a34a',
                              borderRadius: 8,
                              transform: 'rotate(-4deg)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#16a34a',
                              fontFamily: 'monospace',
                              fontWeight: 900,
                              lineHeight: 1.2,
                              textAlign: 'center',
                              letterSpacing: '0.05em'
                            }}>
                              <span style={{ fontSize: 12 }}>★ AUTHENTICATED ★</span>
                              <span style={{ fontSize: 9.5 }}>DEPED SDO KORONADAL 201</span>
                              <span style={{ fontSize: 8 }}>CSC QUALITY STANDARDS MET</span>
                            </div>
                          </div>

                          {/* Bottom Attestation & Signature Box */}
                          <div style={{ borderTop: '1.5px solid #0f172a', paddingTop: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'flex-end' }}>
                              <div>
                                <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 4 }}>DIGITAL ARCHIVE AUDIT STAMP:</div>
                                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#334155', lineHeight: 1.4 }}>
                                  SHA-256: 4f8a9e21...8b7c3d10 (VERIFIED)<br />
                                  300 DPI OPTICAL SPECIMEN • TAMPER-PROOF<br />
                                  STORAGE: SDO-KOR-CLOUD-ARCHIVE
                                </div>
                              </div>

                              <div style={{ textAlign: 'center' }}>
                                <div style={{
                                  fontFamily: 'cursive', fontSize: 15, color: '#1e3a8a',
                                  transform: 'rotate(-3deg)', marginBottom: 2
                                }}>
                                  Atty. AO II Validated
                                </div>
                                <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, fontWeight: 800, fontSize: 10, color: '#0f172a' }}>
                                  ADMINISTRATIVE OFFICER II (AO II)
                                </div>
                                <div style={{ fontSize: 9, color: '#64748b' }}>
                                  Designated School Evaluator • DepEd Koronadal
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Inspection & Verification Action Workstation */}
                  <div style={{
                    background: 'var(--color-bg-card, #ffffff)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    padding: '20px 22px',
                    gap: 16,
                    borderLeft: '1px solid var(--color-border)'
                  }}>
                    {/* Panel Title */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
                        AO II Evaluation Workstation
                      </div>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>DepEd DO 7 Standard</span>
                    </div>

                    {/* Bento 1: Document Decision Banner */}
                    <div className="card" style={{
                      padding: 16,
                      background: currentStatus === 'VERIFIED'
                        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(34, 197, 94, 0.04) 100%)'
                        : currentStatus === 'DEFICIENT'
                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0.04) 100%)'
                        : 'var(--color-bg-secondary)',
                      border: currentStatus === 'VERIFIED'
                        ? '1px solid rgba(34, 197, 94, 0.4)'
                        : currentStatus === 'DEFICIENT'
                        ? '1px solid rgba(239, 68, 68, 0.4)'
                        : '1px solid var(--color-border)',
                      boxShadow: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: currentStatus === 'VERIFIED' ? 'rgba(34, 197, 94, 0.2)' : currentStatus === 'DEFICIENT' ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-bg-tertiary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          {currentStatus === 'VERIFIED' ? (
                            <CheckCircle2 size={20} color="var(--color-success)" />
                          ) : currentStatus === 'DEFICIENT' ? (
                            <AlertTriangle size={20} color="var(--color-danger)" />
                          ) : (
                            <ShieldCheck size={20} color="var(--color-primary)" />
                          )}
                        </div>

                        <div>
                          <div style={{
                            fontWeight: 800, fontSize: 13.5,
                            color: currentStatus === 'VERIFIED' ? 'var(--color-success)' : currentStatus === 'DEFICIENT' ? '#f87171' : 'var(--color-text-primary)'
                          }}>
                            {currentStatus === 'VERIFIED'
                              ? 'Document Certified: VERIFIED'
                              : currentStatus === 'DEFICIENT'
                              ? 'Document Flagged: DEFICIENT'
                              : 'Pending AO II Verification'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {currentStatus === 'VERIFIED'
                              ? 'Complies with DepEd standards and requirement checklists.'
                              : currentStatus === 'DEFICIENT'
                              ? 'Deficiency flagged. Resubmission required.'
                              : 'Review document scan on the left and assign status.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bento 2: Primary Action Center */}
                    <div className="card" style={{ padding: 16, background: 'var(--color-bg-secondary)', boxShadow: 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                        Assign Document Status
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                          type="button"
                          className={`btn ${currentStatus === 'VERIFIED' ? 'btn-success' : 'btn-outline-success'}`}
                          style={{
                            padding: '12px 16px',
                            fontWeight: 700,
                            fontSize: 13,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            borderRadius: 8,
                            border: '1.5px solid var(--color-success)',
                            background: currentStatus === 'VERIFIED' ? 'var(--color-success)' : 'rgba(34, 197, 94, 0.08)',
                            color: currentStatus === 'VERIFIED' ? '#ffffff' : 'var(--color-success)'
                          }}
                          onClick={() => {
                            setDocStatuses(prev => ({ ...prev, [viewingDoc.name]: 'VERIFIED' }));
                            addToast(`Document "${viewingDoc.name}" marked as verified in this review.`, 'INFO');
                            if (hasNext && nextDoc) {
                              setViewingDoc(nextDoc);
                              setRotation(0);
                            }
                          }}
                        >
                          <Check size={16} />
                          <span>{currentStatus === 'VERIFIED' ? 'Certified VERIFIED ✓' : 'Mark Document as VERIFIED'}</span>
                          {hasNext && <span style={{ fontSize: 10.5, opacity: 0.85 }}>(Auto-Advance →)</span>}
                        </button>

                        <button
                          type="button"
                          className={`btn ${currentStatus === 'DEFICIENT' ? 'btn-danger' : 'btn-outline-danger'}`}
                          style={{
                            padding: '12px 16px',
                            fontWeight: 700,
                            fontSize: 13,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            borderRadius: 8,
                            border: '1.5px solid var(--color-danger)',
                            background: currentStatus === 'DEFICIENT' ? 'var(--color-danger)' : 'rgba(239, 68, 68, 0.08)',
                            color: currentStatus === 'DEFICIENT' ? '#ffffff' : '#f87171'
                          }}
                          onClick={() => {
                            setDocStatuses(prev => ({ ...prev, [viewingDoc.name]: 'DEFICIENT' }));
                            addToast(`Document "${viewingDoc.name}" flagged as DEFICIENT.`, 'WARNING');
                          }}
                        >
                          <AlertTriangle size={16} />
                          <span>{currentStatus === 'DEFICIENT' ? 'Flagged as DEFICIENT ⚠' : 'Flag Document as DEFICIENT'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Bento 3: Deficiency Notes & Quick Presets */}
                    <div className="card" style={{ padding: 16, background: 'var(--color-bg-secondary)', boxShadow: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                          Deficiency Feedback & Guidance
                        </div>
                        {currentStatus === 'DEFICIENT' && (
                          <span style={{ fontSize: 10.5, color: 'var(--color-danger)', fontWeight: 700 }}>Required for Return</span>
                        )}
                      </div>

                      {/* Quick Tag Pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {quickDeficiencyReasons.map((reason, rIdx) => (
                          <button
                            key={rIdx}
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{
                              fontSize: 10.5,
                              padding: '3px 8px',
                              background: 'var(--color-bg-tertiary)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 6,
                              color: 'var(--color-text-secondary)',
                              textAlign: 'left'
                            }}
                            onClick={() => {
                              setDocDeficiencyNotes(prev => ({
                                ...prev,
                                [viewingDoc.name]: prev[viewingDoc.name] ? `${prev[viewingDoc.name]}; ${reason}` : reason
                              }));
                              setDocStatuses(prev => ({ ...prev, [viewingDoc.name]: 'DEFICIENT' }));
                            }}
                          >
                            + {reason}
                          </button>
                        ))}
                      </div>

                      {/* Notes Textarea */}
                      <textarea
                        aria-label="Add specific correction instructions for the personnel"
                        rows={3}
                        className="input"
                        style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
                        placeholder="Add specific correction instructions for the personnel..."
                        value={docDeficiencyNotes[viewingDoc.name] || ''}
                        onChange={e => setDocDeficiencyNotes({ ...docDeficiencyNotes, [viewingDoc.name]: e.target.value })}
                      />
                    </div>

                    {/* Bento 4: DepEd Authenticity Checklist Audit */}
                    <div className="card" style={{ padding: 16, background: 'var(--color-bg-secondary)', boxShadow: 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                        DepEd Authenticity Checklist
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
                          <CheckCircle2 size={15} color="var(--color-success)" />
                          <span>Official DepEd / CSC Form Template</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
                          <CheckCircle2 size={15} color="var(--color-success)" />
                          <span>Administering Officer Dry Seal Legible</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
                          <CheckCircle2 size={15} color="var(--color-success)" />
                          <span>Appointee Affirmation Signature Affixed</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
                          <CheckCircle2 size={15} color="var(--color-success)" />
                          <span>300 DPI Archival Scan Clarity Met</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Sequential Navigation Footer */}
                    <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {hasNext && nextDoc && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
                          onClick={() => { setViewingDoc(nextDoc); setRotation(0); }}
                        >
                          <span>Next Requirement: {nextDoc.name.slice(0, 26)}...</span>
                          <ArrowRight size={15} />
                        </button>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        {hasPrev && prevDoc && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                            onClick={() => { setViewingDoc(prevDoc); setRotation(0); }}
                          >
                            <ArrowLeft size={13} />
                            <span>Previous Doc</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ModalOverlay>
          );
        })()}

        {/* Disqualification (DQ) Modal */}
        {showDqModal && selected && (
          <ModalOverlay onDismiss={() => setShowDqModal(false)} className="modal-overlay" onClick={() => setShowDqModal(false)}>
            <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Declare Disqualified (DQ) — TX #{selected.id}
                </h3>
              </div>

              <div className="alert alert-danger mb-4" style={{ fontSize: 13 }}>
                <AppIcon name="warning" size={16} />
                <span>
                  Declaring <strong>{selected.personnelName}</strong> DISQUALIFIED (DQ) at school level under{' '}
                  <strong>{selected.promotionTrack === 'ECP' ? 'DepEd Order No. 19 & 24, s. 2025' : 'DepEd Order No. 7, s. 2023'}</strong>.
                </span>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Disqualification Criteria Failure Remarks *</label>
                <textarea
                  aria-label="Disqualification Criteria Failure Remarks"
                  className="form-input"
                  rows={4}
                  placeholder={
                    selected.promotionTrack === 'ECP' 
                      ? 'Specify ECP criteria failure under DO 19 & 24, s. 2025 (e.g. Inadequate years of teaching service, unaligned performance ratings, incomplete portfolio MOV)...'
                      : 'Specify Natural Vacancy QS failure under DO 7, s. 2023 (e.g. Does not meet minimum education/experience requirements for Teacher I)...'
                  }
                  value={dqReason}
                  onChange={e => setDqReason(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDqModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleDisqualify} disabled={isSubmitting}>
                  {isSubmitting ? 'Disqualifying…' : 'Confirm DISQUALIFIED (DQ) Status'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {/* Return for Correction Modal */}
        {showReturnModal && selected && (
          <ModalOverlay onDismiss={() => setShowReturnModal(false)} className="modal-overlay" onClick={() => setShowReturnModal(false)}>
            <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <h3 className="modal-title">↩ Return for Correction — TX #{selected.id}</h3>
              </div>

              <p className="text-sm text-muted mb-4">
                Enter deficiency details. This will set status to <strong>"Returned by AO II"</strong> and notify {selected.personnelName} to correct and resubmit.
              </p>

              <div className="form-group mb-4">
                <label className="form-label">Deficiency Remarks / Correction Instructions *</label>
                <textarea
                  aria-label="Deficiency Remarks / Correction Instructions"
                  className="form-input"
                  rows={4}
                  placeholder="e.g. Missing IPCR Performance Rating for the 2nd Semester 2025. Please upload the most recent rating with at least Very Satisfactory result."
                  value={returnRemarks}
                  onChange={e => setReturnRemarks(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleReturn} disabled={isSubmitting}>
                  {isSubmitting ? 'Returning…' : 'Confirm Return → Notify Personnel'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </div>
    </div>
  );
};
