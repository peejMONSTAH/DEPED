import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface EminenceLogoProps {
  /**
   * 'full': Large hero wordmark with subtext (ideal for login/register screen)
   * 'wordmark': Sleek horizontal logo for headers/sidebars
   * 'mark': Typographic compact text mark ('e.')
   */
  variant?: 'full' | 'wordmark' | 'mark';
  /**
   * Size multiplier or height category
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Tone: 'auto' adapts to current theme; 'light' forces dark text on light surface; 'dark' forces white text on dark surface
   */
  tone?: 'light' | 'dark' | 'auto';
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Custom style overrides
   */
  style?: React.CSSProperties;
}

export const EminenceLogo: React.FC<EminenceLogoProps> = ({
  variant = 'full',
  size = 'md',
  tone = 'auto',
  className = '',
  style = {},
}) => {
  let isCurrentThemeLight = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { theme } = useTheme();
    isCurrentThemeLight = theme === 'light';
  } catch {
    if (typeof document !== 'undefined') {
      isCurrentThemeLight = document.documentElement.getAttribute('data-theme') === 'light';
    }
  }

  const isLight = tone === 'auto' ? isCurrentThemeLight : tone === 'light';

  // Height and font dimensions based on size prop
  const getDimensions = () => {
    switch (size) {
      case 'sm':
        return { height: 28, fullHeight: 44, fontSize: 16, badgeSize: 9 };
      case 'md':
        return { height: 36, fullHeight: 60, fontSize: 20, badgeSize: 11 };
      case 'lg':
        return { height: 48, fullHeight: 80, fontSize: 26, badgeSize: 13 };
      case 'xl':
        return { height: 64, fullHeight: 110, fontSize: 34, badgeSize: 15 };
      default:
        return { height: 36, fullHeight: 60, fontSize: 20, badgeSize: 11 };
    }
  };

  const { fontSize, badgeSize } = getDimensions();

  if (variant === 'mark') {
    return (
      <div 
        className={`eminence-text-logo mark ${className}`} 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
          fontWeight: 800,
          userSelect: 'none',
          ...style 
        }}
      >
        <span 
          style={{ 
            fontSize: `${fontSize * 1.3}px`,
            letterSpacing: '-0.03em',
            color: isLight ? '#1E3A8A' : '#FFFFFF',
            fontWeight: 800,
          }}
        >
          E<span style={{ color: '#DC2626' }}>.</span>
        </span>
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div 
        className={`eminence-text-logo wordmark ${className}`}
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '8px',
          fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
          userSelect: 'none',
          ...style 
        }}
      >
        <span 
          style={{ 
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isLight ? '#0F172A' : '#FFFFFF',
          }}
        >
          EMINENCE<span style={{ color: '#DC2626' }}>.</span>
        </span>
        <span 
          style={{ 
            fontSize: `${badgeSize}px`,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: isLight ? '#1E3A8A' : '#FFFFFF',
            background: isLight ? 'rgba(30, 58, 138, 0.08)' : '#1E3A8A',
            border: isLight ? '1px solid rgba(30, 58, 138, 0.25)' : '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            padding: '2px 6px',
            textTransform: 'uppercase'
          }}
        >
          HRMIS
        </span>
      </div>
    );
  }

  // Full variant (Hero / Sign Up / Login Screen)
  return (
    <div 
      className={`eminence-logo-container ${className}`}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        textAlign: 'center',
        width: '100%',
        margin: '0 auto',
        userSelect: 'none',
        ...style 
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
            fontSize: size === 'xl' ? '36px' : size === 'lg' ? '30px' : '24px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: isLight ? '#0F172A' : '#FFFFFF',
            textTransform: 'uppercase'
          }}
        >
          EMINENCE<span style={{ color: '#DC2626' }}>.</span>
        </span>
        <span
          style={{
            background: isLight ? 'rgba(220, 38, 38, 0.08)' : 'rgba(220, 38, 38, 0.15)',
            border: isLight ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid rgba(220, 38, 38, 0.4)',
            color: isLight ? '#DC2626' : '#FEE2E2',
            fontSize: size === 'xl' ? '14px' : '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            padding: '3px 8px',
            borderRadius: '6px'
          }}
        >
          HRMIS
        </span>
      </div>
      <div
        style={{
          fontSize: size === 'xl' ? '12px' : '10px',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: isLight ? '#64748B' : '#94A3B8'
        }}
      >
        Department of Education • Digital 201 System
      </div>
    </div>
  );
};
