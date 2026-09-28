import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import { PageHeader } from '../../components/common/PageHeader';
import { AsyncState } from '../../components/common/AsyncState';
import { TransactionTimeline } from '../../components/personnel/TransactionTimeline';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import {
  TransactionRecord,
  isActiveTransaction,
  isCompletedTransaction,
  getTransactionStageSummary,
} from '../../models/transactionState';

export const MyTransactions: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'HISTORY'>('CURRENT');
  const [expandedTxId, setExpandedTxId] = useState<number | null>(null);

  const fetchMyTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/transactions/my-transactions');
      setTransactions(res.data?.data || []);
    } catch (err: any) {
      console.error('Failed to load my transactions:', err);
      // Surface real error, never silently fall back to empty state!
      setError(
        err?.response?.data?.message ||
        'Unable to load your transactions from the Division records server. Please check your network connection.'
      );
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime updates
  useRealtimeTransactions(fetchMyTransactions);

  React.useEffect(() => {
    fetchMyTransactions();
  }, [fetchMyTransactions]);

  // Separate current active transactions from completed transaction history
  const currentTransactions = useMemo(
    () => transactions.filter(tx => isActiveTransaction(tx.status)),
    [transactions]
  );

  const historyTransactions = useMemo(
    () => transactions.filter(tx => isCompletedTransaction(tx.status) || !isActiveTransaction(tx.status)),
    [transactions]
  );

  const activeList = activeTab === 'CURRENT' ? currentTransactions : historyTransactions;

  const toggleExpand = (id: number) => {
    setExpandedTxId(prev => (prev === id ? null : id));
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <PageHeader
        title="My 201 File Transactions"
        subtitle="Track ongoing appointment, promotion, reclassification, and credential validation filings"
        breadcrumbs={[
          { label: 'Portal Home', to: '/personnel/home' },
          { label: 'My Transactions' },
        ]}
        actions={
          <Link
            to="/personnel/documents"
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <AppIcon name="folder" size={14} /> My 201 Files
          </Link>
        }
      />

      {/* Section Tabs: Current Active vs Transaction History */}
      <div
        role="tablist"
        aria-label="Transaction categories"
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 20,
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'CURRENT'}
          onClick={() => setActiveTab('CURRENT')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeTab === 'CURRENT' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'CURRENT' ? '#fff' : 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s ease',
          }}
        >
          <AppIcon name="pending" size={15} color={activeTab === 'CURRENT' ? '#fff' : 'currentColor'} />
          <span>Current Transactions</span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '1px 7px',
              borderRadius: 9999,
              background: activeTab === 'CURRENT' ? 'rgba(255,255,255,0.25)' : 'var(--color-bg-secondary)',
              color: activeTab === 'CURRENT' ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            {currentTransactions.length}
          </span>
        </button>

        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'HISTORY'}
          onClick={() => setActiveTab('HISTORY')}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: activeTab === 'HISTORY' ? 'var(--color-primary)' : 'transparent',
            color: activeTab === 'HISTORY' ? '#fff' : 'var(--color-text-secondary)',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s ease',
          }}
        >
          <AppIcon name="history" size={15} color={activeTab === 'HISTORY' ? '#fff' : 'currentColor'} />
          <span>Transaction History</span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '1px 7px',
              borderRadius: 9999,
              background: activeTab === 'HISTORY' ? 'rgba(255,255,255,0.25)' : 'var(--color-bg-secondary)',
              color: activeTab === 'HISTORY' ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            {historyTransactions.length}
          </span>
        </button>
      </div>

      {/* Main Content Area with AsyncState */}
      <AsyncState
        loading={loading}
        error={error}
        onRetry={fetchMyTransactions}
        isEmpty={activeList.length === 0}
        emptyTitle={
          activeTab === 'CURRENT'
            ? 'No Active Transactions'
            : 'No Past Transactions Recorded'
        }
        emptyMessage={
          activeTab === 'CURRENT'
            ? 'You do not have any filings currently undergoing review with AO II or Division HRMO.'
            : 'Completed, approved, and archived transactions will appear here once finalized.'
        }
        emptyAction={
          activeTab === 'CURRENT'
            ? {
                label: 'View Open Promotion Vacancies',
                to: '/personnel/home',
              }
            : undefined
        }
        loadingText="Loading transaction records from Division database..."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeList.map(tx => {
            const summary = getTransactionStageSummary(tx);
            const isDeficiency = tx.status === 'DEFICIENCY';
            const isExpanded = expandedTxId === tx.id || isDeficiency; // Auto-expand deficiency to make action obvious

            return (
              <div
                key={tx.id}
                className="card"
                style={{
                  padding: 20,
                  borderRadius: 16,
                  border: isDeficiency
                    ? '1.5px solid #ef4444'
                    : '1px solid var(--color-border)',
                  background: isDeficiency ? 'rgba(239, 68, 68, 0.02)' : 'var(--color-bg-card)',
                  boxShadow: isDeficiency ? '0 4px 12px rgba(239, 68, 68, 0.08)' : undefined,
                }}
              >
                {/* Transaction Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: 800,
                          fontSize: '0.8125rem',
                          color: 'var(--color-primary)',
                          background: 'rgba(2, 132, 199, 0.08)',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        TRX-{String(tx.id).padStart(4, '0')}
                      </span>
                      <strong style={{ fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                        {tx.transactionType?.name || 'HR Filing'}
                      </strong>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        Filed: {new Date(tx.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      <span>·</span>
                      <span>
                        Stage: <strong style={{ color: summary.stageColor }}>{summary.stageTitle}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Reviewer: <strong>{summary.ownerLabel}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <StatusBadge status={tx.status} />

                    <Link
                      to={`/personnel/checklist?txId=${tx.id}`}
                      className={`btn btn-sm ${isDeficiency ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 700,
                        textDecoration: 'none',
                        background: isDeficiency ? '#dc2626' : undefined,
                        borderColor: isDeficiency ? '#dc2626' : undefined,
                        color: isDeficiency ? '#fff' : undefined,
                      }}
                    >
                      <AppIcon name={isDeficiency ? 'upload' : 'checklist'} size={14} color={isDeficiency ? '#fff' : 'currentColor'} />
                      <span>{isDeficiency ? 'Replace Document' : 'Open Checklist'}</span>
                    </Link>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleExpand(tx.id)}
                      aria-expanded={isExpanded}
                      style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {isExpanded ? 'Hide Timeline' : 'View Timeline'}
                      </span>
                      <AppIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} />
                    </button>
                  </div>
                </div>

                {/* Status Guidance Strip */}
                <div
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    border: '1px solid var(--color-border)',
                    marginBottom: isExpanded ? 16 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="location" size={14} color={summary.stageColor} />
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      <strong>Next Expected Action:</strong> {summary.nextExpectedAction}
                    </span>
                  </div>
                  {tx.complianceScore !== undefined && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                      Compliance: {tx.complianceScore}%
                    </span>
                  )}
                </div>

                {/* Chronological Event Timeline Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: 16,
                      marginTop: 12,
                    }}
                  >
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      DepEd Processing Lifecycle Timeline
                    </div>
                    <TransactionTimeline transaction={tx} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AsyncState>
    </div>
  );
};
