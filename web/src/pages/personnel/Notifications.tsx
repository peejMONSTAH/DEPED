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
type CategoryFilter = 'ALL' | 'ACCOUNT' | 'TRANSACTIONS' | 'CAREER';

function formatRelativeTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

function isToday(dateString: string): boolean {
  try {
    const d = new Date(dateString);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  } catch {
    return false;
  }
}

export const PersonnelNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readStatus, setReadStatus] = useState<ReadFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');

  const fetchNotifications = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiClient.get('/notifications');
      setNotifications(res.data?.data || []);
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      setLoadError(err?.response?.data?.message || 'Unable to connect to notification service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeNotifications(fetchNotifications);

  const handleMarkAsRead = async (id: number) => {
    try {
      await apiClient.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
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
    const rawMsg = n.message || '';
    // Strip leading emoji characters to maintain a clean editorial visual hierarchy
    const cleanMsg = rawMsg.replace(/^[\p{Emoji}\s]+/u, '').trim();
    const lower = cleanMsg.toLowerCase();

    // Parse title vs body if formatted with a colon separator
    let title = cleanMsg;
    let body = '';
    const colonIdx = cleanMsg.indexOf(':');
    if (colonIdx > 0 && colonIdx < 55) {
      title = cleanMsg.substring(0, colonIdx).trim();
      body = cleanMsg.substring(colonIdx + 1).trim();
    }

    const isApproved = lower.includes('approved');
    const isReturned = lower.includes('deficienc') || lower.includes('reject') || lower.includes('return');
    const isAccount = lower.includes('password') || lower.includes('credential') || lower.includes('account');
    const isCareer = lower.includes('career') || lower.includes('service record') || lower.includes('promotion');

    if (isAccount) {
      return {
        path: '/personnel/profile-completion',
        label: 'Account Alert',
        category: 'Account',
        iconName: 'profile' as const,
        badge: 'Account Alert',
        color: '#c79a2e',
        title,
        body,
      };
    }
    if (isReturned) {
      return {
        path: '/personnel/checklist',
        label: 'Action Required',
        category: 'Deficiency',
        iconName: 'warning' as const,
        badge: 'Action Required',
        color: '#ef4444',
        title,
        body,
      };
    }
    if (isApproved) {
      return {
        path: '/personnel/transactions',
        label: 'Approval',
        category: 'Approval',
        iconName: 'approved' as const,
        badge: 'Approval',
        color: '#10b981',
        title,
        body,
      };
    }
    if (isCareer) {
      return {
        path: '/personnel/profile',
        label: 'Career Event',
        category: 'Career',
        iconName: 'repository' as const,
        badge: 'Career Event',
        color: '#2f7d52',
        title,
        body,
      };
    }
    return {
      path: '/personnel/transactions',
      label: 'Transaction',
      category: 'Transactions',
      iconName: 'transactions' as const,
      badge: 'Update',
      color: '#0284c7',
      title,
      body,
    };
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (readStatus === 'UNREAD' && n.isRead) return false;
      const msg = (n.message || '').toLowerCase();
      if (categoryFilter === 'ACCOUNT') {
        return msg.includes('account') || msg.includes('password') || msg.includes('credential');
      }
      if (categoryFilter === 'TRANSACTIONS') {
        return (
          msg.includes('transaction') ||
          msg.includes('validation') ||
          msg.includes('approval') ||
          msg.includes('submission') ||
          msg.includes('deficienc')
        );
      }
      if (categoryFilter === 'CAREER') {
        return msg.includes('career') || msg.includes('promotion') || msg.includes('service record');
      }
      return true;
    });
  }, [notifications, readStatus, categoryFilter]);

  const { todayItems, earlierItems } = useMemo(() => {
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];
    for (const item of filteredNotifications) {
      if (isToday(item.createdAt)) {
        today.push(item);
      } else {
        earlier.push(item);
      }
    }
    return { todayItems: today, earlierItems: earlier };
  }, [filteredNotifications]);

  const renderNotificationRow = (n: NotificationItem) => {
    const action = getActionConfig(n);
    const timeFormatted = formatRelativeTime(n.createdAt);

    return (
      <div
        key={n.id}
        {...clickable<HTMLDivElement>(() => {
          if (!n.isRead) void handleMarkAsRead(n.id);
          navigate(action.path);
        }, `Open ${action.label}: ${action.title}`)}
        className={`notif-inbox-row ${!n.isRead ? 'unread' : ''}`}
        style={{
          '--notif-accent-color': action.color,
        } as React.CSSProperties}
      >
        {/* Category Icon */}
        <div
          className="notif-inbox-icon"
          style={{ background: `${action.color}15`, color: action.color }}
        >
          <AppIcon name={action.iconName} size={18} />
        </div>

        {/* Text Container */}
        <div className="notif-inbox-text-content">
          <div className="notif-inbox-meta-line">
            <span
              className="notif-inbox-badge"
              style={{ color: action.color, background: `${action.color}14` }}
            >
              {action.badge}
            </span>
            {n.relatedEntityId && (
              <span className="notif-inbox-ref">Ref: #{n.relatedEntityId}</span>
            )}
          </div>

          <div className="notif-inbox-title">{action.title}</div>
          {action.body && <div className="notif-inbox-preview">{action.body}</div>}
        </div>

        {/* Right Meta Column: Timestamp, Unread Dot, Action Affordance */}
        <div className="notif-inbox-right-meta">
          <span className="notif-inbox-time">{timeFormatted}</span>
          {!n.isRead && <span className="notif-unread-dot" title="Unread" />}
          <div className="notif-inbox-arrow" aria-hidden="true">
            <AppIcon name="chevron-right" size={16} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in personnel-content-container notif-inbox-container">
      {/* Header Row */}
      <div className="notif-inbox-header">
        <div className="notif-inbox-title-group">
          <h1 className="notif-inbox-heading">Notifications</h1>
          {unreadCount > 0 && (
            <span className="notif-unread-count-pill" aria-label={`${unreadCount} unread`}>
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            className="notif-inbox-mark-read-btn"
            onClick={handleMarkAllRead}
            aria-label="Mark all notifications as read"
          >
            <AppIcon name="approved" size={13} />
            <span>Mark all as read</span>
          </button>
        ) : (
          <span className="notif-inbox-caught-up">All caught up</span>
        )}
      </div>

      {/* Primary Filter Segmented Control */}
      <div className="notif-inbox-filters-area">
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

        {/* Horizontal Category Chips */}
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
              <AppIcon name="profile" size={13} /> Account
            </button>
            <button
              type="button"
              className={`notif-chip ${categoryFilter === 'TRANSACTIONS' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('TRANSACTIONS')}
            >
              <AppIcon name="transactions" size={13} /> Transactions
            </button>
            <button
              type="button"
              className={`notif-chip ${categoryFilter === 'CAREER' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('CAREER')}
            >
              <AppIcon name="repository" size={13} /> Career
            </button>
            {categoryFilter !== 'ALL' && (
              <button
                type="button"
                className="notif-chip-clear"
                onClick={() => setCategoryFilter('ALL')}
                aria-label="Clear topic filter"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="notif-chips-fade-right" aria-hidden="true" />
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="notif-skeleton-list" aria-busy="true" aria-label="Loading notifications">
          {[1, 2, 3].map(i => (
            <div key={i} className="notif-skeleton-row">
              <div className="notif-skeleton-icon skeleton" />
              <div className="notif-skeleton-content">
                <div className="notif-skeleton-line short skeleton" />
                <div className="notif-skeleton-line title skeleton" />
                <div className="notif-skeleton-line desc skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="notif-error-banner" role="alert">
          <AppIcon name="warning" size={24} color="#ef4444" />
          <div className="notif-error-text">
            <strong>Could not load notifications</strong>
            <p>{loadError}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void fetchNotifications()}
          >
            Retry
          </button>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="notif-empty-state">
          <div className="notif-empty-icon">
            <AppIcon name="notifications" size={32} />
          </div>
          <div className="notif-empty-title">
            {notifications.length === 0 ? 'No notifications' : 'No notifications match these filters'}
          </div>
          <div className="notif-empty-subtitle">
            {notifications.length === 0
              ? 'Official announcements and transaction updates will appear here.'
              : 'Try switching to All or clearing your selected filters.'}
          </div>
          {(categoryFilter !== 'ALL' || readStatus !== 'ALL') && (
            <button
              type="button"
              className="btn btn-secondary btn-sm notif-empty-reset-btn"
              onClick={() => {
                setCategoryFilter('ALL');
                setReadStatus('ALL');
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="notif-inbox-list">
          {/* Today Group */}
          {todayItems.length > 0 && (
            <div className="notif-group-section">
              <div className="notif-group-heading">Today</div>
              <div className="notif-group-items">
                {todayItems.map(renderNotificationRow)}
              </div>
            </div>
          )}

          {/* Earlier Group */}
          {earlierItems.length > 0 && (
            <div className="notif-group-section">
              <div className="notif-group-heading">Earlier</div>
              <div className="notif-group-items">
                {earlierItems.map(renderNotificationRow)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
