import React from 'react';
import './digital201-brand.css';

export interface Digital201LogoProps {
  variant?: 'full' | 'wordmark' | 'mark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark' | 'auto';
  /** Kept for existing callers: the lockup artwork already carries the name. */
  showTag?: boolean;
  subtitle?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Digital 201 brand: the file-and-check mark on its own, or the mark with the
 * DIGITAL 201 wordmark (header lockup). Artwork lives in /public/brand.
 */
export const Digital201Logo: React.FC<Digital201LogoProps> = ({
  variant = 'wordmark',
  size = 'md',
  tone = 'auto',
  subtitle,
  className = '',
  style,
}) => {
  const rootClasses = ['digital201-brand', `digital201-brand--${variant}`, `digital201-brand--${size}`, `digital201-brand--${tone}`, className]
    .filter(Boolean).join(' ');

  if (variant === 'mark') {
    return (
      <span className={rootClasses} style={style} aria-label="Digital 201">
        <img className="digital201-brand-img digital201-brand-img--mark" src="/brand/digital201-logo-mark.png" alt="" width={236} height={256} />
      </span>
    );
  }

  const lockup = <img className="digital201-brand-img digital201-brand-img--lockup" src="/brand/digital201-header-lockup.png" alt="" width={584} height={120} />;
  return (
    <span className={rootClasses} style={style} aria-label="Digital 201">
      {variant === 'full' ? (
        <span className="digital201-brand-copy">
          {lockup}
          <span className="digital201-brand-subtitle">{subtitle || 'Personnel Information System · DepEd Koronadal'}</span>
        </span>
      ) : lockup}
    </span>
  );
};
