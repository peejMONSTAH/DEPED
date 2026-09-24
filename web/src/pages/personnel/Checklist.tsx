import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { templateForRequirement } from '../../components/forms/templateMatch';
import { checklistFromTransaction, checklistReadiness, type RequirementItem } from './checklistData';
import { ExtractionReview } from '../../components/forms/ExtractionReview';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentScannerModal } from '../../components/common/DocumentScannerModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';

type ExistingDocument = { id: number; documentTypeName: string; originalFileName: string | null; mimeType: string | null; fileSize: number | null; hasFile: boolean; status: string };

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
  const [reviewDocument, setReviewDocument] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actualType, setActualType] = useState('');
  const [txStatus, setTxStatus] = useState<string>('UNKNOWN');
  const [txRemarks, setTxRemarks] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingReqId, setUploadingReqId] = useState<number | null>(null);
  const [activeReqItem, setActiveReqItem] = useState<RequirementItem | null>(null);
  const [scannerReqItem, setScannerReqItem] = useState<RequirementItem | null>(null);
  const [attachReqItem, setAttachReqItem] = useState<RequirementItem | null>(null);
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

        setItems(checklistFromTransaction(txData));
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
    if (txId) {
      fetchTransactionData(txId);
    }
  }, [txId, fetchTransactionData]);

  // Real-time synchronization: immediately updates when AO II validates or HRMO approves
  useRealtimeTransactions(useCallback(() => {
    const target = txId || rawTxId;
    if (target) {
      fetchTransactionData(target);
    }
  }, [txId, rawTxId, fetchTransactionData]));

  const submitDocumentFile = async (file: File, requirement: RequirementItem) => {
    if (!txId || !['DRAFT', 'DEFICIENCY'].includes(txStatus) || uploadingReqId !== null) return;

    // Strict validation: Strictly PDF, PNG, JPEG (.pdf, .png, .jpg, .jpeg)
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!allowedMimes.includes(file.type) && !allowedExts.includes(ext)) {
      addToast('Invalid file format. Strict upload policy: Only PDF, PNG, and JPEG files (.pdf, .png, .jpg, .jpeg) are allowed for transaction document uploads.', 'ERROR');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      addToast('File exceeds the 10 MB maximum size limit.', 'ERROR');
      return;
    }

    const activeTargetId = txId;

    try {
      setUploadingReqId(requirement.requirementId);
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
      addToast(err.response?.data?.message || `Upload failed for "${requirement.name}".`, 'ERROR');
      await fetchTransactionData(activeTargetId);
    } finally {
      setUploadingReqId(null);
    }
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeReqItem) void submitDocumentFile(file, activeReqItem);
    e.target.value = '';
    setActiveReqItem(null);
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
      addToast(err.response?.data?.message || 'Could not load My Documents.', 'ERROR');
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
      await apiClient.put(`/transactions/${activeTargetId}/submit`);
      addToast('Document(s) successfully submitted to AO II for validation!', 'SUCCESS');
      navigate('/personnel/transactions');
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
          <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700 }}>
            TRX-{txId || rawTxId || '—'}
          </span>
          <StatusBadge status={txStatus} />
        </div>
      </div>

      {/* 1. Submitted / Pending AO II Review Banner */}
      {txStatus === 'PENDING_VALIDATION' && (
        <div className="card mb-4" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="clock" size={20} color="#f59e0b" />
            <strong style={{ color: '#f59e0b', fontSize: 14 }}>Under AO II Review & Receiving</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Your 201 transaction dossier has been successfully submitted and is currently in the queue for evaluation & document pre-checking by the Administrative Officer II (AO II). Any validation updates or deficiency notes will appear here in real time.
          </div>
        </div>
      )}

      {/* 2. Validated by AO II / Under HRMO Review Banner */}
      {txStatus === 'FOR_APPROVAL' && (
        <div className="card mb-4" style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid #c79a2e', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="approved" size={20} color="#c79a2e" />
            <strong style={{ color: '#c79a2e', fontSize: 14 }}>Validated by AO II — Forwarded to HRMO for Final Approval</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            All documentary requirements have been successfully validated and verified by AO II. Your application is now in the Division HRMO approval queue awaiting official appointment signing.
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
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
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
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {txRemarks ? `HRMO Reason: "${txRemarks}"` : 'Your application was rejected during division review.'}
          </div>
        </div>
      )}

      {/* 5. Deficiency Alert Banner if returned by AO II */}
      {isReturnedState && (
        <div className="card mb-4" style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <AppIcon name="warning" size={20} color="#f85149" />
            <strong style={{ color: '#f85149', fontSize: 14 }}>AO II Deficiency Action Required</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {txRemarks ? `AO II Remarks: "${txRemarks}"` : 'Your application was returned by AO II due to document deficiencies.'}
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
              <span className={`badge ${pill.cls}`} style={{ fontSize: 13, padding: '6px 14px' }}>{pill.text}</span>
            </div>

            <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden', margin: '14px 0 4px' }}>
              <div style={{ width: `${score}%`, height: '100%', background: tone, transition: 'width 0.4s' }} />
            </div>

            {returned.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="text-xs" style={{ fontWeight: 700, color: 'var(--color-danger)', marginBottom: 2 }}>Returned by AO II — upload a corrected copy</div>
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

            {completedReqs.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="text-xs text-muted" style={{ fontWeight: 700, marginBottom: 2 }}>Uploaded</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {completedReqs.map(r => row(r, 'var(--color-success)', 'approved',
                    r.status === 'VALIDATED' ? 'Validated by AO II' : r.needsExtractionReview ? 'Review the extracted information' : 'Awaiting AO II validation'))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted" style={{ margin: '14px 0 0' }}>
              {isComplete
                ? 'All required documents are in. Submit below to send your application to AO II for validation.'
                : returned.length
                  ? `Upload corrected copies of the ${returned.length} returned document${returned.length === 1 ? '' : 's'}${notUploaded.length ? ` and the ${notUploaded.length} still missing` : ''} to submit.`
                  : `Upload the ${notUploaded.length} remaining document${notUploaded.length === 1 ? '' : 's'} to submit.`}
            </p>
          </section>
        );
      })()}

      {/* Mandatory Checklist Items in Table Card */}
      <div className="table-card-large mb-5">
        <div className="card-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 className="card-heading-title" style={{ margin: 0 }}>Required Checklist Documents</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-info" style={{ fontSize: 11, padding: '4px 10px' }}>
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
                className={`checklist-item ${isApprovedDoc || isUploaded ? 'completed' : item.isMandatory ? 'required' : 'optional'}`}
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
                      <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="approved" size={11} /> APPROVED BY AO II
                      </span>
                    )}
                    {isDeficientDoc && (
                      <span className="badge badge-deficiency" style={{ fontSize: 10, padding: '2px 8px', background: '#f85149', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="warning" size={11} color="#ffffff" /> DEFICIENT — ACTION REQUIRED
                      </span>
                    )}
                    {!isApprovedDoc && !isDeficientDoc && item.isMandatory && (
                      <span className="badge badge-deficiency" style={{ fontSize: 10, padding: '2px 6px' }}>REQUIRED</span>
                    )}
                    <span className="badge badge-info font-mono" style={{ fontSize: 10, padding: '2px 6px' }}>{item.version}</span>
                  </div>
                  <div className="checklist-desc">{item.description}</div>
                  {isDeficientDoc && item.rejectionNotes && (
                    <div style={{ fontSize: 12, color: '#f85149', marginTop: 6, fontWeight: 600 }}>
                      AO II Evaluation Note: {item.rejectionNotes}
                    </div>
                  )}
                </div>

                <div>
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
                      {item.needsExtractionReview && item.documentId && <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewDocument(item.documentId)}>Review scanned information</button>}
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
                        {uploadingReqId === item.requirementId ? 'Uploading…' : isDeficientDoc ? 'Fix & Re-upload' : isUploaded ? 'Replace File' : 'Upload File'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        disabled={loading || uploadingReqId !== null || submitting}
                        onClick={() => setScannerReqItem(item)}>
                        <AppIcon name="camera" size={13} /> Scan
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        disabled={loading || uploadingReqId !== null || submitting}
                        onClick={() => void openExistingPicker(item)}>
                        <AppIcon name="documents" size={13} /> From My Documents
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
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {reviewDocument && <ExtractionReview documentId={reviewDocument} onClose={() => setReviewDocument(null)} onConfirmed={() => { setReviewDocument(null); void fetchTransactionData(); }} />}

      {scannerReqItem && <DocumentScannerModal
        isOpen={Boolean(scannerReqItem)} documentTypeName={scannerReqItem.name}
        onClose={() => setScannerReqItem(null)}
        onScanComplete={file => {
          const requirement = scannerReqItem;
          setScannerReqItem(null);
          void submitDocumentFile(file, requirement);
        }}
      />}

      {attachReqItem && <ModalPortal><ModalOverlay onDismiss={attachLoading ? undefined : () => setAttachReqItem(null)}>
        <section className="modal" role="dialog" aria-modal="true" aria-label={`Attach to ${attachReqItem.name}`}
          style={{ width: 'min(94vw, 560px)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', padding: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
          <header style={{ padding: '20px 20px 12px' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Attach from My Documents</h2>
            <p className="text-sm text-muted" style={{ margin: '6px 0 0' }}>
              For <strong style={{ color: 'var(--color-text-primary)' }}>{attachReqItem.name}</strong>. A copy is saved with this transaction; your original stays in My Documents.
            </p>
          </header>
          <div style={{ overflowY: 'auto', padding: '0 20px', flex: 1, minHeight: 0 }}>
            {attachLoading && <p className="text-sm text-muted">Loading…</p>}
            {!attachLoading && existingDocuments.length === 0 && <p className="text-sm text-muted">No PDF, PNG, or JPEG in My Documents yet. Upload or scan the document instead.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {existingDocuments.map(doc => <li key={doc.id}>
                <button type="button" disabled={attachLoading} onClick={() => void attachExisting(doc.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', textAlign: 'left',
                    background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                  <AppIcon name="document" size={18} color="var(--color-primary)" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.documentTypeName}</span>
                    <span className="text-xs text-muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.originalFileName ?? undefined}>{doc.originalFileName}</span>
                  </span>
                  <span className="text-xs" style={{ fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 }}>Attach</span>
                </button>
              </li>)}
            </ul>
          </div>
          <footer style={{ padding: 16, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" disabled={attachLoading} onClick={() => setAttachReqItem(null)}>Cancel</button>
          </footer>
        </section>
      </ModalOverlay></ModalPortal>}

      <input
        aria-label="Choose a document file to upload"
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
        onChange={handleDirectFileUpload}
      />

      {/* Step 8 Submit Action Card */}
      <div className="card" style={{ padding: 24, borderRadius: 20, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {txStatus === 'APPROVED' || txStatus === 'COMPLETED'
                ? 'Transaction Finalized & Synchronized'
                : txStatus === 'FOR_APPROVAL'
                ? 'Validated by AO II — Awaiting HRMO Approval'
                : txStatus === 'PENDING_VALIDATION'
                ? 'Submitted — Under AO II Verification'
                : isComplete
                ? 'All Mandatory Requirements Satisfied'
                : 'Documents Pending Upload'}
            </div>
            <div className="text-xs text-muted">
              {txStatus === 'APPROVED' || txStatus === 'COMPLETED'
                ? 'Your appointment has been officially approved and merged into your Master 201 File.'
                : txStatus === 'FOR_APPROVAL'
                ? 'All documents were verified by AO II and are currently awaiting final division review by HRMO.'
                : txStatus === 'PENDING_VALIDATION'
                ? 'Your dossier is actively in the receiving queue for AO II validation. You will be notified of any deficiency or endorsement in real time.'
                : isComplete
                ? 'Your 201 transaction dossier is complete and ready for AO II receiving and validation.'
                : `Please complete the remaining ${missingReqs.length} required document(s) before submitting.`}
            </div>
          </div>
          {txStatus === 'APPROVED' || txStatus === 'COMPLETED' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="approved" size={16} color="var(--color-success)" /> ✅ Appointment Approved & Finalized
            </button>
          ) : txStatus === 'FOR_APPROVAL' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: '#c79a2e', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="approved" size={16} color="#c79a2e" /> Validated by AO II — In HRMO Queue
            </button>
          ) : txStatus === 'PENDING_VALIDATION' ? (
            <button className="btn btn-secondary" disabled style={{ opacity: 0.85, cursor: 'default', padding: '10px 24px', fontWeight: 700, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="clock" size={16} color="#f59e0b" /> Submitted — Pending AO II Review
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmitTransaction}
              disabled={!isComplete || !canEdit || loading || submitting || uploadingReqId !== null}
              style={{ opacity: isComplete ? 1 : 0.6, cursor: isComplete ? 'pointer' : 'not-allowed', padding: '10px 24px', fontWeight: 700 }}
            >
              {submitting
                ? 'Submitting to AO II…'
                : isReturnedState ? 'Resubmit Deficient Document(s) to AO II →' : 'Submit Transaction to AO II for Validation →'}
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
