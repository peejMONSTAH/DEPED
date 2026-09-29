import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../api/auth.api';
import { homePathFor } from '../../auth/permissions';
import './auth-access.css';

/** Mirrors backend validatePasswordComplexity; the server re-checks on submit. */
const MIN_LENGTH = 6;

/**
 * Opened from the "Set up my password" email sent when an account's access is
 * distributed. The holder replaces the temporary password with their own and
 * is signed in. Nothing is sent until they submit, so opening the link (or a
 * mail scanner prefetching it) does not use it up.
 */
export const SetupAccount: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { loginWithTokens } = useAuthContext();
  const { addToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'This setup link is incomplete. Open the link from your email again.');
  const [linkUnusable, setLinkUnusable] = useState(!token);

  const tooShort = password.trim().length > 0 && password.trim().length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = Boolean(token) && password.trim().length >= MIN_LENGTH && confirm === password && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authApi.completeSetup(token, password);
      const data = res.data.data;
      if (!data?.accessToken || !data.user) throw new Error('The server did not confirm the new password.');
      loginWithTokens(data.accessToken, data.refreshToken, data.user, data.deviceToken);
      addToast('Your password is set. Welcome to Digital 201.', 'SUCCESS');
      navigate(homePathFor(data.user), { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      setError(err?.response?.data?.message || err?.message || 'Your password could not be set. Please try again.');
      // 401 = expired, used or superseded link: retrying with it cannot work.
      if (status === 401) setLinkUnusable(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="access-page">
      <div className="access-page__shell">
        <header className="access-page__brand" aria-label="Digital 201">
          <span className="access-page__brand-mark">201</span>
          <span><strong>Digital 201</strong><small>Personnel records portal</small></span>
        </header>
        <main className="access-card">
          <div className="access-card__icon" aria-hidden="true"><KeyRound size={23} /></div>
          <p className="access-card__eyebrow">Account activation</p>
          <h1>Set your password</h1>
          <p className="access-card__intro">Create a password to replace the temporary one. Once saved, you will be signed in automatically.</p>

        {error && (
          <div className="access-card__error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {linkUnusable ? (
          <div className="access-card__recovery">
            <p>This link can no longer be used. If you have a temporary password from your AO II or System Administrator, you can sign in with it and change it there. Otherwise, ask them for a new setup link.</p>
            <Link to="/login" className="access-card__submit">Go to sign in</Link>
          </div>
        ) : (
          <form className="access-card__form" onSubmit={handleSubmit} noValidate>
            <div className="access-card__field">
              <label htmlFor="setup-password">New password</label>
              <div className="access-card__password-row">
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  aria-describedby="setup-password-hint"
                  aria-invalid={tooShort}
                  autoFocus
                />
                <button
                  type="button"
                  className="access-card__visibility"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              <p id="setup-password-hint" className={tooShort ? 'access-card__hint is-error' : 'access-card__hint'}>
                At least {MIN_LENGTH} characters. Do not reuse the temporary password.
              </p>
            </div>

            <div className="access-card__field">
              <label htmlFor="setup-confirm">Confirm new password</label>
              <input
                id="setup-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? 'setup-confirm-error' : undefined}
              />
              {mismatch && (
                <p id="setup-confirm-error" className="access-card__hint is-error">The passwords do not match.</p>
              )}
            </div>

            <button type="submit" className="access-card__submit" disabled={!canSubmit}>
              {submitting && <Loader2 size={18} className="spin" aria-hidden="true" />}
              {submitting ? 'Saving…' : 'Set password and sign in'}
            </button>
          </form>
        )}
          <p className="access-card__footer">Opened this page by mistake? <Link to="/login">Return to sign in</Link></p>
        </main>
        <p className="access-page__security">Use this link only if you requested access to Digital 201. Never share it or your password.</p>
      </div>
    </div>
  );
};
