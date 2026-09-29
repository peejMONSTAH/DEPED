import React from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from './AppIcon';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string | React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  badge?: {
    label: string;
    tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  };
  actions?: React.ReactNode;
}

const TONE_STYLES = {
  primary: { bg: 'rgba(2, 132, 199, 0.12)', fg: '#0284c7', border: 'rgba(2, 132, 199, 0.25)' },
  success: { bg: 'rgba(16, 185, 129, 0.12)', fg: '#059669', border: 'rgba(16, 185, 129, 0.25)' },
  warning: { bg: 'rgba(245, 158, 11, 0.12)', fg: '#d97706', border: 'rgba(245, 158, 11, 0.25)' },
  danger: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', border: 'rgba(239, 68, 68, 0.25)' },
  info: { bg: 'rgba(99, 102, 241, 0.12)', fg: '#4f46e5', border: 'rgba(99, 102, 241, 0.25)' },
  neutral: { bg: 'rgba(100, 116, 139, 0.12)', fg: '#475569', border: 'rgba(100, 116, 139, 0.25)' },
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  badge,
  actions,
}) => {
  const badgeStyle = badge ? TONE_STYLES[badge.tone || 'primary'] : null;

  return (
    <header className="page-header-container" style={{ marginBottom: 24 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
          <ol
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontSize: '0.8125rem',
              color: 'var(--color-text-muted)',
              flexWrap: 'wrap',
            }}
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <li key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      style={{
                        color: 'var(--color-text-secondary)',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: isLast ? 700 : 500, color: isLast ? 'var(--color-text-primary)' : 'inherit' }}>
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <AppIcon name="chevron-right" size={12} color="var(--color-text-muted)" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '1.375rem',
                fontWeight: 800,
                margin: 0,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              {title}
            </h1>
            {badge && badgeStyle && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 9999,
                  background: badgeStyle.bg,
                  color: badgeStyle.fg,
                  border: `1px solid ${badgeStyle.border}`,
                  letterSpacing: '0.02em',
                }}
              >
                {badge.label}
              </span>
            )}
          </div>
          {subtitle && (
            <div
              style={{
                marginTop: 4,
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {actions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              flexShrink: 0,
              maxWidth: '100%',
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};
