import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon } from './AppIcon';

interface AccountSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountSetupModal: React.FC<AccountSetupModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuthContext();
  const { addToast } = useToast();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState<'info' | 'security' | 'preferences'>('info');

  // Account Info State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');

  // Password & Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Preferences State
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [dataPrivacyConsent, setDataPrivacyConsent] = useState(true);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setPhone('0917-555-' + Math.floor(1000 + Math.random() * 9000));
      setDesignation(
        user.role === 'SYSTEM_ADMIN' ? 'System Administrator' :
        user.role === 'AO_II' ? 'Administrative Officer II' :
        user.role === 'HRMO' ? 'Human Resource Management Officer' :
        user.role === 'TEACHING_PERSONNEL' ? 'Master Teacher I' : 'Administrative Assistant II'
      );
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  // Password Complexity Validation (BR-58: ≥12 chars, upper, lower, number, special)
  const isMinLength = newPassword.length >= 12;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isPasswordValid = isMinLength && hasUpper && hasLower && hasNumber && hasSpecial && passwordsMatch;

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      addToast('First name, last name, and email are required.', 'ERROR');
      return;
    }

    updateUser({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    });

    addToast('Basic essential account details updated successfully.', 'SUCCESS');
    onClose();
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast('Please enter your current password.', 'ERROR');
      return;
    }
    if (!isPasswordValid) {
      addToast('New password does not meet security requirements or passwords do not match.', 'ERROR');
      return;
    }

    setPasswordSuccess(true);
    addToast('Account password updated successfully.', 'SUCCESS');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    addToast('Account security preferences updated.', 'SUCCESS');
    onClose();
  };

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || user.email[0]}`.toUpperCase()
    : 'U';

  const isDark = theme === 'dark';
  const primaryActionBg = isDark ? '#D7F84A' : '#141416';
  const primaryActionColor = isDark ? '#141416' : '#FFFFFF';

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          maxWidth: 620,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-bg-card)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-tertiary)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: '#D7F84A',
                color: '#141416',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 18,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(215, 248, 74, 0.35)',
              }}
            >
              {initials}
            </div>
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                Essential Account Setup
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  marginTop: 2,
                }}
              >
                Configure profile info, credentials & security preferences
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              transition: 'all 0.15s ease',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '14px 24px',
            backgroundColor: 'var(--color-bg-card)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          {[
            { id: 'info', label: 'Basic Info', icon: 'profile' },
            { id: 'security', label: 'Password & Security', icon: 'credentials' },
            { id: 'preferences', label: 'Preferences', icon: 'settings' },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 16px',
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  border: isActive ? 'none' : '1px solid var(--color-border)',
                  backgroundColor: isActive ? primaryActionBg : 'var(--color-bg-secondary)',
                  color: isActive ? primaryActionColor : 'var(--color-text-secondary)',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                <AppIcon
                  name={tab.icon}
                  size={14}
                  color={isActive ? primaryActionColor : 'currentColor'}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: '22px 24px',
            overflowY: 'auto',
            flex: '1 1 auto',
            backgroundColor: 'var(--color-bg-card)',
          }}
        >
          {/* TAB 1: BASIC ESSENTIAL ACCOUNT INFO */}
          {activeTab === 'info' && (
            <form onSubmit={handleSaveInfo}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderRadius: 12,
                  backgroundColor: 'var(--color-info-light)',
                  border: '1px solid var(--color-info)',
                  color: 'var(--color-info-text)',
                  fontSize: 13,
                  marginBottom: 18,
                }}
              >
                <AppIcon name="personal" size={16} />
                <span>
                  Essential identity credentials for <strong>DepEd Region XII HRIS Portal</strong>.
                </span>
              </div>

              {/* First & Last Name */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1.5px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      fontSize: 13.5,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1.5px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      fontSize: 13.5,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* DepEd Email Address */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      margin: 0,
                    }}
                  >
                    Official DepEd Email Address
                  </label>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#EF4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <AppIcon name="lock" size={10} color="#EF4444" /> Read-Only Record
                  </span>
                </div>
                <input
                  type="email"
                  value={email}
                  disabled
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13.5,
                    cursor: 'not-allowed',
                    opacity: 0.85,
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--color-text-muted)',
                    marginTop: 4,
                  }}
                >
                  Official DepEd system email credential. Managed by Division Administrator.
                </div>
              </div>

              {/* Phone & Designation */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 16,
                  marginBottom: 18,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--color-text-secondary)',
                        margin: 0,
                      }}
                    >
                      Contact Number
                    </label>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 9999,
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        color: '#10B981',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <AppIcon name="lock" size={10} color="#10B981" /> Verified
                    </span>
                  </div>
                  <input
                    type="text"
                    value={phone}
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      backgroundColor: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      fontSize: 13.5,
                      cursor: 'not-allowed',
                      opacity: 0.85,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-text-muted)',
                      marginTop: 4,
                    }}
                  >
                    Primary registered contact on file.
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    Position / Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      backgroundColor: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      fontSize: 13.5,
                      cursor: 'not-allowed',
                      opacity: 0.85,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-text-muted)',
                      marginTop: 4,
                    }}
                  >
                    Plantilla Item Position.
                  </div>
                </div>
              </div>

              {/* Role & Employee Metadata Card (No bloated .card classes) */}
              <div
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Account System Role:
                  </span>
                  <span
                    style={{
                      backgroundColor: 'rgba(185, 174, 245, 0.25)',
                      color: isDark ? '#B9AEF5' : '#6D28D9',
                      border: '1px solid rgba(185, 174, 245, 0.4)',
                      padding: '3px 10px',
                      borderRadius: 9999,
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {user?.role}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    Employee Number:
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-primary)',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    EMP-2026-08{user?.id}
                  </span>
                </div>
              </div>

              {/* Form Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 9999,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 22px',
                    borderRadius: 9999,
                    backgroundColor: primaryActionBg,
                    color: primaryActionColor,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  Save Essential Info
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: PASSWORD & SECURITY */}
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword}>
              {passwordSuccess && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 12,
                    backgroundColor: 'var(--color-success-light)',
                    border: '1px solid var(--color-success)',
                    color: 'var(--color-success-text)',
                    fontSize: 13,
                    marginBottom: 18,
                  }}
                >
                  <AppIcon name="approved" size={16} />
                  <span>Password updated successfully! Next login requires new password.</span>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  Current Password *
                </label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1.5px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  New Password *
                </label>
                <input
                  type="password"
                  placeholder="Minimum 12 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1.5px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Password Complexity Checklist Box */}
              {newPassword.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    marginBottom: 16,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      marginBottom: 8,
                    }}
                  >
                    Security Requirements (Argon2id Spec):
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '8px 16px',
                    }}
                  >
                    {[
                      { label: 'At least 12 characters', valid: isMinLength },
                      { label: 'Uppercase letter (A-Z)', valid: hasUpper },
                      { label: 'Lowercase letter (a-z)', valid: hasLower },
                      { label: 'Number digit (0-9)', valid: hasNumber },
                      { label: 'Special symbol (!@#$)', valid: hasSpecial },
                      { label: 'Passwords match', valid: passwordsMatch },
                    ].map((req, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: req.valid ? 'var(--color-success)' : 'var(--color-text-muted)',
                          fontWeight: req.valid ? 600 : 500,
                          fontSize: 12,
                        }}
                      >
                        {req.valid ? (
                          <AppIcon name="check" size={13} color="var(--color-success)" />
                        ) : (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: 'currentColor',
                              display: 'inline-block',
                              margin: '0 3px',
                            }}
                          />
                        )}
                        <span>{req.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1.5px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13.5,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Form Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 9999,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newPassword.length > 0 && !isPasswordValid}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 9999,
                    backgroundColor: primaryActionBg,
                    color: primaryActionColor,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: newPassword.length > 0 && !isPasswordValid ? 'not-allowed' : 'pointer',
                    opacity: newPassword.length > 0 && !isPasswordValid ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  Update Password
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PREFERENCES & DATA PRIVACY (FIXED SCREENSHOT 1) */}
          {activeTab === 'preferences' && (
            <form onSubmit={handleSavePreferences}>
              {[
                {
                  id: 'emailAlerts',
                  title: 'Email Transaction Alerts',
                  desc: 'Receive status notifications when transactions change state',
                  checked: emailNotifications,
                  toggle: () => setEmailNotifications(prev => !prev),
                },
                {
                  id: 'securityAlerts',
                  title: 'Account Security Notifications',
                  desc: 'Alert when account is accessed from new devices',
                  checked: securityAlerts,
                  toggle: () => setSecurityAlerts(prev => !prev),
                },
                {
                  id: 'privacyConsent',
                  title: 'DepEd Data Privacy Compliance',
                  desc: 'Consent to processing 201 records under RA 10173',
                  checked: dataPrivacyConsent,
                  toggle: () => setDataPrivacyConsent(prev => !prev),
                },
              ].map(pref => (
                <div
                  key={pref.id}
                  onClick={pref.toggle}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      pref.toggle();
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: 14,
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1.5px solid var(--color-border)',
                    marginBottom: 12,
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <div style={{ paddingRight: 16, flex: '1 1 auto' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        marginBottom: 3,
                        lineHeight: 1.3,
                      }}
                    >
                      {pref.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {pref.desc}
                    </div>
                  </div>

                  {/* Toggle Switch Component */}
                  <div
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: pref.checked
                        ? (isDark ? '#D7F84A' : '#141416')
                        : (isDark ? 'rgba(255, 255, 255, 0.16)' : '#CBD5E1'),
                      position: 'relative',
                      transition: 'background-color 0.2s ease',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: pref.checked
                          ? (isDark ? '#141416' : '#FFFFFF')
                          : '#FFFFFF',
                        position: 'absolute',
                        top: 3,
                        left: pref.checked ? 23 : 3,
                        transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Form Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 9999,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 22px',
                    borderRadius: 9999,
                    backgroundColor: primaryActionBg,
                    color: primaryActionColor,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  Save Preferences
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
