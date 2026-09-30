import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { useDocumentPreview } from '../../components/common/useDocumentPreview';
import { PdfPages } from '../../components/common/PdfPages';
import { PrecheckStrip } from '../../components/common/PrecheckStrip';
import { PreviewZoomControls } from '../../components/common/PreviewZoomControls';
import { ReviewNotice, reviewerName } from '../../components/common/ReviewNotice';
import type { ReviewState } from '../../components/common/ReviewNotice';
import { useAuthContext } from '../../contexts/AuthContext';
import './transaction-review.css';

/**
 * Review (AO II, or HRMO for its own lane) of one transaction's submitted documents. Shows the file the
 * personnel actually uploaded (never a generated stand-in), one document at a
 * time, and records a verdict for each before the transaction is validated
 * (passed on for final approval) or returned for correction.
 */

type Verdict = 'PENDING' | 'VERIFIED' | 'DEFICIENT';
type Doc = { id: number; name: string; fileName: string; mimeType: string | null; status: string; notes: string | null; changed: boolean; previousNotes: string | null };
type Tx = {
  id: number; status: string; remarks: string | null; submissionDate: string | null;
  typeName: string; personName: string; employeeId: string; station: string; docs: Doc[];
  /** Who checked it, who acts next and what this viewer can do, as decided by the server. */
  review: ReviewState | null;
};

const QUICK_REASONS = [
  'Blurred or unreadable scan',
  'Missing signature',
  'Incomplete pages',
  'Wrong or outdated form',
  'Expired document',
  'Missing dry seal',
];

const statusLabel: Record<string, string> = {
  PENDING_VALIDATION: 'Waiting for validation', DEFICIENCY: 'Returned for correction', FOR_APPROVAL: 'Validated, waiting for final approval',
  APPROVED: 'Approved', REJECTED: 'Disqualified', DRAFT: 'Not yet submitted by personnel',
};

const toTx = (d: any): Tx => ({
  id: d.id, status: d.status, remarks: d.remarks ?? null, submissionDate: d.submissionDate ?? null, review: d.review ?? null,
  typeName: /^promotion$/i.test(d.transactionType?.name || '') ? 'Promotion Appointment' : (d.transactionType?.name || 'Transaction'),
  personName: d.personnel ? `${d.personnel.firstName} ${d.personnel.lastName}` : 'Personnel',
  employeeId: d.personnel?.employeeId || '',
  station: [d.personnel?.school, d.personnel?.district].filter(Boolean).join(', '),
  docs: (d.uploadedDocuments || [])
    .filter((u: any) => u.status !== 'PENDING_UPLOAD')
    .map((u: any) => ({
      id: u.id, name: u.requirementTemplate?.name || u.fileName, fileName: u.fileName, mimeType: u.mimeType ?? null,
      status: u.status, notes: u.validationNotes ?? null,
      changed: Boolean(u.replacedAfterReturn), previousNotes: u.previousVersion?.reviewNotes ?? null,
    })),
});

