import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import './system-exceptions.css';

type Item = { key: string; text: string; detail?: string; to: string; tone: 'bad' | 'warn' };

/**
 * What needs a System Administrator today, from the existing checks only:
 * service health (including backups), failed emails and waiting account
 * requests. Each links to the page that handles it. A check that cannot be
 * read says so; it is never shown as healthy.
 */
export const SystemExceptions: React.FC = () => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [unchecked, setUnchecked] = useState<string[]>([]);

  const load = useCallback(async () => {
    const out: Item[] = []; const missing: string[] = [];
    const [health, email, requests] = await Promise.allSettled([
      apiClient.get('/admin/operations/health'),
      apiClient.get('/admin/operations/email', { params: { state: 'FAILED', limit: 1 } }),
      apiClient.get('/users/requests', { params: { status: 'PENDING' } }),
    ]);
    if (health.status === 'fulfilled') {
      for (const c of health.value.data?.data?.checks || []) {
        if (c.status === 'OPERATIONAL') continue;
        out.push({ key: `h-${c.key}`, text: `${c.name}: ${c.status === 'UNAVAILABLE' ? 'not working' : c.status === 'UNKNOWN' ? 'no evidence recorded' : c.status === 'NOT_CONFIGURED' ? 'not set up' : 'needs attention'}`,
          detail: c.detail, to: '/admin/health', tone: c.status === 'UNAVAILABLE' ? 'bad' : 'warn' });
      }
    } else missing.push('service health');
    if (email.status === 'fulfilled') {
      const n = email.value.data?.pagination?.totalItems ?? (email.value.data?.data || []).length;
      if (n > 0) out.push({ key: 'email', text: `${n} email${n === 1 ? '' : 's'} could not be sent`, detail: 'Setup links and notices that failed after every retry.', to: '/admin/email', tone: 'bad' });
    } else missing.push('email delivery');
    if (requests.status === 'fulfilled') {
      const n = (requests.value.data?.data || []).filter((r: any) => r.status === 'PENDING').length;
      if (n > 0) out.push({ key: 'req', text: `${n} account request${n === 1 ? '' : 's'} waiting for approval`, to: '/admin/credentials', tone: 'warn' });
    } else missing.push('account requests');
    out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));
    setItems(out); setUnchecked(missing);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="sxe" aria-labelledby="sxe-title">
      <h2 id="sxe-title">Needs attention</h2>
      {items === null ? <p className="sxe__muted" aria-busy="true">Checking…</p>
        : items.length === 0 && unchecked.length === 0 ? <p className="sxe__muted">Nothing needs attention. Health checks passed, no failed emails and no waiting requests.</p>
        : <ul>
          {items.map(i => (
            <li key={i.key} className={`is-${i.tone}`}>
              <div><strong>{i.text}</strong>{i.detail && <span>{i.detail}</span>}</div>
              <Link className="btn btn-secondary btn-sm" to={i.to}>Open</Link>
            </li>
          ))}
          {unchecked.length > 0 && <li className="is-warn"><div><strong>Could not check {unchecked.join(', ')}</strong><span>This is not the same as healthy.</span></div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setItems(null); void load(); }}>Try again</button></li>}
        </ul>}
    </section>
  );
};
