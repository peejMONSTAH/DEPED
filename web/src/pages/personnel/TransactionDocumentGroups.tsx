import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';

/**
 * The documents submitted for each transaction (Promotion Appointment, Newly
 * Hired Appointment, …), grouped by transaction, so everything a person has
 * filed is in My 201 Files. Read-only here: uploads and replacements happen in
 * the transaction's checklist.
 */

type TxDoc = { id: number; fileName: string; status: string; requirementTemplate?: { name: string } | null };
type Tx = {
  id: number; status: string; createdAt: string;
  transactionType?: { name: string } | null;
  uploadedDocuments?: TxDoc[];
};

const TX_STATUS: Record<string, string> = {
  DRAFT: 'Preparing requirements', DEFICIENCY: 'Returned for correction', PENDING_VALIDATION: 'Under AO II validation',
  FOR_APPROVAL: 'Awaiting HRMO approval', APPROVED: 'Approved', COMPLETED: 'Completed', REJECTED: 'Not approved', CANCELLED: 'Cancelled',
};
// The backend's type is named "Promotion"; personnel know it as the appointment.
const txLabel = (name?: string | null) => !name ? 'Transaction' : /^promotion$/i.test(name.trim()) ? 'Promotion Appointment' : name;
// Anything uploaded that is neither validated nor returned is awaiting AO II.
const docStatus = (status: string) => status === 'VALIDATED' ? { label: 'Validated', cls: 'badge-approved' }
  : status === 'REJECTED' ? { label: 'Returned', cls: 'badge-deficiency' }
  : { label: 'Awaiting validation', cls: 'badge-pending' };
// PENDING_UPLOAD rows are empty requirement slots, not documents.
const hasFile = (doc: TxDoc) => doc.status !== 'PENDING_UPLOAD';

export const TransactionDocumentGroups: React.FC = () => {
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [viewing, setViewing] = useState<{ title: string; id: number; fileName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/personnel/me')
      .then(res => { if (!cancelled) setTxs((res.data?.data?.transactions || [])
        .map((t: Tx) => ({ ...t, uploadedDocuments: (t.uploadedDocuments || []).filter(hasFile) }))
        .filter((t: Tx) => t.uploadedDocuments!.length > 0)); })
      .catch(() => { if (!cancelled) setTxs([]); });
    return () => { cancelled = true; };
  }, []);

  if (!txs || txs.length === 0) return null;

  return (
    <section className="tx-doc-groups" aria-labelledby="tx-doc-groups-title">
      <h2 id="tx-doc-groups-title" className="tx-doc-groups-title">Transaction documents</h2>
      <p className="text-sm text-muted" style={{ margin: '0 0 12px' }}>
        Requirements you submitted for each appointment. To replace one, open its checklist.
      </p>
      {txs.map(tx => (
        <article key={tx.id} className="card tx-doc-group">
          <header className="tx-doc-group-head">
            <div style={{ minWidth: 0 }}>
              <h3>{txLabel(tx.transactionType?.name)} <span className="text-muted font-mono">TRX-{tx.id}</span></h3>
              <span className="text-xs text-muted">{TX_STATUS[tx.status] || tx.status}</span>
            </div>
            {['DRAFT', 'DEFICIENCY'].includes(tx.status) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/personnel/checklist?txId=${tx.id}`)}>
                Open checklist
              </button>
            )}
          </header>
          <ul className="tx-doc-list">
            {(tx.uploadedDocuments || []).map(doc => {
              const status = docStatus(doc.status);
              const title = doc.requirementTemplate?.name || doc.fileName;
              return (
                <li key={doc.id} className="tx-doc-row">
                  <AppIcon name="document" size={16} color="var(--color-primary)" />
                  <span className="tx-doc-text">
                    <span className="tx-doc-name">{title}</span>
                    <span className="text-xs text-muted tx-doc-file" title={doc.fileName}>{doc.fileName}</span>
                  </span>
                  <span className={`badge ${status.cls}`} style={{ fontSize: 10, padding: '2px 8px' }}>{status.label}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing({ title, id: doc.id, fileName: doc.fileName })}>
                    <AppIcon name="view" size={14} /> View
                  </button>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
      {viewing && (
        <DocumentViewerModal
          isOpen
          onClose={() => setViewing(null)}
          title={viewing.title}
          fileName={viewing.fileName}
          fileUrl={`/documents/${viewing.id}/file`}
        />
      )}
    </section>
  );
};
