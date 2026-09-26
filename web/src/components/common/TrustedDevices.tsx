import React, { useCallback, useEffect, useState } from 'react';
import { authApi, type TrustedDevice } from '../../api/auth.api';
import { useToast } from '../../contexts/ToastContext';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

/** Devices that skip the emailed sign-in code; removing one makes it ask again. */
export const TrustedDevices: React.FC = () => {
  const { addToast } = useToast();
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authApi.devices();
      setDevices(res.data.data || []);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (d: TrustedDevice) => {
    setRemoving(d.id);
    try {
      await authApi.removeDevice(d.id);
      addToast(`${d.label} removed. It will need a code at its next sign-in.`, 'SUCCESS');
      await load();
    } catch {
      addToast('The device could not be removed. Try again.', 'ERROR');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="card profile-card" aria-labelledby="profile-devices">
      <h2 id="profile-devices">Signed-in devices</h2>
      <p className="text-sm text-muted" style={{ margin: '0 0 12px' }}>
        These devices sign in without an emailed code. Remove any you do not recognise, then change your password.
      </p>
      {devices === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted">No trusted devices yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {devices.map(d => (
            <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {d.label}
                  {d.current && <span className="badge badge-approved" style={{ marginLeft: 8 }}>This device</span>}
                </div>
                <div className="text-xs text-muted">Last used {when(d.lastUsedAt)} · Added {when(d.createdAt)}</div>
              </div>
              {!d.current && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ borderRadius: 9999 }} disabled={removing === d.id} onClick={() => void remove(d)}>
                  {removing === d.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
