import { ModalOverlay } from '../../components/common/ModalOverlay';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import { playSuccessChime } from '../../utils/sound.utils';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { SkeletonStats, SkeletonList } from '../../components/common/Skeleton';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';
import { clickable } from '../../a11y/clickable';

// ─── 201-System-Workflow.md: HRMO Steps 1, 2, 3 ──────────────────────────────
// Step 1: Review Validated Transactions — displays Personnel Profile, Compliance Information, Uploaded Documents, Validation History
// Step 2: Final Approval — "Approve" → Status: Approved → part of official digital 201 file
//                         "Return" → Status: Returned by HRMO → personnel notification
// Step 3: Career Lifecycle Update — auto updates Appointment History, Promotion History,
//          Salary Adjustment History, Service Records, Transaction History

type DetailedDocument = {
  id?: number;
  name: string;
  type?: string;
  status?: string;
  validationNotes?: string;
  validatedBy?: string;
};

type Transaction = {
  id: number;
  personnelName: string;
  employeeId: string;
  transactionType: string;
  personnelCategory: string;
  dateSubmitted: string;
  validatedBy: string;
  validatedDate: string;
  complianceScore: number;
  currentPosition: string;
  yearsInService: number;
  status: string;
  validationHistory: string[];
  documents: string[];
  detailedDocuments?: DetailedDocument[];
  careerUpdateTriggered: boolean;
  isPromotion?: boolean;
  promotionDetails?: {
    isSelected: boolean;
    cycleName: string;
    targetPosition: string;
    cycleType: string;
  } | null;
  remarks?: string;
  resubmissionCount?: number;
};

// Step 3: Career Lifecycle Update fields
const CAREER_UPDATE_FIELDS = [
  { label: 'Appointment History',       icon: 'transactions', description: 'New appointment entry recorded in 201 ledger' },
  { label: 'Promotion History',         icon: 'promotions',   description: 'Promotion milestone and rank progression logged' },
  { label: 'Salary Adjustment History', icon: 'salary',       description: 'Official salary grade and step increment updated' },
  { label: 'Service Records',           icon: 'repository',   description: 'Certified tenure service record synchronized' },
  { label: 'Transaction History',       icon: 'reports',      description: 'Permanent transaction audit reference recorded' },
];

type TabFilter = 'FOR_APPROVAL' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'ALL';

