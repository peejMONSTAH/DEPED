import React, { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useTheme, AppTheme } from '../../contexts/ThemeContext';
import { AppIcon } from '../../components/common/AppIcon';

export const Settings: React.FC = () => {
  const { addToast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mfa, setMfa] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [allowedExtensions, setAllowedExtensions] = useState('PDF, JPG, PNG');

  const handleSave = () => {
    addToast('System settings saved successfully.', 'SUCCESS');
  };

  const themeOptions: { id: AppTheme; label: string; desc: string; icon: string; bg: string; text: string; border: string }[] = [
    {
      id: 'dark',
      label: 'Dark Mode (Default)',
      desc: 'Sleek institutional dark theme optimized for low-light environments and reduced eye strain',
      icon: 'moon',
      bg: '#0d1117',
      text: '#e6edf3',
      border: '#30363d',
    },
    {
      id: 'light',
      label: 'Light Mode',
      desc: 'Clean DepEd administrative paper aesthetic with crisp surfaces and high contrast',
      icon: 'sun',
      bg: '#ffffff',
      text: '#0f172a',
      border: '#cbd5e1',
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div>
          <div className="topbar-title">System Settings & Appearance</div>
          <div className="topbar-subtitle">Configure application theme, security policies, and document rules</div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 900 }}>
        {/* Appearance / Theme Settings */}
        <div className="card mb-6">
          <h3 className="card-title mb-2">Interface Appearance & Theme</h3>
          <p className="text-xs text-muted mb-4">Choose your preferred visual theme for the Eminence HRIS portal</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            {themeOptions.map(t => {
              const isSelected = theme === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: isSelected ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--color-primary-100)' : 'var(--color-bg-hover)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <AppIcon name={t.id === 'dark' ? 'moon' : t.id === 'light' ? 'sun' : 'eye'} size={18} color={isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
                    </div>
                    {isSelected && (
                      <span className="badge badge-success" style={{ fontSize: 10 }}>Active</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {t.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security Policies */}
        <div className="card mb-6">
          <h3 className="card-title mb-4">Security Policies</h3>
          
          <div className="form-group mb-4" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <input 
              type="checkbox" 
              id="mfa" 
              checked={mfa}
              onChange={e => setMfa(e.target.checked)}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
            <div>
              <label htmlFor="mfa" style={{ fontWeight: 600, display: 'block', cursor: 'pointer' }}>Require Multi-Factor Authentication</label>
              <span className="text-xs text-muted">Enforces all Admin users to authenticate with authenticator app</span>
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="form-label">Admin Session Inactivity Timeout (minutes)</label>
            <input 
              type="number" 
              className="form-input" 
              value={sessionTimeout} 
              onChange={e => setSessionTimeout(e.target.value)}
              style={{ maxWidth: 200 }}
            />
          </div>
        </div>

        {/* Document Upload Configuration */}
        <div className="card mb-6">
          <h3 className="card-title mb-4">Document Upload Configuration</h3>
          
          <div className="form-group mb-4">
            <label className="form-label">Allowed File Formats</label>
            <input 
              type="text" 
              className="form-input" 
              value={allowedExtensions} 
              onChange={e => setAllowedExtensions(e.target.value)}
              style={{ maxWidth: 400 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Max File Size Limit (MB)</label>
            <input type="number" className="form-input" defaultValue="10" style={{ maxWidth: 200 }} />
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
};

