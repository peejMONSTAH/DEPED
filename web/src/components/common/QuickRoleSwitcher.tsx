import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from './AppIcon';
import type { AuthUser } from '../../types';

export const ROLE_CREDENTIALS = {
  admin: {
    email: 'admin@deped.gov',
    password: 'admin123',
    label: 'Sys Admin',
    icon: 'settings',
    role: 'SYSTEM_ADMIN',
    badgeClass: 'badge-purple',
  },
  ao: {
    email: 'kces@deped.gov',
    password: 'admin123',
    label: 'AO II',
    icon: 'validation',
    role: 'AO_II',
    badgeClass: 'badge-blue',
  },
  hrmo: {
    email: 'hrmo@deped.gov',
    password: 'admin123',
    label: 'HRMO',
    icon: 'promotions',
    role: 'HRMO',
    badgeClass: 'badge-emerald',
  },
  teaching: {
    email: 'ben@deped.koronadal.gov',
    password: 'admin123',
    label: 'Teaching',
    icon: 'profile',
    role: 'TEACHING_PERSONNEL',
    badgeClass: 'badge-cyan',
  },
  aoDistrict6: {
    email: 'barrio8@deped.gov',
    password: 'admin123',
    label: 'AO II (Dist 6)',
    icon: 'validation',
    role: 'AO_II',
    badgeClass: 'badge-indigo',
  },
} as const;

export type QuickRoleKey = keyof typeof ROLE_CREDENTIALS;

export const QuickRoleSwitcher: React.FC = () => {
  const { user, login } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [isExpanded, setIsExpanded] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<QuickRoleKey | null>(null);

  const handleRoleSwitch = async (key: QuickRoleKey) => {
    const cred = ROLE_CREDENTIALS[key];
    if (user?.role === cred.role) {
      addToast(`Already logged in as ${cred.label}`, 'INFO');
      setIsExpanded(false);
      return;
    }

    setSwitchingRole(key);
    try {
      await login(cred.email, cred.password);
      const storedUserStr = localStorage.getItem('user');
      const loggedUser = storedUserStr ? (JSON.parse(storedUserStr) as AuthUser) : null;
      
      const isPersonnel = (cred.role as string) === 'TEACHING_PERSONNEL' || (cred.role as string) === 'NON_TEACHING_PERSONNEL';
      const targetPath = isPersonnel ? '/personnel/home' : '/admin/dashboard';

      addToast(`1-Click switched to ${cred.label}!`, 'SUCCESS');
      setIsExpanded(false);
      navigate(targetPath, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Quick login failed. Ensure backend server is running.';
      addToast(msg, 'ERROR');
    } finally {
      setSwitchingRole(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9990,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {isExpanded && (
        <div
          className="animate-scale-in"
          style={{
            marginBottom: '10px',
            background: 'var(--glass-dropdown-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '14px',
            boxShadow: 'var(--glass-shadow), var(--glass-highlight)',
            width: '280px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--glass-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AppIcon name="quick-action" size={14} color="var(--color-primary)" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                1-Click Role Switcher
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
              title="Close"
            >
              <AppIcon name="close" size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {(Object.keys(ROLE_CREDENTIALS) as QuickRoleKey[]).map(key => {
              const item = ROLE_CREDENTIALS[key];
              const isCurrent = user?.role === item.role;
              const isLoading = switchingRole === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleRoleSwitch(key)}
                  disabled={!!switchingRole}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 9px',
                    borderRadius: '8px',
                    border: isCurrent
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--glass-border-subtle)',
                    background: isCurrent
                      ? 'var(--color-primary-subtle, rgba(215, 248, 74, 0.15))'
                      : 'var(--glass-bg-subtle)',
                    color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-primary)',
                    fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 500,
                    cursor: switchingRole ? 'wait' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <AppIcon name={item.icon} size={13} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isLoading ? 'Signing in...' : item.label}
                  </span>
                  {isCurrent && <AppIcon name="check" size={11} color="var(--color-primary)" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '9999px',
          background: 'var(--glass-dropdown-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow), var(--glass-highlight)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 700,
          transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.15), var(--glass-highlight)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--glass-shadow), var(--glass-highlight)';
        }}
        title="Toggle 1-Click Quick Role Switcher"
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AppIcon name="quick-action" size={13} color="var(--color-accent-lime, #D7F84A)" /> 1-Click Role
        </span>
        <AppIcon name="chevron-down" size={12} />
      </button>
    </div>
  );
};
