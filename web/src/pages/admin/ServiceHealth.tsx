import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { AppIcon } from '../../components/common/AppIcon';
import './system-operations.css';

type Status = 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNKNOWN';
type Check = { key: string; name: string; status: Status; detail: string; remedy?: string; checkedAt: string };
type Run = { runKey: string; kind: string; status: string; finishedAt: string | null; reportedAt: string; sizeBytes: number | null; encrypted: boolean | null; manifestVerified: boolean | null; missingObjects: number | null; error: string | null };
type Backups = { status: Status; explanation: string; lastBackup: Run | null; lastSuccessfulBackup: Run | null; lastRestoreDrill: Run | null; history: Run[]; restore: string };

export const STATUS_LABEL: Record<Status, string> = { OPERATIONAL: 'Operational', DEGRADED: 'Degraded', UNAVAILABLE: 'Unavailable', NOT_CONFIGURED: 'Not configured', UNKNOWN: 'Unknown' };
const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const size = (b: number | null) => (b === null ? '—' : b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const yes = (v: boolean | null) => (v === null ? 'Not reported' : v ? 'Yes' : 'No');

/** Each status comes from a check the server just ran (or ran in the last 30 s); nothing is assumed. */
export const ServiceHealth: React.FC = () => {
  const [checks, setChecks] = useState<{ checkedAt: string; checks: Check[] } | null>(null);
  const [backups, setBackups] = useState<Backups | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const [h, b] = await Promise.all([
        apiClient.get('/admin/operations/health', { params: refresh ? { refresh: 1 } : {} }),
        apiClient.get('/admin/operations/backups'),
      ]);
      setChecks(h.data.data); setBackups(b.data.data);
    } catch (err: any) { setChecks(null); setBackups(null); setError(err?.response?.data?.message || 'Health checks could not run.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const problems = checks?.checks.filter(c => c.status !== 'OPERATIONAL') || [];

  return <div className="animate-fade-in sysops-page">
    <header className="sysops-header"><div><p className="sysops-eyebrow">System operations</p><h1>Service health & backups</h1><p>Live checks of the database, storage, email, worker, OCR and backups. No secrets are shown.</p></div>
      <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load(true)}><AppIcon name="refresh" size={16} /> {loading ? 'Checking…' : 'Run checks now'}</button></header>

    {error ? <section className="sysops-error" role="alert"><div><strong>Checks unavailable</strong><span>{error}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(true)}>Try again</button></section>
    : !checks ? <div className="sysops-loading" aria-busy="true">Running checks…</div>
    : <>
      <section className={`sysops-error adm-banner${problems.length ? '' : ' is-ok'}`} role="status">
        <div><strong>{problems.length ? `${problems.length} service${problems.length === 1 ? '' : 's'} need attention` : 'Every checked service answered normally'}</strong>
          <span>Checked {when(checks.checkedAt)}</span></div></section>
      <section className="sysops-panel"><ul className="adm-list">{checks.checks.map(c => <li key={c.key}>
        <div className="adm-list__main"><strong>{c.name} <span className={`adm-state is-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span></strong><span>{c.detail}</span>{c.remedy && <span className="adm-remedy">What to do: {c.remedy}</span>}</div>
      </li>)}</ul></section>

      {backups && <section className="sysops-panel" style={{ marginTop: '1rem' }}>
        <div className="sysops-panel-heading"><div><h2>Backup & recovery <span className={`adm-state is-${backups.status.toLowerCase()}`}>{STATUS_LABEL[backups.status]}</span></h2><p>{backups.explanation}</p></div></div>
        <dl className="sysops-control-list">
          <div><dt>Last successful backup</dt><dd>{when(backups.lastSuccessfulBackup?.finishedAt || backups.lastSuccessfulBackup?.reportedAt)}</dd></div>
          <div><dt>Latest backup result</dt><dd>{backups.lastBackup ? `${backups.lastBackup.status === 'SUCCEEDED' ? 'Succeeded' : 'Failed'}${backups.lastBackup.error ? ` · ${backups.lastBackup.error}` : ''}` : 'None reported'}</dd></div>
          <div><dt>Size · encrypted · manifest verified</dt><dd>{size(backups.lastBackup?.sizeBytes ?? null)} · {yes(backups.lastBackup?.encrypted ?? null)} · {yes(backups.lastBackup?.manifestVerified ?? null)}</dd></div>
          <div><dt>Missing referenced files</dt><dd>{backups.lastBackup?.missingObjects ?? 'Not reported'}</dd></div>
          <div><dt>Last restore drill</dt><dd>{backups.lastRestoreDrill ? `${backups.lastRestoreDrill.status === 'SUCCEEDED' ? 'Passed' : 'Failed'} · ${when(backups.lastRestoreDrill.reportedAt)}` : 'None reported'}</dd></div>
        </dl>
        <p className="adm-remedy" style={{ marginTop: '.75rem' }}>{backups.restore}</p>
      </section>}
    </>}
  </div>;
};
