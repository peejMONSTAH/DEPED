import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AppIcon } from '../../components/common/AppIcon';
import { PageHeader } from '../../components/common/PageHeader';
import { AsyncState } from '../../components/common/AsyncState';
import apiClient from '../../api/client';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useToast } from '../../contexts/ToastContext';
import './personnel-notifications.css';

export interface NotificationItem {
  /** true once the requested action is done; null for information. */
  actionResolved?: boolean | null;
  id: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
  relatedEntityType?: string;
  promotionApplicationId?: number;
  promotionCycleId?: number;
  transactionId?: number;
}

export type ReadFilter = 'ALL' | 'UNREAD';
export type CategoryFilter = 'ALL' | 'ACTION_REQUIRED' | 'TRANSACTIONS' | 'DOCUMENTS' | 'CAREER' | 'ACCOUNT';

export interface ActionConfig {
  path: string;
  label: string;
  category: string;
  iconName: string;
  badge: string;
  color: string;
  title: string;
  body: string;
  ctaText: string;
  isActionRequired: boolean;
}

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
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

export function parseNotificationAction(n: NotificationItem): ActionConfig {
  const rawMsg = n.message || '';
  const cleanMsg = rawMsg.replace(/^[\p{Emoji}\s]+/u, '').trim();
  const lower = cleanMsg.toLowerCase();

  let title = cleanMsg;
  let body = '';
  const colonIdx = cleanMsg.indexOf(':');
  if (colonIdx > 0 && colonIdx < 55) {
    title = cleanMsg.substring(0, colonIdx).trim();
    body = cleanMsg.substring(colonIdx + 1).trim();
  }

  const isDeficiency = lower.includes('deficienc') || lower.includes('reject') || lower.includes('return') || lower.includes('incomplete');
  const isDocument = lower.includes('document') || lower.includes('uploaded as') || lower.includes('pds') || lower.includes('prc') || lower.includes('attachment') || lower.includes('expired');
  const isCareer = lower.includes('career') || lower.includes('service record') || lower.includes('promotion') || lower.includes('vacancy') || lower.includes('appointed') || lower.includes('ranking');
  const isAccount = lower.includes('password') || lower.includes('credential') || lower.includes('account') || lower.includes('profile');
  const isSessionNotice = lower.includes('signed out') || lower.includes('sign out') || lower.includes('session');

  // Session/security notices sometimes carry no entity and must never fall
  // through to the generic transaction destination.
  if (isSessionNotice) {
    return {
      path: '/personnel/profile', label: 'Account security', category: 'ACCOUNT',
      iconName: 'profile', badge: 'Account security', color: '#8a621b', title,
      body, ctaText: 'Review account', isActionRequired: false,
    };
  }

  // 1. Action Required: Deficiency or returned items
  if (isDeficiency) {
    const txId = n.transactionId || n.relatedEntityId;
    return {
      path: txId ? `/personnel/checklist?txId=${txId}` : '/personnel/transactions',
      label: 'Action Required',
      category: 'ACTION_REQUIRED',
      iconName: 'warning',
      badge: 'Action Required',
      color: '#dc2626',
      title,
      body,
      ctaText: 'Replace Document',
      isActionRequired: true,
    };
  }

  // Any other notice about a transaction opens that transaction, not a list.
  if ((n.relatedEntityType || '').toLowerCase() === 'transaction' && n.relatedEntityId) {
    return {
      path: `/personnel/checklist?txId=${n.relatedEntityId}`,
      label: 'Transaction',
      category: isCareer ? 'CAREER' : 'DOCUMENTS',
      iconName: 'transactions',
      badge: 'Transaction',
      color: '#2F7D52',
      title,
      body,
      ctaText: 'Open transaction',
      isActionRequired: false,
    };
  }

  // 2. Account & Profile
  if (isAccount) {
    return {
      path: '/personnel/profile',
      label: 'Account Alert',
      category: 'ACCOUNT',
      iconName: 'profile',
      badge: 'Account Alert',
      color: '#c79a2e',
      title,
      body,
      ctaText: 'Open Profile',
      isActionRequired: false,
    };
  }

  // 3. Document 201 updates
  if (isDocument) {
    return {
      path: '/personnel/documents',
      label: '201 Document',
      category: 'DOCUMENTS',
      iconName: 'document',
      badge: '201 Files',
      color: '#0284c7',
      title,
      body,
      ctaText: 'Review 201',
      isActionRequired: lower.includes('expir') || lower.includes('missing'),
    };
  }

  // 4. Career & Promotion
  if (isCareer) {
    const isOpenCycle = lower.includes('cycle opened') || lower.includes('active for applications') || lower.includes('accepting applications');
    return {
      path: lower.includes('service record') ? '/personnel/service-record'
        : isOpenCycle ? (n.promotionCycleId ? `/personnel/home?cycle=${n.promotionCycleId}` : '/personnel/home#vacancies')
        : '/personnel/transactions',
      label: 'Career Opportunity',
      category: 'CAREER',
      iconName: 'repository',
      badge: 'Career Event',
      color: '#16a34a',
      title,
      body,
      ctaText: lower.includes('service record') ? 'View service record' : isOpenCycle ? 'View vacancy' : 'View application',
      isActionRequired: false,
    };
  }

  // 5. General Transaction Update
  const txId = n.transactionId || n.relatedEntityId;
  return {
    path: txId ? `/personnel/checklist?txId=${txId}` : '/personnel/transactions',
    label: 'Transaction',
    category: 'TRANSACTIONS',
    iconName: 'transactions',
    badge: 'Transaction Update',
    color: '#0284c7',
    title,
    body,
    ctaText: 'Open Transaction',
    isActionRequired: false,
  };
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
      setLoadError(
        err?.response?.data?.message ||
        'Unable to connect to notification service. Please check your network connection.'
      );
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeNotifications(fetchNotifications);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleToggleRead = async (id: number, currentRead: boolean) => {
    const nextRead = !currentRead;
    // Optimistic update
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: nextRead } : n)));
    try {
      if (nextRead) {
        await apiClient.put(`/notifications/${id}/read`);
      } else {
        await apiClient.put(`/notifications/${id}/unread`);
      }
    } catch (err) {
      console.error('Failed to toggle notification read status:', err);
      // Revert if failed
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: currentRead } : n)));
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

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  // Filter notifications by read status and category
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (readStatus === 'UNREAD' && n.isRead) return false;
      const config = parseNotificationAction(n);

      if (categoryFilter === 'ACTION_REQUIRED') {
        return config.isActionRequired;
      }
      if (categoryFilter === 'TRANSACTIONS') {
        return config.category === 'TRANSACTIONS';
      }
      if (categoryFilter === 'DOCUMENTS') {
        return config.category === 'DOCUMENTS';
      }
      if (categoryFilter === 'CAREER') {
        return config.category === 'CAREER';
      }
      if (categoryFilter === 'ACCOUNT') {
        return config.category === 'ACCOUNT';
      }
      return true;
    });
  }, [notifications, readStatus, categoryFilter]);

  // Separate Action Required (pinned at top) vs standard time-grouped items
  const { actionRequiredItems, todayItems, earlierItems } = useMemo(() => {
    const actionRequired: NotificationItem[] = [];
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];

    for (const item of filteredNotifications) {
      const config = parseNotificationAction(item);
      if (config.isActionRequired && item.actionResolved !== true && categoryFilter !== 'ACTION_REQUIRED') {
        actionRequired.push(item);
      } else if (isToday(item.createdAt)) {
        today.push(item);
      } else {
        earlier.push(item);
      }
    }

    return { actionRequiredItems: actionRequired, todayItems: today, earlierItems: earlier };
  }, [filteredNotifications, categoryFilter]);

  const renderNotificationCard = (n: NotificationItem) => {
    const action = parseNotificationAction(n);
    const timeFormatted = formatRelativeTime(n.createdAt);

    return (
      <div
        key={n.id}
        className="personnel-notification"
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: action.isActionRequired
            ? '1.5px solid #ef4444'
            : n.isRead
            ? '1px solid var(--color-border)'
            : '1px solid var(--color-primary-light, #0284c7)',
          background: action.isActionRequired
            ? 'rgba(239, 68, 68, 0.03)'
            : n.isRead
            ? 'var(--color-bg-card)'
            : 'var(--color-bg-secondary)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0, flex: '1 1 320px' }}>
          {/* Category Icon */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: action.isActionRequired ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-bg-secondary)',
              color: action.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <AppIcon name={action.iconName as any} size={16} color={action.color} />
          </div>

          {/* Text and Details */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: action.isActionRequired ? 'rgba(239, 68, 68, 0.15)' : 'var(--color-bg-secondary)',
                  color: action.color,
                  border: `1px solid ${action.color}33`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {action.badge}
              </span>

              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {timeFormatted}
              </span>

              {!n.isRead && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    display: 'inline-block',
                  }}
                  title="Unread"
                />
              )}
            </div>

            <div style={{ fontWeight: n.isRead ? 600 : 800, fontSize: '0.9375rem', color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {action.title}
            </div>

            {action.body && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
                {action.body}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons & Read Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Direct CTA */}
          <Link
            to={action.path}
            className={`btn btn-sm ${action.isActionRequired ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
              background: action.isActionRequired ? '#dc2626' : undefined,
              borderColor: action.isActionRequired ? '#dc2626' : undefined,
              color: action.isActionRequired ? '#fff' : undefined,
            }}
          >
            <span>{action.ctaText}</span>
            <AppIcon name="chevron-right" size={12} color={action.isActionRequired ? '#fff' : 'currentColor'} />
          </Link>

          {/* Individual Read / Unread Toggle Control */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleToggleRead(n.id, n.isRead)}
            title={n.isRead ? 'Mark as unread' : 'Mark as read'}
            aria-label={n.isRead ? 'Mark as unread' : 'Mark as read'}
            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <AppIcon name={n.isRead ? 'envelope' : 'check'} size={14} color={n.isRead ? 'var(--color-text-muted)' : '#059669'} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <PageHeader
        title="Notifications"
        subtitle="Actions, reviews, and updates about your 201 file"
        breadcrumbs={[
          { label: 'Portal Home', to: '/personnel/home' },
          { label: 'Notifications' },
        ]}
        badge={
          unreadCount > 0
            ? {
                label: `${unreadCount} Unread`,
                tone: 'warning',
              }
            : undefined
        }
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleMarkAllRead}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <AppIcon name="check" size={14} /> Mark All as Read
            </button>
          ) : undefined
        }
      />

      {/* Category Tabs: Action Required, Transactions, Documents, Career, Account */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`btn btn-sm ${categoryFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('ACTION_REQUIRED')}
            className={`btn btn-sm ${categoryFilter === 'ACTION_REQUIRED' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              fontWeight: 700,
              background: categoryFilter === 'ACTION_REQUIRED' ? '#dc2626' : undefined,
              borderColor: categoryFilter === 'ACTION_REQUIRED' ? '#dc2626' : undefined,
            }}
          >
            Action Required
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('TRANSACTIONS')}
            className={`btn btn-sm ${categoryFilter === 'TRANSACTIONS' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Transactions
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('DOCUMENTS')}
            className={`btn btn-sm ${categoryFilter === 'DOCUMENTS' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Documents
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('CAREER')}
            className={`btn btn-sm ${categoryFilter === 'CAREER' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Career
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('ACCOUNT')}
            className={`btn btn-sm ${categoryFilter === 'ACCOUNT' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontWeight: 700 }}
          >
            Account
          </button>
        </div>

        {/* Read / Unread Status Filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setReadStatus('ALL')}
            className={`btn btn-sm ${readStatus === 'ALL' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', fontWeight: 600 }}
          >
            All Items
          </button>
          <button
            type="button"
            onClick={() => setReadStatus('UNREAD')}
            className={`btn btn-sm ${readStatus === 'UNREAD' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', fontWeight: 600 }}
          >
            Unread Only {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
      </div>

      {/* Main Content with AsyncState */}
      <AsyncState
        loading={loading}
        error={loadError}
        onRetry={fetchNotifications}
        isEmpty={filteredNotifications.length === 0}
        emptyTitle="No Notifications"
        emptyMessage={
          readStatus === 'UNREAD'
            ? 'You have caught up with all official notifications.'
            : 'You have no notifications in this category.'
        }
        loadingText="Loading notifications..."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pinned Action Required Section */}
          {actionRequiredItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#dc2626',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc2626', margin: 0 }}>
                  Action needed ({actionRequiredItems.length})
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actionRequiredItems.map(renderNotificationCard)}
              </div>
            </div>
          )}

          {/* Today's Section */}
          {todayItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: 0 }}>
                Today
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todayItems.map(renderNotificationCard)}
              </div>
            </div>
          )}

          {/* Earlier Section */}
          {earlierItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: 0 }}>
                Earlier Activity
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {earlierItems.map(renderNotificationCard)}
              </div>
            </div>
          )}
        </div>
      </AsyncState>
    </div>
  );
};
