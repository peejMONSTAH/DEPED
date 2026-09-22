import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryClient';
import { AccountSetupModal } from '../../components/common/AccountSetupModal';
import { clickable } from '../../a11y/clickable';

type TransactionItem = {
  id: string;
  avatar: string;
  employee: string;
  type: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  date: string;
};

type TopNotificationItem = {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
  relatedEntityType?: string;
};

export const AdminDashboard: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [totalPersonnel, setTotalPersonnel] = useState<number>(0);
  const [teachingCount, setTeachingCount] = useState<number>(0);
  const [nonTeachingCount, setNonTeachingCount] = useState<number>(0);
  const [totalTransactions, setTotalTransactions] = useState<number>(0);
  const [pendingQueue, setPendingQueue] = useState<number>(0);
  const [approvedCount, setApprovedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // SysAdmin Dedicated State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [accountRequests, setAccountRequests] = useState<any[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<any[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [totalAuditCount, setTotalAuditCount] = useState<number>(0);
  const [sysAdminViewTab, setSysAdminViewTab] = useState<'USERS' | 'REQUESTS'>('USERS');

  // Topbar Notification & Settings dropdown states
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);
  // Server state: React Query owns the cache; unread is derived, never stored separately.
  const queryClient = useQueryClient();
  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async (): Promise<TopNotificationItem[]> => {
      const res = await apiClient.get('/notifications');
      return res.data?.data || [];
    },
  });
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const patchNotifications = (fn: (list: TopNotificationItem[]) => TopNotificationItem[]) =>
    queryClient.setQueryData<TopNotificationItem[]>(queryKeys.notifications, prev => fn(prev || []));

  const notifMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // Weekly activity stats computed from real transactions
  const [weeklyStats, setWeeklyStats] = useState<{ day: string; rate: number; count: number }[]>([
    { day: 'MON', rate: 0, count: 0 },
    { day: 'TUE', rate: 0, count: 0 },
    { day: 'WED', rate: 0, count: 0 },
    { day: 'THU', rate: 0, count: 0 },
    { day: 'FRI', rate: 0, count: 0 },
  ]);

  const isSysAdmin = user?.role === 'SYSTEM_ADMIN';

  const [summary, setSummary] = useState<any>(null);
  const [dashboardError, setDashboardError] = useState('');
  const dashboardRequest = useRef(0);
  const fetchDashboardData = useCallback(async () => {
    const request = ++dashboardRequest.current;
    setLoading(true);
    try {
      const [summaryRes, previewRes, requestsRes, auditRes] = await Promise.all([
        apiClient.get('/dashboard'),
        apiClient.get(user?.role === 'SYSTEM_ADMIN' ? '/users?limit=7' : '/transactions?limit=5'),
        user?.role === 'SYSTEM_ADMIN' ? apiClient.get('/users/requests?status=PENDING&limit=7') : Promise.resolve(null),
        user?.role === 'SYSTEM_ADMIN' ? apiClient.get('/audit-logs?limit=5') : Promise.resolve(null),
      ]);
      if (request !== dashboardRequest.current) return;
      const data = summaryRes.data.data;
      setSummary(data);
      setDashboardError('');
      if (user?.role === 'SYSTEM_ADMIN') {
        setUsersList(previewRes.data.data || []);
        setTotalUsersCount(data.total);
        setPendingRequestsCount(data.pendingRequests);
        setAccountRequests(requestsRes?.data.data || []);
        setRecentAuditLogs(auditRes?.data.data || []);
        setTotalAuditCount(auditRes?.data.pagination?.totalItems || 0);
      } else {
        setTotalTransactions(data.totalTransactions);
        setPendingQueue(data.pendingQueue);
        setApprovedCount(data.approvedCount);
        setTotalPersonnel(data.totalPersonnel);
        setTeachingCount(data.teachingCount);
        setNonTeachingCount(data.nonTeachingCount);
        setWeeklyStats(data.weeklyStats);
        setRecentTransactions((previewRes.data.data || []).map((t: any) => ({
          id: `TRX-${t.id}`,
          avatar: t.personnel ? `${t.personnel.firstName?.[0] || ''}${t.personnel.lastName?.[0] || ''}`.toUpperCase() : 'EP',
          employee: t.personnel ? `${t.personnel.firstName} ${t.personnel.lastName}` : 'Personnel',
          type: t.transactionType?.name || 'Transaction',
          status: ['APPROVED', 'COMPLETED'].includes(t.status) ? 'APPROVED' : t.status === 'REJECTED' ? 'REJECTED' : 'PENDING',
          date: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—',
        })));
      }
    } catch (err: any) {
      if (request === dashboardRequest.current) setDashboardError(err.response?.data?.message || 'Dashboard data could not be refreshed. Please retry.');
    } finally {
      if (request === dashboardRequest.current) setLoading(false);
    }
  }, [user?.role]);

  // A realtime push just refreshes the cached notifications.
  const fetchNotifications = useCallback(() => { refetchNotifications(); }, [refetchNotifications]);

  // Live data subscriptions with automated initial fetch and fallback polling
  useRealtimeTransactions(fetchDashboardData);
  useRealtimeNotifications(fetchNotifications);

  // Dismiss dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.put('/notifications/read-all');
      patchNotifications(list => list.map(n => ({ ...n, isRead: true })));
      addToast('All notifications marked as read.', 'SUCCESS');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to mark all as read.', 'ERROR');
    }
  };

  const handleNotificationClick = async (n: TopNotificationItem) => {
    if (!n.isRead) {
      try {
        await apiClient.put(`/notifications/${n.id}/read`);
        patchNotifications(list => list.map(item => item.id === n.id ? { ...item, isRead: true } : item));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    setShowNotifications(false);

    // Route dynamically based on message or related entity
    const msg = (n.message || '').toLowerCase();
    const entity = (n.relatedEntityType || '').toLowerCase();
    if (entity === 'accountcreationrequest' || msg.includes('account') || msg.includes('credential')) {
      navigate('/admin/credentials');
    } else if (msg.includes('validation') || (user?.role === 'AO_II' && entity === 'transaction')) {
      navigate('/admin/documents');
    } else if (msg.includes('approval') || (user?.role === 'HRMO' && entity === 'transaction')) {
      navigate('/admin/approvals');
    } else if (entity === 'promotioncycle' || msg.includes('promotion') || msg.includes('ranking')) {
      navigate('/admin/promotions');
    } else {
      navigate('/admin/notifications');
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const formattedToday = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  // Dynamic percentages calculated strictly from database numbers
  const teachingPercent = totalPersonnel > 0 ? ((teachingCount / totalPersonnel) * 100).toFixed(1) + '%' : '0%';
  const nonTeachingPercent = totalPersonnel > 0 ? ((nonTeachingCount / totalPersonnel) * 100).toFixed(1) + '%' : '0%';

  const activeAccountsCount = summary?.active ?? '—';
  const accountsRequiringAction = summary?.requiringAction ?? 0;
  const roleCounts: Record<string, number> = summary?.roleCounts || {};
  const representedRoleCount = Object.values(roleCounts).filter(count => count > 0).length;
  const roleDistributionSummary = [
    ['Admin', roleCounts.SYSTEM_ADMIN || 0],
    ['AO II', roleCounts.AO_II || 0],
    ['HRMO', roleCounts.HRMO || 0],
    ['Teaching', roleCounts.TEACHING_PERSONNEL || 0],
    ['Staff', roleCounts.NON_TEACHING_PERSONNEL || 0],
  ];

  const userFullName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim()
    : user?.email?.split('@')[0] || 'User';

  const userRoleBadge =
    user?.role === 'SYSTEM_ADMIN' ? 'System Administrator' :
    user?.role === 'AO_II' ? 'Administrative Officer II' :
    user?.role === 'HRMO' ? 'HRMO Staff' :
    user?.role === 'TEACHING_PERSONNEL' ? 'Teaching Personnel' :
    user?.role === 'NON_TEACHING_PERSONNEL' ? 'Non-Teaching Personnel' : '';

  if (dashboardError && !summary) return (
    <div className="dashboard-editorial-root">
      <h1>Dashboard unavailable</h1>
      <div role="alert" className="dashboard-error">
        <span>{dashboardError} Counts have not loaded; no zero values are being assumed.</span>
        <button type="button" onClick={() => void fetchDashboardData()} disabled={loading}>Retry</button>
      </div>
    </div>
  );

  return (
    <div className="dashboard-editorial-root">
      {dashboardError && (
        <div role="alert" className="dashboard-error">
          <span>{dashboardError} {summary ? 'Showing the last successfully loaded data.' : 'Counts are unavailable until the connection is restored.'}</span>
          <button type="button" onClick={() => void fetchDashboardData()} disabled={loading}>Retry</button>
        </div>
      )}
      
      {/* ─── 1. TOP WORKSPACE HEADER BAR ───────────────────────────── */}
      <div className="workspace-top-bar">
        {/* Right: Notifications, Settings & Live Date */}
        <div className="top-controls-group">
          {/* Notifications Trigger & Interactive Dropdown */}
          <div className="header-icon-wrapper" ref={notifMenuRef}>
            <button
              type="button"
              className={`header-icon-circle ${showNotifications ? 'active' : ''}`}
              onClick={() => {
                setShowNotifications(prev => !prev);
                setShowSettings(false);
              }}
              title="Notifications"
              aria-label="Notifications"
            >
              <AppIcon name="notifications" size={16} />
              {unreadCount > 0 && (
                <span className="header-icon-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="topbar-flyout-menu notif-flyout-menu animate-fade-in">
                <div className="topbar-flyout-header">
                  <div className="topbar-flyout-title-row">
                    <span className="topbar-flyout-title">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="topbar-unread-chip">{unreadCount} new</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="topbar-mark-read-btn"
                      onClick={handleMarkAllRead}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="topbar-notif-scroll-area">
                  {notifications.length === 0 ? (
                    <div className="topbar-notif-empty">
                      <div className="notif-empty-icon-circle">
                        <AppIcon name="notifications" size={24} />
                      </div>
                      <div className="notif-empty-title">All caught up!</div>
                      <div className="notif-empty-desc">No notifications at this time.</div>
                    </div>
                  ) : (
                    notifications.slice(0, 8).map(n => (
                      <div
                        key={n.id}
                        className={`topbar-notif-row ${!n.isRead ? 'unread' : ''}`}
                        {...clickable<HTMLDivElement>(() => handleNotificationClick(n))}
                      >
                        <div className="notif-row-status-dot">
                          {!n.isRead && <span className="blue-pulse-dot" />}
                        </div>
                        <div className="notif-row-content">
                          <div className="notif-row-msg">{n.message}</div>
                          <div className="notif-row-time">{formatTimeAgo(n.createdAt)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="topbar-flyout-bottom">
                  <button
                    type="button"
                    className="topbar-view-all-btn"
                    onClick={() => {
                      setShowNotifications(false);
                      navigate('/admin/notifications');
                    }}
                  >
                    <span>Open Notifications Center</span>
                    <span className="topbar-arrow-icon">→</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Settings Trigger & Interactive Dropdown */}
          <div className="header-icon-wrapper" ref={settingsMenuRef}>
            <button
              type="button"
              className={`header-icon-circle ${showSettings ? 'active' : ''}`}
              onClick={() => {
                setShowSettings(prev => !prev);
                setShowNotifications(false);
              }}
              title="Settings"
              aria-label="Settings"
            >
              <AppIcon name="settings" size={16} />
            </button>

            {showSettings && (
              <div className="topbar-flyout-menu settings-flyout-menu animate-fade-in">
                <div className="topbar-flyout-header">
                  <span className="topbar-flyout-title">Settings</span>
                  <span className="topbar-flyout-subtext">Preferences</span>
                </div>

                <div className="topbar-flyout-links">
                  <button
                    type="button"
                    className="topbar-menu-row"
                    onClick={() => {
                      setShowSettings(false);
                      setShowAccountModal(true);
                    }}
                  >
                    <div className="topbar-menu-icon-box">
                      <AppIcon name="profile" size={16} />
                    </div>
                    <div className="topbar-menu-text">
                      <div className="topbar-menu-label">Account & Security</div>
                      <div className="topbar-menu-hint">Profile info, password, personal preferences</div>
                    </div>
                    <span className="topbar-menu-arrow">›</span>
                  </button>

                  <button
                    type="button"
                    className="topbar-menu-row"
                    onClick={() => {
                      setShowSettings(false);
                      navigate('/admin/settings');
                    }}
                  >
                    <div className="topbar-menu-icon-box">
                      <AppIcon name="settings" size={16} />
                    </div>
                    <div className="topbar-menu-text">
                      <div className="topbar-menu-label">System Settings</div>
                      <div className="topbar-menu-hint">Global policies, upload rules & timeouts</div>
                    </div>
                    <span className="topbar-menu-arrow">›</span>
                  </button>

                  <button
                    type="button"
                    className="topbar-menu-row"
                    onClick={() => {
                      setShowSettings(false);
                      navigate('/admin/audit');
                    }}
                  >
                    <div className="topbar-menu-icon-box">
                      <AppIcon name="audit" size={16} />
                    </div>
                    <div className="topbar-menu-text">
                      <div className="topbar-menu-label">Audit Logs & Security</div>
                      <div className="topbar-menu-hint">System access logs and transaction trails</div>
                    </div>
                    <span className="topbar-menu-arrow">›</span>
                  </button>
                </div>

                <div className="topbar-flyout-footer">
                  <span className="shortcut-tag">Ctrl + K</span>
                  <span>Open Command Search</span>
                </div>
              </div>
            )}
          </div>

          <div className="date-chip-pill">
            <span className="live-indicator-dot" />
            <span>Today, {formattedToday}</span>
          </div>
        </div>
      </div>

      {/* ─── 2. EDITORIAL PAGE HEADING ─────────────────────────────── */}
      <div className="editorial-heading-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 0 }}>
          <h1 className="editorial-main-title" style={{ margin: 0 }}>
            Welcome back, {userFullName}!
          </h1>
          {userRoleBadge && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 9999,
                background: isSysAdmin ? 'rgba(239, 68, 68, 0.15)' : 'rgba(215, 248, 74, 0.15)',
                color: isSysAdmin ? '#EF4444' : 'var(--color-primary)',
                border: '1px solid var(--glass-border-subtle)',
                letterSpacing: '0.02em',
              }}
            >
              {userRoleBadge}
            </span>
          )}
        </div>
      </div>

      {isSysAdmin ? (
        /* ═══════════════════════════════════════════════════════════════
           SYSADMIN SOLE VIEW: USER PROVISIONING & SYSTEM GOVERNANCE
        ═══════════════════════════════════════════════════════════════ */
        <>
          {/* ─── 3. SYSADMIN METRICS ROW ──────────────────────────────── */}
          <div className="metrics-grid-row">
            {/* Metric 1: Active Accounts */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">ACTIVE ACCOUNTS</span>
                <span className="metric-lime-pill">USABLE</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : activeAccountsCount}</div>
                <div className="metric-footer-note">Can currently access Digital 201</div>
              </div>
              <div className="metric-bottom-slot metric-context-note">
                {loading ? '' : `${activeAccountsCount} of ${totalUsersCount} provisioned`}
              </div>
            </div>

            {/* Metric 2: Pending Account Requests */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">PROVISIONING QUEUE</span>
                <span className="metric-lavender-pill">
                  {pendingRequestsCount > 0 ? `${pendingRequestsCount} PENDING` : 'CLEARED'}
                </span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num text-purple">{loading ? '...' : pendingRequestsCount}</div>
                <div className="metric-footer-note">Awaiting Admin Provisioning</div>
              </div>
              <div className="metric-bottom-slot metric-context-note">{summary ? `${summary.pendingDistribution} accounts awaiting distribution` : '—'}</div>
            </div>

            {/* Metric 3: Accounts Requiring Action */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">REQUIRES ACTION</span>
                <span className={accountsRequiringAction > 0 ? 'metric-action-pill' : 'metric-lime-pill'}>
                  {accountsRequiringAction > 0 ? 'REVIEW' : 'CLEAR'}
                </span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : accountsRequiringAction}</div>
                <div className="metric-footer-note">Access restrictions or incomplete profiles</div>
              </div>
              <div className="metric-bottom-slot metric-context-note">{summary ? `${summary.passwordChanges} password changes · ${summary.incompleteProfiles} incomplete profiles` : '—'}</div>
            </div>

            {/* Metric 4: Role Distribution */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">ROLE DISTRIBUTION</span>
                <span className="metric-gray-pill">{representedRoleCount} ROLES</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : totalUsersCount}</div>
                <div className="metric-footer-note">Provisioned accounts by system role</div>
              </div>
              <div className="metric-role-breakdown" aria-label="Account distribution by role">
                {roleDistributionSummary.map(([label, count]) => (
                  <div className="metric-role-item" key={String(label)}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── 4. ASYMMETRIC MAIN GRID (2:1 Ratio Layout) ────────── */}
          <div className="asymmetric-main-grid provisioning-main-grid">
            {/* Left Column: User Provisioning & Account Registry */}
            <div className="soft-card table-card-large">
              <div className="card-header-flex">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h3 className="card-heading-title" style={{ margin: 0 }}>User Accounts & Provisioning Queue</h3>
                    <div style={{ display: 'inline-flex', background: 'var(--color-surface)', borderRadius: 8, padding: 2, border: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setSysAdminViewTab('USERS')}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          background: sysAdminViewTab === 'USERS' ? 'var(--color-primary)' : 'transparent',
                          color: sysAdminViewTab === 'USERS' ? '#000' : 'inherit',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Accounts ({summary ? totalUsersCount : '—'})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSysAdminViewTab('REQUESTS')}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          background: sysAdminViewTab === 'REQUESTS' ? 'var(--color-primary)' : 'transparent',
                          color: sysAdminViewTab === 'REQUESTS' ? '#000' : 'inherit',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>Requests</span>
                        {pendingRequestsCount > 0 && (
                          <span style={{ background: '#EF4444', color: '#fff', padding: '1px 5px', borderRadius: 9999, fontSize: 9 }}>
                            {pendingRequestsCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <Link to="/admin/credentials" className="view-all-link">
                  <span>Manage Credentials</span>
                  <span className="arrow">→</span>
                </Link>
              </div>

              <div className="editorial-table-wrapper">
                {sysAdminViewTab === 'USERS' ? (
                  <table className="editorial-table">
                    <thead>
                      <tr>
                        <th>USER / PERSONNEL</th>
                        <th>EMAIL ADDRESS</th>
                        <th>SYSTEM ROLE</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: 'right' }}>DATE CREATED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#6B7280', fontSize: '13px' }}>
                            {loading ? 'Fetching provisioned accounts...' : 'No provisioned user accounts found.'}
                          </td>
                        </tr>
                      ) : (
                        usersList.slice(0, 7).map((u: any) => {
                          const initials = u.personnel
                            ? `${u.personnel.firstName?.[0] || ''}${u.personnel.lastName?.[0] || ''}`.toUpperCase()
                            : (u.email?.[0] || 'U').toUpperCase();
                          const name = u.personnel
                            ? `${u.personnel.firstName} ${u.personnel.lastName}`
                            : u.email.split('@')[0];
                          const roleLabel =
                            u.role === 'TEACHING_PERSONNEL' ? 'Teaching Faculty' :
                            u.role === 'NON_TEACHING_PERSONNEL' ? 'Non-Teaching' :
                            u.role === 'HRMO' ? 'HRMO Officer' :
                            u.role === 'AO_II' ? 'AO II (School)' :
                            u.role === 'SYSTEM_ADMIN' ? 'System Admin' : u.role;
                          return (
                            <tr key={u.id}>
                              <td>
                                <div className="table-user-cell">
                                  <div className="user-initials-badge">{initials}</div>
                                  <div>
                                    <span className="user-full-name">{name}</span>
                                    {u.personnel?.employeeId && (
                                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{u.personnel.employeeId}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="code-cell">{u.email}</td>
                              <td>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: u.role === 'SYSTEM_ADMIN' ? 'rgba(239, 68, 68, 0.15)' : u.role === 'HRMO' ? 'rgba(215, 248, 74, 0.15)' : 'var(--color-surface)',
                                    color: u.role === 'SYSTEM_ADMIN' ? '#EF4444' : 'inherit',
                                    border: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  {roleLabel}
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill ${u.accountStatus === 'ACTIVE' ? 'status-lime' : 'status-lavender'}`}>
                                  {u.accountStatus || 'ACTIVE'}
                                </span>
                              </td>
                              <td className="date-cell" style={{ textAlign: 'right' }}>
                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="editorial-table">
                    <thead>
                      <tr>
                        <th>APPLICANT / NAME</th>
                        <th>EMAIL</th>
                        <th>REQUESTED ROLE</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountRequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#6B7280', fontSize: '13px' }}>
                            No pending account creation requests.
                          </td>
                        </tr>
                      ) : (
                        accountRequests.slice(0, 7).map((req: any) => (
                          <tr key={req.id}>
                            <td>
                              <div className="table-user-cell">
                                <div className="user-initials-badge">
                                  {`${req.firstName?.[0] || ''}${req.lastName?.[0] || ''}`.toUpperCase()}
                                </div>
                                <span className="user-full-name">{`${req.firstName} ${req.lastName}`}</span>
                              </div>
                            </td>
                            <td className="code-cell">{req.email}</td>
                            <td className="type-cell">{req.role}</td>
                            <td>
                              <span className={`status-pill ${req.status === 'APPROVED' ? 'status-lime' : req.status === 'REJECTED' ? 'status-rose' : 'status-lavender'}`}>
                                {req.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Link
                                to="/admin/credentials"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--color-primary)',
                                  textDecoration: 'none',
                                }}
                              >
                                Review & Provision →
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right Column: DARK FEATURE CARD (System Audit Trail & Security Health) */}
            <div className="dark-feature-card">
              <div className="dark-card-top-tag">
                <span className="dark-tag-dot" />
                <span>SECURITY AUDIT TRAIL</span>
              </div>

              <div className="dark-card-metric-section">
                <div className="dark-big-num">{loading ? '...' : totalAuditCount}</div>
                <div className="dark-big-sub">Total Audit Trail Events Logged</div>
              </div>

              {/* Recent Audit Events List */}
              <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {recentAuditLogs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', padding: '12px 0' }}>
                    No recent security audit logs recorded.
                  </div>
                ) : (
                  recentAuditLogs.slice(0, 5).map((log: any) => (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 9,
                            fontWeight: 700,
                            background: 'rgba(215, 248, 74, 0.2)',
                            color: '#D7F84A',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {log.action?.split('_')[0] || 'EVENT'}
                        </span>
                        <span
                          style={{
                            color: 'rgba(255,255,255,0.85)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 130,
                          }}
                          title={log.userEmail || 'System'}
                        >
                          {log.userEmail ? log.userEmail.split('@')[0] : 'System'}
                        </span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, flexShrink: 0 }}>
                        {formatTimeAgo(log.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="dark-card-bottom-info">
                <div className="dark-info-row">
                  <span className="info-label">Active Accounts</span>
                  <span className="info-val">{loading ? '...' : totalUsersCount}</span>
                </div>
                <div className="dark-info-row">
                  <span className="info-label">Pending Requests</span>
                  <span className="info-val">{loading ? '...' : pendingRequestsCount}</span>
                </div>
                <div className="dark-info-row">
                  <span className="info-label">System Security Status</span>
                  <span className="info-val lime-text">Live Protected</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 5. QUICK MANAGEMENT ACTIONS (SysAdmin Dedicated) ─────── */}
          <div className="quick-actions-section">
            <h3 className="section-title">System Administration & Provisioning Controls</h3>

            <div className="bento-actions-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
              {/* Action 1: Provision Accounts */}
              <Link to="/admin/credentials" className="action-bento-link">
                <div className="soft-card bento-action-card">
                  <div className="bento-icon-badge badge-lime-bg">
                    <AppIcon name="credentials" size={20} color="#141416" />
                  </div>
                  <h4 className="bento-card-title">User Provisioning & Credentials</h4>
                  <p className="bento-card-desc">
                    Provision new accounts, approve creation requests, and distribute secure access credentials.
                  </p>
                </div>
              </Link>

              {/* Action 2: Audit Logs */}
              <Link to="/admin/audit" className="action-bento-link">
                <div className="soft-card bento-action-card">
                  <div className="bento-icon-badge badge-purple-bg">
                    <AppIcon name="audit" size={20} color="#141416" />
                  </div>
                  <h4 className="bento-card-title">Security Audit & System Logs</h4>
                  <p className="bento-card-desc">
                    Audit system access trails, data modifications, login records, and administrative actions.
                  </p>
                </div>
              </Link>

              {/* Action 3: System Settings */}
              <Link to="/admin/settings" className="action-bento-link">
                <div className="soft-card bento-action-card">
                  <div className="bento-icon-badge badge-charcoal-bg">
                    <AppIcon name="settings" size={20} color="#FFFFFF" />
                  </div>
                  <h4 className="bento-card-title">System Settings & Security</h4>
                  <p className="bento-card-desc">
                    Configure global security policies, password complexity rules, session timeouts, and upload parameters.
                  </p>
                </div>
              </Link>

              {/* Action 4: System Reports */}
              <Link to="/admin/reports" className="action-bento-link">
                <div className="soft-card bento-action-card">
                  <div className="bento-icon-badge badge-lime-bg">
                    <AppIcon name="reports" size={20} color="#141416" />
                  </div>
                  <h4 className="bento-card-title">System Reports & Compliance</h4>
                  <p className="bento-card-desc">
                    Export division system compliance summaries, demographics reports, and audit certificates.
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           HRMO / AO_II VIEW: WORKFORCE INTELLIGENCE & 201 TRANSACTIONS
        ═══════════════════════════════════════════════════════════════ */
        <>
          {/* ─── 3. HRMIS METRICS ROW (Strict Database Numbers) ─────────── */}
          <div className="metrics-grid-row">
            {/* Metric 1: Total Personnel (DB) */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">TOTAL PERSONNEL</span>
                <span className="metric-lime-pill">ACTIVE</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : totalPersonnel.toLocaleString()}</div>
                <div className="metric-footer-note">Division Active Records</div>
              </div>
              <div className="metric-bottom-slot">
                <div className="metric-dot-matrix">
                  <span className="dot active-dot" />
                  <span className="dot active-dot" />
                  <span className="dot active-dot" />
                  <span className="dot active-dot" />
                  <span className="dot active-dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            </div>

            {/* Metric 2: Teaching Personnel (DB) */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">TEACHING</span>
                <span className="metric-lavender-pill">{teachingPercent}</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : teachingCount}</div>
                <div className="metric-footer-note">Licensed Faculty</div>
              </div>
              <div className="metric-bottom-slot">
                <div className="metric-bar-visualizer">
                  <div className="bar-fill fill-lavender" style={{ width: teachingPercent }} />
                </div>
              </div>
            </div>

            {/* Metric 3: Non-Teaching Personnel (DB) */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">STAFF</span>
                <span className="metric-gray-pill">{nonTeachingPercent}</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num">{loading ? '...' : nonTeachingCount}</div>
                <div className="metric-footer-note">Administrative Support</div>
              </div>
              <div className="metric-bottom-slot">
                <div className="metric-bar-visualizer">
                  <div className="bar-fill fill-charcoal" style={{ width: nonTeachingPercent }} />
                </div>
              </div>
            </div>

            {/* Metric 5: Pending Review (DB) */}
            <div className="soft-card metric-card">
              <div className="metric-card-top">
                <span className="metric-label">PENDING REVIEW</span>
                <span className="metric-lavender-pill">ACTION REQ</span>
              </div>
              <div className="metric-card-body">
                <div className="metric-value-num text-purple">{loading ? '...' : pendingQueue}</div>
                <div className="metric-footer-note">Awaiting Validation</div>
              </div>
              <div className="metric-bottom-slot" />
            </div>
          </div>

          {/* ─── 4. ASYMMETRIC MAIN GRID (2:1 Ratio Layout) ────────────── */}
          <div className="asymmetric-main-grid">
            
            {/* Left Column: Recent Transactions Queue (DB Driven) */}
            <div className="soft-card table-card-large">
              <div className="card-header-flex">
                <h3 className="card-heading-title" style={{ margin: 0 }}>Recent Transactions Queue</h3>
                <Link to="/admin/transactions" className="view-all-link">
                  <span>View Queue</span>
                  <span className="arrow">→</span>
                </Link>
              </div>

              <div className="editorial-table-wrapper">
                <table className="editorial-table">
                  <thead>
                    <tr>
                      <th>REF NO.</th>
                      <th>PERSONNEL</th>
                      <th>TRANSACTION TYPE</th>
                      <th>STATUS</th>
                      <th style={{ textAlign: 'right' }}>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#6B7280', fontSize: '13px' }}>
                          {loading ? 'Fetching database records...' : 'No recent transactions found in database.'}
                        </td>
                      </tr>
                    ) : (
                      recentTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="code-cell">{tx.id}</td>
                          <td>
                            <div className="table-user-cell">
                              <div className="user-initials-badge">{tx.avatar}</div>
                              <span className="user-full-name">{tx.employee}</span>
                            </div>
                          </td>
                          <td className="type-cell">{tx.type}</td>
                          <td>
                            <span className={`status-pill ${tx.status === 'APPROVED' ? 'status-lime' : 'status-lavender'}`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="date-cell" style={{ textAlign: 'right' }}>{tx.date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: DARK FEATURE CARD (Database Overview) */}
            <div className="dark-feature-card">
              <div className="dark-card-top-tag">
                <span className="dark-tag-dot" />
                <span>WEEKLY TRANSACTION ACTIVITY</span>
              </div>

              <div className="dark-card-metric-section">
                <div className="dark-big-num">{loading ? '...' : totalTransactions}</div>
                <div className="dark-big-sub">Total Transactions This Week</div>
              </div>

              {/* Graphic Bar Matrix – Live from DB */}
              <div className="dark-graphic-chart">
                {(() => {
                  const maxCount = Math.max(...weeklyStats.map(ws => ws.count), 1);
                  return weeklyStats.map((ws) => {
                    const barHeight = ws.count > 0 ? Math.max((ws.count / maxCount) * 100, 8) : 0;
                    return (
                      <div className="graphic-bar-col" key={ws.day}>
                        <div className="bar-top-value">{ws.count}</div>
                        <div className="bar-fill-track">
                          <div
                            className={`bar-fill-inner ${ws.count > 0 ? 'fill-lime' : 'fill-lavender'}`}
                            style={{ height: `${barHeight}%` }}
                          />
                        </div>
                        <div className="bar-day-label">{ws.day}</div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="dark-card-bottom-info">
                <div className="dark-info-row">
                  <span className="info-label">Active Personnel</span>
                  <span className="info-val">{loading ? '...' : totalPersonnel}</span>
                </div>
                <div className="dark-info-row">
                  <span className="info-label">Pending Queue</span>
                  <span className="info-val">{loading ? '...' : pendingQueue}</span>
                </div>
                <div className="dark-info-row">
                  <span className="info-label">Database Sync Status</span>
                  <span className="info-val lime-text">Live Connected</span>
                </div>
              </div>
            </div>

          </div>

          {/* ─── 5. QUICK MANAGEMENT ACTIONS (Bento Cards Row) ─────────── */}
          <div className="quick-actions-section">
            <h3 className="section-title">Quick Management Actions</h3>

            <div className="bento-actions-grid">
              {user?.role === 'SYSTEM_ADMIN' ? (
                <>
                  {/* SysAdmin Action 1: Create Credentials */}
                  <Link to="/admin/credentials" className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-lime-bg">
                        <AppIcon name="credentials" size={20} color="#141416" />
                      </div>
                      <h4 className="bento-card-title">User Accounts & Credentials</h4>
                      <p className="bento-card-desc">
                        Manage system logins, provision station accounts, and distribute secure credentials.
                      </p>
                    </div>
                  </Link>

                  {/* SysAdmin Action 2: Audit Trail */}
                  <Link to="/admin/audit" className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-purple-bg">
                        <AppIcon name="audit" size={20} color="#141416" />
                      </div>
                      <h4 className="bento-card-title">Security & Audit Logs</h4>
                      <p className="bento-card-desc">
                        Inspect immutable system audit trail and track administrative operations.
                      </p>
                    </div>
                  </Link>

                  {/* SysAdmin Action 3: Settings & Roles */}
                  <Link to="/admin/settings" className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-charcoal-bg">
                        <AppIcon name="settings" size={20} color="#FFFFFF" />
                      </div>
                      <h4 className="bento-card-title">System Settings & Security</h4>
                      <p className="bento-card-desc">
                        Configure system parameters, RBAC roles, and authentication security.
                      </p>
                    </div>
                  </Link>
                </>
              ) : (
                <>
                  {/* Action 1: Create Credentials */}
                  <Link to="/admin/credentials" className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-lime-bg">
                        <AppIcon name="credentials" size={20} color="#141416" />
                      </div>
                      <h4 className="bento-card-title">Create Accounts & Credentials</h4>
                      <p className="bento-card-desc">
                        Onboard new division personnel and distribute secure digital login credentials.
                      </p>
                    </div>
                  </Link>

                  {/* Action 2: Document Validation (AO II) / Compliance (HRMO) */}
                  <Link to={user?.role === 'AO_II' ? '/admin/documents' : '/admin/compliance'} className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-purple-bg">
                        <AppIcon name={user?.role === 'AO_II' ? 'validation' : 'compliance'} size={20} color="#141416" />
                      </div>
                      <h4 className="bento-card-title">{user?.role === 'AO_II' ? 'Document Validation (AO II)' : 'Compliance & YOS'}</h4>
                      <p className="bento-card-desc">
                        {user?.role === 'AO_II'
                          ? 'Review and certify submitted 201 appointment document packages and qualifications.'
                          : 'Monitor statutory compliance, loyalty milestones, and years of service records.'}
                      </p>
                    </div>
                  </Link>

                  {/* Action 3: Personnel Master List */}
                  <Link to="/admin/personnel" className="action-bento-link">
                    <div className="soft-card bento-action-card">
                      <div className="bento-icon-badge badge-charcoal-bg">
                        <AppIcon name="personnel" size={20} color="#FFFFFF" />
                      </div>
                      <h4 className="bento-card-title">Personnel Master List</h4>
                      <p className="bento-card-desc">
                        Access and manage all employee digital 201 Personal Data Sheets (PDS) and service records.
                      </p>
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Account Setup Modal for profile, password & preference editing */}
      <AccountSetupModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
    </div>
  );
};
