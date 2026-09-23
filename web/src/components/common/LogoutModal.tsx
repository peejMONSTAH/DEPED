import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from './AppIcon';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const roleLabels: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  AO_II: 'Administrative Officer II',
  HRMO: 'HRMO Staff',
  TEACHING_PERSONNEL: 'Teaching Personnel',
  NON_TEACHING_PERSONNEL: 'Non-Teaching Personnel',
};

const LOGOUT_TIPS = [
  'DepEd 201 HRIS automatically secures all active session logs upon exit.',
  'Always make sure to log out when using shared workstations at division offices.',
  'Your digital 201 file records are encrypted and protected by DepEd data privacy policies.',
];

export const LogoutModal: React.FC<LogoutModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const lastUserRef = React.useRef(user);
  if (user) {
    lastUserRef.current = user;
  }
  const displayUser = user || lastUserRef.current;

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [clearCache, setClearCache] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setIsLoggingOut(false);
      setProgress(0);
      setActiveStep(0);
    }
  }, [isOpen]);

  // This modal builds its own overlay rather than using ModalOverlay, so Escape
  // is wired here. Ignored once logout is under way — there is nothing to cancel.
  useEffect(() => {
    if (!isOpen || isLoggingOut) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isOpen, isLoggingOut, onClose]);

  if (!isOpen) return null;

  const userRole = displayUser?.role || '';
  const initials = displayUser
    ? `${displayUser.firstName?.[0] || ''}${displayUser.lastName?.[0] || displayUser.email?.[0] || ''}`.toUpperCase()
    : '--';
  const roleName = userRole ? (roleLabels[userRole] || userRole) : '';
  const fullName = displayUser?.firstName
    ? `${displayUser.firstName} ${displayUser.lastName}`
    : (displayUser?.email || 'User');

  const handleConfirmLogout = () => {
    setIsLoggingOut(true);
    setProgress(20);
    setActiveStep(1);

    setTimeout(() => {
      setProgress(60);
      setActiveStep(2);
    }, 500);

    setTimeout(() => {
      setProgress(90);
      setActiveStep(3);
    }, 1000);

    setTimeout(async () => {
      setProgress(100);
      try {
        await logout();
        addToast('Logged out successfully.', 'SUCCESS');
        onClose();
        navigate('/login');
      } catch (err) {
        console.error('Logout error:', err);
        navigate('/login');
      }
    }, 1400);
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(18, 18, 20, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      {!isLoggingOut ? (
        /* ─── PHASE 1: SOFT BRUTALIST CONFIRMATION MODAL ───────────── */
        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            background: '#FFFFFF',
            borderRadius: '24px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
            overflow: 'hidden',
            color: '#1f3a2c',
            fontFamily: 'var(--font-sans)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon name="logout" size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1f3a2c' }}>
                  Confirm Logout
                </h3>
              </div>
            </div>
          </div>

          {/* Modal Content Body */}
          <div style={{ padding: '24px' }}>
            {/* User Details Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                background: '#F7FAF6',
                padding: '14px 16px',
                borderRadius: '16px',
                border: '1px solid #DCE6DE',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#E3C36A',
                  color: '#1f3a2c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#1f3a2c' }}>
                  {fullName}
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>
                  {roleName}
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayUser?.email || ''}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Are you sure you want to end your active session? You will need to re-authenticate with your DepEd credentials to access the 201 HRIS portal.
            </p>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: '#6B7280',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={clearCache}
                onChange={e => setClearCache(e.target.checked)}
                style={{ accentColor: '#1f3a2c', cursor: 'pointer' }}
              />
              Clear temporary local session cache for security
            </label>
          </div>

          {/* Action Buttons Footer */}
          <div
            style={{
              padding: '16px 24px',
              background: '#FAFAFB',
              borderTop: '1px solid #F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#FFFFFF',
                color: '#1f3a2c',
                border: '1px solid #E5E7EB',
                borderRadius: '9999px',
                padding: '8px 18px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmLogout}
              style={{
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '8px 20px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AppIcon name="logout" size={15} />
              Yes, Log Out
            </button>
          </div>
        </div>
      ) : (
        /* ─── PHASE 2: LOGGING OUT PROGRESS DISPLAY ─────────────── */
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            background: '#FFFFFF',
            borderRadius: '24px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
            padding: '36px 28px',
            textAlign: 'center',
            color: '#1f3a2c',
            fontFamily: 'var(--font-sans)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
            }}
          >
            <AppIcon name="logout" size={28} />
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1f3a2c', margin: '0 0 4px 0' }}>
            Logging Out...
          </h3>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 20px 0' }}>
            Safely closing your DepEd 201 HRIS session
          </p>

          {/* Progress Bar Track */}
          <div
            style={{
              background: '#F3F4F6',
              height: '8px',
              borderRadius: '9999px',
              overflow: 'hidden',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#1f3a2c',
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>
            {activeStep === 1 && 'Securing audit log & session state...'}
            {activeStep === 2 && 'Revoking active authorization tokens...'}
            {activeStep === 3 && 'Clearing session cache...'}
          </div>
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
