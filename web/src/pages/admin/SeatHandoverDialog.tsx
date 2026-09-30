import React, { useEffect, useState } from 'react';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import apiClient from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import './seat-handover.css';

export interface SeatHolder { personnelId: number; name: string; role: string; school?: string | null }
interface Candidate { userId: number; personnelId: number; name: string; role: string; designation: string | null; school: string | null; district: string | null }

const seatLabel = (role: string) => (role === 'AO_II' ? 'AO II' : role === 'HRMO' ? 'HRMO' : role);
const sameStation = (a?: string | null, b?: string | null) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/**
 * Hand an AO II or HRMO seat to someone else, e.g. after the officer is promoted. The successor is
 * found by searching the whole division. An AO II's station is the school on their own record, so a
 * successor from another school moves to the seat's station when they take it.
 */
export const SeatHandoverDialog: React.FC<{ holder: SeatHolder; onClose: () => void; onDone: () => void }> = ({ holder, onClose, onDone }) => {
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const label = seatLabel(holder.role);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.get('/users/seat-handover/candidates', { params: { q } });
        if (live) setResults(res.data?.data || []);
      } catch {
        if (live) setResults([]);
      } finally { if (live) setSearching(false); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  const moves = Boolean(picked && holder.role === 'AO_II' && !sameStation(picked.school, holder.school));

  const submit = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/users/seat-handover', { outgoingPersonnelId: holder.personnelId, successorUserId: picked.userId });
      addToast(res.data?.message || 'Seat handed over.', 'SUCCESS');
      onDone();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'The seat could not be handed over.', 'ERROR');
    } finally { setBusy(false); }
  };

  return (
    <ModalPortal>
      <ModalOverlay onDismiss={onClose} className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
        <div className="modal animate-scale-in seat-dialog" role="dialog" aria-modal="true" aria-labelledby="seat-title" onClick={e => e.stopPropagation()}>
          <h3 id="seat-title" className="seat-dialog__title">Hand over the {label} seat</h3>
          <p className="seat-dialog__from"><b>{holder.name}</b> leaves the {label} seat{holder.school ? ` for ${holder.school}` : ''} and continues as staff.</p>

          <label className="seat__field">
            <span>Successor</span>
            <input
              type="search" className="form-control" autoFocus value={query} onChange={e => { setQuery(e.target.value); setPicked(null); }}
              placeholder="Search the whole division by name, employee ID, position or school"
            />
          </label>

          {query.trim().length >= 2 && !picked && (
            <ul className="seat-dialog__results" aria-label="Search results">
              {searching && results.length === 0 && <li className="seat-dialog__hint">Searching…</li>}
              {!searching && results.length === 0 && <li className="seat-dialog__hint">No matching active staff found.</li>}
              {results.map(c => (
                <li key={c.userId}>
                  <button type="button" onClick={() => { setPicked(c); setQuery(c.name); }}>
                    <strong>{c.name}</strong>
                    <span>{[c.designation, c.school].filter(Boolean).join(' · ') || 'No position or station on record'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <ul className="seat__effects" aria-label="What changes">
              <li><b>{picked.name}</b> becomes {label}{holder.school ? ` for ${holder.school}` : ''} and takes over its open cases.</li>
              {moves && <li><b>{picked.name}</b> works at {picked.school || 'no station'} today. Taking this seat moves them to {holder.school}.</li>}
              <li><b>{holder.name}</b> continues as non-teaching staff and can apply for promotion like anyone else.</li>
              <li>Both accounts sign in again with their new roles. The handover is recorded in the audit trail.</li>
            </ul>
          )}

          <div className="seat-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Keep as is</button>
            <button type="button" className="btn btn-primary" disabled={!picked || busy} onClick={() => void submit()}>{busy ? 'Handing over…' : 'Hand over seat'}</button>
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
};
