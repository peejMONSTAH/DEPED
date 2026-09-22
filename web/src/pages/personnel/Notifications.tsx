import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useToast } from '../../contexts/ToastContext';
import { clickable } from '../../a11y/clickable';

type NotificationItem = {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
  relatedEntityType?: string;
};

type ReadFilter = 'ALL' | 'UNREAD';
type CategoryFilter = 'ALL' | 'ACCOUNT' | 'TRANSACTIONS';

export const PersonnelNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [readStatus, setReadStatus] = useState<ReadFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeNotifications(fetchNotifications);

  const handleMarkAsRead = async (id: number) => {
    try {
      await apiClient.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      addToast('All notifications marked as read.', 'SUCCESS');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to mark all as read.', 'ERROR');
    }
  };

  const getActionConfig = (n: NotificationItem) => {
    const msg = n.message.toLowerCase();
    const isApproved = msg.includes('approved');
    const isReturned = msg.includes('deficienc') || msg.includes('reject') || msg.includes('return');
    const isAccount = msg.includes('password') || msg.includes('credential') || msg.includes('account');
    const isCareer = msg.includes('career') || msg.includes('service record') || msg.includes('promotion');

    if (isAccount) {
      return {
        path: '/personnel/profile-completion',
        label: 'Complete Account & Credentials',
        iconName: 'profile' as const,
        badge: 'Account Alert',
        color: '#8b5cf6',
        btnClass: 'btn-primary',
      };
    }
    if (isReturned) {
      return {
        path: '/personnel/checklist',
        label: 'Fix Deficiency & Re-upload',
        iconName: 'warning' as const,
        badge: 'Action Required',
        color: '#ef4444',
        btnClass: 'btn-primary',
      };
    }
    if (isApproved) {
      return {
        path: '/personnel/transactions',
        label: 'View Approved Transaction',
        iconName: 'approved' as const,
        badge: 'Approval',
        color: '#10b981',
        btnClass: 'btn-secondary',
      };
    }
    if (isCareer) {
      return {
        path: '/personnel/profile',
        label: 'View Service Record',
        iconName: 'repository' as const,
        badge: 'Career Event',
        color: '#388bfd',
        btnClass: 'btn-secondary',
      };
    }
    return {
      path: '/personnel/transactions',
      label: 'View Transaction Status',
      iconName: 'transactions' as const,
      badge: 'Submission Update',
      color: '#388bfd',
      btnClass: 'btn-secondary',
    };
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (readStatus === 'UNREAD' && n.isRead) return false;
      const msg = n.message.toLowerCase();
      if (categoryFilter === 'ACCOUNT') {
        return msg.includes('account') || msg.includes('password') || msg.includes('credential');
      }
      if (categoryFilter === 'TRANSACTIONS') {
        return msg.includes('transaction') || msg.includes('validation') || msg.includes('approval') || msg.includes('submission');
      }
      return true;
    });
  }, [notifications, readStatus, categoryFilter]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 16px 0', marginBottom: 16 }}>
        <div>
          <div className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>Notification & Compliance Monitoring</div>
          <div className="topbar-subtitle" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Official alerts, document reviews, and appointment approvals for your 201 records
          </div>
        </div>
        {unreadCount > 0 && (
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleMarkAllRead}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
            >
              <AppIcon name="approved" size={13} /> Mark All as Read
            </button>
          </div>
        )}
      </div>

      <div className="page-content" style={{ padding: 0 }}>
        {/* Tier 1: Primary Segmented Status Filter */}
        <div className="notif-segmented-control" role="tablist" aria-label="Filter by status">
          <button
            type="button"
            role="tab"
            aria-selected={readStatus === 'ALL'}
            className={`notif-segment-btn ${readStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setReadStatus('ALL')}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={readStatus === 'UNREAD'}
            className={`notif-segment-btn ${readStatus === 'UNREAD' ? 'active' : ''}`}
            onClick={() => setReadStatus('UNREAD')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Tier 2: Horizontal Category Chips with Continuation Cue */}
        <div className="notif-category-chips-wrapper">
          <div className="notif-category-chips" role="group" aria-label="Filter by topic">
            <button
              type="button"
              className={`notif-chip ${categoryFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('ALL')}
            >
              All Topics
            </button>
            <button
              type="button"
              className={`notif-chip ${categoryFilter === 'ACCOUNT' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('ACCOUNT')}
            >
              <AppIcon name="profile" size={13} /> Account & Credentials
            </button>
            <button
              type="button"
              className={`notif-chip ${categoryFilter === 'TRANSACTIONS' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('TRANSACTIONS')}
            >
              <AppIcon name="transactions" size={13} /> Transactions & Approvals
            </button>
          </div>
          <div className="notif-chips-fade-right" aria-hidden="true" />
        </div>

        {loading ? (
          <div className="card text-center" style={{ padding: '36px', borderRadius: 16, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Loading notifications...</div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card text-center" style={{ padding: '40px 20px', borderRadius: 16, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <AppIcon name="notifications" size={36} color="var(--color-text-muted)" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--color-text-primary)' }}>No notifications found</div>
            <div className="text-sm text-muted">You're all caught up for this view!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredNotifications.map(n => {
              const action = getActionConfig(n);

              return (
                <div
                  key={n.id}
                  {...clickable<HTMLDivElement>(() => {
                    if (!n.isRead) handleMarkAsRead(n.id);
                    navigate(action.path);
                  }, `Open notification: ${n.message}`)}
                  className={`personnel-notif-card hover-lift ${!n.isRead ? 'unread' : ''}`}
                  style={{
                    borderLeft: !n.isRead ? `4px solid ${action.color}` : '1px solid var(--color-border)',
                  }}
                >
                  <div className="personnel-notif-header-row">
                    <div
                      className="personnel-notif-icon-circle"
                      style={{
                        background: `${action.color}15`,
                        color: action.color,
                      }}
                    >
                      <AppIcon name={action.iconName} size={20} />
                    </div>

                    <div className="personnel-notif-badges-group">
                      <span
                        style={{
                          background: `${action.color}18`,
                          color: action.color,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {action.badge}
                      </span>
                      {n.relatedEntityId && (
                        <span className="text-xs text-muted font-mono">Ref: #{n.relatedEntityId}</span>
                      )}
                      {!n.isRead && (
                        <span
                          style={{ width: 8, height: 8, borderRadius: '50%', background: action.color }}
                          title="Unread"
                        />
                      )}
                    </div>

                    <div className="personnel-notif-time text-xs text-muted">
                      {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  <div className="personnel-notif-content">
                    <p className="personnel-notif-msg">{n.message}</p>
                    <div className="personnel-notif-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="clock" size={12} />
                        <span className="notif-desktop-date">{new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • </span>
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="personnel-notif-action-wrap">
                    <button
                      type="button"
                      className={`btn ${action.btnClass} btn-sm personnel-notif-action-btn`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.isRead) handleMarkAsRead(n.id);
                        navigate(action.path);
                      }}
                    >
                      {action.label} →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
