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
import { activateOnKey } from '../../a11y/clickable';
import './return-sheet.css';
import './sysadmin-pages.css';
import { Search, Download, Check, CircleCheck, TriangleAlert } from 'lucide-react';
import { LoadFailure, StaleNotice, PartialNotice } from '../../components/common/LoadFailure';
import { ReviewNotice, reviewerName } from '../../components/common/ReviewNotice';
import type { ReviewState } from '../../components/common/ReviewNotice';

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
  validationDate?: string | null;
  /** Replaced after a reviewer returned it: the change since the previous submission. */
  replacedAfterReturn?: boolean;
  previousNotes?: string | null;
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
  /** Who checked it, who acts next and what this viewer can do, decided by the server. */
  review?: ReviewState | null;
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
  const approvalsRef = useRef<Transaction[]>([]);
  approvalsRef.current = approvals;
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DetailedDocument | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('FOR_APPROVAL');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnDocumentIds, setReturnDocumentIds] = useState<number[]>([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showCareerUpdate, setShowCareerUpdate] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<number[]>([]);

  const canApprove = user?.role === 'HRMO';
  const me = reviewerName(user?.role);
  // A failed load is not an empty queue: keep what was loaded (marked stale) and offer Retry.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchApprovals = useCallback(async () => {
    setLoading(prev => prev && approvalsRef.current.length === 0);
    try {
      // HRMO sees the whole approvals queue; the server decides which rows can be approved.
      const res = await apiClient.get('/transactions?limit=1000');
      const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const mapped: Transaction[] = list.map((tx: any) => {
        const isPromo = tx.isPromotion || tx.transactionType?.name?.toUpperCase().includes('PROMOTION') || !!tx.promotionDetails;
        const promoDetails = tx.promotionDetails || (isPromo ? {
          isSelected: true,
          cycleName: '',
          // Unknown here: never guessed from the current post or a default rank.
    targetPosition: '',
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
          // Who validated the documents, by name and by the role they actually validated as.
          validatedBy: (() => {
            const by = tx.review?.validatedBy;
            const v = (tx.uploadedDocuments || []).find((d: any) => d.validatedBy)?.validatedBy;
            const p = v?.personnel;
            const name = by?.name || (p ? `${p.firstName} ${p.lastName}`.trim() : '');
            const role = by?.role ? reviewerName(by.role) : reviewerName(tx.review?.validator);
            return name ? `${name} (${role})` : v?.email || role;
          })(),
          review: tx.review ?? null,
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
      setLoadFailed(false);
      setLoadedAt(new Date());

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
      // Never turn a failure into a cleared queue: keep what was loaded and say it may be stale.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  const retry = async () => { setRetrying(true); try { await fetchApprovals(); } finally { setRetrying(false); } };

  const handleOpenTransactionDetails = async (tx: Transaction) => {
    openedTxIdRef.current = String(tx.id);
    setSelected(tx);
    setDetailFailed(false);
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
              validationDate: d.validationDate ?? null,
              replacedAfterReturn: Boolean(d.replacedAfterReturn),
              previousNotes: d.previousVersion?.reviewNotes ?? null,
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
          review: detailed.review ?? prev.review,
        } : prev);
      }
    } catch (err) {
      console.error('Failed to load transaction history details:', err);
      setDetailFailed(true);
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
      // One at a time, and say exactly which ones did not go through.
      const failed: string[] = [];
      for (const id of selectedTxIds) {
        try { await apiClient.post(`/transactions/${id}/approve`, { isApproved: true, notes: `Bulk approved by ${me}` }); }
        catch (e: any) { failed.push(`TRX-${id}: ${e.response?.data?.message || 'not approved'}`); }
      }
      const done = selectedTxIds.length - failed.length;
      if (done) playSuccessChime();
      addToast(failed.length ? `${done} approved. Not approved: ${failed.join('; ')}` : `${done} approved. Career records updated.`, failed.length ? 'WARNING' : 'SUCCESS');
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

  // Only after a decision is saved: open the next transaction waiting for approval.
  const openNextAfter = (doneId: number) => {
    const next = forApprovalList.find(t => t.id !== doneId);
    if (next) { void handleOpenTransactionDetails(next); addToast(`Next: TRX-${next.id}, ${next.personnelName}.`, 'INFO'); }
    else setSelected(null);
  };

  // Step 2: Approve → Status: Approved → triggers Step 3 Career Lifecycle Update
  const handleApprove = async (tx: Transaction) => {
    const { confirmed } = await confirm({
      title: 'Final approval',
      message: `Give final approval to ${tx.personnelName}'s ${tx.transactionType}? This updates their career record and cannot be undone from this screen.`,
      confirmLabel: 'Approve transaction',
      tone: 'primary',
      icon: 'approvals',
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/transactions/${tx.id}/approve`, {
        isApproved: true,
        notes: `Final approval by ${me}`,
      });
      playSuccessChime();
      addToast(res.data?.message || `TRX-${tx.id} approved. Career record updated.`, 'SUCCESS');
      openNextAfter(tx.id);
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
    if (returnDocumentIds.length === 0) {
      addToast('Select at least one document that the personnel must replace.', 'ERROR');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/transactions/${selected.id}/approve`, {
        isApproved: false,
        decision: 'RETURN_FOR_CORRECTION',
        deficientDocumentIds: returnDocumentIds,
        notes: returnRemarks,
      });
      addToast(res.data?.message || `TRX-${selected.id} returned for correction. The personnel is notified with your remarks.`, 'WARNING');
      setShowReturnModal(false);
      openNextAfter(selected.id);
      setReturnRemarks('');
      setReturnDocumentIds([]);
      fetchApprovals();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to return transaction.', 'ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  const TABS = [
    ['FOR_APPROVAL', 'To approve', forApprovalList.length],
    ['APPROVED', 'Approved', approvedList.length],
    ['RETURNED', 'Returned', returnedList.length],
    ['REJECTED', 'Rejected', rejectedList.length],
    ['ALL', 'All', approvals.length],
  ] as const;

  return (
    <div className="sap animate-fade-in">
      <header className="sap-head">
        <h1>Approvals</h1>
        {selectedTxIds.length > 0 && canApprove && (
          <div className="sap-head__actions">
            <button type="button" className="sap-btn sap-btn--ghost" onClick={handleBulkExportPdf}><Download size={18} aria-hidden="true" /> Download files</button>
            <button type="button" className="sap-btn sap-btn--primary" onClick={handleBulkApprove} disabled={isSubmitting}><Check size={18} aria-hidden="true" /> Approve {selectedTxIds.length} selected</button>
          </div>
        )}
      </header>

      <div className="sap-stack">
        {loading ? (
          <div className="sap-stats" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="sap-skel" />)}</div>
        ) : (
          <section className="sap-stats" aria-label="Approvals by status">
            {TABS.slice(0, 3).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}
                className={`sap-stat sap-stat--btn${activeTab === key ? ' is-on' : ''}${key === 'FOR_APPROVAL' && count ? ' is-warn' : ''}`}>
                <span className="sap-stat__label">{key === 'FOR_APPROVAL' ? 'Waiting for final approval' : key === 'APPROVED' ? 'Approved' : 'Returned for correction'}</span>
                <span className="sap-stat__num">{loadFailed && !loadedAt ? '–' : count}</span>
              </button>
            ))}
          </section>
        )}

        <section className="sap-card">
          <div className="sap-card__head sap-card__head--stack">
            <div className="sap-seg" role="group" aria-label="Status" style={{ justifySelf: 'start' }}>
              {TABS.map(([key, label, count]) => (
                <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>{label} <b className={key === 'FOR_APPROVAL' && count ? 'is-warn' : ''}>{count}</b></button>
              ))}
            </div>
            <div className="sap-toolbar">
              <label className="sap-search">
                <Search size={20} aria-hidden="true" />
                <span className="sr-only">Search approvals</span>
                <input type="search" placeholder="Search name, ID or TRX number" value={search} onChange={e => setSearch(e.target.value)} />
              </label>
              <div className="sap-seg" role="group" aria-label="Category">
                {([['ALL', 'All'], ['TEACHING', 'Teaching'], ['NON_TEACHING', 'Non-teaching'], ['PROMOTION', 'Promotion']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={categoryFilter === v} onClick={() => setCategoryFilter(v)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="sap-md" style={{ gridTemplateColumns: selected ? 'minmax(0, 1fr) minmax(320px, 520px)' : 'minmax(0, 1fr)' }}>
          <div>
            {loadFailed && loadedAt && <StaleNotice what="the approvals queue" since={loadedAt} onRetry={() => void retry()} retrying={retrying} />}
            {loading ? (
              <div style={{ display: 'grid', gap: 12 }} aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="sap-skel" style={{ height: 120 }} />)}</div>
            ) : loadFailed && !loadedAt ? (
              <LoadFailure what="the approvals queue" onRetry={() => void retry()} retrying={retrying} />
            ) : displayList.length === 0 ? (
              <div className="sap-card sap-empty">
                <CircleCheck size={40} aria-hidden="true" style={{ color: 'var(--sap-green)', display: 'block', margin: '0 auto 10px' }} />
                {search ? `No results for “${search}”.` : categoryFilter !== 'ALL' ? 'Nothing in this category.' : activeTab === 'FOR_APPROVAL' ? 'Nothing waiting for approval.' : activeTab === 'REJECTED' ? 'Nothing rejected.' : activeTab === 'RETURNED' ? 'Nothing returned.' : 'Nothing approved yet.'}
                <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {search && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => setSearch('')}>Clear search</button>}
                  {!search && categoryFilter !== 'ALL' && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => setCategoryFilter('ALL')}>All categories</button>}
                  {!search && categoryFilter === 'ALL' && activeTab === 'FOR_APPROVAL' && approvedList.length > 0 && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => setActiveTab('APPROVED')}>See {approvedList.length} approved</button>}
                </div>
              </div>
            ) : (
              <ul className="sap-cards">
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
                  const tone = isApproved ? 'is-ok' : isRejected ? 'is-bad' : 'is-warn';
                  const open = () => handleOpenTransactionDetails(tx);
                  return (
                    <li key={tx.id} className={`sap-txcard${isSelected ? ' is-selected' : ''}`} tabIndex={0} onClick={open} onKeyDown={activateOnKey<HTMLLIElement>(open)}>
                      <div className="sap-txcard__top">
                        {isPending && tx.review?.canApprove && (
                          <input className="sap-check" type="checkbox" aria-label={`Select ${tx.personnelName} for bulk approval`}
                            checked={selectedTxIds.includes(tx.id)} onChange={e => toggleSelectTx(tx.id, e as unknown as React.MouseEvent)} onClick={e => e.stopPropagation()} />
                        )}
                        <span className="sap-avatar">{tx.personnelName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                        <div className="sap-who">
                          <span className="sap-who__name">{tx.personnelName}<span className="sap-tag">{tx.personnelCategory}</span>{tx.isPromotion && <span className="sap-tag">Promotion</span>}</span>
                          <span className="sap-who__line">{tx.currentPosition}</span>
                          <span className="sap-who__mono">TRX-{tx.id} · {tx.employeeId}</span>
                        </div>
                        <span className={`sap-pill ${tone}`}>{isApproved ? 'Approved' : isRejected ? 'Rejected' : isReturned ? 'Returned' : 'For final approval'}</span>
                      </div>
                      {isEscalatedUnvalidated && (
                        <div className="sap-txcard__warn"><TriangleAlert size={18} aria-hidden="true" /> Reached the correction limit without validation. Check the documents yourself.</div>
                      )}
                      <dl className="sap-txcard__facts">
                        <div><dt>Type</dt><dd>{tx.transactionType}</dd></div>
                        <div><dt>Validated by</dt><dd>{tx.validatedBy}</dd></div>
                        <div><dt>Validated</dt><dd>{tx.validatedDate}</dd></div>
                        <div><dt>Documents</dt><dd>{tx.documents.length}</dd></div>
                      </dl>
                      <div className="sap-row__actions" onClick={e => e.stopPropagation()}>
                        {isPending && tx.review?.canApprove ? (
                          <>
                            <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => { open(); setShowReturnModal(true); }}>Return</button>
                            <button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={() => handleApprove(tx)}><Check size={17} aria-hidden="true" /> Approve</button>
                          </>
                        ) : (
                          <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={open}>{isPending ? 'View (another HRMO approves)' : 'View'}</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
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
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Check the documents, then approve or return
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


              {/* Personnel Profile Card */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: 14
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  Personnel
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '8px 12px', fontSize: 13 }}>
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
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    Documents complete
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-success)' }}>
                    {selected.complianceScore}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${selected.complianceScore}%`, height: '100%', background: 'var(--color-success)' }} />
                </div>
              </div>

              {/* Documents validated by the reviewer named on the transaction */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    Submitted Requirements ({selected.detailedDocuments?.length ?? selected.documents.length})
                  </span>
                  <span className={`badge ${selected.detailedDocuments?.every(d => d.status === 'VALIDATED' || d.status === 'APPROVED') ? 'badge-approved' : 'badge-info'}`} style={{ fontSize: 13 }}>
                    {selected.detailedDocuments?.every(d => d.status === 'VALIDATED' || d.status === 'APPROVED') ? `Verified by ${reviewerName(selected.review?.validatedBy?.role || selected.review?.validator)}` : 'Checking…'}
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
                        fontSize: 13
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="repository" size={14} color="#3F9265" />
                        <span style={{ display: 'grid', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{doc.name}</span>
                          <span className="text-xs text-muted">
                            {doc.status === 'VALIDATED' ? `Checked by ${reviewerName(selected.review?.validatedBy?.role || selected.review?.validator)}${(doc as DetailedDocument).validationDate ? ` on ${new Date((doc as DetailedDocument).validationDate!).toLocaleDateString('en-PH', { dateStyle: 'medium' })}` : ''}` : doc.status === 'REJECTED' ? 'Returned for correction' : 'Not checked yet'}
                          </span>
                          {(doc as DetailedDocument).replacedAfterReturn && (
                            <span className="text-xs" style={{ color: '#8A5A0B', fontWeight: 700 }}>
                              Changed since last submission{(doc as DetailedDocument).previousNotes ? ` · was returned: ${(doc as DetailedDocument).previousNotes}` : ''}
                            </span>
                          )}
                        </span>
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
              <ReviewNotice review={selected.review} />
              {detailFailed && <PartialNotice missing="The document list and history of this transaction did not load, so the files shown may be incomplete. Approve only after they load." onRetry={() => void handleOpenTransactionDetails(selected)} />}
              {selected.status === 'FOR_APPROVAL' && selected.review?.canApprove ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ width: '100%', padding: '10px', fontWeight: 700 }}
                    onClick={() => handleApprove(selected)}
                    disabled={isSubmitting || detailFailed}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ width: '100%', padding: '10px', fontWeight: 700 }}
                    onClick={() => { setReturnDocumentIds([]); setReturnRemarks(''); setShowReturnModal(true); }}
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
                  fontSize: 13,
                  textAlign: 'center',
                  fontWeight: 700,
                  color: selected.status === 'APPROVED' ? 'var(--color-success-text)' : 'var(--color-warning-text)'
                }}>
                  {selected.status === 'APPROVED' ? '✓ Transaction Certified & Synced in Official 201 File'
                    : selected.status === 'FOR_APPROVAL' ? (selected.review?.youCan || 'Waiting for final approval by another reviewer.')
                    : selected.status === 'REJECTED' ? 'Transaction rejected'
                    : 'Transaction Returned for Deficiency'}
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-success-text)' }}>{field.label}</div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>{field.description}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: '10px 14px', background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5
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
      {showReturnModal && selected && (() => {
        const close = () => { setShowReturnModal(false); setReturnDocumentIds([]); };
        const docs = (selected.detailedDocuments || []).filter(d => d.id !== undefined);
        return (
        <ModalOverlay onDismiss={close} className="modal-overlay">
          <div className="modal ret-sheet" role="dialog" aria-modal="true" aria-labelledby="ret-title">
            <header className="ret-sheet__head">
              <div>
                <h3 id="ret-title">Return TRX-{selected.id}</h3>
                <p>{selected.personnelName} · only the documents you tick reopen for upload</p>
              </div>
              <button type="button" className="ret-sheet__close" aria-label="Close" onClick={close}>✕</button>
            </header>
            <div className="ret-sheet__body">
              <fieldset>
                <legend>Documents to replace</legend>
                <div className="ret-sheet__docs">
                  {docs.map(document => {
                    const documentId = document.id!;
                    const checked = returnDocumentIds.includes(documentId);
                    return (
                      <label key={documentId} className={`ret-sheet__doc${checked ? ' is-on' : ''}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setReturnDocumentIds(current => checked ? current.filter(id => id !== documentId) : [...current, documentId])} />
                        <span>
                          <strong>{document.name}</strong>
                          {document.type && <small>{document.type}</small>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="ret-sheet__field">
                <span>What needs fixing</span>
                <textarea className="form-input" rows={3} placeholder="Sent to the personnel"
                  value={returnRemarks} onChange={e => setReturnRemarks(e.target.value)} required />
              </label>
            </div>
            <footer className="ret-sheet__foot">
              <button type="button" className="btn btn-danger" onClick={handleReturn}
                disabled={isSubmitting || returnDocumentIds.length === 0 || !returnRemarks.trim()}>
                {isSubmitting ? 'Returning…' : returnDocumentIds.length ? `Return ${returnDocumentIds.length} document${returnDocumentIds.length === 1 ? '' : 's'}` : 'Tick a document to return'}
              </button>
            </footer>
          </div>
        </ModalOverlay>
        );
      })()}

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