export const TransactionApproval: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openedTxIdRef = useRef<string | null>(null);
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { user } = useAuthContext();
  const [approvals, setApprovals] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DetailedDocument | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('FOR_APPROVAL');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [returnRemarks, setReturnRemarks] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showCareerUpdate, setShowCareerUpdate] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);

  const canApprove = user?.role === 'HRMO' || user?.role === 'SYSTEM_ADMIN';

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch both for-approval and all transactions so HRMO has full visibility
      const res = await apiClient.get('/transactions?limit=1000');
      const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const mapped: Transaction[] = list.map((tx: any) => {
        const isPromo = tx.isPromotion || tx.transactionType?.name?.toUpperCase().includes('PROMOTION') || !!tx.promotionDetails;
        const promoDetails = tx.promotionDetails || (isPromo ? {
          isSelected: true,
          cycleName: 'DepEd Promotion Cycle',
          targetPosition: tx.personnel?.designation || 'Master Teacher I',
          cycleType: 'NATURAL_VACANCY',
        } : null);

        const hired = tx.personnel?.dateHired ? new Date(tx.personnel.dateHired) : new Date();
        const years = Math.max(0, Math.floor((Date.now() - hired.getTime()) / (1000 * 60 * 60 * 24 * 365.25)));

        return {
          id: tx.id,
          personnelName: tx.personnel ? `${tx.personnel.lastName}, ${tx.personnel.firstName}` : 'Personnel Member',
          employeeId: tx.personnel?.employeeId || `EMP-${tx.personnelId}`,
          transactionType: tx.transactionType?.name || 'HR Transaction',
          personnelCategory: tx.personnel?.designation?.toLowerCase().includes('teacher') ? 'Teaching Personnel' : 'Non-Teaching Personnel',
          dateSubmitted: tx.submissionDate ? new Date(tx.submissionDate).toLocaleDateString() : new Date(tx.createdAt).toLocaleDateString(),
          validatedBy: tx.validatedBy?.email || 'Recorded validator',
          validatedDate: tx.validationDate ? new Date(tx.validationDate).toLocaleDateString() : new Date(tx.updatedAt || tx.createdAt).toLocaleDateString(),
          complianceScore: tx.complianceScore ?? 0,
          currentPosition: tx.personnel?.designation || 'Staff',
          yearsInService: years,
          status: tx.status,
          validationHistory: [],
          documents: (tx.uploadedDocuments || []).map((d: any) => d.fileName || 'Uploaded File'),
          careerUpdateTriggered: tx.status === 'APPROVED' || tx.status === 'COMPLETED',
          isPromotion: isPromo,
          promotionDetails: promoDetails,
          remarks: tx.remarks || '',
          resubmissionCount: tx.resubmissionCount ?? 0,
        };
      });

      setApprovals(mapped);

      const targetTxId = searchParams.get('txId');
      if (targetTxId && openedTxIdRef.current !== targetTxId) {
        const found = mapped.find((t: any) => t.id === parseInt(targetTxId, 10));
        if (found) {
          openedTxIdRef.current = targetTxId;
          handleOpenTransactionDetails(found);
        }
      }
    } catch (err) {
      console.error('Failed to load approvals:', err);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  const handleOpenTransactionDetails = async (tx: Transaction) => {
    openedTxIdRef.current = String(tx.id);
    setSelected(tx);
    try {
      const res = await apiClient.get(`/transactions/${tx.id}`);
      const detailed = res.data?.data;
      if (detailed) {
        const docsList: DetailedDocument[] = (detailed.uploadedDocuments && detailed.uploadedDocuments.length > 0)
          ? detailed.uploadedDocuments.map((d: any) => ({
              id: d.id,
              name: d.requirementTemplate?.name || d.fileName || 'Uploaded Document',
              type: d.fileName || 'DOCUMENT',
              status: d.status || 'REQUIRES_MANUAL_REVIEW',
              validationNotes: d.validationNotes || '',
              validatedBy: d.validatedBy?.email || 'Not yet recorded',
            }))
          : tx.documents.map(d => ({ name: d, status: 'REQUIRES_MANUAL_REVIEW' }));

        const historyList = (detailed.history || []).map((h: any) =>
          `[${new Date(h.timestamp || Date.now()).toLocaleDateString()}] ${h.action}: ${h.user?.email || 'System'} (${h.user?.role?.name || 'USER'})`
        );

        setSelected(prev => prev && prev.id === tx.id ? {
          ...prev,
          status: detailed.status || prev.status,
          detailedDocuments: docsList,
          validationHistory: historyList.length > 0 ? historyList : prev.validationHistory,
          isPromotion: detailed.isPromotion !== undefined ? detailed.isPromotion : prev.isPromotion,
          promotionDetails: detailed.promotionDetails || prev.promotionDetails,
          remarks: detailed.remarks || prev.remarks,
        } : prev);
      }
    } catch (err) {
      console.error('Failed to load transaction history details for HRMO:', err);
    }
  };

  useRealtimeTransactions(fetchApprovals);

  // Status-segregated counts
  const forApprovalList = useMemo(() => approvals.filter(a => a.status === 'FOR_APPROVAL'), [approvals]);
  const approvedList    = useMemo(() => approvals.filter(a => a.status === 'APPROVED' || a.status === 'COMPLETED'), [approvals]);
  // Returned means 'fix it and resubmit'; rejected means the request is over.
  // Merging them hid that difference from the officer reading the queue.
  // Returned work has status DEFICIENCY; the old 'RETURNED' filter matched nothing, so this tab was always empty.
  const returnedList    = useMemo(() => approvals.filter(a => a.status === 'DEFICIENCY'), [approvals]);
  const rejectedList    = useMemo(() => approvals.filter(a => a.status === 'REJECTED'), [approvals]);

  // Tab and Search filtering
  const displayList = useMemo(() => {
    let list: Transaction[] = [];
    if (activeTab === 'FOR_APPROVAL') list = forApprovalList;
    else if (activeTab === 'APPROVED') list = approvedList;
    else if (activeTab === 'RETURNED') list = returnedList;
    else if (activeTab === 'REJECTED') list = rejectedList;
    else list = approvals;

    return list.filter(tx => {
      const matchSearch =
        tx.personnelName.toLowerCase().includes(search.toLowerCase()) ||
        tx.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        String(tx.id).includes(search) ||
        tx.transactionType.toLowerCase().includes(search.toLowerCase());

      const matchCategory =
        categoryFilter === 'ALL' ||
        (categoryFilter === 'TEACHING' && tx.personnelCategory.includes('Teaching')) ||
        (categoryFilter === 'NON_TEACHING' && tx.personnelCategory.includes('Non-Teaching')) ||
        (categoryFilter === 'PROMOTION' && tx.isPromotion);

      return matchSearch && matchCategory;
    });
  }, [approvals, activeTab, forApprovalList, approvedList, returnedList, search, categoryFilter]);

  const toggleSelectTx = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTxIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    if (selectedTxIds.length === 0) return;

    const { confirmed } = await confirm({
      title: 'Approve transactions',
      message: `Give final HRMO approval to ${selectedTxIds.length} transaction${selectedTxIds.length === 1 ? '' : 's'}? This updates the affected career records and cannot be undone from this screen.`,
      confirmLabel: `Approve ${selectedTxIds.length}`,
      tone: 'primary',
      icon: 'approvals',
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await Promise.all(selectedTxIds.map(id => apiClient.post(`/transactions/${id}/approve`, { isApproved: true, notes: 'Bulk approved by HRMO' })));
      playSuccessChime();
      addToast(`Batch approved ${selectedTxIds.length} transactions successfully! Career records updated.`, 'SUCCESS');
      setSelectedTxIds([]);
      fetchApprovals();
    } catch (err: any) {
      addToast('Failed to execute bulk approval.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkExportPdf = async () => {
    if (selectedTxIds.length === 0) return;
    setIsSubmitting(true);
    let downloaded = 0;
    try {
      for (const txId of selectedTxIds) {
        const detailResponse = await apiClient.get(`/transactions/${txId}`);
        const documents = detailResponse.data?.data?.uploadedDocuments || [];
        for (const document of documents) {
          const fileResponse = await apiClient.get(`/documents/${document.id}/download`, { responseType: 'blob' });
          const url = URL.createObjectURL(fileResponse.data);
          const anchor = window.document.createElement('a');
          anchor.href = url;
          anchor.download = `TRX-${txId}-${String(document.fileName || `document-${document.id}.pdf`).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
          window.document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
          downloaded += 1;
        }
      }
      addToast(downloaded > 0 ? `Downloaded ${downloaded} dossier document${downloaded === 1 ? '' : 's'}.` : 'No uploaded documents were found for the selected transactions.', downloaded > 0 ? 'SUCCESS' : 'WARNING');
    } catch (error: any) {
      addToast(error.response?.data?.message || `Download stopped after ${downloaded} document${downloaded === 1 ? '' : 's'}.`, 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Approve → Status: Approved → triggers Step 3 Career Lifecycle Update
  const handleApprove = async (tx: Transaction) => {
    const { confirmed } = await confirm({
      title: 'Final HRMO approval',
      message: `Give final approval to ${tx.personnelName}'s ${tx.transactionType}? This updates their career record and cannot be undone from this screen.`,
      confirmLabel: 'Approve transaction',
      tone: 'primary',
      icon: 'approvals',
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await apiClient.post(`/transactions/${tx.id}/approve`, {
        isApproved: true,
        notes: 'Final Approved by HRMO',
      });
      playSuccessChime();
      addToast(`Transaction #${tx.id} APPROVED by HRMO. Career record updated!`, 'SUCCESS');
      setSelected(null);
      fetchApprovals();
      setShowCareerUpdate(tx);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to approve transaction.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Return → Status: Returned by HRMO → personnel notified
  const handleReturn = async () => {
    if (!returnRemarks.trim()) {
      addToast('Please enter return remarks before proceeding.', 'ERROR');
      return;
    }
    if (!selected) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(`/transactions/${selected.id}/approve`, {
        isApproved: false,
        notes: returnRemarks,
      });
      addToast(`Transaction #${selected.id} returned by HRMO. Personnel notified with remarks.`, 'WARNING');
      setShowReturnModal(false);
      setSelected(null);
      setReturnRemarks('');
      fetchApprovals();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to return transaction.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Topbar */}
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0 }}>HRMO — Final Approval</h1>
        <div className="topbar-actions flex items-center gap-2">
          {selectedTxIds.length > 0 && canApprove && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleBulkExportPdf}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <AppIcon name="download" size={14} /> Download dossier files
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleBulkApprove}
                disabled={isSubmitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <AppIcon name="check" size={14} /> Approve {selectedTxIds.length} Selected
              </button>
            </>
          )}
          <span className={forApprovalList.length > 0 ? 'badge badge-pending' : 'badge badge-approved'}>
            {forApprovalList.length > 0 ? `${forApprovalList.length} Awaiting Approval` : 'Queue Cleared'}
          </span>
        </div>
      </div>

      <div className="page-content" style={{ paddingBottom: '60px' }}>
        {/* Top 4 Metric Overview Cards */}
        {loading ? (
          <SkeletonStats count={4} columns={4} />
        ) : (
          <div className="compliance-stats-grid" style={{ gridTemplateColumns: 'var(--layout-columns-4, repeat(4, 1fr))', marginBottom: '20px' }}>
            <div className="compliance-stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B'
                }}>
                  <AppIcon name="pending" size={20} color="#F59E0B" />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: forApprovalList.length > 0 ? '#F59E0B' : '#10B981',
                  background: forApprovalList.length > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  padding: '2px 8px', borderRadius: 9999
                }}>
                  {forApprovalList.length > 0 ? 'ACTION REQUIRED' : 'CLEARED'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 4 }}>
                  {forApprovalList.length}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Awaiting Final Approval
                </div>
              </div>
            </div>

            <div className="compliance-stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981'
                }}>
                  <AppIcon name="approved" size={20} color="#10B981" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: 9999 }}>
                  201 UPDATED
                </span>
              </div>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 4 }}>
                  {approvedList.length}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Certified & Approved
                </div>
              </div>
            </div>

            <div className="compliance-stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '12px',
                  background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F97316'
                }}>
                  <AppIcon name="returned" size={20} color="#F97316" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#F97316', background: 'rgba(249, 115, 22, 0.12)', padding: '2px 8px', borderRadius: 9999 }}>
                  CORRECTIONS
                </span>
              </div>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 4 }}>
                  {returnedList.length}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Returned by HRMO
                </div>
              </div>
            </div>

            <div className="compliance-stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '12px',
                  background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C79A2E'
                }}>
                  <AppIcon name="repository" size={20} color="#C79A2E" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#C79A2E', background: 'rgba(139, 92, 246, 0.12)', padding: '2px 8px', borderRadius: 9999 }}>
                  REAL-TIME
                </span>
              </div>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 4 }}>
                  100%
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  201 Vault Sync Health
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Segmented Pill Tabs */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'var(--glass-bg-subtle)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: '9999px',
          padding: '4px',
          gap: '4px',
          marginBottom: '20px',
          boxShadow: 'var(--glass-shadow)',
          flexWrap: 'wrap'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('FOR_APPROVAL')}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'FOR_APPROVAL' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'FOR_APPROVAL' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'FOR_APPROVAL' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="pending" size={14} color={activeTab === 'FOR_APPROVAL' ? 'currentColor' : undefined} />
            <span>Awaiting Approval ({forApprovalList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('APPROVED')}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'APPROVED' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'APPROVED' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'APPROVED' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="approved" size={14} color={activeTab === 'APPROVED' ? 'currentColor' : undefined} />
            <span>Approved History ({approvedList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RETURNED')}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'RETURNED' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'RETURNED' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'RETURNED' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="returned" size={14} color={activeTab === 'RETURNED' ? 'currentColor' : undefined} />
            <span>Returned for Correction ({returnedList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REJECTED')}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'REJECTED' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'REJECTED' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'REJECTED' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <AppIcon name="error" size={14} color={activeTab === 'REJECTED' ? 'currentColor' : undefined} />
            <span>Rejected ({rejectedList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              border: 'none',
              background: activeTab === 'ALL' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'ALL' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'ALL' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none'
            }}
          >
            <span>All ({approvals.length})</span>
          </button>
        </div>

        {/* Filter & Search Controls */}
        <div className="compliance-filter-bar" style={{ marginTop: 0, marginBottom: '20px' }}>
          <div className="search-bar" style={{ flex: '1 1 320px', maxWidth: 420 }}>
            <span className="search-icon">
              <AppIcon name="search" size={15} color="var(--color-text-muted)" />
            </span>
            <input
              aria-label="Search by personnel, ID, or TRX number"
              type="text"
              className="search-input"
              style={{ paddingLeft: '44px' }}
              placeholder="Search by personnel, ID, or TRX number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="tq-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'All Categories', value: 'ALL' },
              { label: 'Teaching', value: 'TEACHING' },
              { label: 'Non-Teaching', value: 'NON_TEACHING' },
              { label: 'Promotion Cycle', value: 'PROMOTION' },
            ].map(cat => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategoryFilter(cat.value)}
                className={`tq-filter-pill ${categoryFilter === cat.value ? 'is-active' : ''}`}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Master-Detail Layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: selected ? 'var(--layout-master-detail, minmax(0, 1fr) minmax(300px, 520px))' : 'minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'start'
        }}>
          {/* Main Transaction List Container */}
          <div>
            {loading ? (
              <SkeletonList count={4} />
            ) : displayList.length === 0 ? (
              search ? (
                <SmartEmptyState
                  type="no-search-results"
                  query={search}
                  primaryAction={{
                    label: 'Clear Search',
                    onClick: () => setSearch(''),
                    icon: 'search',
                  }}
                  secondaryAction={{
                    label: 'Show All Categories',
                    onClick: () => setCategoryFilter('ALL'),
                  }}
                />
              ) : categoryFilter !== 'ALL' ? (
                <SmartEmptyState
                  type="no-filter-match"
                  category={categoryFilter}
                  primaryAction={{
                    label: 'Reset Category Filter',
                    onClick: () => setCategoryFilter('ALL'),
                  }}
                />
              ) : activeTab === 'FOR_APPROVAL' ? (
                <SmartEmptyState
                  type="queue-cleared"
                  primaryAction={
                    approvedList.length > 0
                      ? {
                          label: `View Approved History (${approvedList.length})`,
                          onClick: () => setActiveTab('APPROVED'),
                          icon: 'approved',
                        }
                      : undefined
                  }
                  secondaryAction={{
                    label: 'Refresh Queue',
                    onClick: fetchApprovals,
                  }}
                />
              ) : activeTab === 'REJECTED' ? (
                <SmartEmptyState
                  type="no-records"
                  title="No Rejected Transactions"
                  secondaryAction={{
                    label: 'Back to Pending Queue',
                    onClick: () => setActiveTab('FOR_APPROVAL'),
                  }}
                />
              ) : activeTab === 'RETURNED' ? (
                <SmartEmptyState
                  type="deficiency-cleared"
                  secondaryAction={{
                    label: 'Back to Pending Queue',
                    onClick: () => setActiveTab('FOR_APPROVAL'),
                  }}
                />
              ) : (
                <SmartEmptyState
                  type="no-records"
                  title="No Certified Approvals Yet"
                  primaryAction={{
                    label: 'View Awaiting Approvals',
                    onClick: () => setActiveTab('FOR_APPROVAL'),
                  }}
                />
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {displayList.map(tx => {
                  const isSelected = selected?.id === tx.id;
                  const isPending = tx.status === 'FOR_APPROVAL';
                  const isApproved = tx.status === 'APPROVED' || tx.status === 'COMPLETED';
                  const isReturned = tx.status === 'DEFICIENCY';
                  // Mirrors MAX_CORRECTION_RESUBMISSIONS in transaction-workflow.util.ts.
                  // At the limit a submission skips AO II validation and lands here
                  // directly, so it must not read as 'AO validated'.
                  const isEscalatedUnvalidated = (tx.resubmissionCount ?? 0) >= 3 && tx.status === 'FOR_APPROVAL';
                  const isRejected = tx.status === 'REJECTED';

                  return (
                    <div
                      key={tx.id}
                      className="card"
                      style={{
                        cursor: 'pointer',
                        padding: '16px 20px',
                        borderRadius: '16px',
                        background: isSelected ? 'var(--color-bg-hover)' : 'var(--glass-bg)',
                        backdropFilter: 'var(--glass-blur)',
                        WebkitBackdropFilter: 'var(--glass-blur)',
                        border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                        boxShadow: isSelected ? '0 8px 24px rgba(0, 0, 0, 0.08)' : 'var(--glass-shadow)',
                        transition: 'all 0.2s ease',
                        marginBottom: 0
                      }}
                      {...clickable<HTMLDivElement>(
                        () => handleOpenTransactionDetails(tx),
                        `Open ${tx.personnelName}'s ${tx.transactionType} details`,
                      )}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {isPending && canApprove && (
                            <input
                              aria-label={`Select ${tx.personnelName}'s ${tx.transactionType} for bulk approval`}
                              type="checkbox"
                              checked={selectedTxIds.includes(tx.id)}
                              onChange={e => toggleSelectTx(tx.id, e as unknown as React.MouseEvent)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                            />
                          )}

                          <div style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: isApproved ? 'rgba(16, 185, 129, 0.15)' : isReturned ? 'rgba(249, 115, 22, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: isApproved ? '#10B981' : isReturned ? '#F97316' : '#3F9265',
                            fontWeight: 800, fontSize: 13,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {tx.personnelName.substring(0, 2).toUpperCase()}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                                background: 'var(--color-bg-secondary)', padding: '2px 8px', borderRadius: 6,
                                border: '1px solid var(--color-border)', color: 'var(--color-text-primary)'
                              }}>
                                TRX-{tx.id}
                              </span>
                              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text-primary)' }}>
                                {tx.personnelName}
                              </span>
                              <span className={tx.personnelCategory.includes('Teaching') ? 'badge badge-info' : 'badge badge-secondary'} style={{ fontSize: 10 }}>
                                {tx.personnelCategory}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                              ID: <strong className="font-mono">{tx.employeeId}</strong> &bull; {tx.currentPosition}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {tx.isPromotion && (
                            <span className="badge" style={{
                              background: 'rgba(139, 92, 246, 0.15)', color: '#C79A2E',
                              border: '1px solid rgba(139, 92, 246, 0.3)', fontWeight: 700, fontSize: 10,
                              display: 'inline-flex', alignItems: 'center', gap: 4
                            }}>
                              <AppIcon name="promotions" size={12} color="#C79A2E" /> Promotion
                            </span>
                          )}
                          {isEscalatedUnvalidated && (
                            <span
                              className="badge badge-warning"
                              title="Reached the correction limit and bypassed AO II validation. Verify the documents yourself before approving."
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <AppIcon name="warning" size={12} />
                              ESCALATED — NOT AO-VALIDATED
                            </span>
                          )}
                          <span className={
                            isApproved ? 'badge badge-approved' :
                            isRejected ? 'badge badge-danger' :
                            isReturned ? 'badge badge-warning' :
                            'badge badge-pending'
                          }>
                            {isApproved
                              ? 'APPROVED (201 SYNCED)'
                              : isRejected
                                ? 'REJECTED — NO RESUBMISSION'
                                : isReturned
                                  ? 'RETURNED FOR CORRECTION'
                                  : 'FOR HRMO APPROVAL'}
                          </span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, repeat(4, 1fr))', gap: 10,
                        fontSize: 12, background: 'var(--color-bg-secondary)',
                        padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--color-border)',
                        marginBottom: 12
                      }}>
                        <div><span style={{ color: 'var(--color-text-secondary)' }}>Type:</span> <strong>{tx.transactionType}</strong></div>
                        <div><span style={{ color: 'var(--color-text-secondary)' }}>Validated By:</span> <strong>{tx.validatedBy}</strong></div>
                        <div><span style={{ color: 'var(--color-text-secondary)' }}>Validated:</span> <strong>{tx.validatedDate}</strong></div>
                        <div><span style={{ color: 'var(--color-text-secondary)' }}>Documents:</span> <strong>{tx.documents.length} verified</strong></div>
                      </div>

                      {/* Action Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          Click to inspect full 201 dossier & validation logs &rarr;
                        </div>

                        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                          {isPending && canApprove ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => { handleOpenTransactionDetails(tx); setShowReturnModal(true); }}
                              >
                                Return
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleApprove(tx)}
                              >
                                Approve & Sign
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenTransactionDetails(tx)}
                            >
                              Inspect Dossier
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Step 1 Detail Review Panel */}
          {selected && (
            <div style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: 'var(--glass-shadow), var(--glass-highlight)',
              position: 'sticky',
              top: '80px',
              maxHeight: 'calc(100vh - 100px)',
              overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', color: 'var(--color-text-primary)' }}>
                    Review Transaction #{selected.id}
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    Official Digital 201 File Evaluation
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelected(null)}
                  title="Close Inspector"
                >
                  &times;
                </button>
              </div>

              {/* Promotion Candidate Selected Banner */}
              {selected.isPromotion && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ padding: 6, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AppIcon name="promotions" size={18} color="#C79A2E" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: '#C79A2E', display: 'flex', alignItems: 'center', gap: 6 }}>
                        Promotion Appointment Final Approval
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        Candidate <strong>{selected.personnelName}</strong> has been certified for promotion under <strong>{selected.promotionDetails?.cycleName || 'DepEd Cycle'}</strong>. Approving officially promotes personnel to <strong>{selected.promotionDetails?.targetPosition || 'Promoted Rank'}</strong>.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Personnel Profile Card */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: 14
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Personnel Profile
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '8px 12px', fontSize: 12 }}>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Name:</span> <strong style={{ color: 'var(--color-text-primary)' }}>{selected.personnelName}</strong></div>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Employee ID:</span> <strong className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{selected.employeeId}</strong></div>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Category:</span> <strong>{selected.personnelCategory}</strong></div>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Position:</span> <strong>{selected.currentPosition}</strong></div>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Service Tenure:</span> <strong>{selected.yearsInService} yrs</strong></div>
                  <div><span style={{ color: 'var(--color-text-secondary)' }}>Transaction:</span> <strong>{selected.transactionType}</strong></div>
                </div>
              </div>

              {/* Compliance Score Card */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: 14
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    Compliance & Validation Score
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-success)' }}>
                    {selected.complianceScore}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${selected.complianceScore}%`, height: '100%', background: 'var(--color-success)' }} />
                </div>
              </div>

              {/* Documents Validated by AO II */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    Submitted Requirements ({selected.detailedDocuments?.length ?? selected.documents.length})
                  </span>
                  <span className={`badge ${selected.detailedDocuments?.every(d => d.status === 'VALIDATED' || d.status === 'APPROVED') ? 'badge-approved' : 'badge-info'}`} style={{ fontSize: 9 }}>
                    {selected.detailedDocuments?.every(d => d.status === 'VALIDATED' || d.status === 'APPROVED') ? 'AO II CERTIFIED' : 'LOADING REVIEW STATUS'}
                  </span>
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(selected.detailedDocuments || selected.documents.map(d => ({ name: d, status: 'REQUIRES_MANUAL_REVIEW', validationNotes: '' }))).map((doc, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        fontSize: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="repository" size={14} color="#3F9265" />
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{doc.name}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => setViewingDoc(doc)}
                        disabled={(doc as DetailedDocument).id === undefined}
                        title={(doc as DetailedDocument).id === undefined ? 'Reload the transaction to open its files' : undefined}
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons in Review Panel */}
              {selected.status === 'FOR_APPROVAL' && canApprove ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ width: '100%', padding: '10px', fontWeight: 700 }}
                    onClick={() => handleApprove(selected)}
                    disabled={isSubmitting}
                  >
                    Approve & Trigger 201 LifeCycle Update
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ width: '100%', padding: '10px', fontWeight: 700 }}
                    onClick={() => setShowReturnModal(true)}
                    disabled={isSubmitting}
                  >
                    Return for Correction (Deficiency)
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: selected.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(249, 115, 22, 0.12)',
                  border: `1px solid ${selected.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`,
                  fontSize: 12,
                  textAlign: 'center',
                  fontWeight: 700,
                  color: selected.status === 'APPROVED' ? 'var(--color-success-text)' : 'var(--color-warning-text)'
                }}>
                  {selected.status === 'APPROVED' ? '✓ Transaction Certified & Synced in Official 201 File' : 'Transaction Returned for Deficiency'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Career Lifecycle Update Modal */}
      {showCareerUpdate && (
        <ModalOverlay onDismiss={() => setShowCareerUpdate(null)} className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AppIcon name="approved" size={20} color="#10B981" />
                <span>Step 3: Career Lifecycle Update Certified</span>
              </h3>
            </div>

            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
                Transaction #{showCareerUpdate.id} for <strong style={{ color: 'var(--color-text-primary)' }}>{showCareerUpdate.personnelName}</strong> has been <strong style={{ color: 'var(--color-success)' }}>APPROVED</strong>. The system has automatically synchronized the following 201 records:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {CAREER_UPDATE_FIELDS.map(field => (
                  <div key={field.label} style={{
                    display: 'flex', gap: 12, alignItems: 'center',
                    padding: '10px 14px', background: 'var(--color-success-light)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <AppIcon name={field.icon} size={16} color="var(--color-success-text)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-success-text)' }}>{field.label}</div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>{field.description}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: '10px 14px', background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5
              }}>
                Transaction #{showCareerUpdate.id} is now locked and authenticated as part of <strong>{showCareerUpdate.personnelName}'s</strong> official digital 201 career portfolio.
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setShowCareerUpdate(null)}>
                Complete & Return to Queue
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Return Modal */}
      {showReturnModal && selected && (
        <ModalOverlay onDismiss={() => setShowReturnModal(false)} className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="returned" size={16} color="var(--color-error)" /> Return Transaction #{selected.id}
              </h3>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
                Status will be set to <strong>"Returned by HRMO"</strong>. Applicant <strong style={{ color: 'var(--color-text-primary)' }}>{selected.personnelName}</strong> will receive an urgent notification to resolve deficiencies.
              </p>
              <div className="form-group">
                <label className="form-label">Return Remarks / Deficiency Notes *</label>
                <textarea
                  aria-label="Return Remarks / Deficiency Notes"
                  className="form-input"
                  rows={4}
                  placeholder="Specify deficiency reasons or missing documentary certifications…"
                  value={returnRemarks}
                  onChange={e => setReturnRemarks(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowReturnModal(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={handleReturn} disabled={isSubmitting}>
                {isSubmitting ? 'Returning…' : 'Confirm Return → Notify Personnel'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* The actual uploaded file, fitted to the viewer's width */}
      {viewingDoc && viewingDoc.id !== undefined && (
        <DocumentViewerModal
          isOpen
          onClose={() => setViewingDoc(null)}
          title={viewingDoc.name}
          fileName={viewingDoc.type}
          fileUrl={`/documents/${viewingDoc.id}/file`}
        />
      )}
    </div>
  );
};