export const TransactionReviewModal: React.FC<{ txId: number; onClose: () => void; onDecided: () => void }> = ({ txId, onClose, onDecided }) => {
  const { addToast } = useToast();
  const { user } = useAuthContext();
  // The role doing the review, named as the people affected will read it.
  const me = reviewerName(user?.role);
  const [tx, setTx] = useState<Tx | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'RETURN' | 'DQ'>(null);
  const [overall, setOverall] = useState('');
  const [dqAck, setDqAck] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await apiClient.get(`/transactions/${txId}`);
      const t = toTx(res.data?.data);
      setTx(t);
      setActiveId(t.docs[0]?.id ?? null);
      setVerdicts(Object.fromEntries(t.docs.map(d => [d.id, d.status === 'VALIDATED' ? 'VERIFIED' : d.status === 'REJECTED' ? 'DEFICIENT' : 'PENDING'])));
      setNotes(Object.fromEntries(t.docs.filter(d => d.status === 'REJECTED' && d.notes).map(d => [d.id, d.notes!])));
    } catch (err: any) {
      setLoadError(err.response?.data?.message || 'Could not load this transaction.');
    }
  }, [txId]);
  useEffect(() => { void load(); }, [load]);

  const active = tx?.docs.find(d => d.id === activeId) || null;
  const { preview, retry } = useDocumentPreview(active ? `/documents/${active.id}/file` : null, active?.mimeType || undefined);
  useEffect(() => setZoom(1), [activeId]);

  // Reviewing is offered only when the server says this viewer may validate it (right lane, not their own file).
  const editable = tx?.status === 'PENDING_VALIDATION' && (tx.review ? tx.review.canValidate : true);
  const counts = useMemo(() => {
    const v = Object.values(verdicts);
    return { verified: v.filter(x => x === 'VERIFIED').length, deficient: v.filter(x => x === 'DEFICIENT').length, pending: v.filter(x => x === 'PENDING').length };
  }, [verdicts]);

  const nextPending = (fromId: number, v: Record<number, Verdict>) => {
    const docs = tx?.docs || [];
    const start = docs.findIndex(d => d.id === fromId);
    for (let i = 1; i <= docs.length; i++) {
      const d = docs[(start + i) % docs.length];
      if (v[d.id] === 'PENDING') return d.id;
    }
    return fromId;
  };
  const setVerdict = (id: number, verdict: Verdict) => {
    const next = { ...verdicts, [id]: verdict };
    setVerdicts(next);
    if (verdict === 'VERIFIED') setActiveId(nextPending(id, next));
  };

  const documentValidations = () => (tx?.docs || []).map(d => ({
    documentId: d.id,
    isValid: verdicts[d.id] === 'VERIFIED',
    feedback: verdicts[d.id] === 'DEFICIENT' ? (notes[d.id] || 'Deficient') : `Verified by ${me}`,
  }));

  const submit = async (targetStatus: 'FOR_APPROVAL' | 'DEFICIENCY' | 'REJECTED') => {
    if (!tx) return;
    if (targetStatus === 'DEFICIENCY' && tx.docs.some(d => verdicts[d.id] === 'DEFICIENT' && !(notes[d.id] || '').trim())) {
      addToast('Add a note to every deficient document so the personnel knows what to fix.', 'ERROR'); return;
    }
    if (targetStatus === 'REJECTED' && !overall.trim()) { addToast('Enter the reason for disqualification.', 'ERROR'); return; }
    const deficientList = tx.docs.filter(d => verdicts[d.id] === 'DEFICIENT').map(d => `${d.name}: ${notes[d.id]}`).join('; ');
    const remarks = targetStatus === 'FOR_APPROVAL' ? `All documents verified by ${me}.`
      : targetStatus === 'DEFICIENCY' ? `Returned for correction by ${me}. ${deficientList}${overall.trim() ? ` — ${overall.trim()}` : ''}`
      : `Declared disqualified by ${me}: ${overall.trim()}`;
    setBusy(true);
    try {
      const res = await apiClient.post(`/transactions/${tx.id}/validate`, { targetStatus, remarks, documentValidations: documentValidations() });
      // The server says where the case went and who owns the next step.
      addToast(res.data?.message || (targetStatus === 'FOR_APPROVAL' ? `TRX-${tx.id} validated. It now waits for final approval.`
        : targetStatus === 'DEFICIENCY' ? `TRX-${tx.id} returned to ${tx.personName} for correction. They are notified by app and email.`
        : `TRX-${tx.id} recorded as disqualified.`), targetStatus === 'FOR_APPROVAL' ? 'SUCCESS' : 'WARNING');
      onDecided();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not record the decision.', 'ERROR');
    } finally { setBusy(false); setConfirm(null); }
  };

  return (
    <ModalPortal><ModalOverlay onDismiss={busy ? undefined : onClose}>
      <section className="modal trv" role="dialog" aria-modal="true" aria-labelledby="trv-title">
        <header className="trv-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="trv-title">{tx ? `${tx.typeName} · TRX-${tx.id}` : `TRX-${txId}`}</h2>
            {tx && <p className="text-sm text-muted">{tx.personName}{tx.employeeId ? ` · ${tx.employeeId}` : ''}{tx.station ? ` · ${tx.station}` : ''}</p>}
          </div>
          {tx && <span className={`badge ${editable ? 'badge-pending' : 'badge-info'}`}>{statusLabel[tx.status] || tx.status}</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        </header>

        {tx && <div className="trv-pad" style={{ paddingBottom: 0 }}><ReviewNotice review={tx.review} compact /></div>}
        {loadError ? <div role="alert" className="trv-pad"><p style={{ color: 'var(--color-danger)', margin: '0 0 10px' }}>{loadError} This is a loading problem, not an empty transaction.</p><button type="button" className="btn btn-primary btn-sm" onClick={() => void load()}>Retry</button></div>
          : !tx ? <p className="trv-pad text-muted">Loading…</p>
          : tx.docs.length === 0 ? <p className="trv-pad text-muted">No documents have been uploaded for this transaction yet.</p>
          : (
          <div className="trv-body">
            <nav className="trv-list" aria-label="Submitted documents">
              <div className="trv-progress">
                <strong>{counts.pending ? `${counts.pending} left to review` : 'All documents reviewed'}</strong>
                <span>{counts.verified} verified, {counts.deficient} deficient</span>
                <span className="trv-progress__bar"><span style={{ width: `${((tx.docs.length - counts.pending) / tx.docs.length) * 100}%` }} /></span>
              </div>
              {tx.docs.map(d => (
                <button key={d.id} type="button" className={`trv-doc ${d.id === activeId ? 'active' : ''} v-${verdicts[d.id].toLowerCase()}`}
                  onClick={() => setActiveId(d.id)} aria-current={d.id === activeId}>
                  <span className="trv-mark" aria-hidden="true">{verdicts[d.id] === 'VERIFIED' ? '✓' : verdicts[d.id] === 'DEFICIENT' ? '!' : ''}</span>
                  <span className="trv-doc-text">
                    <span className="trv-doc-name">{d.name}</span>
                    <span className="trv-doc-state">{verdicts[d.id] === 'VERIFIED' ? 'Verified' : verdicts[d.id] === 'DEFICIENT' ? 'Returned' : 'To review'}{d.changed ? ' · replaced since last check' : ''}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="trv-viewer">
              {active && (
                <>
                  <div className="trv-viewer-bar">
                    <span className="text-sm" title={active.fileName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <strong>{active.name}</strong> <span className="text-muted">· {active.fileName}</span>
                    </span>
                    <PreviewZoomControls zoom={zoom} onZoomChange={setZoom} disabled={preview.status !== 'ready'} buttonClassName="doc-viewer-btn doc-viewer-btn-icon" />
                  </div>
                  {active.changed && <p className="text-sm" role="note" style={{ margin: '0 0 8px', color: '#8A5A0B' }}><strong>Replaced since the last check.</strong>{active.previousNotes ? ` It was returned because: ${active.previousNotes}` : ''}</p>}
                  <PrecheckStrip url={`/documents/${active.id}/precheck`} />
                  <div className="trv-stage">
                    {preview.status === 'ready' && preview.url ? (
                      preview.type === 'application/pdf'
                        ? <PdfPages url={preview.url} zoom={zoom} title={active.name} />
                        : <div className={`trv-img-wrap ${zoom === 1 ? 'is-fit' : ''}`}><img src={preview.url} alt={active.name} style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }} /></div>
                    ) : preview.status === 'error' ? (
                      <div className="trv-center"><p style={{ color: 'var(--color-danger)' }}>{preview.error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Retry</button></div>
                    ) : <div className="trv-center text-muted">Loading the uploaded file…</div>}
                  </div>

                  {editable && (
                    <div className="trv-verdict">
                      <div className="trv-verdict-buttons">
                        <button type="button" className={`btn btn-sm ${verdicts[active.id] === 'VERIFIED' ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => setVerdict(active.id, 'VERIFIED')}><AppIcon name="approved" size={14} /> Verified</button>
                        <button type="button" className={`btn btn-sm ${verdicts[active.id] === 'DEFICIENT' ? 'btn-danger' : 'btn-secondary'}`}
                          onClick={() => setVerdict(active.id, 'DEFICIENT')}><AppIcon name="warning" size={14} /> Deficient</button>
                      </div>
                      {verdicts[active.id] === 'DEFICIENT' && (
                        <div className="trv-note">
                          <div className="trv-chips">
                            {QUICK_REASONS.map(r => (
                              <button key={r} type="button" className="trv-chip" onClick={() => setNotes(n => ({ ...n, [active.id]: n[active.id] ? `${n[active.id]}; ${r}` : r }))}>+ {r}</button>
                            ))}
                          </div>
                          <textarea className="form-input" rows={2} maxLength={500} placeholder="What should the personnel fix? (sent to them)"
                            value={notes[active.id] || ''} onChange={e => setNotes(n => ({ ...n, [active.id]: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  )}
                  {!editable && active.notes && <p className="trv-verdict text-sm">Reviewer note: {active.notes}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {tx && editable && tx.docs.length > 0 && (
          <footer className="trv-foot">
            {confirm ? (
              <div className="trv-confirm">
                {confirm === 'DQ' && (
                  <div role="alert" className="trv-dq-warning">
                    <strong>Disqualifying closes this transaction.</strong>
                    <span>Use it only when {tx.personName} is not qualified. If documents just need fixing, go back and choose Return for correction instead.</span>
                    <label><input type="checkbox" checked={dqAck} onChange={e => setDqAck(e.target.checked)} disabled={busy} /> I understand this is not a return for correction</label>
                  </div>
                )}
                <label className="text-sm" style={{ fontWeight: 600 }}>
                  {confirm === 'RETURN' ? 'Message to the personnel (optional)' : 'Reason for disqualification (required)'}
                  <textarea className="form-input" rows={2} maxLength={500} value={overall} onChange={e => setOverall(e.target.value)} disabled={busy} />
                </label>
                <div className="trv-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setConfirm(null); setDqAck(false); }} disabled={busy}>Back</button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy || (confirm === 'DQ' && (!dqAck || overall.trim().length < 10))} onClick={() => void submit(confirm === 'RETURN' ? 'DEFICIENCY' : 'REJECTED')}>
                    {busy ? 'Saving…' : confirm === 'RETURN' ? `Return ${counts.deficient} document${counts.deficient === 1 ? '' : 's'} for correction` : 'Record disqualification'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="trv-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm('DQ')} disabled={busy || counts.pending > 0}
                  title={counts.pending > 0 ? 'Review every document first' : undefined}>Disqualify…</button>
                <span style={{ flex: 1 }} />
                {counts.deficient > 0 ? (
                  <button type="button" className="btn btn-danger" onClick={() => setConfirm('RETURN')} disabled={busy || counts.pending > 0}>
                    Return for correction
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => void submit('FOR_APPROVAL')} disabled={busy || counts.pending > 0}>
                    {busy ? 'Saving…' : 'Validate & pass on for final approval'}
                  </button>
                )}
                {counts.pending > 0 && <span className="text-xs text-muted trv-hint">Review all {tx.docs.length} documents to continue ({counts.pending} left).</span>}
              </div>
            )}
          </footer>
        )}
      </section>
    </ModalOverlay></ModalPortal>
  );
};
