import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { useDocumentPreview } from '../../components/common/useDocumentPreview';
import { PdfPages } from '../../components/common/PdfPages';
import { PreviewZoomControls } from '../../components/common/PreviewZoomControls';
import './transaction-review.css';

/**
 * AO II review of one transaction's submitted documents. Shows the file the
 * personnel actually uploaded (never a generated stand-in), one document at a
 * time, and records a verdict for each before the transaction is validated
 * (forwarded to HRMO) or returned for correction.
 */

type Verdict = 'PENDING' | 'VERIFIED' | 'DEFICIENT';
type Doc = { id: number; name: string; fileName: string; mimeType: string | null; status: string; notes: string | null };
type Tx = {
  id: number; status: string; remarks: string | null; submissionDate: string | null;
  typeName: string; personName: string; employeeId: string; station: string; docs: Doc[];
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
  PENDING_VALIDATION: 'Awaiting your validation', DEFICIENCY: 'Returned for correction', FOR_APPROVAL: 'Forwarded to HRMO',
  APPROVED: 'Approved', REJECTED: 'Disqualified', DRAFT: 'Not yet submitted by personnel',
};

const toTx = (d: any): Tx => ({
  id: d.id, status: d.status, remarks: d.remarks ?? null, submissionDate: d.submissionDate ?? null,
  typeName: /^promotion$/i.test(d.transactionType?.name || '') ? 'Promotion Appointment' : (d.transactionType?.name || 'Transaction'),
  personName: d.personnel ? `${d.personnel.firstName} ${d.personnel.lastName}` : 'Personnel',
  employeeId: d.personnel?.employeeId || '',
  station: [d.personnel?.school, d.personnel?.district].filter(Boolean).join(', '),
  docs: (d.uploadedDocuments || [])
    .filter((u: any) => u.status !== 'PENDING_UPLOAD')
    .map((u: any) => ({
      id: u.id, name: u.requirementTemplate?.name || u.fileName, fileName: u.fileName, mimeType: u.mimeType ?? null,
      status: u.status, notes: u.validationNotes ?? null,
    })),
});

export const TransactionReviewModal: React.FC<{ txId: number; onClose: () => void; onDecided: () => void }> = ({ txId, onClose, onDecided }) => {
  const { addToast } = useToast();
  const [tx, setTx] = useState<Tx | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'RETURN' | 'DQ'>(null);
  const [overall, setOverall] = useState('');

  const load = useCallback(async () => {
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

  const editable = tx?.status === 'PENDING_VALIDATION';
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
    feedback: verdicts[d.id] === 'DEFICIENT' ? (notes[d.id] || 'Deficient') : 'Verified by AO II',
  }));

  const submit = async (targetStatus: 'FOR_APPROVAL' | 'DEFICIENCY' | 'REJECTED') => {
    if (!tx) return;
    if (targetStatus === 'DEFICIENCY' && tx.docs.some(d => verdicts[d.id] === 'DEFICIENT' && !(notes[d.id] || '').trim())) {
      addToast('Add a note to every deficient document so the personnel knows what to fix.', 'ERROR'); return;
    }
    if (targetStatus === 'REJECTED' && !overall.trim()) { addToast('Enter the reason for disqualification.', 'ERROR'); return; }
    const deficientList = tx.docs.filter(d => verdicts[d.id] === 'DEFICIENT').map(d => `${d.name}: ${notes[d.id]}`).join('; ');
    const remarks = targetStatus === 'FOR_APPROVAL' ? 'All documents verified by AO II.'
      : targetStatus === 'DEFICIENCY' ? `Returned for correction by AO II. ${deficientList}${overall.trim() ? ` — ${overall.trim()}` : ''}`
      : `Declared disqualified by AO II: ${overall.trim()}`;
    setBusy(true);
    try {
      await apiClient.post(`/transactions/${tx.id}/validate`, { targetStatus, remarks, documentValidations: documentValidations() });
      addToast(targetStatus === 'FOR_APPROVAL' ? `TRX-${tx.id} validated and forwarded to HRMO.`
        : targetStatus === 'DEFICIENCY' ? `TRX-${tx.id} returned to ${tx.personName} for correction. They are notified by app and email.`
        : `TRX-${tx.id} recorded as disqualified.`, targetStatus === 'FOR_APPROVAL' ? 'SUCCESS' : 'WARNING');
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

        {loadError ? <p role="alert" className="trv-pad" style={{ color: 'var(--color-danger)' }}>{loadError}</p>
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
                    <span className="trv-doc-state">{verdicts[d.id] === 'VERIFIED' ? 'Verified' : verdicts[d.id] === 'DEFICIENT' ? 'Deficient' : 'To review'}</span>
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
                  {!editable && active.notes && <p className="trv-verdict text-sm">AO II note: {active.notes}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {tx && editable && tx.docs.length > 0 && (
          <footer className="trv-foot">
            {confirm ? (
              <div className="trv-confirm">
                <label className="text-sm" style={{ fontWeight: 600 }}>
                  {confirm === 'RETURN' ? 'Message to the personnel (optional)' : 'Reason for disqualification (required)'}
                  <textarea className="form-input" rows={2} maxLength={500} value={overall} onChange={e => setOverall(e.target.value)} disabled={busy} />
                </label>
                <div className="trv-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)} disabled={busy}>Back</button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void submit(confirm === 'RETURN' ? 'DEFICIENCY' : 'REJECTED')}>
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
                    {busy ? 'Saving…' : 'Validate & forward to HRMO'}
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
