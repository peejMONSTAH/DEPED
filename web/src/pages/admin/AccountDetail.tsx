import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '../../api/client';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import './account-detail.css';

type Account = {
  id: number; email: string; role: string; accountStatus: string;
  personnel?: { firstName?: string; lastName?: string; employeeId?: string; designation?: string; school?: string | null; district?: string | null } | null;
};
type Session = { id: number; client: string; lastUsedAt: string; createdAt: string };
type Device = { id: number; label: string; lastUsedAt: string };

const ROLE: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator', HRMO: 'HRMO', AO_II: 'AO II',
  TEACHING_PERSONNEL: 'Teaching personnel', NON_TEACHING_PERSONNEL: 'Non-teaching personnel',
};
const STATUS: Record<string, string> = { ACTIVE: 'Active', PENDING: 'Setup email not sent', INACTIVE: 'Deactivated', LOCKED: 'Locked' };
const when = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export interface AccountActions {
  edit?: () => void;
  resetPassword?: () => void;
  sendSetup?: () => void;
  activate?: () => void;
  deactivate?: () => void;
  signOutEverywhere?: () => Promise<void> | void;
  requireCodes?: () => Promise<void> | void;
}

/**
 * Everything about one account in one place: who they are, where they are
 * signed in, and every action an administrator can take on them.
 * Sessions and devices load only for System Administrators (the API refuses others).
 */
export const AccountDetail: React.FC<{ account: Account; canSeeAccess: boolean; actions: AccountActions; onClose: () => void }> = ({ account, canSeeAccess, actions, onClose }) => {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [accessError, setAccessError] = useState('');

  const loadAccess = useCallback(async () => {
    if (!canSeeAccess) return;
    setAccessError('');
    try {
      const [s, d] = await Promise.all([
        apiClient.get('/admin/sessions', { params: { userId: account.id, limit: 50 } }),
        apiClient.get('/admin/devices', { params: { userId: account.id, limit: 50 } }),
      ]);
      setSessions(s.data.data); setDevices(d.data.data);
    } catch (err: any) {
      setSessions(null); setDevices(null);
      setAccessError(err?.response?.data?.message || 'Sign-in activity could not be loaded.');
    }
  }, [account.id, canSeeAccess]);
  useEffect(() => { void loadAccess(); }, [loadAccess]);

  const p = account.personnel;
  const name = p?.firstName ? `${p.firstName} ${p.lastName ?? ''}`.trim() : account.email;
  const station = ['SYSTEM_ADMIN', 'HRMO'].includes(account.role) ? 'Division office' : [p?.school, p?.district].filter(Boolean).join(' · ') || 'Not recorded';
  const run = (fn?: () => Promise<void> | void) => async () => { await fn?.(); await loadAccess(); };

  return createPortal(
    <ModalOverlay onDismiss={onClose} className="modal-overlay">
      <section className="modal acd" role="dialog" aria-modal="true" aria-labelledby="acd-title" onClick={e => e.stopPropagation()}>
        <header className="acd__head">
          <div>
            <h3 id="acd-title">{name}</h3>
            <p>{ROLE[account.role] || account.role} · {p?.designation || 'No position recorded'}</p>
          </div>
          <button type="button" className="acd__close" aria-label="Close" onClick={onClose}>✕</button>
        </header>

        <div className="acd__body">
          <dl className="acd__facts">
            <div><dt>Status</dt><dd><span className={`acd__status is-${account.accountStatus.toLowerCase()}`}>{STATUS[account.accountStatus] || account.accountStatus}</span></dd></div>
            <div><dt>Employee ID</dt><dd className="acd__mono">{p?.employeeId || '—'}</dd></div>
            <div><dt>Email</dt><dd className="acd__mono">{account.email}</dd></div>
            <div><dt>Station</dt><dd>{station}</dd></div>
          </dl>

          {canSeeAccess && (
            <section className="acd__section" aria-labelledby="acd-access">
              <h4 id="acd-access">Signed in on</h4>
              {accessError ? <p className="acd__muted" role="alert">{accessError}</p>
                : !sessions || !devices ? <p className="acd__muted" aria-busy="true">Loading…</p>
                : <>
                  {sessions.length === 0 ? <p className="acd__muted">No active sessions.</p> : (
                    <ul className="acd__list">{sessions.map(s => <li key={s.id}><strong>{s.client === 'app' ? 'Phone app' : 'Web browser'}</strong><span>Last used {when(s.lastUsedAt)}</span></li>)}</ul>
                  )}
                  <p className="acd__muted">{devices.length ? `Trusted devices: ${devices.map(d => d.label).join(', ')}` : 'No trusted devices. The next sign-in on a new device asks for an emailed code.'}</p>
                </>}
            </section>
          )}
        </div>

        <footer className="acd__foot">
          {actions.sendSetup && account.accountStatus === 'PENDING' && <button type="button" className="btn btn-primary btn-sm" onClick={actions.sendSetup}>Send setup email</button>}
          {actions.edit && <button type="button" className="btn btn-secondary btn-sm" onClick={actions.edit}>Change email</button>}
          {actions.resetPassword && <button type="button" className="btn btn-secondary btn-sm" onClick={actions.resetPassword}>Reset password</button>}
          {actions.signOutEverywhere && account.accountStatus === 'ACTIVE' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void run(actions.signOutEverywhere)()}>Sign out everywhere</button>}
          {actions.requireCodes && account.accountStatus === 'ACTIVE' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void run(actions.requireCodes)()}>Require sign-in codes</button>}
          {actions.activate && <button type="button" className="btn btn-secondary btn-sm" onClick={actions.activate}>Reactivate</button>}
          {actions.deactivate && <button type="button" className="btn btn-secondary btn-sm acd__danger" onClick={actions.deactivate}>Deactivate</button>}
        </footer>
      </section>
    </ModalOverlay>,
    document.body,
  );
};
