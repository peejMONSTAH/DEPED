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

type FilterTab = 'ALL' | 'UNREAD' | 'ACCOUNT' | 'TRANSACTIONS';

export const PersonnelNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

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
      if (activeFilter === 'UNREAD') return !n.isRead;
      if (activeFilter === 'ACCOUNT') {
        const msg = n.message.toLowerCase();
        return msg.includes('account') || msg.includes('password') || msg.includes('credential');
      }
      if (activeFilter === 'TRANSACTIONS') {
        const msg = n.message.toLowerCase();
        return msg.includes('transaction') || msg.includes('validation') || msg.includes('approval') || msg.includes('submission');
      }
      return true;
    });
  }, [notifications, activeFilter]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24 }}>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <AppIcon name="approved" size={13} /> Mark All as Read
            </button>
          </div>
        )}
      </div>

      <div className="page-content" style={{ padding: 0 }}>
        {/* Filter Tabs matching HR Admin */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('ALL')}
          >
            All Notifications ({notifications.length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'UNREAD' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('UNREAD')}
          >
            Unread ({unreadCount})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'ACCOUNT' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('ACCOUNT')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <AppIcon name="profile" size={14} /> Account & Credentials
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'TRANSACTIONS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('TRANSACTIONS')}
          >
            Transactions & Approvals
          </button>
        </div>

        {loading ? (
          <div className="card text-center" style={{ padding: '36px', borderRadius: 20, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
            <div style={{ color: 'var(--color-text-secondary)' }}>Loading notifications...</div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card text-center" style={{ padding: '40px 20px', borderRadius: 20, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <AppIcon name="notifications" size={36} color="var(--color-text-muted)" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--color-text-primary)' }}>No notifications found</div>
            <div className="text-sm text-muted">You're all caught up for this view!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredNotifications.map(n => {
              const action = getActionConfig(n);

              return (
                <div
                  key={n.id}
                  {...(n.isRead ? {} : clickable<HTMLDivElement>(() => handleMarkAsRead(n.id), 'Mark notification as read'))}
                  className={`personnel-notif-card hover-lift ${!n.isRead ? 'unread' : ''}`}
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderLeft: !n.isRead ? `4px solid ${action.color}` : '1px solid var(--color-border)',
                    cursor: n.isRead ? 'default' : 'pointer',
                  }}
                >
                  <div
                    className="personnel-notif-icon-circle"
                    style={{
                      background: `${action.color}15`,
                      color: action.color,
                    }}
                  >
                    <AppIcon name={action.iconName} size={22} />
                  </div>

                  <div className="personnel-notif-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: `${action.color}18`,
                          color: action.color,
                          padding: '2px 9px',
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
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: action.color }} />
                      )}
                    </div>

                    <p className="personnel-notif-msg">{n.message}</p>

                    <div className="personnel-notif-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="pending" size={12} /> {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ alignSelf: 'center', flexShrink: 0, marginLeft: 12 }}>
                    <button
                      type="button"
                      className={`btn ${action.btnClass} btn-sm`}
                      style={{ fontSize: 12, padding: '7px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}
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
