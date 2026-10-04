import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { canSwitchView, inPersonnelView } from '../../auth/permissions';
import { useWorkflowFeatures } from '../../api/features';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { UserRole } from '../../types';
import { AppIcon } from '../common/AppIcon';
import { Digital201Logo } from '../common/Digital201Logo';
import { notificationsApi } from '../../api/notifications.api';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { AccountSetupModal } from '../common/AccountSetupModal';
import { ModalOverlay } from '../common/ModalOverlay';
import { TrustedDevices } from '../common/TrustedDevices';
import { CommandPalette } from '../common/CommandPalette';
import { OfflineSyncBanner } from '../common/OfflineSyncBanner';
import { personnelDisplayName } from '../../utils/personnel-display';
import { clickable } from '../../a11y/clickable';
import { NAV_SECTIONS as navSections, NavItem } from '../../navigation/navItems';
import './sidebar-collapse.css';



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
  const location = useLocation();

  // Retain the authenticated user profile during logout transition to prevent showing fallbacks
  const lastUserRef = useRef(user);
  if (user) {
    lastUserRef.current = user;
  }
  const displayUser = user || lastUserRef.current;

  // Desktop only: the sidebar can shrink to an icon rail. The choice is remembered per browser.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch { /* keep the in-memory choice */ }
    return next;
  });

  const [showUserMenu, setShowUserMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Lock background scrolling and save scroll position
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.classList.add('has-drawer-open');

    // Move focus into the drawer: its first link.
    sidebarRef.current?.querySelector<HTMLElement>('.shell-nav-link')?.focus();

    // Trap focus inside the open mobile drawer
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose?.();
        return;
      }
      if (event.key === 'Tab' && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const prevTop = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.classList.remove('has-drawer-open');
      if (prevTop) {
        const parsed = parseInt(prevTop, 10);
        window.scrollTo(0, isNaN(parsed) ? 0 : parsed * -1);
      }
    };
  }, [isOpen, onClose]);
  const [showAccountSetupModal, setShowAccountSetupModal] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
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

  // An AO II or HRMO can switch to the personnel portal and act as themselves, as staff.
  const { hrDirectReview } = useWorkflowFeatures();
  const canSwitch = hrDirectReview && canSwitchView(userRole);
  const personnelView = inPersonnelView(userRole, location.pathname);
  const effectiveRole = personnelView ? 'NON_TEACHING_PERSONNEL' : userRole;
  // HRMO's validation entry exists only for the HR-direct workflow, so it stays hidden until the server turns it on.
  const filterItems = (items: NavItem[]) =>
    items.filter(item => (!item.roles || (effectiveRole && item.roles.includes(effectiveRole as UserRole)))
      && (hrDirectReview || !(item.path === '/admin/documents' && effectiveRole === 'HRMO')));

  const filteredSections = navSections
    .map(sec => ({ ...sec, items: filterItems(sec.items) }))
    .filter(sec => sec.items.length > 0);

  const initials = displayUser
    ? `${displayUser.firstName?.[0] || ''}${displayUser.lastName?.[0] || displayUser.email?.[0] || ''}`.toUpperCase()
    : '--';

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside
        ref={sidebarRef}
        id="primary-navigation"
        aria-label="Main navigation"
        aria-modal={isOpen ? 'true' : undefined}
        className={`shell-sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      >
        {/* Brand Header */}
        <div className="shell-sidebar-header">
          <div className="sidebar-brand-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="sidebar-brand-title-block">
              <div className="brand-title-row">
                <Digital201Logo variant="wordmark" size="md" className="sidebar-logo-full" />
                <Digital201Logo variant="mark" size="md" className="sidebar-logo-compact" />
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
                  title={collapsed ? item.label : undefined}
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

              <button
                type="button"
                className="popover-menu-btn"
                onClick={() => { setShowUserMenu(false); setShowDevices(true); }}
              >
                <AppIcon name="security" size={15} />
                <span>Signed-in devices</span>
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

          {/* One compact row: the view switch (AO II and HRMO) and the collapse button. */}
          <div className={`sidebar-controls${canSwitch ? '' : ' is-solo'}`}>
            {canSwitch && (
              <div className="view-seg" role="group" aria-label="Workspace view">
                <button
                  type="button"
                  className={personnelView ? '' : 'is-on'}
                  aria-pressed={!personnelView}
                  title="Admin view"
                  onClick={() => { if (personnelView) { onClose?.(); navigate('/admin/dashboard'); } }}
                >
                  <AppIcon name="dashboard" size={15} />
                  <span className="view-seg__label">Admin</span>
                </button>
                <button
                  type="button"
                  className={personnelView ? 'is-on' : ''}
                  aria-pressed={personnelView}
                  title="Personnel view"
                  onClick={() => { if (!personnelView) { onClose?.(); navigate('/personnel/home'); } }}
                >
                  <AppIcon name="profile" size={15} />
                  <span className="view-seg__label">Personnel</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="sidebar-collapse-toggle"
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleCollapsed}
            >
              <AppIcon name="chevron-left" size={16} className="sidebar-collapse-icon" />
              <span className="sidebar-collapse-label">Collapse</span>
            </button>
          </div>

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

      {showDevices && (
        <ModalOverlay onDismiss={() => setShowDevices(false)} className="modal-overlay" onClick={() => setShowDevices(false)}>
          <div className="modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="devices-title"
            onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '94vw' }}>
            <div className="modal-header">
              <h3 id="devices-title" className="modal-title">Signed-in devices</h3>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setShowDevices(false)}>×</button>
            </div>
            <TrustedDevices embedded />
          </div>
        </ModalOverlay>
      )}

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />

      <OfflineSyncBanner />
    </>
  );
};
