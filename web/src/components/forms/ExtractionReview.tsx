import React, { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { ModalOverlay } from '../common/ModalOverlay';
import { ModalPortal } from '../common/ModalPortal';

export function ExtractionReview({ documentId, onClose, onConfirmed }: {
  documentId: number; onClose: () => void; onConfirmed: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string> | null>(null);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let disposed = false;
    apiClient.get(`/documents/${documentId}/extraction-review`).then(response => {
      if (!disposed) { setFields(response.data.data.fields); setVersion(response.data.data.version); }
    }).catch(err => { if (!disposed) setError(err.response?.data?.message || 'Could not load the fields. Close and try again.'); });
    return () => { disposed = true; };
  }, [documentId]);
  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fields || saving) return;
    setSaving(true); setError('');
    try { await apiClient.put(`/documents/${documentId}/extraction-review`, { fields, version }); onConfirmed(); }
    catch (err: any) { setError(err.response?.data?.message || 'Could not save. Your edits are still here.'); }
    finally { setSaving(false); }
  };
  return <ModalPortal><ModalOverlay onDismiss={saving ? undefined : onClose}>
    <form onSubmit={confirm} className="modal" role="dialog" aria-modal="true" aria-labelledby="extraction-review-title"
      style={{ width: 'min(680px, calc(100vw - 32px))', maxHeight: '90dvh', overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}>
      <h2 id="extraction-review-title" style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Review scanned information</h2>
      <p className="text-sm text-muted" style={{ margin: '8px 0 20px', lineHeight: 1.5 }}>Check these values against your document and correct any scan errors. Confirmation does not approve your 201 record; AO validation and HRMO approval are still required.</p>
      {error && <p role="alert" style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>}
      {!fields && !error && <p role="status">Loading extracted fields…</p>}
      {fields && Object.entries(fields).map(([key, value]) => <label key={key} style={{ display: 'block', marginBottom: 16, overflowWrap: 'anywhere' }}>
        <span style={{ display: 'block', marginBottom: 6 }}>{key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ')}</span>
        <textarea className="form-input" rows={2} maxLength={3000} disabled={saving} value={value} onChange={event => setFields({ ...fields, [key]: event.target.value })} style={{ width: '100%' }} />
      </label>)}
      {fields && !Object.keys(fields).length && <div role="status" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-secondary, rgba(0,0,0,0.04))', border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>No information could be read from this scan.</strong>
        Confirm to continue; AO II will check the document itself.
      </div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap-reverse', justifyContent: 'flex-end', marginTop: 24 }}>
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!fields || saving}>{saving ? 'Saving…' : 'Confirm reviewed information'}</button>
      </div>
    </form>
  </ModalOverlay></ModalPortal>;
}
