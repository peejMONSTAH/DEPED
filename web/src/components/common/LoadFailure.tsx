import React from 'react';
import { AppIcon } from './AppIcon';

/**
 * A failed request is not an empty result. This says so, and offers Retry.
 *
 * - `LoadFailure`: nothing could be loaded, so there is nothing to show.
 * - `StaleNotice`: an earlier load is still on screen but the latest refresh failed;
 *   the data is marked as possibly out of date instead of being silently kept or dropped.
 */
export const LoadFailure: React.FC<{ what: string; onRetry: () => void; retrying?: boolean; detail?: string }> = ({ what, onRetry, retrying, detail }) => (
  <div role="alert" className="load-failure" style={{
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '20px 22px', borderRadius: 14,
    border: '1px solid #E4B4AE', background: '#FBEDEB', color: '#7A2B22',
  }}>
    <span aria-hidden="true" style={{ display: 'inline-flex' }}><AppIcon name="warning" size={22} color="#B23A2E" /></span>
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <strong style={{ display: 'block', fontSize: '1rem' }}>We could not load {what}.</strong>
      <span style={{ fontSize: '.875rem' }}>
        This is a connection or server problem, not an empty list: there may be work waiting that you cannot see yet.
        {detail ? ` (${detail})` : ''}
      </span>
    </div>
    <button type="button" className="btn btn-primary btn-sm" onClick={onRetry} disabled={retrying}>
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </div>
);

export const StaleNotice: React.FC<{ what: string; since?: Date | null; onRetry: () => void; retrying?: boolean }> = ({ what, since, onRetry, retrying }) => (
  <div role="status" className="load-stale" style={{
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px', borderRadius: 12, marginBottom: 12,
    border: '1px solid #E6D3A0', background: '#FBF5E1', color: '#6B5311', fontSize: '.875rem',
  }}>
    <span style={{ flex: '1 1 240px' }}>
      <strong>May be out of date.</strong> The latest refresh of {what} failed
      {since ? `; this is the list from ${since.toLocaleTimeString()}.` : '.'}
    </span>
    <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </div>
);

/** Some of what was asked for loaded and some did not: the part that is missing is named. */
export const PartialNotice: React.FC<{ missing: string; onRetry: () => void; retrying?: boolean }> = ({ missing, onRetry, retrying }) => (
  <div role="status" className="load-partial" style={{
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 16px', borderRadius: 12, marginBottom: 12,
    border: '1px solid #E6D3A0', background: '#FBF5E1', color: '#6B5311', fontSize: '.875rem',
  }}>
    <span style={{ flex: '1 1 240px' }}><strong>Some information is missing.</strong> {missing}</span>
    <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </div>
);
