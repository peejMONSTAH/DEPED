import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryClient';
import { personnelDisplayName } from '../../utils/personnel-display';
import { AccountSetupModal } from '../../components/common/AccountSetupModal';
import { clickable } from '../../a11y/clickable';
import { notificationPromotionPath } from '../../promotions/deepLink';
import { SysAdminDashboard } from './SysAdminDashboard';
import { StaffDashboard } from './StaffDashboard';

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
  const [loading, setLoading] = useState<boolean>(true);

  // SysAdmin Dedicated State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [accountRequests, setAccountRequests] = useState<any[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<any[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [totalAuditCount, setTotalAuditCount] = useState<number>(0);

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
    if (entity === 'promotioncycle' || entity === 'promotionapplication') {
      navigate(notificationPromotionPath(n));
    } else if (entity === 'accountcreationrequest' || msg.includes('account') || msg.includes('credential')) {
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


  const activeAccountsCount = summary?.active ?? '—';
  const accountsRequiringAction = summary?.requiringAction ?? 0;
  const roleCounts: Record<string, number> = summary?.roleCounts || {};
  const roleDistributionSummary = [
    ['Admin', roleCounts.SYSTEM_ADMIN || 0],
    ['AO II', roleCounts.AO_II || 0],
    ['HRMO', roleCounts.HRMO || 0],
    ['Teaching', roleCounts.TEACHING_PERSONNEL || 0],
    ['Staff', roleCounts.NON_TEACHING_PERSONNEL || 0],
  ];

  // The name lives on the personnel record; the sidebar reads it from there too.
  const userFullName = personnelDisplayName(user?.personnel || user, user?.role) || user?.email?.split('@')[0] || 'User';

  const userRoleBadge =
    user?.role === 'SYSTEM_ADMIN' ? 'System Administrator' :
    user?.role === 'AO_II' ? 'Administrative Officer II' :
    user?.role === 'HRMO' ? 'HRMO Staff' :
    user?.role === 'TEACHING_PERSONNEL' ? 'Teaching Personnel' :
    user?.role === 'NON_TEACHING_PERSONNEL' ? 'Non-Teaching Personnel' : '';

  // An AO II's school is part of who they are on Home. Older sessions did not carry it, so fall back to the station the address starts with.
  const stationName = user?.role === 'AO_II'
    ? (user.school || user.personnel?.school || (user.address || user.personnel?.address || '').split(',')[0].trim() || null)
    : null;

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

                  {/* System settings and the audit trail are System Administrator pages; other roles are not offered them. */}
                  {isSysAdmin && (
                    <>
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
                    </>
                  )}
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
                fontSize: 13,
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
          {stationName && (
            <span
              title="Your station"
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 9999,
                background: '#17472E',
                color: '#FFFFFF',
                letterSpacing: '0.02em',
              }}
            >
              {stationName}
            </span>
          )}
        </div>
      </div>

      {isSysAdmin ? (
        /* ═══════════════════════════════════════════════════════════════
           SYSADMIN SOLE VIEW: USER PROVISIONING & SYSTEM GOVERNANCE
        ═══════════════════════════════════════════════════════════════ */
        <SysAdminDashboard
          loading={loading}
          summary={summary}
          activeAccounts={activeAccountsCount}
          totalUsers={totalUsersCount}
          pendingRequests={pendingRequestsCount}
          requiringAction={accountsRequiringAction}
          roles={roleDistributionSummary}
          users={usersList}
          requests={accountRequests}
          auditLogs={recentAuditLogs}
          auditTotal={totalAuditCount}
          timeAgo={formatTimeAgo}
        />
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           HRMO / AO_II VIEW: WORKFORCE INTELLIGENCE & 201 TRANSACTIONS
        ═══════════════════════════════════════════════════════════════ */
        <StaffDashboard
          loading={loading}
          role={user?.role}
          personnel={totalPersonnel}
          teaching={teachingCount}
          nonTeaching={nonTeachingCount}
          pending={pendingQueue}
          weekTotal={totalTransactions}
          weekly={weeklyStats}
          recent={recentTransactions}
        />
      )}

      {/* Account Setup Modal for profile, password & preference editing */}
      <AccountSetupModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
    </div>
  );
};
