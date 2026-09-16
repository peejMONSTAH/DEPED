import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullPage?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', text, fullPage }) => {
  const sizeClass = size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : '';

  if (fullPage) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        background: 'var(--color-bg-workspace)',
      }}>
        <div style={{
          width: 56, height: 56,
          background: 'linear-gradient(135deg, var(--color-primary-dark), var(--color-primary))',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', fontWeight: 900, color: 'white',
          marginBottom: 8,
        }}>E</div>
        <div className={`spinner spinner-lg`} />
        <p className="text-sm text-muted">Loading Digital 201…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className={`spinner ${sizeClass}`} />
      {text && <span className="text-sm text-muted">{text}</span>}
    </div>
  );
};

export const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}>
        <div className="skeleton" style={{ height: 18, borderRadius: 4 }} />
      </td>
    ))}
  </tr>
);

export const SkeletonCard: React.FC = () => (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="skeleton" style={{ height: 20, width: '60%', borderRadius: 4 }} />
    <div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 4 }} />
    <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
  </div>
);
