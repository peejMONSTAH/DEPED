import React, { useCallback, useEffect, useState } from 'react';
import { Server, Database, HardDrive, Mail, Cpu, ScanText, Archive, Globe, RefreshCw, CircleCheck, TriangleAlert, CircleX } from 'lucide-react';
import apiClient from '../../api/client';
import './sysadmin-pages.css';

type Status = 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNKNOWN';
type Check = { key: string; name: string; status: Status; detail: string; remedy?: string; checkedAt: string };
type Run = { runKey: string; kind: string; status: string; finishedAt: string | null; reportedAt: string; sizeBytes: number | null; encrypted: boolean | null; manifestVerified: boolean | null; missingObjects: number | null; error: string | null };
type Backups = { status: Status; explanation: string; lastBackup: Run | null; lastSuccessfulBackup: Run | null; lastRestoreDrill: Run | null; history: Run[]; restore: string };

export const STATUS_LABEL: Record<Status, string> = { OPERATIONAL: 'Operational', DEGRADED: 'Degraded', UNAVAILABLE: 'Unavailable', NOT_CONFIGURED: 'Not configured', UNKNOWN: 'Unknown' };
const TONE: Record<Status, 'ok' | 'warn' | 'bad'> = { OPERATIONAL: 'ok', DEGRADED: 'warn', UNAVAILABLE: 'bad', NOT_CONFIGURED: 'warn', UNKNOWN: 'warn' };
const ICON: Record<string, React.ElementType> = { api: Server, database: Database, storage: HardDrive, email: Mail, worker: Cpu, ocr: ScanText, backup: Archive, config: Globe };
const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const size = (b: number | null) => (b === null ? '—' : b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const yes = (v: boolean | null) => (v === null ? '—' : v ? 'Yes' : 'No');
/** Server details can carry raw ISO timestamps; show them the way the rest of the page does. */
const readable = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, iso => when(iso));

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
  const worst = problems.some(c => c.status === 'UNAVAILABLE') ? 'bad' : problems.length ? 'warn' : 'ok';
  const HeroIcon = worst === 'ok' ? CircleCheck : worst === 'bad' ? CircleX : TriangleAlert;
  const lb = backups?.lastBackup;

  return <div className="sap animate-fade-in">
    <header className="sap-head">
      <h1>Service health</h1>
      <button type="button" className="sap-btn sap-btn--ghost" disabled={loading} onClick={() => void load(true)}>
        <RefreshCw size={18} className={loading ? 'sap-spin' : ''} aria-hidden="true" /> {loading ? 'Checking…' : 'Run checks'}
      </button>
    </header>

    {error ? (
      <section className="sap-hero is-bad" role="alert">
        <span className="sap-hero__icon"><CircleX size={30} aria-hidden="true" /></span>
        <div className="sap-hero__text"><strong>Checks unavailable</strong><span>{error}</span></div>
        <button type="button" className="sap-btn sap-btn--ghost" onClick={() => void load(true)}>Try again</button>
      </section>
    ) : !checks ? (
      <div aria-busy="true" style={{ display: 'grid', gap: 16 }}><div className="sap-skel" /><div className="sap-services">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="sap-skel" style={{ height: 130 }} />)}</div></div>
    ) : <>
      <section className={`sap-hero is-${worst}`} role="status">
        <span className="sap-hero__icon"><HeroIcon size={30} aria-hidden="true" /></span>
        <div className="sap-hero__text">
          <strong>{problems.length ? `${problems.length} of ${checks.checks.length} services need attention` : 'All systems operational'}</strong>
          <span>Checked {when(checks.checkedAt)}</span>
        </div>
      </section>

      <section className="sap-services" aria-label="Services">
        {[...checks.checks].sort((a, b) => (a.status === 'OPERATIONAL' ? 1 : 0) - (b.status === 'OPERATIONAL' ? 1 : 0)).map(c => {
          const Icon = ICON[c.key] || Server, tone = TONE[c.status];
          return <article key={c.key} className={`sap-service is-${tone}`}>
            <span className="sap-avatar"><Icon size={24} aria-hidden="true" /></span>
            <div className="sap-service__name">{c.name}</div>
            <div className="sap-service__detail">{readable(c.detail)}</div>
            {c.remedy && c.status !== 'OPERATIONAL' && <div className="sap-service__fix">{c.remedy}</div>}
            <span className={`sap-pill is-${tone}`} style={{ gridColumn: 2 }}>{STATUS_LABEL[c.status]}</span>
          </article>;
        })}
      </section>

      {backups && <section className="sap-card" aria-labelledby="sh-backups">
        <div className="sap-card__head">
          <h2 id="sh-backups">Backups</h2>
          <span className={`sap-pill is-${TONE[backups.status]}`}>{STATUS_LABEL[backups.status]}</span>
        </div>
        <dl className="sap-facts">
          <div className="sap-fact"><dt>Last successful</dt><dd>{when(backups.lastSuccessfulBackup?.finishedAt || backups.lastSuccessfulBackup?.reportedAt)}</dd></div>
          <div className="sap-fact"><dt>Latest result</dt><dd className={lb ? (lb.status === 'SUCCEEDED' ? 'is-ok' : 'is-bad') : ''}>{lb ? (lb.status === 'SUCCEEDED' ? 'Succeeded' : 'Failed') : '—'}</dd></div>
          <div className="sap-fact"><dt>Size</dt><dd>{size(lb?.sizeBytes ?? null)}</dd></div>
          <div className="sap-fact"><dt>Encrypted</dt><dd className={lb?.encrypted ? 'is-ok' : ''}>{yes(lb?.encrypted ?? null)}</dd></div>
          <div className="sap-fact"><dt>Manifest verified</dt><dd className={lb?.manifestVerified ? 'is-ok' : ''}>{yes(lb?.manifestVerified ?? null)}</dd></div>
          <div className="sap-fact"><dt>Missing files</dt><dd className={lb?.missingObjects ? 'is-bad' : ''}>{lb?.missingObjects ?? '—'}</dd></div>
          <div className="sap-fact"><dt>Last restore drill</dt><dd className={backups.lastRestoreDrill ? (backups.lastRestoreDrill.status === 'SUCCEEDED' ? 'is-ok' : 'is-bad') : 'is-warn'}>
            {backups.lastRestoreDrill ? `${backups.lastRestoreDrill.status === 'SUCCEEDED' ? 'Passed' : 'Failed'} · ${when(backups.lastRestoreDrill.reportedAt)}` : 'Never'}</dd></div>
        </dl>
        {lb?.error && <div className="sap-card__body"><span className="sap-pill is-bad no-dot">{lb.error}</span></div>}
      </section>}
    </>}
  </div>;
};
