import { ModalOverlay } from '../components/common/ModalOverlay';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import apiClient from '../api/client';
import { Digital201Logo } from '../components/common/Digital201Logo';
import { AppIcon } from '../components/common/AppIcon';
import '../components/login/login.css';
import '../components/login/split-login.css';
import type { AuthUser } from '../types';
import { authApi, type VerificationChallenge } from '../api/auth.api';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Arriving from an idle sign-out explains itself instead of looking like a crash.
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('reason') === 'idle'
    ? 'You were signed out after 30 minutes without activity. Sign in again to continue.'
    : '');

  const { login, verifyDevice } = useAuthContext();

  // Set when this device must first enter the code emailed to the account.
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingLogin, setPendingLogin] = useState<{ email: string } | null>(null);

  const navigateToDashboard = (loggedUser: AuthUser) => {
    addToast('Welcome back!', 'SUCCESS');
    const target =
      loggedUser.role === 'TEACHING_PERSONNEL' ||
      loggedUser.role === 'NON_TEACHING_PERSONNEL'
        ? '/personnel/home'
        : '/admin/dashboard';
    navigate(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setIsLoading(true);
    try {
      const needsCode = await login(email.trim(), password);
      if (needsCode) {
        setChallenge(needsCode);
        setCode('');
        setResendIn(needsCode.resendAfterSeconds);
        return;
      }
      afterSignIn();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Login failed. Please check your credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  const errorMessage = (err: unknown, fallback: string) => {
    const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
    return data?.message || data?.error || (err as Error)?.message || fallback;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError('');
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your email.'); return; }
    setIsLoading(true);
    try {
      await verifyDevice(challenge.challengeToken, code);
      setChallenge(null);
      afterSignIn();
    } catch (err) {
      setError(errorMessage(err, 'That code did not work. Try again.'));
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!challenge || resendIn > 0) return;
    setError('');
    try {
      const res = await authApi.resendCode(challenge.challengeToken);
      setResendIn(res.data.data?.resendAfterSeconds ?? 60);
      addToast(`A new code was sent to ${challenge.maskedEmail}.`, 'SUCCESS');
    } catch (err) {
      setError(errorMessage(err, 'The code could not be sent. Try again.'));
    }
  };

  // After the password (and any emailed code) is accepted.
  const afterSignIn = () => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/admin/dashboard');
      return;
    }
    const loggedUser = JSON.parse(storedUser) as AuthUser;

    // Whether a password must be replaced is the server's answer, not a guess
    // from the text the user typed. The old check looked for a 'Temp@' prefix,
    // which no issued password actually used, so nobody was ever prompted.
    // The API refuses every other route until this is done.
    if ((loggedUser as AuthUser & { mustChangePassword?: boolean }).mustChangePassword) {
      setPendingLogin({ email });
      setShowFirstTimeModal(true);
      return;
    }

    navigateToDashboard(loggedUser);
  };

  const handleFirstTimePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      addToast('Password must be at least 12 characters long.', 'ERROR');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match.', 'ERROR');
      return;
    }

    setIsLoading(true);
    try {
      const loginEmail = pendingLogin?.email || email;
      await login(loginEmail, password);
      await apiClient.post('/auth/change-password', { currentPassword: password, newPassword });
      await login(loginEmail, newPassword);
      addToast('Account activated and password changed.', 'SUCCESS');
      setShowFirstTimeModal(false);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const loggedUser = JSON.parse(storedUser) as AuthUser;
        navigateToDashboard(loggedUser);
      } else {
        navigate('/admin/dashboard');
      }
    } catch {
      addToast('Account activation failed. Please try again.', 'ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="neuro-login-viewport split-login">
      <main className="split-login-frame">
        <section className="split-login-panel" aria-labelledby="login-heading">
          <div className="split-login-inner">
            <div className="split-login-brand">
              <img src="/depedlogo.png" alt="Department of Education" className="split-login-seal" />
              <Digital201Logo variant="wordmark" size="md" tone="light" showTag />
            </div>
            {challenge ? (
              <header className="split-login-header">
                <h1 id="login-heading">Check your email</h1>
                <p>
                  This device is new to your account, so we sent a 6-digit code to <strong>{challenge.maskedEmail}</strong>.
                  You will not be asked again on this device for 30 days.
                </p>
              </header>
            ) : (
              <header className="split-login-header">
                <h1 id="login-heading">Welcome back</h1>
                <p>Sign in to your Digital 201 account.</p>
              </header>
            )}

            {error && <div className="split-login-error" role="alert">{error}</div>}

            {challenge ? (
              <form className="split-login-form" onSubmit={handleVerify} id="verify-form">
                <div className="split-login-field">
                  <label className="split-login-label" htmlFor="code">Sign-in code</label>
                  <span className="split-login-input">
                    <input id="code" className="split-login-code" inputMode="numeric" autoComplete="one-time-code"
                      pattern="[0-9]*" maxLength={6} placeholder="000000" autoFocus
                      value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      disabled={isLoading} required />
                  </span>
                </div>
                <button className="split-login-submit" type="submit" disabled={isLoading || code.length !== 6}>
                  {isLoading && <LoadingSpinner size="sm" />}
                  {isLoading ? 'Checking…' : 'Verify and sign in'}
                </button>
                <div className="split-login-code-actions">
                  <button type="button" className="split-login-link" onClick={handleResend} disabled={resendIn > 0}>
                    {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                  </button>
                  <button type="button" className="split-login-link" onClick={() => { setChallenge(null); setError(''); setPassword(''); }}>
                    Use a different account
                  </button>
                </div>
              </form>
            ) : (
            <form className="split-login-form" onSubmit={handleSubmit} id="login-form">
              <div className="split-login-field">
                <label className="split-login-label" htmlFor="email">Email address</label>
                <span className="split-login-input">
                  <input id="email" type="email" placeholder="you@deped.gov.ph"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username" disabled={isLoading} required />
                  <span className="split-login-icon"><AppIcon name="email" size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                </span>
              </div>
              <div className="split-login-field">
                <label className="split-login-label" htmlFor="password">Password</label>
                <span className="split-login-input">
                  <input id="password" type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password" disabled={isLoading} required />
                  <button type="button" className="split-login-reveal"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                    <AppIcon name={showPassword ? 'view-off' : 'view'} size={18} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </span>
              </div>
              <button id="login-submit-btn" className="split-login-submit" type="submit" disabled={isLoading}>
                {isLoading && <LoadingSpinner size="sm" />}
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            )}
            <p className="split-login-help">Accounts are issued by your school&apos;s AO II or the Division HR office.</p>
            <p className="split-login-help"><Link to="/download" className="split-login-link">Get the Android app</Link></p>
            <p className="split-login-help"><Link to="/privacy" className="split-login-link">Privacy Notice</Link></p>
          </div>
        </section>

        <aside className="split-login-art" aria-hidden="true">
          <picture>
            <source srcSet="/brand/sdo-koronadal-building.webp" type="image/webp" />
            <img className="split-login-photo" src="/brand/sdo-koronadal-building.jpg" alt="" width={1732} height={908} decoding="async" fetchPriority="high" />
          </picture>
          <span className="split-login-scrim" />
          <div className="split-login-caption">
            <span className="split-login-caption__kicker">DepEd · Schools Division of Koronadal City</span>
            <strong>Digital 201</strong>
            <span>Personnel records, promotions and document validation in one place.</span>
          </div>
        </aside>
      </main>

      {/* ─── 3. MODALS & POPUPS (PRESERVED) ─────────────────────────── */}
      {/* First Login Password Reset Modal */}
      {showFirstTimeModal && (
        <ModalOverlay className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, width: '92%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Welcome to Digital 201!</h3>
            </div>
            <p className="text-sm text-muted mb-4">
              Because this is your initial sign-in with temporary credentials,
              please establish a new secure password to activate your account.
            </p>
            <form onSubmit={handleFirstTimePasswordChange} className="neuro-form-body">
              <div className="form-group">
                <label className="modal-label">
                  New Secure Password (min 12 chars)
                </label>
                <input
                  aria-label="New Secure Password (min 12 chars)"
                  type="password"
                  className="modal form-input"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                />
              </div>
              <div className="form-group">
                <label className="modal-label">Confirm New Password</label>
                <input
                  aria-label="Confirm New Password"
                  type="password"
                  className="modal form-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button
                  type="submit"
                  className="neuro-submit-btn btn-full"
                  disabled={isLoading}
                >
                  {isLoading ? <LoadingSpinner size="sm" /> : null}
                  {isLoading
                    ? 'Activating Account…'
                    : 'Activate Account & Sign In'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

    </div>
  );
};
