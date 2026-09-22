import React from 'react';

const PolicyRow: React.FC<{ label: string; value: string; note: string }> = ({ label, value, note }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, repeat(2, minmax(0, 1fr)))', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--color-border)' }}>
    <div style={{ fontWeight: 600 }}>{label}</div>
    <div><div style={{ fontWeight: 600 }}>{value}</div><div className="text-xs text-muted" style={{ marginTop: 4 }}>{note}</div></div>
  </div>
);

export const Settings: React.FC = () => (
  <div className="animate-fade-in">
    <div className="topbar"><h1 className="topbar-title" style={{ margin: 0 }}>System Security</h1></div>
    <div className="page-content" style={{ maxWidth: 900 }}>
      <div className="card mb-6">
        <h3 className="card-title">Effective policies</h3>
        <p className="text-sm text-muted">This page is informational. Security policy changes require reviewed server configuration and deployment.</p>
        <PolicyRow label="Multi-factor authentication" value="Not configured" note="The system does not claim MFA protection until a verified second-factor service is connected." />
        <PolicyRow label="Password changes" value="Current password required" note="Changing or resetting a password invalidates previously issued sessions." />
        <PolicyRow label="Document formats" value="PDF, PNG and JPEG" note="The server validates both extension and file signature; the maximum upload size is 10 MB." />
        <PolicyRow label="Authorization" value="Role and school scoped" note="Personnel data and documents are restricted to the owner or an authorized HR role and AO II station scope." />
      </div>
    </div>
  </div>
);
