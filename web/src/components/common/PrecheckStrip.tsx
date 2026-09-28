import React, { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import './precheck-strip.css';

type Check = { key: string; state: 'ok' | 'warn' | 'unknown'; label: string };
type Result = { readable: boolean; checks: Check[]; facts: string[] };

const ICON = { ok: '✓', warn: '⚠', unknown: '?' } as const;

/**
 * Automatic hints for the document on screen: right document, right person,
 * still valid, key facts. Read by OCR, so they are hints only; the reviewer
 * still decides. Loads per document and is silent until it has something.
 */
export const PrecheckStrip: React.FC<{ url: string | null }> = ({ url }) => {
  const [state, setState] = useState<{ url: string; result?: Result; error?: string } | null>(null);

  useEffect(() => {
    if (!url) { setState(null); return; }
    let live = true;
    setState({ url });
    apiClient.get(url)
      .then(res => { if (live) setState({ url, result: res.data?.data }); })
      .catch(err => { if (live) setState({ url, error: err?.response?.data?.message || 'The automatic check is unavailable.' }); });
    return () => { live = false; };
  }, [url]);

  if (!url || !state || state.url !== url) return null;
  if (!state.result && !state.error) {
    return <div className="pcs pcs--loading" aria-busy="true">Reading the document…</div>;
  }
  if (state.error) return <div className="pcs pcs--muted" role="status">{state.error} Check this one by eye.</div>;

  const { checks, facts } = state.result!;
  const worst = checks.some(c => c.state === 'warn') ? 'warn' : checks.every(c => c.state === 'ok') ? 'ok' : 'unknown';
  return (
    <section className={`pcs pcs--${worst}`} aria-label="Automatic check">
      <ul>
        {checks.map(c => (
          <li key={c.key} className={`pcs__item is-${c.state}`}>
            <span aria-hidden="true">{ICON[c.state]}</span> {c.label}
          </li>
        ))}
        {facts.map(f => <li key={f} className="pcs__fact">{f}</li>)}
      </ul>
      <p className="pcs__note">Read automatically. Confirm on the document.</p>
    </section>
  );
};
