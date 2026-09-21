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

// Content placeholders live in components/common/Skeleton.tsx; this file owns the spinner only.
