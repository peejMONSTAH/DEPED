import React from 'react';
import './digital201-brand.css';

export interface Digital201LogoProps {
  variant?: 'full' | 'wordmark' | 'mark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark' | 'auto';
  showTag?: boolean;
  subtitle?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Digital 201 Minimalist Text-Only Branding Identity
 * Pure typographic brand architecture with zero pictorial icons.
 */
export const Digital201Logo: React.FC<Digital201LogoProps> = ({
  variant = 'wordmark',
  size = 'md',
  tone = 'auto',
  showTag = false,
  subtitle,
  className = '',
  style,
}) => {
  const rootClasses = [
    'digital201-brand',
    `digital201-brand--${variant}`,
    `digital201-brand--${size}`,
    `digital201-brand--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'mark') {
    return (
      <span className={rootClasses} style={style} aria-label="Digital 201">
        <span className="digital201-brand-mark-stamp" aria-hidden="true">
          201<span className="digital201-brand-mark-dot" />
        </span>
      </span>
    );
  }

  const wordmark = (
    <span className="digital201-brand-wordmark">
      <span className="digital201-brand-prefix">DIGITAL</span>
      <span className="digital201-brand-accent">201</span>
      {showTag && <span className="digital201-brand-tag">HRIS</span>}
    </span>
  );

  return (
    <span className={rootClasses} style={style} aria-label="Digital 201">
      {variant === 'full' ? (
        <span className="digital201-brand-copy">
          {wordmark}
          <span className="digital201-brand-subtitle">
            {subtitle || 'Personnel Information System · DepEd Koronadal'}
          </span>
        </span>
      ) : (
        wordmark
      )}
    </span>
  );
};
