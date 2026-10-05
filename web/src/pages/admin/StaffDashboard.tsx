import React from 'react';
import { Link } from 'react-router-dom';
import { Users, GraduationCap, Briefcase, Inbox } from 'lucide-react';
import { transactionStatusLabel } from '../../constants/transactionStatus';
import './sysadmin-dashboard.css';

type Recent = { id: string; avatar: string; employee: string; type: string; status: string; date: string };

interface Props {
  loading: boolean;
  role?: string;
  personnel: number;
  teaching: number;
  nonTeaching: number;
  pending: number;
  weekTotal: number;
  weekly: { day: string; count: number }[];
  recent: Recent[];
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** HRMO and AO II home: who is on record, what is waiting, and this week's activity. */
export const StaffDashboard: React.FC<Props> = p => {
  const n = (v: number) => (p.loading ? '…' : v.toLocaleString());
  const queueLink = p.role === 'AO_II' ? '/admin/documents' : '/admin/transactions';
  const max = Math.max(1, ...p.weekly.map(w => w.count));

  return (
    <div className="sad">
      <section className="sad-kpis sad-kpis--four" aria-label="At a glance">
        <Link to="/admin/personnel" className="sad-kpi">
          <span className="sad-kpi__label"><Users size={20} aria-hidden="true" /> Personnel</span>
          <span className="sad-kpi__num">{n(p.personnel)}</span>
        </Link>
        <Link to="/admin/personnel" className="sad-kpi">
          <span className="sad-kpi__label"><GraduationCap size={20} aria-hidden="true" /> Teaching</span>
          <span className="sad-kpi__num">{n(p.teaching)}<small> {pct(p.teaching, p.personnel)}%</small></span>
          <span className="sad-meter" aria-hidden="true"><i style={{ width: `${pct(p.teaching, p.personnel)}%` }} /></span>
        </Link>
        <Link to="/admin/personnel" className="sad-kpi">
          <span className="sad-kpi__label"><Briefcase size={20} aria-hidden="true" /> Non-teaching</span>
          <span className="sad-kpi__num">{n(p.nonTeaching)}<small> {pct(p.nonTeaching, p.personnel)}%</small></span>
          <span className="sad-meter is-gold" aria-hidden="true"><i style={{ width: `${pct(p.nonTeaching, p.personnel)}%` }} /></span>
        </Link>
        <Link to={queueLink} className={`sad-kpi${p.pending > 0 ? ' is-warn' : ''}`}>
          <span className="sad-kpi__label"><Inbox size={20} aria-hidden="true" /> Waiting for review</span>
          <span className="sad-kpi__num">{n(p.pending)}</span>
        </Link>
      </section>

      <div className="sad-main">
        <section className="sad-card" aria-labelledby="sd-recent">
          <header className="sad-card__head">
            <h2 id="sd-recent">Recent transactions</h2>
            <Link to="/admin/transactions" className="sad-link">Open queue →</Link>
          </header>
          <div className="sad-table-wrap">
            <table className="sad-table">
              <thead><tr><th>Personnel</th><th>Type</th><th>Status</th><th className="r">Date</th></tr></thead>
              <tbody>
                {p.recent.length === 0 ? (
                  <tr><td colSpan={4} className="sad-empty">{p.loading ? 'Loading…' : 'No transactions yet.'}</td></tr>
                ) : p.recent.map(tx => (
                  <tr key={tx.id}>
                    <td>
                      <div className="sad-person">
                        <span className="sad-avatar">{tx.avatar}</span>
                        <div><strong>{tx.employee}</strong><span>{tx.id}</span></div>
                      </div>
                    </td>
                    <td>{tx.type}</td>
                    <td><span className={`sad-status ${tx.status === 'APPROVED' ? 'is-ok' : tx.status === 'REJECTED' ? 'is-bad' : 'is-wait'}`}>{transactionStatusLabel(tx.status)}</span></td>
                    <td className="r sad-muted">{tx.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sad-audit" aria-labelledby="sd-week">
          <header><h2 id="sd-week">This week</h2></header>
          <div className="sad-audit__num">{p.loading ? '…' : p.weekTotal}<small>{p.weekTotal === 1 ? 'transaction' : 'transactions'}</small></div>
          <div className="sad-week" role="img" aria-label={p.weekly.map(w => `${w.day} ${w.count}`).join(', ')}>
            {p.weekly.map(w => (
              <div key={w.day} className="sad-week__col">
                <span className="sad-week__val">{w.count}</span>
                <span className="sad-week__track"><i style={{ height: `${w.count ? Math.max(8, (w.count / max) * 100) : 0}%` }} /></span>
                <span className="sad-week__day">{w.day.slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
