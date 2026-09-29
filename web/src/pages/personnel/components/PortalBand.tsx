import React from 'react';
import './portal-band.css';

/** Page banner for the personnel portal: title, one plain sentence, and a few live counts. */
export const PortalBand: React.FC<{
  title: string; subtitle?: string; facts?: Array<{ label: string; value: string | number }>;
  actions?: React.ReactNode; children?: React.ReactNode;
}> = ({ title, subtitle, facts, actions, children }) => (
  <header className="pb">
    <div className="pb__text">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {facts && facts.length > 0 && (
      <dl className="pb__facts">
        {facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
      </dl>
    )}
    {actions && <div className="pb__actions">{actions}</div>}
    {children}
  </header>
);

/** The 201 folder as one segment per required file; filled segments are uploaded files. */
export const FolderStrip: React.FC<{ uploaded: number; total: number }> = ({ uploaded, total }) => (
  <div className="pb__folder" role="img" aria-label={`${uploaded} of ${total} required 201 files uploaded`}>
    <span className="pb__folder-cells" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < uploaded ? 'is-on' : ''} />)}
    </span>
    <span className="pb__folder-label">{uploaded === total ? '201 folder complete' : `201 folder · ${uploaded} of ${total} files`}</span>
  </div>
);
