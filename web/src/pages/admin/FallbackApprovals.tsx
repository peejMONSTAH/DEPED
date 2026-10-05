import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import apiClient from '../../api/client';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';

type Row = { id: number; personnel?: { firstName?: string; lastName?: string; employeeId?: string; designation?: string }; transactionType?: { name?: string }; review?: { summary?: string } };

/**
 * Fallback approval, a feature of the System Administrator's dashboard (not a module of its own).
 * Final approval must come from someone other than the validator. When the only eligible HRMO
 * validated a file, nobody else can approve it; the server lists exactly those files here
 * (queue=fallback) and refuses the approval for anything an HRMO can still give.
 */
export const FallbackApprovals: React.FC = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { const res = await apiClient.get('/transactions', { params: { queue: 'fallback', limit: 50 } }); setRows(res.data?.data || []); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const approve = async (r: Row) => {
    const name = `${r.personnel?.firstName || ''} ${r.personnel?.lastName || ''}`.trim() || `TRX-${r.id}`;
    const { confirmed, reason } = await confirm({
      title: 'Fallback final approval',
      message: `No other HRMO can approve ${name}'s ${r.transactionType?.name || 'transaction'}, because the only eligible HRMO validated it. Give the final approval? This updates their career record.`,
      confirmLabel: 'Approve',
      tone: 'primary',
      reason: { label: 'Note (recorded in the audit trail)', required: true },
    } as any);
    if (!confirmed) return;
    setBusy(r.id);
    try {
      await apiClient.post(`/transactions/${r.id}/approve`, { isApproved: true, notes: `Fallback approval by the System Administrator: ${String(reason || '').trim()}` });
      addToast(`TRX-${r.id} approved.`, 'SUCCESS');
      await load();
    } catch (err: any) { addToast(err?.response?.data?.message || 'The approval failed.', 'ERROR'); }
    finally { setBusy(null); }
  };

  if (!rows || rows.length === 0) return null;
  return (
    <section className="sad-card sad-fallback" id="fallback" aria-labelledby="sad-fallback-h">
      <header className="sad-card__head">
        <h2 id="sad-fallback-h"><ShieldCheck size={22} aria-hidden="true" /> Fallback approvals <span className="sad-fallback__count">{rows.length}</span></h2>
      </header>
      <ul className="sad-fallback__list">
        {rows.map(r => (
          <li key={r.id}>
            <span className="sad-avatar">{`${r.personnel?.firstName?.[0] || ''}${r.personnel?.lastName?.[0] || ''}`.toUpperCase() || '?'}</span>
            <div>
              <strong>{r.personnel?.firstName} {r.personnel?.lastName}</strong>
              <span>{r.transactionType?.name || 'Transaction'} · TRX-{r.id}{r.personnel?.employeeId ? ` · ${r.personnel.employeeId}` : ''}</span>
              {r.review?.summary && <span>{r.review.summary}</span>}
            </div>
            <button type="button" className="sad-fallback__btn" disabled={busy !== null} onClick={() => void approve(r)}>
              {busy === r.id ? 'Approving…' : 'Approve'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
