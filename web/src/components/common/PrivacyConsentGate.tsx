import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthContext } from '../../contexts/AuthContext';
import { ModalOverlay } from './ModalOverlay';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_SUMMARY, PRIVACY_NOTICE_VERSION } from '../../constants/privacyNotice';

/**
 * Asks each signed-in person to read the current Privacy Notice once. The box starts
 * unchecked and the answer is saved on the server with the notice version, so it can be shown later.
 * It never appears while a forced password change is pending: that comes first.
 */
export const PrivacyConsentGate: React.FC = () => {
  const { user, logout } = useAuthContext() as { user: ({ mustChangePassword?: boolean } & Record<string, unknown>) | null; logout?: () => void };
  const [needed, setNeeded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const signedIn = Boolean(user) && !user?.mustChangePassword;

  useEffect(() => {
    if (!signedIn) { setNeeded(false); return; }
    let live = true;
    apiClient.get('/auth/privacy-consent')
      .then(r => { if (live) setNeeded(r.data?.data?.accepted === false); })
      .catch(() => { /* If the check fails, do not lock people out of their records. */ });
    return () => { live = false; };
  }, [signedIn, user?.id]);

  if (!needed) return null;

  const accept = async () => {
    setSaving(true); setError('');
    try {
      await apiClient.post('/auth/privacy-consent', { version: PRIVACY_NOTICE_VERSION });
      setNeeded(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Your answer could not be saved. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <ModalOverlay className="modal-overlay">
      <section className="modal pg-card" role="dialog" aria-modal="true" aria-labelledby="pg-title">
        <header className="pg-head">
          <h2 id="pg-title">Privacy Notice</h2>
          <p>Before you continue, please read how Digital 201 handles your personal data.</p>
        </header>
        <div className="pg-body">
          {PRIVACY_NOTICE.map(s => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              {s.body.map(p => <p key={p}>{p}</p>)}
            </section>
          ))}
          <p className="pg-link"><Link to="/privacy" target="_blank" rel="noopener noreferrer">Open the Privacy Notice in a new tab</Link></p>
        </div>
        <footer className="pg-foot">
          <label className="pg-check">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={saving} />
            <span>{PRIVACY_NOTICE_SUMMARY}</span>
          </label>
          {error && <p className="pg-error" role="alert">{error}</p>}
          <div className="pg-actions">
            {logout && <button type="button" className="btn btn-secondary" onClick={logout} disabled={saving}>Sign out</button>}
            <button type="button" className="btn btn-primary" onClick={accept} disabled={!checked || saving}>{saving ? 'Saving…' : 'Continue'}</button>
          </div>
        </footer>
      </section>
    </ModalOverlay>
  );
};
