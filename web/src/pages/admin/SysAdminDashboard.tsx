import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { humanizeEnum } from '../../constants/transactionStatus';
import { SystemExceptions } from './SystemExceptions';
import { FallbackApprovals } from './FallbackApprovals';
import './sysadmin-dashboard.css';

interface Props {
  loading: boolean;
  summary: any;
  activeAccounts: number | string;
  totalUsers: number;
  pendingRequests: number;
  requiringAction: number;
  roles: (string | number)[][];
  users: any[];
  requests: any[];
  auditLogs: any[];
  auditTotal: number;
  timeAgo: (d: string) => string;
}

const ROLE_LABEL: Record<string, string> = {
  TEACHING_PERSONNEL: 'Teaching', NON_TEACHING_PERSONNEL: 'Non-teaching', HRMO: 'HRMO', AO_II: 'AO II', SYSTEM_ADMIN: 'System Admin',
};
const ROLE_COLOR = ['#17472E', '#2F7D52', '#D4A017', '#6FA587', '#B9C7BD'];
const initials = (a?: string, b?: string) => `${a?.[0] || ''}${b?.[0] || ''}`.toUpperCase() || '?';

/** The System Administrator's home: what needs attention, the account counts, recent accounts and the audit trail. */
export const SysAdminDashboard: React.FC<Props> = p => {
  const [tab, setTab] = useState<'USERS' | 'REQUESTS'>('USERS');
  const n = (v: number | string) => (p.loading ? '…' : v);
  const roleTotal = p.roles.reduce((s, [, c]) => s + Number(c), 0) || 1;

  return (
    <div className="sad">
      <SystemExceptions />
      <FallbackApprovals />

      <section className="sad-kpis" aria-label="Accounts at a glance">
        <Link to="/admin/credentials" className="sad-kpi">
          <span className="sad-kpi__label">Active accounts</span>
          <span className="sad-kpi__num">{n(p.activeAccounts)}<small> / {n(p.totalUsers)}</small></span>
        </Link>
        <Link to="/admin/credentials" className={`sad-kpi${p.pendingRequests > 0 ? ' is-warn' : ''}`}>
          <span className="sad-kpi__label">Waiting requests</span>
          <span className="sad-kpi__num">{n(p.pendingRequests)}</span>
        </Link>
        <Link to="/admin/credentials" className={`sad-kpi${p.requiringAction > 0 ? ' is-warn' : ''}`}>
          <span className="sad-kpi__label">Need action</span>
          <span className="sad-kpi__num">{n(p.requiringAction)}</span>
          {p.summary && (
            <span className="sad-kpi__meta">{p.summary.passwordChanges} password · {p.summary.incompleteProfiles} profile</span>
          )}
        </Link>
        <div className="sad-kpi sad-kpi--roles">
          <span className="sad-kpi__label">Accounts by role</span>
          <div className="sad-rolebar" aria-hidden="true">
            {p.roles.map(([label, c], i) => Number(c) > 0 && (
              <span key={String(label)} style={{ flexGrow: Number(c), background: ROLE_COLOR[i] }} />
            ))}
          </div>
          <ul className="sad-roles">
            {p.roles.map(([label, c], i) => (
              <li key={String(label)}>
                <i style={{ background: ROLE_COLOR[i] }} />
                <span>{label}</span>
                <strong>{n(Number(c))}</strong>
              </li>
            ))}
          </ul>
          <span className="sr-only">{roleTotal} accounts in total</span>
        </div>
      </section>

      <div className="sad-main">
        <section className="sad-card" aria-labelledby="sad-accounts">
          <header className="sad-card__head">
            <h2 id="sad-accounts">Accounts</h2>
            <div className="sad-tabs" role="tablist" aria-label="Accounts or requests">
              <button type="button" role="tab" aria-selected={tab === 'USERS'} className={tab === 'USERS' ? 'is-on' : ''} onClick={() => setTab('USERS')}>
                Recent <b>{p.summary ? p.totalUsers : '—'}</b>
              </button>
              <button type="button" role="tab" aria-selected={tab === 'REQUESTS'} className={tab === 'REQUESTS' ? 'is-on' : ''} onClick={() => setTab('REQUESTS')}>
                Requests {p.pendingRequests > 0 && <b className="is-alert">{p.pendingRequests}</b>}
              </button>
            </div>
            <Link to="/admin/credentials" className="sad-link">Open Accounts →</Link>
          </header>

          <div className="sad-table-wrap">
            {tab === 'USERS' ? (
              <table className="sad-table">
                <thead><tr><th>Name</th><th>Role</th><th>Status</th><th className="r">Created</th></tr></thead>
                <tbody>
                  {p.users.length === 0 ? (
                    <tr><td colSpan={4} className="sad-empty">{p.loading ? 'Loading…' : 'No accounts yet.'}</td></tr>
                  ) : p.users.slice(0, 7).map((u: any) => {
                    const name = u.personnel ? `${u.personnel.firstName} ${u.personnel.lastName}` : u.email.split('@')[0];
                    const status = u.accountStatus || 'ACTIVE';
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="sad-person">
                            <span className="sad-avatar">{u.personnel ? initials(u.personnel.firstName, u.personnel.lastName) : initials(u.email)}</span>
                            <div><strong>{name}</strong><span>{u.email}</span></div>
                          </div>
                        </td>
                        <td>{ROLE_LABEL[u.role] || humanizeEnum(u.role)}</td>
                        <td><span className={`sad-status ${status === 'ACTIVE' ? 'is-ok' : 'is-wait'}`}>{humanizeEnum(status)}</span></td>
                        <td className="r sad-muted">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="sad-table">
                <thead><tr><th>Name</th><th>Requested role</th><th>Status</th><th className="r" /></tr></thead>
                <tbody>
                  {p.requests.length === 0 ? (
                    <tr><td colSpan={4} className="sad-empty">No waiting requests.</td></tr>
                  ) : p.requests.slice(0, 7).map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <div className="sad-person">
                          <span className="sad-avatar">{initials(r.firstName, r.lastName)}</span>
                          <div><strong>{`${r.firstName} ${r.lastName}`}</strong><span>{r.email}</span></div>
                        </div>
                      </td>
                      <td>{ROLE_LABEL[r.role] || humanizeEnum(r.role)}</td>
                      <td><span className={`sad-status ${r.status === 'APPROVED' ? 'is-ok' : r.status === 'REJECTED' ? 'is-bad' : 'is-wait'}`}>{humanizeEnum(r.status)}</span></td>
                      <td className="r"><Link to="/admin/credentials" className="sad-link">Review →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="sad-audit" aria-labelledby="sad-audit-h">
          <header>
            <h2 id="sad-audit-h">Audit trail</h2>
            <Link to="/admin/audit" className="sad-link sad-link--light">Open →</Link>
          </header>
          <div className="sad-audit__num">{n(p.auditTotal.toLocaleString())}<small>{p.auditTotal === 1 ? 'event' : 'events'}</small></div>
          <ol className="sad-audit__list">
            {p.auditLogs.length === 0 ? <li className="sad-audit__empty">No events yet.</li>
              : p.auditLogs.slice(0, 5).map((log: any) => (
                <li key={log.id}>
                  <span className="sad-audit__tag">{humanizeEnum(log.action?.split('_')[0] || 'EVENT')}</span>
                  <span className="sad-audit__who" title={log.userEmail || 'System'}>{log.userEmail ? log.userEmail.split('@')[0] : 'System'}</span>
                  <time>{p.timeAgo(log.timestamp)}</time>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </div>
  );
};
