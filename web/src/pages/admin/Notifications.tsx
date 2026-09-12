import React, { useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';

type NotificationItem = {
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
  relatedEntityType?: string;
};

export const AdminNotifications: React.FC = () => {
  const { addToast } = useToast();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'UNREAD' | 'ACCOUNT' | 'TRANSACTIONS'>('ALL');

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

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      addToast('All notifications marked as read.', 'SUCCESS');
      fetchNotifications();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to mark all as read.', 'ERROR');
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await apiClient.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const getActionConfig = (n: NotificationItem) => {
    const msg = (n.message || '').toLowerCase();
    const entity = (n.relatedEntityType || '').toLowerCase();

    // 1. Account Creation Request
    if (entity === 'accountcreationrequest' || msg.includes('account creation') || msg.includes('creation request') || msg.includes('new account')) {
      return {
        path: '/admin/credentials',
        label: 'Review Account Request & Issue Credentials',
        btnClass: 'btn-primary',
        badge: 'Account Request',
        iconName: 'checklist' as const,
      };
    }

    // 2. Account Password Reset / Credentials Distribution
    if (entity === 'user' || msg.includes('password') || msg.includes('reset') || msg.includes('credential')) {
      return {
        path: '/admin/credentials',
        label: 'Manage Credentials & User Accounts',
        btnClass: 'btn-secondary',
        badge: 'Credential Action',
        iconName: 'profile' as const,
      };
    }

    // 3. Document Validation (AO II)
    if (msg.includes('validation') || msg.includes('submitted for validation') || (user?.role === 'AO_II' && entity === 'transaction')) {
      return {
        path: '/admin/documents',
        label: 'Validate Documents & Review Form',
        btnClass: 'btn-primary',
        badge: 'AO II Action Required',
        iconName: 'verification' as const,
      };
    }

    // 4. HRMO Approvals & Ranking
    if (msg.includes('hrmo') || msg.includes('approval') || (user?.role === 'HRMO' && entity === 'transaction')) {
      return {
        path: '/admin/approvals',
        label: 'Open HRMO Approvals & Ranking',
        btnClass: 'btn-primary',
        badge: 'HRMO Approval',
        iconName: 'approvals' as const,
      };
    }

    // 5. Promotion Cycle / Applications
    if (entity === 'promotioncycle' || entity === 'promotionapplication' || msg.includes('promotion') || msg.includes('ranking') || msg.includes('leaderboard')) {
      return {
        path: '/admin/promotions',
        label: 'View Promotion Cycle & Leaderboard',
        btnClass: 'btn-primary',
        badge: 'Promotion Cycle',
        iconName: 'promotions' as const,
      };
    }

    // Default Transaction
    return {
      path: '/admin/transactions',
      label: 'View Transaction Details',
      btnClass: 'btn-secondary',
      badge: 'Transaction Alert',
      iconName: 'notifications' as const,
    };
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (activeFilter === 'UNREAD') return !n.isRead;
      if (activeFilter === 'ACCOUNT') {
        const msg = n.message.toLowerCase();
        const entity = (n.relatedEntityType || '').toLowerCase();
        return entity === 'accountcreationrequest' || entity === 'user' || msg.includes('account') || msg.includes('password') || msg.includes('credential');
      }
      if (activeFilter === 'TRANSACTIONS') {
        const msg = n.message.toLowerCase();
        const entity = (n.relatedEntityType || '').toLowerCase();
        return entity === 'transaction' || msg.includes('transaction') || msg.includes('validation') || msg.includes('approval');
      }
      return true;
    });
  }, [notifications, activeFilter]);

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div>
          <div className="topbar-title">Notifications Center</div>
          <div className="topbar-subtitle">Real-time system activities, workflow alerts, and direct action routing</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
            Mark all read
          </button>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 900 }}>
        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('ALL')}
          >
            All ({notifications.length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'UNREAD' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('UNREAD')}
          >
            Unread ({notifications.filter(n => !n.isRead).length})
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'ACCOUNT' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('ACCOUNT')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <AppIcon name="security" size={14} /> Account & Credentials
          </button>
          <button
            className={`btn btn-sm ${activeFilter === 'TRANSACTIONS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveFilter('TRANSACTIONS')}
          >
            Transactions & Approvals
          </button>
        </div>

        {loading ? (
          <div className="card text-center" style={{ padding: '32px' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
            <div>Loading notifications...</div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card text-center" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <AppIcon name="notifications" size={36} color="var(--color-primary-light)" />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No notifications found</div>
            <div className="text-sm text-muted">You're all caught up for this view!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredNotifications.map(n => {
              const action = getActionConfig(n);
              return (
                <div 
                  key={n.id} 
                  className="card"
                  onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                  style={{
                    cursor: n.isRead ? 'default' : 'pointer',
                    background: n.type === 'SUCCESS' ? 'var(--color-success-light)' : n.type === 'WARNING' ? 'var(--color-warning-light)' : 'var(--color-info-light)',
                    borderColor: n.type === 'SUCCESS' ? 'rgba(46, 160, 67, 0.3)' : n.type === 'WARNING' ? 'rgba(227, 179, 65, 0.3)' : 'rgba(56, 139, 253, 0.3)',
                    color: n.type === 'SUCCESS' ? 'var(--color-success-text)' : n.type === 'WARNING' ? 'var(--color-warning-text)' : 'var(--color-info-text)',
                    opacity: n.isRead ? 0.88 : 1,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)',
                    boxShadow: n.isRead ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                    <div style={{ padding: 6, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AppIcon name={action.iconName} size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span 
                          style={{ 
                            fontSize: '10px', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            background: 'rgba(0,0,0,0.08)',
                            letterSpacing: '0.04em'
                          }}
                        >
                          {action.badge}
                        </span>
                        {n.relatedEntityId && (
                          <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: 600 }}>
                            ID #{n.relatedEntityId}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'inherit', fontWeight: n.isRead ? 400 : 700, margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {n.message}
                      </p>
                    </div>
                    {!n.isRead && (
                      <span style={{ background: 'var(--color-primary)', width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4 }} title="Unread" />
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingTop: 8, borderTop: '1px solid rgba(0, 0, 0, 0.06)', gap: 12 }}>
                    <span style={{ fontSize: '11px', opacity: 0.75, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <AppIcon name="pending" size={11} /> {new Date(n.createdAt).toLocaleString()}
                    </span>

                    {/* Direct Action Routing Button - perfectly aligned to right */}
                    <button
                      type="button"
                      className={`btn ${action.btnClass} btn-xs`}
                      style={{
                        fontSize: 12,
                        padding: '6px 14px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: 6,
                        marginLeft: 'auto',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.isRead) handleMarkAsRead(n.id);
                        navigate(action.path);
                      }}
                    >
                      {action.label}
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

