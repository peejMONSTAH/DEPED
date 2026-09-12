import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { AppIcon } from '../components/common/AppIcon';
import { AuthTransitionOverlay } from '../components/common/AuthTransitionOverlay';
import { DiagonalEnvironment } from '../components/login/DiagonalEnvironment';
import { LoginSlideshow } from '../components/login/LoginSlideshow';
import '../components/login/login.css';
import type { AuthUser } from '../types';

export const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'signin' | 'roles'>('signin');
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

  // Sign In & Welcome Back Overlay State
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [welcomeUser, setWelcomeUser] = useState<AuthUser | null>(null);
  const [redirectPath, setRedirectPath] = useState('');

  // 2FA / OTP State for High-Privilege Roles
  const [show2FaModal, setShow2FaModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [activeLoadingRole, setActiveLoadingRole] = useState<string | null>(null);

  // Mouse Parallax coordinates (now handled directly inside DiagonalEnvironment with 0 re-renders)
  const redirectPathRef = useRef(redirectPath);
  useEffect(() => {
    redirectPathRef.current = redirectPath;
  }, [redirectPath]);

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcomeOverlay(false);
    addToast('Welcome back!', 'SUCCESS');
    navigate(redirectPathRef.current || '/admin/dashboard');
  }, [addToast, navigate]);

  const proceedToWelcome = (loggedUser: AuthUser) => {
    setWelcomeUser(loggedUser);
    const target =
      loggedUser.role === 'TEACHING_PERSONNEL' ||
      loggedUser.role === 'NON_TEACHING_PERSONNEL'
        ? '/personnel/home'
        : '/admin/dashboard';
    setRedirectPath(target);
    setShowWelcomeOverlay(true);
  };

  const handleVerify2FA = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) {
      addToast('Please enter a valid 6-digit authentication code.', 'ERROR');
      return;
    }
    setShow2FaModal(false);
    if (welcomeUser) {
      proceedToWelcome(welcomeUser);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    // First Login & Temporary Password Change Check
    if (password.startsWith('Temp@')) {
      setPendingLogin({ email });
      setShowFirstTimeModal(true);
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);

      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const loggedUser = JSON.parse(storedUser) as AuthUser;
        setWelcomeUser(loggedUser);
        if (loggedUser.role === 'SYSTEM_ADMIN' || loggedUser.role === 'HRMO') {
          setOtpCode('888201');
          setShow2FaModal(true);
        } else {
          proceedToWelcome(loggedUser);
        }
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
      await login(pendingLogin?.email || email, password);
      addToast('Account activated! New password saved securely.', 'SUCCESS');
      setShowFirstTimeModal(false);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const loggedUser = JSON.parse(storedUser) as AuthUser;
        setWelcomeUser(loggedUser);
        const target =
          loggedUser.role === 'TEACHING_PERSONNEL' ||
          loggedUser.role === 'NON_TEACHING_PERSONNEL'
            ? '/personnel/home'
            : '/admin/dashboard';
        setRedirectPath(target);
        setShowWelcomeOverlay(true);
      } else {
        navigate('/admin/dashboard');
      }
    } catch {
      addToast('Account activation failed. Please try again.', 'ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Quick Login handler
  const handleQuickLogin = async (
    role: 'admin' | 'ao' | 'hrmo' | 'teaching' | 'nonteaching'
  ) => {
    let targetEmail = '';
    let targetPassword = '';
    switch (role) {
      case 'admin':
        targetEmail = 'admin@deped.koronadal.gov.ph';
        targetPassword = 'admin123';
        break;
      case 'ao':
        targetEmail = 'ao2_clara@deped.koronadal.gov.ph';
        targetPassword = 'admin123';
        break;
      case 'hrmo':
        targetEmail = 'hrmo@deped.koronadal.gov.ph';
        targetPassword = 'admin123';
        break;
      case 'teaching':
        targetEmail = 'personnel@deped.koronadal.gov.ph';
        targetPassword = 'admin123';
        break;
      case 'nonteaching':
        targetEmail = 'nonteaching@deped.koronadal.gov.ph';
        targetPassword = 'admin123';
        break;
    }

    setEmail(targetEmail);
    setPassword(targetPassword);
    setError('');
    setIsLoading(true);
    setActiveLoadingRole(role);

    try {
      await login(targetEmail, targetPassword);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const loggedUser = JSON.parse(storedUser) as AuthUser;
        proceedToWelcome(loggedUser);
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        'Quick login failed. Please ensure the backend server is running.';
      setError(message);
    } finally {
      setIsLoading(false);
      setActiveLoadingRole(null);
    }
  };

  const rolesData = [
    {
      id: 'teaching' as const,
      name: 'Teaching Personnel',
      code: 'TEACHER',
      desc: 'Elementary & Secondary Faculty',
      icon: 'personnel',
    },
    {
      id: 'nonteaching' as const,
      name: 'Non-Teaching Staff',
      code: 'STAFF',
      desc: 'School & Office Administration',
      icon: 'wes',
    },
    {
      id: 'admin' as const,
      name: 'System Administrator',
      code: 'ADMIN',
      desc: 'Full Division Infrastructure & Audits',
      icon: 'settings',
    },
    {
      id: 'ao' as const,
      name: 'Administrative Officer II',
      code: 'AO II',
      desc: 'Initial Verification & Document Filing',
      icon: 'security',
    },
    {
      id: 'hrmo' as const,
      name: 'HRMO Specialist',
      code: 'HRMO',
      desc: 'Final Certification & Appointments',
      icon: 'badge',
    },
  ];

  return (
    <div className="neuro-login-viewport">
      {/* 1. ATMOSPHERIC BACKGROUND GLOW */}
      <DiagonalEnvironment />

      {/* 2. MAIN 2-COLUMN STAGE (Matches NeuroFox Reference Layout) */}
      <div className="neuro-login-stage">
        {/* ─── LEFT COLUMN: SYSTEM & COLLABORATION SLIDESHOW ────── */}
        <div className="neuro-stage-left">
          <LoginSlideshow />
        </div>

        {/* ─── RIGHT COLUMN: SLEEK DARK AUTHENTICATION PORTAL ────── */}
        <div className="neuro-stage-right">
          <motion.div
            className="neuro-auth-container"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Top Segmented Pill Toggle: [ Sign In | Quick Roles ] */}
            <div className="neuro-toggle-wrapper">
              <div className="neuro-segmented-toggle">
                <button
                  type="button"
                  className={`neuro-toggle-btn ${activeTab === 'signin' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('signin')}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`neuro-toggle-btn ${activeTab === 'roles' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('roles')}
                >
                  Quick Roles
                </button>
              </div>
            </div>

            {/* Header Heading */}
            <div className="neuro-form-header">
              <h1 className="neuro-form-title">
                {activeTab === 'signin' ? 'Welcome Back' : 'Quick Role Demo'}
              </h1>
              <p className="neuro-form-subtitle">
                {activeTab === 'signin'
                  ? 'City Schools Division of Koronadal • Digital 201 System'
                  : 'Experience Eminence HRIS across division privilege tiers'}
              </p>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="neuro-alert-error"
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <AppIcon name="warning" size={16} className="neuro-alert-icon" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* TAB CONTENT 1: STANDARD CREDENTIALS SIGN IN */}
            {activeTab === 'signin' ? (
              <>
                <form className="neuro-form-body" onSubmit={handleSubmit} id="login-form">
                  {/* Email Input */}
                  <div className="neuro-input-wrapper">
                    <span className="neuro-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </span>
                    <input
                      id="email"
                      type="email"
                      className="neuro-input-field"
                      placeholder="Enter Your Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {/* Password Input */}
                  <div className="neuro-input-wrapper">
                    <span className="neuro-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="neuro-input-field"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="neuro-input-eye-btn"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                    </button>
                  </div>

                  {/* Primary Amber CTA Button */}
                  <motion.button
                    id="login-submit-btn"
                    type="submit"
                    className="neuro-submit-btn"
                    disabled={isLoading}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {isLoading ? <LoadingSpinner size="sm" /> : null}
                    <span>{isLoading ? 'Authenticating…' : 'Sign In to Portal'}</span>
                  </motion.button>
                </form>

                {/* "Or" Divider */}
                <div className="neuro-divider">
                  <div className="neuro-divider-line" />
                  <span className="neuro-divider-text">Or Quick Demo</span>
                  <div className="neuro-divider-line" />
                </div>

                {/* Quick Role Access Row (Styled like social buttons in reference) */}
                <div className="neuro-roles-row">
                  {rolesData.map((r) => {
                    const isRoleLoading = activeLoadingRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="neuro-role-icon-btn"
                        disabled={isLoading}
                        onClick={() => handleQuickLogin(r.id)}
                        title={`1-Click Demo: ${r.name}`}
                      >
                        {isRoleLoading ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <AppIcon name={r.icon as any} size={18} />
                        )}
                        <span className="neuro-role-tooltip">{r.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              /* TAB CONTENT 2: EXPANDED ROLE CARDS */
              <div className="neuro-roles-grid">
                {rolesData.map((r) => {
                  const isRoleLoading = activeLoadingRole === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="neuro-role-card-btn"
                      disabled={isLoading}
                      onClick={() => handleQuickLogin(r.id)}
                    >
                      <div className="neuro-role-card-left">
                        <div className="neuro-role-card-icon">
                          {isRoleLoading ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <AppIcon name={r.icon as any} size={18} />
                          )}
                        </div>
                        <div className="neuro-role-card-info">
                          <span className="neuro-role-card-title">{r.name}</span>
                          <span className="neuro-role-card-desc">{r.desc}</span>
                        </div>
                      </div>
                      <span className="neuro-role-card-action">
                        Launch Role →
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Legal / Institutional Compliance Footer */}
            <div className="neuro-form-footer">
              <p>Protected by DepEd Data Privacy Act (RA 10173)</p>
              <p>Notre Dame of Marbel University × DepEd Region XII</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── 3. MODALS & POPUPS (PRESERVED) ─────────────────────────── */}
      {/* First Login Password Reset Modal */}
      {showFirstTimeModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">Welcome to Eminence HRIS!</h3>
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
        </div>
      )}

      {/* 2FA / OTP Verification Modal for High-Privilege Roles */}
      {show2FaModal && (
        <div className="modal-overlay">
          <div className="modal animate-scale-in" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <AppIcon name="security" size={20} color="#F5A623" />
                <h3 className="modal-title">Two-Factor Authentication</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShow2FaModal(false)}
              >
                ×
              </button>
            </div>
            <p className="text-sm text-muted mb-4">
              Enter the 6-digit authentication code sent to your registered
              DepEd enterprise email or authenticator app.
            </p>
            <form onSubmit={handleVerify2FA} className="neuro-form-body">
              <div className="form-group">
                <label className="modal-label">6-Digit Verification Code</label>
                <input
                  type="text"
                  className="modal form-input text-center"
                  style={{
                    letterSpacing: '0.3em',
                    fontSize: 20,
                    fontWeight: 700,
                  }}
                  placeholder="888201"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                Demo OTP Code:{' '}
                <strong style={{ color: '#F5A623' }}>
                  888201
                </strong>
              </div>
              <div className="modal-footer">
                <button type="submit" className="neuro-submit-btn btn-full">
                  Verify & Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AuthTransitionOverlay
        isOpen={showWelcomeOverlay}
        user={welcomeUser}
        onComplete={handleWelcomeComplete}
      />
    </div>
  );
};
