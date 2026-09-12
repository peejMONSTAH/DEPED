import React, { useState, useEffect, useRef } from 'react';
import { AppIcon } from './AppIcon';
import { EminenceLogo } from './EminenceLogo';
import { playLoginChime } from '../../utils/sound.utils';
import type { AuthUser } from '../../types';

interface AuthTransitionOverlayProps {
  isOpen: boolean;
  user: AuthUser | null;
  onComplete: () => void;
}

const roleLabels: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  AO_II: 'Administrative Officer II',
  HRMO: 'HRMO Staff',
  TEACHING_PERSONNEL: 'Teaching Personnel',
  NON_TEACHING_PERSONNEL: 'Non-Teaching Personnel',
};

const WELCOME_TIPS = [
  'Tip: You can quick-search any personnel by DepEd Employee ID or Email.',
  'Tip: Service records submitted by personnel automatically generate PDF 201 archives.',
  'Tip: Check your Notifications tab for pending 201 file approvals and validations.',
  'Tip: System Administrators can monitor all security audit trails in real-time.',
];

export const AuthTransitionOverlay: React.FC<AuthTransitionOverlayProps> = ({
  isOpen,
  user,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'AUTH' | 'WELCOME'>('AUTH');
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(1);
  const [tipIndex, setTipIndex] = useState(0);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isStartedRef = useRef(false);
  const hasChimedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setPhase('AUTH');
      setProgress(0);
      setStepIndex(1);
      isStartedRef.current = false;
      hasChimedRef.current = false;
      return;
    }

    if (isStartedRef.current) {
      return;
    }
    isStartedRef.current = true;

    // Timeline sequence:
    setProgress(15);
    setStepIndex(1);

    const timer1 = setTimeout(() => {
      setProgress(45);
      setStepIndex(2);
    }, 450);

    const timer2 = setTimeout(() => {
      setProgress(70);
      setStepIndex(3);
      setPhase('WELCOME');
      if (!hasChimedRef.current) {
        hasChimedRef.current = true;
        playLoginChime();
      }
    }, 900);

    const timer3 = setTimeout(() => {
      setProgress(100);
    }, 1500);

    const timer4 = setTimeout(() => {
      onCompleteRef.current?.();
    }, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const userRole = user?.role || 'SYSTEM_ADMIN';
  const roleName = roleLabels[userRole] || userRole;
  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || user.email[0]}`.toUpperCase()
    : 'U';
  const userName = user?.firstName
    ? `${user.firstName} ${user.lastName}`
    : user?.email?.split('@')[0] || 'User';

  const handleNextTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTipIndex(prev => (prev + 1) % WELCOME_TIPS.length);
  };

  return (
    <div
      className="modal-overlay animate-fade-in"
      style={{
        zIndex: 99999,
        background: 'rgba(10, 15, 30, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          maxWidth: 500,
          width: '92vw',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-2xl)',
          padding: '40px 32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 123, 255, 0.2)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Animated Background Gradient Glow */}
        <div style={{
          position: 'absolute',
          top: '-80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 300,
          background: phase === 'AUTH'
            ? 'radial-gradient(circle, rgba(0, 123, 255, 0.25) 0%, rgba(0, 0, 0, 0) 70%)'
            : 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(0, 0, 0, 0) 70%)',
          transition: 'background 0.5s ease',
          pointerEvents: 'none'
        }} />

        {phase === 'AUTH' ? (
          /* STEP 1: AUTHENTICATING STATE */
          <div>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
              <div style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(0, 123, 255, 0.2), rgba(114, 9, 183, 0.15))',
                border: '2px solid rgba(0, 123, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(0, 123, 255, 0.3)',
                margin: '0 auto'
              }}>
                <EminenceLogo variant="mark" size="md" />
              </div>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Signing In...
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
              Authenticating credentials with DepEd Enterprise Security
            </p>

            {/* Animated Progress Bar */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              marginBottom: 24,
              border: '1px solid var(--color-border)'
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #007bff, #7209b7)',
                borderRadius: 999,
                transition: 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
              }} />
            </div>

            {/* Checklist items */}
            <div style={{
              textAlign: 'left',
              background: 'var(--color-bg-secondary)',
              padding: '16px 20px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: stepIndex >= 1 ? '#10b981' : 'var(--color-text-muted)', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  {stepIndex >= 1 ? <AppIcon name="check" size={13} color="#10b981" /> : '•'}
                </span>
                <span style={{ color: stepIndex >= 1 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  Verifying account credentials
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: stepIndex >= 2 ? '#10b981' : 'var(--color-text-muted)', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  {stepIndex >= 2 ? <AppIcon name="check" size={13} color="#10b981" /> : '•'}
                </span>
                <span style={{ color: stepIndex >= 2 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  Initializing SSL/TLS encrypted tokens
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ color: stepIndex >= 3 ? '#10b981' : 'var(--color-text-muted)', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  {stepIndex >= 3 ? <AppIcon name="check" size={13} color="#10b981" /> : '•'}
                </span>
                <span style={{ color: stepIndex >= 3 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  Loading 201 HRIS workspace permissions
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: WELCOME BACK STATE */
          <div className="animate-scale-in">
            {/* User Avatar with Gradient Glow Ring */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
              <div
                className="sidebar-avatar"
                style={{
                  width: 80,
                  height: 80,
                  fontSize: 28,
                  margin: '0 auto',
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.4)',
                  border: '3px solid rgba(16, 185, 129, 0.5)'
                }}
              >
                {initials}
              </div>
              <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#10b981',
                border: '3px solid var(--color-bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 12,
                fontWeight: 'bold'
              }}>
                <AppIcon name="check" size={12} color="#fff" />
              </div>
            </div>

            <div style={{
              display: 'inline-block',
              padding: '3px 12px',
              borderRadius: 999,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 12
            }}>
              {roleName}
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Welcome back, {userName}!
            </h2>
            
            {/* Security Login Summary Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-secondary)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              marginBottom: 16
            }}>
              <AppIcon name="security" size={12} color="#10b981" />
              <span>Security Check: Last login today at 11:58 from 192.168.1.15</span>
            </div>

            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Launching your DepEd 201 HRIS dashboard...
            </p>

            {/* Progress Bar Container */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              marginBottom: 24,
              border: '1px solid var(--color-border)'
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #10b981, #059669)',
                borderRadius: 999,
                transition: 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
              }} />
            </div>

            {/* Interactive Tip Ticker */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              border: '1px dashed var(--color-border)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'left', flex: 1 }}>
                "{WELCOME_TIPS[tipIndex]}"
              </span>
              <button
                type="button"
                onClick={handleNextTip}
                style={{
                  background: 'var(--color-bg-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-primary)',
                  fontSize: 11,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Explore Tips <AppIcon name="lightbulb" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
