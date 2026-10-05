import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Digital201Logo } from '../../components/common/Digital201Logo';
import '../../components/login/login.css';
import '../../components/login/split-login.css';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../api/auth.api';
import { homePathFor } from '../../auth/permissions';

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
    <div className="neuro-login-viewport split-login">
      <main className="split-login-frame">
        <section className="split-login-panel" aria-labelledby="setup-heading">
          <div className="split-login-inner">
            <div className="split-login-brand">
              <img src="/depedlogo.png" alt="Department of Education" className="split-login-seal" />
              <Digital201Logo variant="wordmark" size="md" tone="light" showTag />
            </div>
            <header className="split-login-header">
              <h1 id="setup-heading">Set your password</h1>
              <p>Choose your own password. You will be signed in right after.</p>
            </header>

            {error && (
              <div className="split-login-error" role="alert">
                <AlertTriangle size={18} aria-hidden="true" style={{ flex: 'none' }} /> <span>{error}</span>
              </div>
            )}

            {linkUnusable ? (
              <div className="split-login-form">
                <p className="split-login-help" style={{ textAlign: 'left' }}>
                  This link can no longer be used. Sign in with a temporary password if you have one, or ask your AO II or System Administrator for a new link.
                </p>
                <Link to="/login" className="split-login-submit" style={{ textDecoration: 'none' }}>Go to sign in</Link>
              </div>
            ) : (
              <form className="split-login-form" onSubmit={handleSubmit} noValidate>
                <div className="split-login-field">
                  <label className="split-login-label" htmlFor="setup-password">New password</label>
                  <span className="split-login-input">
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder={`At least ${MIN_LENGTH} characters`}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      aria-describedby="setup-password-hint"
                      aria-invalid={tooShort}
                      autoFocus
                    />
                    <button type="button" className="split-login-reveal"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </span>
                  <span id="setup-password-hint" className={`split-login-hint${tooShort ? ' is-error' : ''}`}>
                    {tooShort ? `Use at least ${MIN_LENGTH} characters.` : 'Do not reuse the temporary password.'}
                  </span>
                </div>

                <div className="split-login-field">
                  <label className="split-login-label" htmlFor="setup-confirm">Confirm password</label>
                  <span className="split-login-input">
                    <input
                      id="setup-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Type it again"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      aria-invalid={mismatch}
                      aria-describedby={mismatch ? 'setup-confirm-error' : undefined}
                    />
                  </span>
                  {mismatch && <span id="setup-confirm-error" className="split-login-hint is-error">The passwords do not match.</span>}
                </div>

                <button type="submit" className="split-login-submit" disabled={!canSubmit}>
                  {submitting && <Loader2 size={18} className="spin" aria-hidden="true" />}
                  {submitting ? 'Saving…' : 'Set password and sign in'}
                </button>
              </form>
            )}
            <p className="split-login-help"><Link to="/login" className="split-login-link">Back to sign in</Link></p>
            <p className="split-login-help">Never share this link or your password.</p>
          </div>
        </section>

        <aside className="split-login-art" aria-hidden="true">
          <picture>
            <source srcSet="/brand/sdo-koronadal-building.webp" type="image/webp" />
            <img className="split-login-photo" src="/brand/sdo-koronadal-building.jpg" alt="" width={1732} height={908} decoding="async" />
          </picture>
          <span className="split-login-scrim" />
          <div className="split-login-caption">
            <span className="split-login-caption__kicker">Account activation</span>
            <strong>Welcome to Digital 201</strong>
            <span>Your 201 file, applications and service record in one place.</span>
          </div>
        </aside>
      </main>
    </div>
  );
};
