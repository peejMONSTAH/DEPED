import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { useDocumentPreview } from '../../components/common/useDocumentPreview';
import { PdfPages } from '../../components/common/PdfPages';

export type ExistingDocument = {
  id: number;
  documentTypeId?: string;
  documentTypeName: string;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  hasFile: boolean;
  status: string;
};

const STOP = new Set(['of', 'the', 'and', 'a', 'an', 'for', 'to', 'no', 'form', 'cs', 'copy', 'pdf', 'scanned', 'document']);
const words = (text: string) => (text.toLowerCase().match(/[a-z]+|\d+/g) || []).filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
const initials = (text: string) => (text.match(/\(([A-Z]{2,})\)/g) || []).map(m => m.slice(1, -1).toLowerCase());

/** How closely a stored document fits a requirement name: form numbers and acronyms weigh most. */
export function matchScore(requirementName: string, doc: ExistingDocument): number {
  const want = words(requirementName);
  const have = new Set(words(`${doc.documentTypeName} ${doc.documentTypeId || ''} ${doc.originalFileName || ''}`.replace(/_/g, ' ')));
  let score = 0;
  for (const w of want) if (have.has(w)) score += /\d/.test(w) ? 4 : 1;
  for (const acronym of initials(requirementName)) if (have.has(acronym)) score += 4;
  return want.length ? score / want.length : 0;
}

const fileUrlFor = (doc: ExistingDocument) => `/personnel/documents/${doc.id}/file`;

export const AttachExistingModal: React.FC<{
  requirementName: string;
  documents: ExistingDocument[];
  loading: boolean;
  onAttach: (documentId: number) => void;
  onClose: () => void;
}> = ({ requirementName, documents, loading, onAttach, onClose }) => {
  const [selected, setSelected] = useState<ExistingDocument | null>(null);
  const { preview, retry } = useDocumentPreview(selected ? fileUrlFor(selected) : null, selected?.mimeType || undefined);

  const ranked = useMemo(() => documents
    .map(doc => ({ doc, score: matchScore(requirementName, doc) }))
    .sort((a, b) => b.score - a.score), [documents, requirementName]);
  const bestId = ranked[0] && ranked[0].score >= 0.3 ? ranked[0].doc.id : null;

  return (
    <ModalPortal><ModalOverlay onDismiss={loading ? undefined : onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={`Attach to ${requirementName}`}
        style={{ width: selected ? 'min(94vw, 860px)' : 'min(94vw, 560px)', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', padding: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
        <header style={{ padding: '20px 20px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>{selected ? 'Check before attaching' : 'Attach from My 201 Files'}</h2>
          <p className="text-sm text-muted" style={{ margin: '6px 0 0' }}>
            For <strong style={{ color: 'var(--color-text-primary)' }}>{requirementName}</strong>.{' '}
            {selected ? 'Make sure this is the right document.' : 'A copy is saved with this transaction; your original stays in My 201 Files.'}
          </p>
        </header>

        {selected ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
            <div className="text-sm" style={{ fontWeight: 700 }}>{selected.documentTypeName}</div>
            <div className="text-xs text-muted" style={{ marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.originalFileName}</div>
            <div style={{ flex: 1, minHeight: 320, height: '55dvh', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-secondary, #f4f6f8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {preview.status === 'ready' && preview.url ? (
                preview.type === 'application/pdf'
                  ? <PdfPages url={preview.url} zoom={1} title={selected.documentTypeName} />
                  : <img src={preview.url} alt={`Preview of ${selected.documentTypeName}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : preview.status === 'error' ? (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{preview.error}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Retry</button>
                </div>
              ) : <p className="text-sm text-muted">Loading preview…</p>}
            </div>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', padding: '0 20px', flex: 1, minHeight: 0 }}>
            {loading && <p className="text-sm text-muted">Loading…</p>}
            {!loading && documents.length === 0 && <p className="text-sm text-muted">No PDF, PNG, or JPEG in My 201 Files yet. Upload or scan the document instead.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {ranked.map(({ doc }) => {
                const recommended = doc.id === bestId;
                return (
                  <li key={doc.id}>
                    <button type="button" disabled={loading} onClick={() => setSelected(doc)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer',
                        background: recommended ? 'var(--color-success-bg, #eaf7ef)' : 'var(--color-bg-card)',
                        border: `1px solid ${recommended ? 'var(--color-success)' : 'var(--color-border)'}`, borderRadius: 12 }}>
                      <AppIcon name="document" size={18} color="var(--color-primary)" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.documentTypeName}</span>
                          {recommended && <span className="badge badge-approved" style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}>Recommended</span>}
                        </span>
                        <span className="text-xs text-muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.originalFileName ?? undefined}>{doc.originalFileName}</span>
                      </span>
                      <span className="text-xs" style={{ fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 }}>Preview</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <footer style={{ padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--color-border)', marginTop: 12 }}>
          {selected ? (
            <>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setSelected(null)}>Back</button>
              <button type="button" className="btn btn-primary" disabled={loading || preview.status !== 'ready'} onClick={() => onAttach(selected.id)}>
                {loading ? 'Attaching…' : 'Attach this document'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={onClose}>Cancel</button>
          )}
        </footer>
      </section>
    </ModalOverlay></ModalPortal>
  );
};
