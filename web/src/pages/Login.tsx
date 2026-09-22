import { ModalOverlay } from '../components/common/ModalOverlay';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import apiClient from '../api/client';
import { LoginGlow } from '../components/login/LoginGlow';
import { Digital201Logo } from '../components/common/Digital201Logo';
import { AppIcon } from '../components/common/AppIcon';
import '../components/login/login.css';
import '../components/login/simple-login.css';
import type { AuthUser } from '../types';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuthContext();
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
      await login(email.trim(), password);

      const storedUser = localStorage.getItem('user');
      if (storedUser) {
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
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.message ||
        (err as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.error ||
        (err as Error)?.message ||
        'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
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
    <div className="neuro-login-viewport simple-login">
      <main className="simple-login-main">
        <LoginGlow />
        <section className="simple-login-card" aria-labelledby="login-heading">
          <Digital201Logo variant="wordmark" size="md" tone="light" showTag />
          <header className="simple-login-header">
            <h1 id="login-heading">Welcome back</h1>
          </header>

          {error && <div className="simple-login-error" role="alert">{error}</div>}

          <form className="simple-login-form" onSubmit={handleSubmit} id="login-form">
            <div className="simple-login-field">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="username" disabled={isLoading} required />
            </div>
            <div className="simple-login-field">
              <label htmlFor="password">Password</label>
              <div className="simple-login-password">
                <input id="password" type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" disabled={isLoading} required />
                <button type="button" className="simple-login-reveal"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                  <AppIcon name={showPassword ? 'view-off' : 'view'} size={18} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>
            <button id="login-submit-btn" className="simple-login-submit" type="submit" disabled={isLoading}>
              {isLoading && <LoadingSpinner size="sm" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

        </section>
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
