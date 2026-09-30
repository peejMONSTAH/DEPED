import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import apiClient from '../../api/client';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useToast } from '../../contexts/ToastContext';
import { StaleNotice } from '../../components/common/LoadFailure';
import { groupNotifications, NoticeRoute, PersonnelNotification } from './notificationRoute';
import './personnel-notifications.css';

export type NotificationItem = PersonnelNotification;

const when = (d: string) => {
  const date = new Date(d);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();

/** Requests that are still open first, then updates. Every button opens the record the notice is about. */
export const PersonnelNotifications: React.FC = () => {
  const { addToast } = useToast();
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Once notices have loaded, a failed refresh keeps them on screen, marked as possibly out of date.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.get('/notifications');
      setRows(res.data?.data || []);
      setLoadedAt(new Date());
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Your notifications could not be loaded. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useRealtimeNotifications(load);
  React.useEffect(() => { void load(); }, [load]);

  const setRead = async (id: number, read: boolean) => {
    setRows(prev => prev.map(n => (n.id === id ? { ...n, isRead: read } : n)));
    try { await apiClient.put(`/notifications/${id}/${read ? 'read' : 'unread'}`); }
    catch { setRows(prev => prev.map(n => (n.id === id ? { ...n, isRead: !read } : n))); }
  };
  const markAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      setRows(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Could not mark notifications as read.', 'ERROR');
    }
  };

  const unread = rows.filter(n => !n.isRead).length;
  const { action, updates } = useMemo(() => groupNotifications(unreadOnly ? rows.filter(n => !n.isRead) : rows), [rows, unreadOnly]);
  const today = updates.filter(x => isToday(x.n.createdAt));
  const earlier = updates.filter(x => !isToday(x.n.createdAt));

  const card = ({ n, r }: { n: NotificationItem & { repeats: number }; r: NoticeRoute }) => (
    <li key={n.id} className={`pn__item${r.needsAction ? ' is-action' : ''}${n.isRead ? '' : ' is-unread'}`}>
      <div className="pn__text">
        <span className="pn__meta">
          <span className={`pn__kind k-${r.kind}`}>{r.label}</span>
          <span>{when(n.createdAt)}</span>
          {n.repeats > 1 && <span>· sent {n.repeats} times</span>}
          {!n.isRead && <span className="pn__dot">Unread</span>}
        </span>
        <strong>{r.title}</strong>
        <span className="pn__msg">{n.message}</span>
      </div>
      <div className="pn__actions">
        {r.path && r.cta && (
          <Link className={`btn btn-sm ${r.needsAction ? 'btn-primary' : 'btn-secondary'}`} to={r.path} onClick={() => { if (!n.isRead) void setRead(n.id, true); }}>
            {r.cta}
          </Link>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRead(n.id, !n.isRead)}>
          {n.isRead ? 'Mark unread' : 'Mark read'}
        </button>
      </div>
    </li>
  );

  const section = (id: string, title: string, items: typeof updates, hint?: string) => items.length > 0 && (
    <section className="pn__group" aria-labelledby={`pn-${id}`}>
      <h2 id={`pn-${id}`}>{title} <span>{items.length}</span></h2>
      {hint && <p className="pn__hint">{hint}</p>}
      <ul>{items.map(card)}</ul>
    </section>
  );

  return (
    <div className="animate-fade-in personnel-content-container">
      <PageHeader
        title="Notifications"
        actions={unread > 0 ? <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>Mark all as read</button> : undefined}
      />
      <div className="pn__filter" role="group" aria-label="Show">
        <button type="button" className={`btn btn-sm ${!unreadOnly ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button>
        <button type="button" className={`btn btn-sm ${unreadOnly ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread ({unread})</button>
      </div>
      {error && loadedAt && <StaleNotice what="your notifications" since={loadedAt} onRetry={() => { void load(); }} />}
      {loading ? <p className="pn__hint" aria-busy="true">Loading your notifications…</p>
        : error && !loadedAt ? <div className="pn__error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>
        : action.length + updates.length === 0 ? <p className="pn__empty">{unreadOnly ? 'No unread notifications.' : 'No notifications yet. Reviews, returns and approvals will appear here. Your notifications loaded correctly and this list is empty.'}</p>
        : <>
          {section('action', 'Needs your action', action, 'These stay here until the request is done.')}
          {section('today', 'Today', today)}
          {section('earlier', action.length || today.length ? 'Earlier' : 'Updates', earlier)}
        </>}
    </div>
  );
};

export default PersonnelNotifications;
