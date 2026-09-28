import React from 'react';
import { AppIcon } from './AppIcon';
import { Link } from 'react-router-dom';

export interface AsyncStateProps {
  loading: boolean;
  error?: string | Error | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: string;
  emptyAction?: {
    label: string;
    onClick?: () => void;
    to?: string;
  };
  loadingText?: string;
  children: React.ReactNode;
}

export const AsyncState: React.FC<AsyncStateProps> = ({
  loading,
  error,
  onRetry,
  isEmpty = false,
  emptyTitle = 'No records found',
  emptyMessage = 'There are currently no items to display.',
  emptyIcon = 'inbox',
  emptyAction,
  loadingText = 'Loading official records...',
  children,
}) => {
  // 1. Loading State
  if (loading) {
    return (
      <div
        className="card"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          border: '1px solid var(--color-border)',
        }}
        role="status"
        aria-live="polite"
      >
        <div
          style={{
            width: 38,
            height: 38,
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
          {loadingText}
        </div>
      </div>
    );
  }

  // 2. Error State (Never mask as empty state!)
  if (error) {
    const errorMsg = typeof error === 'string' ? error : error.message || 'An unexpected error occurred.';
    return (
      <div
        className="card"
        style={{
          padding: '32px 24px',
          background: 'rgba(239, 68, 68, 0.04)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 16,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
        role="alert"
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name="warning" size={24} color="#dc2626" />
        </div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#dc2626' }}>
          Unable to Load Records
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: 440 }}>
          {errorMsg}
        </p>
        {onRetry && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
            }}
          >
            <AppIcon name="refresh" size={14} /> Retry Connection
          </button>
        )}
      </div>
    );
  }

  // 3. Empty State
  if (isEmpty) {
    return (
      <div
        className="card text-center"
        style={{
          padding: '44px 24px',
          border: '1px dashed var(--color-border)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon name={emptyIcon} size={28} />
        </div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
          {emptyTitle}
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)', maxWidth: 400 }}>
          {emptyMessage}
        </p>
        {emptyAction && (
          emptyAction.to ? (
            <Link
              to={emptyAction.to}
              className="btn btn-primary btn-sm"
              style={{ marginTop: 8, fontWeight: 700, textDecoration: 'none' }}
            >
              {emptyAction.label}
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={emptyAction.onClick}
              style={{ marginTop: 8, fontWeight: 700 }}
            >
              {emptyAction.label}
            </button>
          )
        )}
      </div>
    );
  }

  // 4. Normal Content
  return <>{children}</>;
};
