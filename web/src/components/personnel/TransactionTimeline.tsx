import React from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../common/AppIcon';
import {
  TransactionRecord,
  TimelineEvent,
  buildTransactionTimeline,
} from '../../models/transactionState';

interface TransactionTimelineProps {
  transaction: TransactionRecord;
  compact?: boolean;
}

export const TransactionTimeline: React.FC<TransactionTimelineProps> = ({
  transaction,
  compact = false,
}) => {
  const events = buildTransactionTimeline(transaction);

  const getStatusIcon = (event: TimelineEvent) => {
    switch (event.status) {
      case 'COMPLETED':
        return <AppIcon name="check" size={14} color="#059669" />;
      case 'DEFICIENCY':
      case 'REJECTED':
        return <AppIcon name="warning" size={14} color="#dc2626" />;
      case 'CURRENT':
        return <AppIcon name="pending" size={14} color="#d97706" />;
      default:
        return <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-text-muted)' }} />;
    }
  };

  const getStatusDotBg = (event: TimelineEvent) => {
    switch (event.status) {
      case 'COMPLETED':
        return 'rgba(16, 185, 129, 0.15)';
      case 'DEFICIENCY':
      case 'REJECTED':
        return 'rgba(239, 68, 68, 0.15)';
      case 'CURRENT':
        return 'rgba(245, 158, 11, 0.15)';
      default:
        return 'var(--color-bg-secondary)';
    }
  };

  return (
    <div className="transaction-timeline" style={{ position: 'relative', paddingLeft: compact ? 24 : 32 }}>
      {/* Vertical Track */}
      <div
        style={{
          position: 'absolute',
          left: compact ? 11 : 15,
          top: 12,
          bottom: 12,
          width: 2,
          background: 'var(--color-border)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 16 : 24 }}>
        {events.map((evt, idx) => {
          const isDeficiency = evt.status === 'DEFICIENCY';
          const isRejected = evt.status === 'REJECTED';

          return (
            <div key={idx} style={{ position: 'relative' }}>
              {/* Event Marker */}
              <div
                style={{
                  position: 'absolute',
                  left: compact ? -24 : -32,
                  top: 2,
                  width: compact ? 22 : 28,
                  height: compact ? 22 : 28,
                  borderRadius: '50%',
                  background: getStatusDotBg(evt),
                  border: `2px solid ${
                    evt.status === 'COMPLETED'
                      ? '#10b981'
                      : isDeficiency || isRejected
                      ? '#ef4444'
                      : evt.status === 'CURRENT'
                      ? '#f59e0b'
                      : 'var(--color-border)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {getStatusIcon(evt)}
              </div>

              {/* Event Content Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: compact ? '0.8125rem' : '0.9375rem',
                      color: isDeficiency || isRejected ? '#dc2626' : 'var(--color-text-primary)',
                      marginRight: 8,
                    }}
                  >
                    {evt.stageName}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      background: 'var(--color-bg-secondary)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {evt.actorName ? `${evt.actorRole}: ${evt.actorName}` : evt.actorRole}
                  </span>
                </div>

                {evt.timestamp && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(evt.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>

              {/* Event Description */}
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-text-secondary)',
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {evt.description}
              </div>

              {/* Specific Remarks */}
              {evt.remarks && !isDeficiency && (
                <div
                  style={{
                    marginTop: 6,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--color-bg-secondary)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    borderLeft: '3px solid var(--color-primary)',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Note:</span> {evt.remarks}
                </div>
              )}

              {/* Deficiency Alert Branching Box */}
              {isDeficiency && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="warning" size={14} color="#dc2626" /> AO II Deficiency Remarks:
                    </span>
                    {evt.remainingAttempts !== undefined && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309' }}>
                        {evt.remainingAttempts} compliance resubmission attempt{evt.remainingAttempts === 1 ? '' : 's'} remaining
                      </span>
                    )}
                  </div>

                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-primary)', fontStyle: 'italic' }}>
                    "{evt.remarks}"
                  </p>

                  {evt.affectedDocuments && evt.affectedDocuments.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      <strong style={{ color: 'var(--color-text-primary)' }}>Document(s) needing replacement:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {evt.affectedDocuments.map((docName, dIdx) => (
                          <li key={dIdx} style={{ fontWeight: 600, color: '#dc2626' }}>
                            {docName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {evt.actionRequired && (
                    <div style={{ marginTop: 4 }}>
                      <Link
                        to={evt.actionRequired.route}
                        className="btn btn-primary btn-sm"
                        style={{
                          background: '#dc2626',
                          borderColor: '#dc2626',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <AppIcon name="upload" size={12} color="#fff" />
                        {evt.actionRequired.label}
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
