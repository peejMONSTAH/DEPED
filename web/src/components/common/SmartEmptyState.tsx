import React from 'react';
import { AppIcon, IconName } from './AppIcon';
import { humanizeEnum } from '../../constants/transactionStatus';

export type SmartEmptyStateType =
  | 'queue-cleared'
  | 'no-search-results'
  | 'no-filter-match'
  | 'no-records'
  | 'deficiency-cleared'
  | 'error';

interface ActionConfig {
  label: string;
  onClick: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'lime';
}

interface SmartEmptyStateProps {
  type?: SmartEmptyStateType;
  icon?: IconName;
  title?: string;
  description?: string;
  query?: string;
  category?: string;
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  className?: string;
  style?: React.CSSProperties;
}

export const SmartEmptyState: React.FC<SmartEmptyStateProps> = ({
  type = 'no-records',
  icon,
  title,
  description,
  query,
  category,
  primaryAction,
  secondaryAction,
  className = '',
  style,
}) => {
  // Derive smart defaults based on state type
  let resolvedIcon: IconName = icon || 'repository';
  let resolvedTitle = title;
  let resolvedDesc = description;
  let iconColor = 'var(--color-primary)';
  let iconBg = 'rgba(215, 248, 74, 0.15)';
  let iconBorder = 'rgba(215, 248, 74, 0.3)';

  switch (type) {
    case 'queue-cleared':
      resolvedIcon = icon || 'approved';
      resolvedTitle = title || 'All Caught Up — Queue Is Clear';
      resolvedDesc = description || '';
      iconColor = 'var(--color-success)';
      iconBg = 'rgba(16, 185, 129, 0.12)';
      iconBorder = 'rgba(16, 185, 129, 0.28)';
      break;

    case 'no-search-results':
      resolvedIcon = icon || 'search';
      resolvedTitle = title || (query ? `No results for "${query}"` : 'No matching records found');
      resolvedDesc = description || '';
      iconColor = '#3F9265';
      iconBg = 'rgba(59, 130, 246, 0.12)';
      iconBorder = 'rgba(59, 130, 246, 0.28)';
      break;

    case 'no-filter-match':
      resolvedIcon = icon || 'compliance';
      // Categories are often backend enums; never show "SOME_VALUE" verbatim.
      resolvedTitle = title || (category ? `No records match "${humanizeEnum(category)}"` : 'No records match filter');
      resolvedDesc = description || '';
      iconColor = '#C79A2E';
      iconBg = 'rgba(139, 92, 246, 0.12)';
      iconBorder = 'rgba(139, 92, 246, 0.28)';
      break;

    case 'deficiency-cleared':
      resolvedIcon = icon || 'compliant';
      resolvedTitle = title || 'Zero Deficiencies Recorded';
      resolvedDesc = description || '';
      iconColor = '#10B981';
      iconBg = 'rgba(16, 185, 129, 0.12)';
      iconBorder = 'rgba(16, 185, 129, 0.28)';
      break;

    case 'error':
      resolvedIcon = icon || 'warning';
      resolvedTitle = title || 'Unable to Load Records';
      resolvedDesc = description || 'Please check your connection and try again.';
      iconColor = 'var(--color-error)';
      iconBg = 'rgba(239, 68, 68, 0.12)';
      iconBorder = 'rgba(239, 68, 68, 0.28)';
      break;

    default:
      resolvedTitle = title || 'No Records Found';
      resolvedDesc = description || '';
      break;
  }

  return (
    <div className={`empty-state ${className}`} style={style}>
      <div
        className="empty-state-icon"
        style={{
          background: iconBg,
          borderColor: iconBorder,
          color: iconColor,
        }}
      >
        <AppIcon name={resolvedIcon} size={32} color={iconColor} />
      </div>

      <h3 className="empty-state-title" style={{ marginBottom: resolvedDesc ? undefined : (primaryAction || secondaryAction ? 14 : 0) }}>
        {resolvedTitle}
      </h3>
      {resolvedDesc && <p className="empty-state-text">{resolvedDesc}</p>}

      {(primaryAction || secondaryAction) && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {primaryAction && (
            <button
              type="button"
              className={`btn btn-sm ${
                primaryAction.variant === 'secondary'
                  ? 'btn-secondary'
                  : primaryAction.variant === 'lime'
                  ? 'btn-lime'
                  : 'btn-primary'
              }`}
              onClick={primaryAction.onClick}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {primaryAction.icon && <AppIcon name={primaryAction.icon} size={14} />}
              <span>{primaryAction.label}</span>
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              className={`btn btn-sm ${
                secondaryAction.variant === 'primary' ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={secondaryAction.onClick}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {secondaryAction.icon && <AppIcon name={secondaryAction.icon} size={14} />}
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
