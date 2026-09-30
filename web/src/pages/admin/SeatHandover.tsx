import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { AsyncState } from '../../components/common/AsyncState';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import './seat-handover.css';

interface Person { userId: number; name: string; role: string; school: string | null; district: string | null; designation: string | null }
const seatLabel = (role: string) => (role === 'AO_II' ? 'AO II' : role === 'HRMO' ? 'HRMO' : role);

/**
 * Hand an AO II or HRMO seat to someone else, e.g. after the officer is promoted. An AO II's
 * station is the school on their own record, so a successor at the same station inherits the
 * station's open cases the moment they hold the role; nothing is moved.
 */
export const SeatHandover: React.FC = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [seats, setSeats] = useState<Person[]>([]);
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outgoingId, setOutgoingId] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.get('/users/seat-handover/options');
      setSeats(res.data?.data?.seats || []);
      setCandidates(res.data?.data?.candidates || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The seat list could not be loaded. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const outgoing = seats.find(s => String(s.userId) === outgoingId);
  // An AO II seat passes to someone at the same station; an HRMO seat may pass to anyone eligible.
  const eligible = useMemo(() => {
    if (!outgoing) return [];
    const pool = candidates.filter(c => c.userId !== outgoing.userId);
    return outgoing.role === 'AO_II'
      ? pool.filter(c => (c.school || '').trim().toLowerCase() === (outgoing.school || '').trim().toLowerCase())
      : pool;
  }, [candidates, outgoing]);
  const successor = eligible.find(c => String(c.userId) === successorId);

  const submit = async () => {
    if (!outgoing || !successor || busy) return;
    const answer = await confirm({
      title: `Hand over the ${seatLabel(outgoing.role)} seat?`,
      message: `${successor.name} becomes ${seatLabel(outgoing.role)}${outgoing.school ? ` for ${outgoing.school}` : ''}. ${outgoing.name} continues as staff. Both must sign in again.`,
      confirmLabel: 'Hand over seat',
      cancelLabel: 'Keep as is',
    });
    if (!answer.confirmed) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/users/seat-handover', { outgoingUserId: outgoing.userId, successorUserId: successor.userId });
      addToast(res.data?.message || 'Seat handed over.', 'SUCCESS');
      setOutgoingId(''); setSuccessorId('');
      await load();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'The seat could not be handed over.', 'ERROR');
    } finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Seat handover" />
      <AsyncState loading={loading} error={error} onRetry={() => { setLoading(true); void load(); }} loadingText="Loading seats…">
        <section className="seat" aria-label="Hand over a seat">
          <label className="seat__field">
            <span>Officer leaving the seat</span>
            <select value={outgoingId} onChange={e => { setOutgoingId(e.target.value); setSuccessorId(''); }}>
              <option value="">Choose an officer</option>
              {seats.map(s => <option key={s.userId} value={s.userId}>{s.name} · {seatLabel(s.role)}{s.school ? ` · ${s.school}` : ''}</option>)}
            </select>
          </label>

          <label className="seat__field">
            <span>Successor</span>
            <select value={successorId} onChange={e => setSuccessorId(e.target.value)} disabled={!outgoing}>
              <option value="">{outgoing ? (eligible.length ? 'Choose a successor' : 'No one at this station is eligible') : 'Choose the officer first'}</option>
              {eligible.map(c => <option key={c.userId} value={c.userId}>{c.name}{c.designation ? ` · ${c.designation}` : ''}{c.school ? ` · ${c.school}` : ''}</option>)}
            </select>
          </label>

          {outgoing && outgoing.role === 'AO_II' && eligible.length === 0 && (
            <p className="seat__note">The successor must already work at {outgoing.school || 'the same station'}. Move them there from Personnel first.</p>
          )}

          {outgoing && successor && (
            <ul className="seat__effects" aria-label="What changes">
              <li><b>{successor.name}</b> becomes {seatLabel(outgoing.role)}{outgoing.school ? ` for ${outgoing.school}` : ''} and takes over its open cases.</li>
              <li><b>{outgoing.name}</b> continues as non-teaching staff and can apply for promotion like anyone else.</li>
              <li>Both accounts sign out and sign in again with their new roles. The handover is recorded in the audit trail.</li>
            </ul>
          )}

          <button type="button" className="btn btn-primary" disabled={!outgoing || !successor || busy} onClick={() => void submit()}>
            {busy ? 'Handing over…' : 'Hand over seat'}
          </button>
        </section>
      </AsyncState>
    </div>
  );
};

export default SeatHandover;
