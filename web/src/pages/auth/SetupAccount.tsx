import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../api/auth.api';
import { homePathFor } from '../../auth/permissions';
import { DiagonalEnvironment } from '../../components/login/DiagonalEnvironment';

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
      loginWithTokens(data.accessToken, data.refreshToken, data.user);
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10, fontSize: '1rem',
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.9375rem', fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.85)' };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A192F', overflow: 'hidden', padding: 16 }}>
      <DiagonalEnvironment />
      <main style={{
        position: 'relative', zIndex: 10, width: '100%', maxWidth: 460, backgroundColor: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20,
        padding: '32px 28px', color: '#FFFFFF', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', background: 'rgba(63,146,101,0.25)', border: '1px solid rgba(63,146,101,0.6)' }}>
            <KeyRound size={22} />
          </span>
          <h1 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 800 }}>Set up your password</h1>
        </div>
        <p style={{ margin: '0 0 22px', color: 'rgba(255,255,255,0.75)', fontSize: '0.9375rem', lineHeight: 1.55 }}>
          Choose your own password to replace the temporary one. You will be signed in right after.
        </p>

        {error && (
          <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, marginBottom: 18, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.45)', color: '#FECACA', fontSize: '0.9375rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {linkUnusable ? (
          <div style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.55 }}>
            <p style={{ marginTop: 0 }}>
              You can still sign in with the temporary password from your AO II or System Administrator. You will be asked to change it right away.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>Go to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="setup-password" style={labelStyle}>New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  aria-describedby="setup-password-hint"
                  aria-invalid={tooShort}
                  style={inputStyle}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ all: 'unset', position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.8)' }}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              <div id="setup-password-hint" style={{ marginTop: 6, fontSize: '0.875rem', color: tooShort ? '#FCA5A5' : 'rgba(255,255,255,0.6)' }}>
                At least {MIN_LENGTH} characters. Do not reuse the temporary password.
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label htmlFor="setup-confirm" style={labelStyle}>Confirm new password</label>
              <input
                id="setup-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? 'setup-confirm-error' : undefined}
                style={inputStyle}
              />
              {mismatch && (
                <div id="setup-confirm-error" style={{ marginTop: 6, fontSize: '0.875rem', color: '#FCA5A5' }}>The passwords do not match.</div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" disabled={!canSubmit} style={{ width: '100%', minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '1rem' }}>
              {submitting && <Loader2 size={18} className="spin" aria-hidden="true" />}
              {submitting ? 'Saving…' : 'Set password and sign in'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
