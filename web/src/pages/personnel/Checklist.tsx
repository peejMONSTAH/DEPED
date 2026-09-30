import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { prepareRequirementFiles } from '../../utils/requirementFiles';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { templateForRequirement } from '../../components/forms/templateMatch';
import { checklistFromTransaction, checklistReadiness, type RequirementItem } from './checklistData';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentScannerModal } from '../../components/common/DocumentScannerModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { AttachExistingModal, type ExistingDocument } from './AttachExistingModal';


const TX_TYPE_LABELS: Record<string, string> = {
  PROMOTION_APPOINTMENT: 'Promotion Appointment',
  NEWLY_HIRED_APPOINTMENT: 'Newly Hired Appointment',
  SALARY_ADJUSTMENT: 'Salary Adjustment',
};



export const Checklist: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTxId = searchParams.get('txId');
  const [txId, setTxId] = useState<string>(rawTxId || '');
  const txType = searchParams.get('txType') || 'PROMOTION_APPOINTMENT';

  const navigate = useNavigate();
  const { addToast } = useToast();

  const [items, setItems] = useState<RequirementItem[]>([]);
  const [score, setScore] = useState(0);
  const [checklistError, setChecklistError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actualType, setActualType] = useState('');
  const [txStatus, setTxStatus] = useState<string>('UNKNOWN');
  const [txRemarks, setTxRemarks] = useState<string>('');
  const [returningAuthority, setReturningAuthority] = useState<'AO II' | 'HRMO'>('AO II');
  const [loading, setLoading] = useState<boolean>(true);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  // Who checks this file, and who validated it, as the server records it (AO II or HRMO): never assumed.
  const [review, setReview] = useState<{ validator?: string; validatedBy?: { role?: string } | null; approver?: string | null; summary?: string; youCan?: string } | null>(null);
  const vName = review?.validator === 'HRMO' ? 'HRMO' : 'AO II';
  const byName = review?.validatedBy?.role === 'HRMO' ? 'HRMO' : review?.validatedBy?.role === 'AO_II' ? 'AO II' : vName;
  const approverName = review?.approver === 'SYSTEM_ADMIN' ? 'the System Administrator (fallback)' : review?.validator ? 'a different HRMO' : 'HRMO';
  const focusRequirement = Number(searchParams.get('requirement')) || null;
  const focusedOnce = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingReqId, setUploadingReqId] = useState<number | null>(null);
  const [activeReqItem, setActiveReqItem] = useState<RequirementItem | null>(null);
  const [scannerReqItem, setScannerReqItem] = useState<RequirementItem | null>(null);
  const [attachReqItem, setAttachReqItem] = useState<RequirementItem | null>(null);
  // A requirement with a document shows View + Replace; Replace reveals the upload options.
  const [replacingReqId, setReplacingReqId] = useState<number | null>(null);
  const [existingDocuments, setExistingDocuments] = useState<ExistingDocument[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const attachInFlight = React.useRef(false);
  const [viewingDoc, setViewingDoc] = useState<{
    title: string;
    fileUrl: string;
  } | null>(null);

  // Resolve only assigned transactions; an explicit ID is never silently substituted.
  useEffect(() => {
    const resolveTxId = async () => {
      if (rawTxId) {
        setTxId(rawTxId);
        return;
      }
      try {
        const res = await apiClient.get('/transactions/my-transactions');
        const list = res.data?.data || [];
        if (list.length > 0) {
          const draftTx = list.find((t: any) => t.status === 'DRAFT' || t.status === 'DEFICIENCY') || list[0];
          const resolved = String(draftTx.id);
          setTxId(resolved);
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('txId', resolved);
            return next;
          });
        } else {
          setTxId('');
          setLoading(false);
          addToast('No assigned transaction. Your hiring or promotion transaction will appear after assignment.', 'INFO');
        }
      } catch (_) {
        setTxId('');
        setLoading(false);
        addToast('Unable to load your assigned transactions. Please retry.', 'ERROR');
      }
    };
    resolveTxId();
  }, [rawTxId, setSearchParams]);

  const fetchTransactionData = useCallback(async (overrideId?: string | number) => {
    const targetId = overrideId || txId || rawTxId;
    const numId = Number(targetId);
    if (!targetId || !Number.isSafeInteger(numId) || numId <= 0) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await apiClient.get(`/transactions/${numId}`);
      const txData = res.data?.data;
      if (txData) {
        setTxStatus(txData.status || 'UNKNOWN');
        setTxRemarks(txData.remarks || '');
        setSubmittedAt(txData.submissionDate || null);
        setEscalated(Boolean(txData.escalatedAt && !txData.escalationReviewedAt));
        setReview(txData.review ?? null);
        setReturningAuthority(
          Array.isArray(txData.history) && txData.history.some((entry: any) => entry.action === 'HRMO_RETURNED_FOR_CORRECTION')
            ? 'HRMO'
            : 'AO II',
        );

        setItems(checklistFromTransaction(txData));
        setReplacingReqId(null);
        setScore(Number(txData.complianceScore) || 0);
        setActualType(txData.transactionType?.name || '');
        setChecklistError('');
      }
    } catch (err) {
      setChecklistError('Could not refresh the assigned checklist. Retry before uploading or submitting.');
      setTxStatus('UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, [txId, rawTxId]);

  useEffect(() => {
    if (!txId) return;
    // Upload once, reuse everywhere: empty requirements are filled from the
    // 201 file first, then the checklist is loaded.
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.post(`/transactions/${txId}/documents/auto-attach`);
        const added: string[] = res.data?.data?.attached || [];
        if (!cancelled && added.length) addToast(`Added ${added.length} document${added.length === 1 ? '' : 's'} from your 201 file. Check them before submitting.`, 'SUCCESS');
      } catch { /* nothing to add, or not editable: the checklist loads as usual */ }
      if (!cancelled) fetchTransactionData(txId);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId, fetchTransactionData]);

  // Real-time synchronization: immediately updates when AO II validates or HRMO approves
  useRealtimeTransactions(useCallback(() => {
    const target = txId || rawTxId;
    if (target) {
      fetchTransactionData(target);
    }
  }, [txId, rawTxId, fetchTransactionData]));

  const submitDocumentFile = async (selection: File | File[], requirement: RequirementItem) => {
    if (!txId || !['DRAFT', 'DEFICIENCY'].includes(txStatus) || uploadingReqId !== null) return;

    const activeTargetId = txId;

    try {
      setUploadingReqId(requirement.requirementId);
      const files = Array.isArray(selection) ? selection : [selection];
      const file = await prepareRequirementFiles(files, requirement.name);
      addToast(`Uploading and saving "${requirement.name}" to database…`, 'INFO');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('requirementId', String(requirement.requirementId));
      formData.append('requirementName', requirement.name);

      const res = await apiClient.post(`/transactions/${activeTargetId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedDoc = res.data?.data;
      if (uploadedDoc) {
        setItems(prev => prev.map(item => {
          if (item.requirementId === requirement.requirementId) {
            return {
              ...item,
              status: uploadedDoc.status || 'UPLOADED',
              documentId: uploadedDoc.id,
              rejectionNotes: undefined,
            };
          }
          return item;
        }));
      }

      addToast(`✅ "${requirement.name}" successfully uploaded and saved to database!`, 'SUCCESS');
      await fetchTransactionData(activeTargetId);
    } catch (err: any) {
      console.error('Direct upload failed:', err);
      addToast(err.response?.data?.message || err.message || `Upload failed for "${requirement.name}".`, 'ERROR');
      await fetchTransactionData(activeTargetId);
    } finally {
      setUploadingReqId(null);
    }
  };

  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const requirement = activeReqItem;
    e.target.value = '';
    setActiveReqItem(null);
    if (!files.length || !requirement) return;
    await submitDocumentFile(files, requirement);
  };

  const openExistingPicker = async (requirement: RequirementItem) => {
    setAttachReqItem(requirement);
    setAttachLoading(true);
    try {
      const response = await apiClient.get('/personnel/documents');
      setExistingDocuments((response.data?.data || []).filter((doc: ExistingDocument) =>
        doc.hasFile && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(doc.status) &&
        ['application/pdf', 'image/png', 'image/jpeg'].includes(doc.mimeType || '') &&
        Boolean(doc.originalFileName) && (doc.fileSize || 0) > 0 && (doc.fileSize || 0) <= 10 * 1024 * 1024));
    } catch (err: any) {
      setAttachReqItem(null);
      addToast(err.response?.data?.message || 'Could not load My 201 Files.', 'ERROR');
    } finally { setAttachLoading(false); }
  };

  const attachExisting = async (documentId: number) => {
    if (!attachReqItem || !txId || attachLoading || attachInFlight.current) return;
    attachInFlight.current = true;
    setAttachLoading(true);
    try {
      await apiClient.post(`/transactions/${txId}/documents/attach-existing`, {
        personnelDocumentId: documentId, requirementId: attachReqItem.requirementId,
      });
      addToast(`Attached a copy to "${attachReqItem.name}".`, 'SUCCESS');
      setAttachReqItem(null);
      await fetchTransactionData(txId);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not attach this document.', 'ERROR');
    } finally { attachInFlight.current = false; setAttachLoading(false); }
  };

  const isReturnedState = txStatus === 'DEFICIENCY';

  // A link naming a requirement (from a notice or email) opens that item;
  // otherwise a returned transaction opens its first returned item. Once per visit.
  useEffect(() => {
    if (focusedOnce.current || loading || !items.length) return;
    const target = focusRequirement ?? (isReturnedState ? items.find(i => i.status === 'DEFICIENT')?.requirementId : null);
    if (!target) return;
    focusedOnce.current = true;
    const el = document.getElementById(`req-${target}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
  }, [items, loading, focusRequirement, isReturnedState]);
  const canEdit = ['DRAFT', 'DEFICIENCY'].includes(txStatus) && !checklistError && Boolean(txId);
  const { missing: mandatoryMissing, complete: isComplete } = checklistReadiness(items);
  const completedReqs = items.filter(item => item.status === 'VALIDATED' || item.status === 'UPLOADED');
  const missingReqs = mandatoryMissing;

  // Step 8: Transaction Submission
  const handleSubmitTransaction = async () => {
    if (!canEdit || submitting || loading || uploadingReqId !== null) return;
    if (!isComplete) {
      addToast(`Submission blocked. Please complete all required documents (${mandatoryMissing.length} remaining).`, 'ERROR');
      return;
    }

    const activeTargetId = txId;
    try {
      setSubmitting(true);
      const res = await apiClient.put(`/transactions/${activeTargetId}/submit`);
      const sent = res.data?.data || {};
      const when = sent.submissionDate ? new Date(sent.submissionDate).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      // The server says who has it now, so the message is right for teaching, non-teaching and no-AO stations alike.
      addToast(`${res.data?.message || `${isReturnedState ? 'Resubmitted' : 'Submitted'}. Waiting for validation.`}${when ? ` (received ${when})` : ''}`, 'SUCCESS');
      setSubmittedAt(sent.submissionDate || null);
      await fetchTransactionData(activeTargetId);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Unable to submit the transaction for validation.', 'ERROR');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            Requirement Checklist & Submission
          </h1>
          <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700 }}>
            TRX-{txId || rawTxId || '—'}
          </span>
          <StatusBadge status={txStatus} />
        </div>
      </div>

      {/* 1. Submitted / waiting for the reviewer named by the server */}
      {txStatus === 'PENDING_VALIDATION' && (
        <div className="card mb-4" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="clock" size={20} color="#f59e0b" />
            <strong style={{ color: '#f59e0b', fontSize: 14 }}>Waiting for {vName}{submittedAt ? ` · received ${new Date(submittedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</strong>
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Your 201 transaction dossier has been successfully submitted and is currently in {vName}'s queue for document checking. Any validation updates or correction notes will appear here as they happen.
          </div>
        </div>
      )}

      {/* 2. Validated / waiting for final approval */}
      {txStatus === 'FOR_APPROVAL' && (
        <div className="card mb-4" style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid #c79a2e', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="approved" size={20} color="#c79a2e" />
            <strong style={{ color: '#c79a2e', fontSize: 14 }}>{escalated ? 'With HRMO after repeated corrections' : `Validated by ${byName} — waiting for final approval`}</strong>
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {escalated
              ? 'Your documents were returned several times, so HRMO is reviewing them. HRMO will tell you exactly what to fix; {vName} then validates the corrected files before final approval.'
              : `${byName} validated your documents. Final approval comes from ${approverName}; your position changes only after that approval.`}
          </div>
        </div>
      )}

      {/* 3. Approved & Finalized by HRMO Banner */}
      {(txStatus === 'APPROVED' || txStatus === 'COMPLETED') && (
        <div className="card mb-4" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="approved" size={20} color="#10b981" />
            <strong style={{ color: '#10b981', fontSize: 14 }}>🎉 Appointment Officially Approved & Finalized by HRMO</strong>
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Congratulations! Your transaction has been approved by the Division Human Resource Management Officer (HRMO) and your updated appointment record is synchronized into your Master 201 File.
          </div>
        </div>
      )}

      {/* 4. Rejected Banner */}
      {txStatus === 'REJECTED' && (
        <div className="card mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="warning" size={20} color="#ef4444" />
            <strong style={{ color: '#ef4444', fontSize: 14 }}>Application Rejected by HRMO</strong>
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {txRemarks ? `HRMO Reason: "${txRemarks}"` : 'Your application was rejected during division review.'}
          </div>
        </div>
      )}

      {/* 5. Deficiency alert banner: says who returned it */}
      {isReturnedState && (
        <div className="card mb-4" style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="warning" size={20} color="#f85149" />
            <strong style={{ color: '#f85149', fontSize: 14 }}>{returningAuthority} Deficiency Action Required</strong>
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {txRemarks ? `${returningAuthority} Remarks: "${txRemarks}"` : `Your application was returned by ${returningAuthority} due to document deficiencies.`}
            <br />
            <span style={{ color: 'var(--color-primary-light)', fontWeight: 600, marginTop: 4, display: 'inline-block' }}>
              Note: Only the flagged deficient documents below require re-upload. Your approved documents are locked and verified.
            </span>
          </div>
        </div>
      )}

      {checklistError && <div role="alert" className="card mb-4">{checklistError} <button type="button" className="btn btn-secondary" onClick={() => void fetchTransactionData()}>Retry</button></div>}

      {/* Step 7: Compliance summary. "Not uploaded yet" and "returned by AO II" are
          different situations, so they are listed separately. */}
      {(() => {
        const returned = missingReqs.filter(r => r.status === 'DEFICIENT');
        const notUploaded = missingReqs.filter(r => r.status !== 'DEFICIENT');
        const uploadedDone = completedReqs;
        const tone = isComplete ? 'var(--color-success)' : returned.length ? 'var(--color-danger)' : 'var(--color-warning)';
        const pill = isComplete ? { cls: 'badge-approved', text: 'Ready for validation' }
          : returned.length ? { cls: 'badge-deficiency', text: `${returned.length} returned for correction` }
          : { cls: 'badge-pending', text: completedReqs.length ? 'In progress' : 'Not started' };
        const row = (r: RequirementItem, color: string, icon: 'approved' | 'warning' | 'pending', note?: string) => (
          <li key={r.requirementId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>
            <span style={{ marginTop: 2 }}><AppIcon name={icon} size={14} color={color} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{r.name}</span>
              {note && <span className="text-xs text-muted" style={{ display: 'block' }}>{note}</span>}
            </span>
          </li>
        );
        return (
          <section className="card mb-5" aria-label="Compliance summary" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Requirements · {actualType || TX_TYPE_LABELS[txType] || txType}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: tone }}>{score}%</span>
                  <span className="text-sm text-muted">complete · {completedReqs.length} of {items.length} uploaded</span>
                </div>
              </div>
              <span className={`badge ${pill.cls}`} style={{ fontSize: 14, padding: '6px 14px' }}>{pill.text}</span>
            </div>

            <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden', margin: '14px 0 4px' }}>
              <div style={{ width: `${score}%`, height: '100%', background: tone, transition: 'width 0.4s' }} />
            </div>

            {returned.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="text-xs" style={{ fontWeight: 700, color: 'var(--color-danger)', marginBottom: 2 }}>Returned by {returningAuthority} — upload a corrected copy</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {returned.map(r => row(r, 'var(--color-danger)', 'warning', r.rejectionNotes || undefined))}
                </ul>
              </div>
            )}

            {notUploaded.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="text-xs text-muted" style={{ fontWeight: 700, marginBottom: 2 }}>Still to upload</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {notUploaded.map(r => row(r, 'var(--color-warning)', 'pending'))}
                </ul>
              </div>
            )}

            {uploadedDone.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="text-xs text-muted" style={{ fontWeight: 700, marginBottom: 2 }}>Uploaded</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {uploadedDone.map(r => row(r, 'var(--color-success)', 'approved',
                    r.status === 'VALIDATED' ? `Validated by ${r.validatedBy || byName}` : `Awaiting ${vName} validation`))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted" style={{ margin: '14px 0 0' }}>
              {isComplete
                ? `All required documents are in. Submit below to send your application to ${vName} for validation.`
                : returned.length
                  ? `Upload corrected copies of the ${returned.length} returned document${returned.length === 1 ? '' : 's'}${notUploaded.length ? ` and the ${notUploaded.length} still missing` : ''} to submit.`
                  : notUploaded.length
                    ? `Upload the ${notUploaded.length} remaining document${notUploaded.length === 1 ? '' : 's'} to submit.`
                    : 'Upload the remaining documents to submit.'}
            </p>
          </section>
        );
      })()}

      {/* Mandatory Checklist Items in Table Card */}
      <div className="table-card-large mb-5">
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 className="card-heading-title" style={{ margin: 0 }}>Required Checklist Documents</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-info" style={{ fontSize: 13, padding: '4px 10px' }}>
              {items.length} Documents Required
            </span>
          </div>
        </div>

        <div className="checklist-items-stack">
          {items.map(item => {
            const isTxLocked = !canEdit;
            const isApprovedDoc = item.status === 'VALIDATED';
            const isDeficientDoc = item.status === 'DEFICIENT';
            const isUploaded = item.documentId !== null && !isDeficientDoc && item.status !== 'PENDING_UPLOAD';
            const isDocLocked = isTxLocked || isApprovedDoc;

            return (
              <div
                key={item.requirementId}
                id={`req-${item.requirementId}`}
                tabIndex={-1}
                className={`checklist-item${focusRequirement === item.requirementId ? ' is-focused' : ''} ${isApprovedDoc || isUploaded ? 'completed' : item.isMandatory ? 'required' : 'optional'}`}
                style={isDeficientDoc ? { borderLeft: '4px solid #f85149', background: 'rgba(248, 81, 73, 0.05)' } : {}}
              >
                <div className="checklist-check">
                  {isApprovedDoc || isUploaded ? (
                    <AppIcon name="approved" size={16} color="#10b981" />
                  ) : isDeficientDoc ? (
                    <AppIcon name="warning" size={16} color="#f85149" />
                  ) : (
                    <AppIcon name="checklist" size={16} color="var(--color-text-muted)" />
                  )}
                </div>

                <div className="checklist-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span className="checklist-name">{item.name}</span>
                    {isApprovedDoc && (
                      <span className="badge badge-approved" style={{ fontSize: 13, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="approved" size={11} /> Validated by {item.validatedBy || byName}
                      </span>
                    )}
                    {isDeficientDoc && (
                      <span className="badge badge-deficiency" style={{ fontSize: 13, padding: '2px 8px', background: '#f85149', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="warning" size={11} color="#ffffff" /> Returned for correction
                      </span>
                    )}
                    {!isApprovedDoc && !isDeficientDoc && item.isMandatory && (
                      <span className="badge badge-deficiency" style={{ fontSize: 13, padding: '2px 6px' }}>REQUIRED</span>
                    )}
                    <span className="badge badge-info font-mono" style={{ fontSize: 13, padding: '2px 6px' }}>{item.version}</span>
                  </div>
                  <div className="checklist-desc">{item.description}</div>
                  {isDeficientDoc && item.rejectionNotes && (
                    <div style={{ fontSize: 13, color: '#f85149', marginTop: 6, fontWeight: 600 }}>
                      {item.returnedBy || returningAuthority} note{item.returnedAt ? ` (${new Date(item.returnedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })})` : ''}: {item.rejectionNotes}
                    </div>
                  )}
                  {isReturnedState && item.replacedAfterReturn && (
                    <div role="status" style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                      <strong>Replacement saved, not sent yet.</strong> Check it with View, then press Resubmit below.
                      {item.previousNotes ? ` It was returned because: ${item.previousNotes}` : ''}
                    </div>
                  )}
                </div>

                <div className="checklist-actions">
                  {isDocLocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.documentId && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setViewingDoc({
                            title: item.name,
                            fileUrl: `/documents/${item.documentId}/file`,
                          })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <AppIcon name="view" size={13} /> View
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" disabled style={{ opacity: 0.85, cursor: 'not-allowed', color: 'var(--color-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="lock" size={14} color="var(--color-success)" /> Locked
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {item.documentId && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setViewingDoc({
                            title: item.name,
                            fileUrl: `/documents/${item.documentId}/file`,
                          })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <AppIcon name="view" size={13} /> View
                        </button>
                      )}
                      {item.documentId && !isDeficientDoc && replacingReqId !== item.requirementId ? (
                        <button type="button" className="btn btn-secondary btn-sm"
                          disabled={loading || uploadingReqId !== null || submitting}
                          onClick={() => setReplacingReqId(item.requirementId)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <AppIcon name="upload" size={13} /> Replace
                        </button>
                      ) : <>
                      {templateForRequirement(item.name) && <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={loading || uploadingReqId !== null || submitting}
                        onClick={() => navigate(`/personnel/fill-document?reqId=${item.requirementId}&txId=${txId}&name=${encodeURIComponent(item.name)}`)}
                        title={isTxLocked ? 'Open the saved form in read-only mode' : 'Fill and save this form online'}
                      >{isTxLocked ? 'View online form' : 'Fill online'}</button>}
                      <button
                        className={`btn btn-sm ${isDeficientDoc ? 'btn-danger' : isUploaded ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => {
                          setActiveReqItem(item);
                          fileInputRef.current?.click();
                        }}
                        disabled={loading || uploadingReqId !== null || submitting}
                        style={isDeficientDoc ? { background: '#f85149', color: '#ffffff', fontWeight: 700 } : { display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        title="Pick and upload a document directly to save into the database"
                      >
                        <AppIcon name={isDeficientDoc ? 'warning' : 'upload'} size={13} />
                        {uploadingReqId === item.requirementId ? 'Uploading…' : isDeficientDoc || isUploaded ? 'Replace files' : 'Upload files'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        disabled={loading || uploadingReqId !== null || submitting}
                        onClick={() => setScannerReqItem(item)}>
                        <AppIcon name="camera" size={13} /> Scan
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        disabled={loading || uploadingReqId !== null || submitting}
                        onClick={() => void openExistingPicker(item)}>
                        <AppIcon name="documents" size={13} /> From My 201 Files
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => navigate(`/personnel/upload-document?reqId=${item.requirementId}&txId=${txId}&name=${encodeURIComponent(item.name)}`)}
                        style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}
                        title="Upload on the full page, which can also read the data in a filled-in form"
                      >
                        Upload &amp; read form
                      </button>
                      {item.documentId && !isDeficientDoc && (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setReplacingReqId(null)}>Keep current</button>
                      )}
                      </>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {scannerReqItem && <DocumentScannerModal
        isOpen={Boolean(scannerReqItem)} documentTypeName={scannerReqItem.name}
        onClose={() => setScannerReqItem(null)}
        onScanComplete={file => {
          const requirement = scannerReqItem;
          setScannerReqItem(null);
          void submitDocumentFile(file, requirement);
        }}
      />}

      {attachReqItem && <AttachExistingModal
        requirementName={attachReqItem.name}
        documents={existingDocuments}
        loading={attachLoading}
        onAttach={documentId => void attachExisting(documentId)}
        onClose={() => setAttachReqItem(null)}
      />}

      <input
        aria-label="Choose a document file to upload"
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
        onChange={handleDirectFileUpload}
      />
      <p className="text-sm text-muted">Select one or more PDF, PNG or JPEG files per requirement (10 MB total). Multiple files are combined into one PDF in selection order. Replacing a requirement replaces its entire attachment.</p>

      {/* Step 8 Submit Action Card */}
      <div className="card" style={{ padding: 24, borderRadius: 20, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {txStatus === 'APPROVED' || txStatus === 'COMPLETED'
                ? 'Transaction Finalized & Synchronized'
                : txStatus === 'FOR_APPROVAL'
                ? (escalated ? 'With HRMO after repeated corrections' : `Validated by ${byName} — waiting for final approval`)
                : txStatus === 'PENDING_VALIDATION'
                ? `Submitted — Under ${vName} Verification`
                : isComplete
                ? 'All Mandatory Requirements Satisfied'
                : 'Documents Pending Upload'}
            </div>
            <div className="text-xs text-muted">
              {txStatus === 'APPROVED' || txStatus === 'COMPLETED'
                ? 'Your appointment has been officially approved and merged into your Master 201 File.'
                : txStatus === 'FOR_APPROVAL'
                ? (escalated ? 'HRMO will return the files that need fixing with instructions.' : `${byName} validated all documents. Final approval comes from ${approverName}.`)
                : txStatus === 'PENDING_VALIDATION'
                ? `Your dossier is in the queue for ${vName} validation. You will be notified of any correction or of validation as it happens.`
                : isComplete
                ? `Your 201 transaction dossier is complete and ready to submit to ${vName} for validation.`
                : `Please complete the remaining ${missingReqs.length} required document(s) before submitting.`}
            </div>
          </div>
          {txStatus === 'APPROVED' || txStatus === 'COMPLETED' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="approved" size={16} color="var(--color-success)" /> ✅ Appointment Approved & Finalized
            </button>
          ) : txStatus === 'FOR_APPROVAL' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: '#c79a2e', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="approved" size={16} color="#c79a2e" /> {escalated ? 'With HRMO for review' : `Validated by ${byName} — awaiting approval`}
            </button>
          ) : txStatus === 'PENDING_VALIDATION' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="clock" size={16} color="#f59e0b" /> Submitted — Pending {vName} Review
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmitTransaction}
              disabled={!isComplete || !canEdit || loading || submitting || uploadingReqId !== null}
              style={{ opacity: isComplete ? 1 : 0.6, cursor: isComplete ? 'pointer' : 'not-allowed', padding: '10px 24px', fontWeight: 700 }}
            >
              {submitting
                ? 'Sending…'
                : isReturnedState ? 'Resubmit corrections' : `Submit to ${vName}`}
            </button>
          )}
        </div>
      </div>

      {viewingDoc && (
        <DocumentViewerModal
          isOpen={Boolean(viewingDoc)}
          onClose={() => setViewingDoc(null)}
          title={viewingDoc.title}
          fileUrl={viewingDoc.fileUrl}
        />
      )}
    </div>
  );
};
