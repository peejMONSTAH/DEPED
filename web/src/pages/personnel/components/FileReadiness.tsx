import React from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../components/common/AppIcon';
import { ReadinessSummary } from '../../../models/documentStatus';

interface FileReadinessProps {
  readiness: ReadinessSummary;
}

export const FileReadiness: React.FC<FileReadinessProps> = ({ readiness }) => {
  const getFillColor = () => {
    switch (readiness.statusLevel) {
      case 'complete':
        return '#10b981';
      case 'good':
        return 'var(--color-primary)';
      case 'attention':
        return '#f59e0b';
      case 'critical':
      default:
        return '#ef4444';
    }
  };

  return (
    <div
      className="card"
      style={{
        borderRadius: 16,
        padding: 20,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppIcon name="security" size={18} color="var(--color-primary)" />
          <h2 style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-primary)' }}>
            201 Files
          </h2>
        </div>

        <Link
          to="/personnel/documents"
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>View 201 Files</span>
          <AppIcon name="chevron-right" size={12} />
        </Link>
      </div>

      {/* Progress Metric & Bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text-primary)', lineHeight: 1 }}>
              {readiness.percent}%
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginLeft: 8 }}>
              complete
            </span>
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {readiness.verified} of {readiness.total} required files uploaded
          </span>
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 9999,
            background: 'var(--color-bg-secondary)',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${readiness.percent}%`,
              background: getFillColor(),
              borderRadius: 9999,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      {/* Status Breakdown Pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {/* Uploaded: files on hand. They are checked when used for a promotion. */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>Uploaded</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{readiness.verified}</div>
        </div>

        {/* Missing */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: readiness.missing > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-bg-secondary)',
            border: readiness.missing > 0 ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: readiness.missing > 0 ? '#dc2626' : 'var(--color-text-muted)' }}>
            Missing
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: readiness.missing > 0 ? '#dc2626' : 'var(--color-text-primary)' }}>
            {readiness.missing}
          </div>
        </div>

        {/* Expiring Soon */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: readiness.expiring > 0 ? 'rgba(245, 158, 11, 0.1)' : 'var(--color-bg-secondary)',
            border: readiness.expiring > 0 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: readiness.expiring > 0 ? '#d97706' : 'var(--color-text-muted)' }}>
            Expiring Soon
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: readiness.expiring > 0 ? '#d97706' : 'var(--color-text-primary)' }}>
            {readiness.expiring}
          </div>
        </div>
      </div>
    </div>
  );
};
