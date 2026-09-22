import React, { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { ModalOverlay } from '../common/ModalOverlay';

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
  return <ModalOverlay onDismiss={saving ? undefined : onClose}>
    <form onSubmit={confirm} className="modal-content" style={{ width: 'min(680px, 100%)', maxHeight: '90dvh', overflowY: 'auto', padding: 24 }}>
      <h2>Review scanned information</h2>
      <p className="text-muted" style={{ margin: '12px 0 20px' }}>Check these values against your document and correct any scan errors. Confirmation does not approve your 201 record; AO validation and HRMO approval are still required.</p>
      {error && <p role="alert" style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>}
      {!fields && !error && <p role="status">Loading extracted fields…</p>}
      {fields && Object.entries(fields).map(([key, value]) => <label key={key} style={{ display: 'block', marginBottom: 16, overflowWrap: 'anywhere' }}>
        <span style={{ display: 'block', marginBottom: 6 }}>{key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ')}</span>
        <textarea className="form-input" rows={2} maxLength={3000} disabled={saving} value={value} onChange={event => setFields({ ...fields, [key]: event.target.value })} style={{ width: '100%' }} />
      </label>)}
      {fields && !Object.keys(fields).length && <p>No fields were detected. Confirm to acknowledge that manual document review is needed.</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 24 }}>
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!fields || saving}>{saving ? 'Saving…' : 'Confirm reviewed information'}</button>
      </div>
    </form>
  </ModalOverlay>;
}
