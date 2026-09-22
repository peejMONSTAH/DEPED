import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { UserRole } from '../../types';
import { AppIcon } from '../common/AppIcon';
import { Digital201Logo } from '../common/Digital201Logo';
import { notificationsApi } from '../../api/notifications.api';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { AccountSetupModal } from '../common/AccountSetupModal';
import { CommandPalette } from '../common/CommandPalette';
import { OfflineSyncBanner } from '../common/OfflineSyncBanner';
import { personnelDisplayName } from '../../utils/personnel-display';
import { clickable } from '../../a11y/clickable';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles?: UserRole[];
  badge?: number;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',         icon: 'dashboard',     path: '/admin/dashboard',    roles: ['SYSTEM_ADMIN', 'AO_II', 'HRMO'] },
      { label: 'Notifications',     icon: 'notifications', path: '/admin/notifications', roles: ['SYSTEM_ADMIN', 'AO_II', 'HRMO'] },
    ],
  },
  {
    label: 'Transactions & Validation',
    items: [
      { label: 'Transaction Queue',  icon: 'transactions', path: '/admin/transactions', roles: ['AO_II', 'HRMO'] },
      { label: 'Doc. Validation',    icon: 'validation',   path: '/admin/documents',    roles: ['AO_II'] },
      { label: 'HRMO Approvals',     icon: 'approvals',    path: '/admin/approvals',    roles: ['HRMO'] },
    ],
  },
  {
    label: 'HR & Digital 201',
    items: [
      { label: 'Personnel',          icon: 'personnel',    path: '/admin/personnel',    roles: ['AO_II', 'HRMO'] },
      { label: 'Plantilla Registry', icon: 'employment',   path: '/admin/plantilla',    roles: ['HRMO'] },
      { label: 'Credentials',        icon: 'credentials',  path: '/admin/credentials',  roles: ['SYSTEM_ADMIN', 'AO_II'] },
      { label: 'Compliance & YOS',   icon: 'compliance',   path: '/admin/compliance',   roles: ['HRMO'] },
      { label: 'Promotions',         icon: 'promotions',   path: '/admin/promotions',   roles: ['AO_II', 'HRMO'] },
    ],
  },
  {
    label: 'System Administration',
    items: [
      { label: 'Reports',            icon: 'reports',      path: '/admin/reports',      roles: ['SYSTEM_ADMIN'] },
      { label: 'Audit Trail',        icon: 'audit',        path: '/admin/audit',        roles: ['SYSTEM_ADMIN'] },
      { label: 'Settings & Roles',   icon: 'settings',     path: '/admin/settings',     roles: ['SYSTEM_ADMIN'] },
    ],
  },
  {
    label: 'Personnel Portal',
    items: [
      { label: 'Portal Home',       icon: 'home',            path: '/personnel/home',            roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'My Documents',      icon: 'document',        path: '/personnel/documents',       roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'My Transactions',   icon: 'transactions',    path: '/personnel/transactions',    roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'Notifications',     icon: 'notifications',   path: '/personnel/notifications',   roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'My 201 File',       icon: 'profile',         path: '/personnel/profile-completion', roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'Service Record',    icon: 'repository',      path: '/personnel/profile',            roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

const roleLabels: Record<string, string> = {
  SYSTEM_ADMIN:           'System Administrator',
  AO_II:                  'Administrative Officer II',
  HRMO:                   'HRMO Staff',
  TEACHING_PERSONNEL:     'Teaching Personnel',
  NON_TEACHING_PERSONNEL: 'Non-Teaching Personnel',
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Retain the authenticated user profile during logout transition to prevent showing fallbacks
  const lastUserRef = useRef(user);
  if (user) {
    lastUserRef.current = user;
  }
  const displayUser = user || lastUserRef.current;

  const [showUserMenu, setShowUserMenu] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);
  const [showAccountSetupModal, setShowAccountSetupModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const res = await notificationsApi.getAll({ status: 'unread' });
      const list = res.data?.data || [];
      setUnreadCount(list.length);
    } catch (_) {}
  }, []);

  useRealtimeNotifications(fetchUnreadCount);

  // Global Ctrl + K key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const handleLogout = async () => {
    setShowUserMenu(false);
    try {
      await logout();
      addToast('Signed out successfully.', 'SUCCESS');
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      navigate('/login', { replace: true });
    }
  };

  const handleProfileClick = () => {
    setShowUserMenu(false);
    setShowAccountSetupModal(true);
  };

  const userRole = displayUser?.role || '';
  const displayName = personnelDisplayName(displayUser?.personnel || displayUser, userRole) || displayUser?.email || '';

  const filterItems = (items: NavItem[]) =>
    items.filter(item => !item.roles || (userRole && item.roles.includes(userRole as UserRole)));

  const filteredSections = navSections
    .map(sec => ({ ...sec, items: filterItems(sec.items) }))
    .filter(sec => sec.items.length > 0);

  const initials = displayUser
    ? `${displayUser.firstName?.[0] || ''}${displayUser.lastName?.[0] || displayUser.email?.[0] || ''}`.toUpperCase()
    : '--';

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside id="primary-navigation" aria-label="Main navigation" className={`shell-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="shell-sidebar-header">
          <div className="sidebar-brand-top-row">
            <div className="sidebar-brand-title-block">
              <div className="brand-title-row">
                <Digital201Logo variant="wordmark" showTag />
              </div>
              <div className="brand-org-subtitle">
                City Schools Division of Koronadal
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="shell-sidebar-nav">
          {filteredSections.map(sec => (
            <div key={sec.label} className="nav-section-block">
              <div className="nav-section-header">{sec.label}</div>
              {sec.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `shell-nav-link ${isActive ? 'active-pill' : ''}`}
                  onClick={onClose}
                >
                  <AppIcon name={item.icon} size={17} className="shell-nav-icon" />
                  <span className="shell-nav-label">{item.label}</span>
                  {item.path.includes('notifications') && unreadCount > 0 ? (
                    <span className="lime-badge-pill">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : item.badge && item.badge > 0 ? (
                    <span className="lavender-badge-pill">{item.badge}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer User Profile Card */}
        <div className="shell-sidebar-footer" ref={userMenuRef}>
          {showUserMenu && (
            <div className="user-popover-card">
              <div className="popover-user-info">
                <div className="popover-name">
                  {displayName}
                </div>
                <div className="popover-email">{displayUser?.email || ''}</div>
              </div>

              <button
                type="button"
                className="popover-menu-btn"
                onClick={handleProfileClick}
              >
                <AppIcon name="profile" size={15} />
                <span>Account Profile</span>
              </button>

              <div className="popover-divider" />

              <button
                type="button"
                className="popover-menu-btn danger-item"
                onClick={handleLogout}
              >
                <AppIcon name="logout" size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          <div
            className="shell-user-card"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            {...clickable<HTMLDivElement>(() => setShowUserMenu(prev => !prev), 'Account menu')}
          >
            <div className="user-avatar-circle">{initials}</div>
            <div className="user-meta">
              <div className="user-name-text">
                {displayName}
              </div>
              <div className="user-role-text">{displayUser?.role ? (roleLabels[displayUser.role] || displayUser.role) : ''}</div>
            </div>
            <span className="user-caret">▲</span>
          </div>
        </div>
      </aside>

      <AccountSetupModal
        isOpen={showAccountSetupModal}
        onClose={() => setShowAccountSetupModal(false)}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />

      <OfflineSyncBanner />
    </>
  );
};
