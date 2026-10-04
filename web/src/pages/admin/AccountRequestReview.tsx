import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { humanizeEnum } from '../../constants/transactionStatus';
import './account-detail.css';

export type PendingRequest = {
  id: number; firstName: string; lastName: string; middleName?: string | null; suffix?: string | null;
  email: string; role: string; designation?: string; school?: string | null; district?: string | null;
  employeeId?: string | null; contactNumber?: string | null; requestedByUser?: { email?: string } | null;
};

/**
 * Account requests are approved from one dialog: it steps through every
 * waiting request, so approving is reading the details and pressing Approve.
 * `duplicateOf` names an existing account with the same email or employee ID.
 */
export const AccountRequestReview: React.FC<{
  requests: PendingRequest[];
  startId?: number | null;
  duplicateOf: (r: PendingRequest) => string | null;
  onApprove: (r: PendingRequest) => Promise<boolean>;
  onDecline: (r: PendingRequest, reason: string) => Promise<boolean>;
  onApproveAll: () => Promise<void>;
  onClose: () => void;
}> = ({ requests, startId, duplicateOf, onApprove, onDecline, onApproveAll, onClose }) => {
  const [index, setIndex] = useState(() => Math.max(0, requests.findIndex(r => r.id === startId)));
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // The list shrinks as requests are handled; stay in range and close when done.
  useEffect(() => {
    if (requests.length === 0) onClose();
    else if (index >= requests.length) setIndex(requests.length - 1);
  }, [requests.length, index, onClose]);

  const r = requests[Math.min(index, requests.length - 1)];
  if (!r) return null;
  const name = [r.firstName, r.middleName, r.lastName, r.suffix].filter(Boolean).join(' ');
  const duplicate = duplicateOf(r);
  const station = [r.school, r.district].filter(Boolean).join(' · ') || 'Not given';

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    try { if ((await fn()) !== false) { setDeclining(false); setReason(''); } }
    finally { setBusy(false); }
  };

  return createPortal(
    <ModalOverlay onDismiss={busy ? () => {} : onClose} className="modal-overlay">
      <section className="modal acd" role="dialog" aria-modal="true" aria-labelledby="arr-title" onClick={e => e.stopPropagation()}>
        <header className="acd__head">
          <div>
            <p style={{ margin: '0 0 4px' }}>New account request{requests.length > 1 ? ` · ${index + 1} of ${requests.length}` : ''}</p>
            <h3 id="arr-title">{name}</h3>
          </div>
        </header>

        <div className="acd__body">
          {duplicate && <p className="acd__warn" role="alert">{duplicate}</p>}
          <dl className="acd__facts">
            <div><dt>Position</dt><dd>{r.designation || 'Not given'}</dd></div>
            <div><dt>Role</dt><dd>{humanizeEnum(r.role)}</dd></div>
            <div><dt>Email</dt><dd className="acd__mono">{r.email}</dd></div>
            <div><dt>Station</dt><dd>{station}</dd></div>
            {r.employeeId && <div><dt>Employee ID</dt><dd className="acd__mono">{r.employeeId}</dd></div>}
            <div><dt>Requested by</dt><dd>{r.requestedByUser?.email || 'Administrative Officer II'}</dd></div>
          </dl>
          {declining ? (
            <label className="acd__section">
              <h4>Reason for declining</h4>
              <textarea className="form-input" rows={3} autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="The AO II sees this reason." />
            </label>
          ) : <p className="acd__muted">Approving creates the account and sends the setup email right away.</p>}
        </div>

        <footer className="acd__foot">
          {declining ? <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setDeclining(false)}>Back</button>
            <button type="button" className="btn btn-primary btn-sm acd__right" disabled={busy || reason.trim().length < 5} onClick={() => void run(() => onDecline(r, reason.trim()))}>{busy ? 'Declining…' : 'Decline request'}</button>
          </> : <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onClose}>Later</button>
            {requests.length > 1 && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setIndex(i => (i + 1) % requests.length)}>Skip</button>}
            <button type="button" className="btn btn-secondary btn-sm acd__danger acd__right" disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
            {requests.length > 1 && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(onApproveAll)}>Approve all {requests.length}</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(() => onApprove(r))}>{busy ? 'Approving…' : 'Approve'}</button>
          </>}
        </footer>
      </section>
    </ModalOverlay>,
    document.body,
  );
};
