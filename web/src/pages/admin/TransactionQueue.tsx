import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { SkeletonTable, SkeletonBox } from '../../components/common/Skeleton';
import { SmartEmptyState } from '../../components/common/SmartEmptyState';
import { AppIcon } from '../../components/common/AppIcon';
import { transactionsApi } from '../../api/transactions.api';
import { isAccessDenied, accessDeniedMessage } from '../../api/access';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import type { Transaction } from '../../types';
import { clickableRow } from '../../a11y/clickable';

interface FilterTab {
  id: string;
  label: string;
  dotClass: string;
}

const FILTER_TABS: FilterTab[] = [
  { id: 'All', label: 'All', dotClass: 'dot-all' },
  { id: 'DRAFT', label: 'Draft', dotClass: 'dot-draft' },
  { id: 'PENDING_VALIDATION', label: 'Under AO II Review', dotClass: 'dot-ao2' },
  { id: 'FOR_APPROVAL', label: 'Under HRMO Review', dotClass: 'dot-hrmo' },
  { id: 'DEFICIENCY', label: 'Returned by AO II', dotClass: 'dot-returned' },
  { id: 'APPROVED', label: 'Approved by HRMO', dotClass: 'dot-approved' },
  { id: 'REJECTED', label: 'Rejected', dotClass: 'dot-rejected' },
];

export const TransactionQueue: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const { id: routeTxId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const { user } = useAuthContext();
  const { addToast } = useToast();
  const canValidate = user?.role === 'AO_II' || user?.role === 'SYSTEM_ADMIN';
  const canApprove = user?.role === 'HRMO' || user?.role === 'SYSTEM_ADMIN';

  // The record the officer is looking at now. A response for any other id
  // arrived late and must not replace what is on screen.
  const requestedTxId = useRef<number | null>(null);

  const loadTransactionDetail = useCallback(async (txId: number) => {
    requestedTxId.current = txId;
    setIsLoadingDetail(true);
    try {
      const res = await transactionsApi.getById(txId);
      if (requestedTxId.current !== txId) return;
      setSelectedTx(res.data?.data ?? null);
    } catch (err) {
      if (requestedTxId.current !== txId) return;
      if (isAccessDenied(err)) {
        // A copied link or edited id: show nothing of the record, say why, and
        // return to the queue the server did return.
        requestedTxId.current = null;
        setSelectedTx(null);
        addToast(accessDeniedMessage('transaction'), 'ERROR');
        navigate('/admin/transactions', { replace: true });
      } else {
        console.error('Failed to load transaction details:', err);
      }
    } finally {
      if (requestedTxId.current === txId || requestedTxId.current === null) setIsLoadingDetail(false);
    }
  }, [addToast, navigate]);

  useEffect(() => {
    if (routeTxId) {
      const parsedId = parseInt(routeTxId, 10);
      if (!isNaN(parsedId)) {
        const found = transactions.find(t => t.id === parsedId);
        // Never keep showing a different record while this one loads.
        setSelectedTx((prev: any) => (prev?.id === parsedId ? prev : (found ?? null)));
        loadTransactionDetail(parsedId);
      } else {
        setSelectedTx(null);
        navigate('/admin/transactions', { replace: true });
      }
    } else {
      requestedTxId.current = null;
      setSelectedTx(null);
    }
  }, [routeTxId, transactions, loadTransactionDetail, navigate]);

  const handleCloseModal = () => {
    setSelectedTx(null);
    navigate('/admin/transactions');
  };

  const loadTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: Record<string, any> = { page, limit: 15 };
      if (statusFilter !== 'All') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await transactionsApi.getAll(params);
      const data = res.data?.data || [];
      setTransactions(data);
      setTotalPages(res.data?.pagination?.totalPages || 1);
      setTotalItems(res.data?.pagination?.totalItems ?? data.length);
    } catch {
      // Handled by interceptor
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Realtime updates
  useRealtimeTransactions(loadTransactions);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTransactions();
  };

  // Quick stats summary computation
  const stats = useMemo(() => {
    const total = totalItems;
    const pendingAO2 = transactions.filter(t =>
      ['PENDING_VALIDATION', 'SUBMITTED_TO_AO2', 'SUBMITTED'].includes(t.status)
    ).length;
    const pendingHRMO = transactions.filter(t => t.status === 'FOR_APPROVAL').length;
    const approved = transactions.filter(t =>
      ['APPROVED', 'APPROVED_BY_HRMO', 'COMPLETED'].includes(t.status)
    ).length;
    return { total, pendingAO2, pendingHRMO, approved };
  }, [transactions, totalItems]);

  return (
    <div className="animate-fade-in">
      {/* Topbar */}
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0 }}>Transaction Queue</h1>
      </div>

      <div className="page-content">
        {/* Quick Stats Chips */}
        <div className="tq-header-chips">
          <div className="tq-stat-chip">
            <span style={{ color: 'var(--color-text-muted)' }}>Total In Queue:</span>
            <span className="tq-stat-val">{stats.total}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-ao2" />
            <span>AO II Verification:</span>
            <span className="tq-stat-val">{stats.pendingAO2}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-hrmo" />
            <span>HRMO Certification:</span>
            <span className="tq-stat-val">{stats.pendingHRMO}</span>
          </div>
          <div className="tq-stat-chip">
            <span className="tq-pill-dot dot-approved" />
            <span>Approved Records:</span>
            <span className="tq-stat-val">{stats.approved}</span>
          </div>
        </div>

        {/* Toolbar: Search and Filter Pills */}
        <div className="tq-toolbar">
          {/* Integrated Search Input */}
          <form onSubmit={handleSearchSubmit} className="tq-search-box">
            <span className="tq-search-icon">
              <AppIcon name="search" size={16} />
            </span>
            <input
              aria-label="Search by personnel, employee ID, or transaction type"
              type="text"
              className="tq-search-input"
              style={{ paddingLeft: '44px' }}
              placeholder="Search by personnel, employee ID, or transaction type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="tq-search-clear"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </form>

          {/* Clean Segmented Filter Pills (NO DUPLICATES) */}
          <div className="tq-filter-pills-row">
            {FILTER_TABS.map(tab => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`tq-filter-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                >
                  <span className={`tq-pill-dot ${tab.dotClass}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table / Empty / Skeleton State */}
        {isLoading ? (
          <SkeletonTable rows={6} columns={7} />
        ) : transactions.length === 0 ? (
          search ? (
            <SmartEmptyState
              type="no-search-results"
              query={search}
              primaryAction={{
                label: 'Clear Search',
                onClick: () => setSearch(''),
                icon: 'search',
              }}
              secondaryAction={statusFilter !== 'All' ? {
                label: 'Reset Status Filter',
                onClick: () => {
                  setStatusFilter('All');
                  setPage(1);
                },
              } : undefined}
            />
          ) : statusFilter !== 'All' ? (
            <SmartEmptyState
              type="no-filter-match"
              category={statusFilter}
              primaryAction={{
                label: 'Show All Transactions',
                onClick: () => {
                  setStatusFilter('All');
                  setPage(1);
                },
              }}
            />
          ) : (
            <SmartEmptyState
              type="queue-cleared"
              title="Transaction Queue Is Clear"
            />
          )
        ) : (
          <div className="table-wrapper bento-card" style={{ padding: 0, margin: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>ID</th>
                  <th>Personnel</th>
                  <th>Employee ID</th>
                  <th>Transaction Type</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: 'right', paddingRight: '24px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const initials = tx.personnel
                    ? `${tx.personnel.firstName?.[0] || ''}${tx.personnel.lastName?.[0] || ''}`.toUpperCase()
                    : 'EP';
                  const fullName = tx.personnel
                    ? `${tx.personnel.firstName} ${tx.personnel.lastName}`
                    : 'DepEd Personnel';
                  const isPromotion =
                    (tx as any).isPromotion ||
                    tx.transactionType?.name?.toLowerCase().includes('promotion');

                  return (
                    <tr
                      key={tx.id}
                      style={{ cursor: 'pointer' }}
                      {...clickableRow(() => {
                        setSelectedTx(tx);
                        navigate(`/admin/transactions/${tx.id}`);
                        loadTransactionDetail(tx.id);
                      })}
                    >
                      {/* ID Badge */}
                      <td>
                        <span className="tq-trx-id-badge">TRX-{tx.id}</span>
                      </td>

                      {/* Personnel Info Cell */}
                      <td>
                        <div className="tq-personnel-cell">
                          <div className="tq-personnel-avatar">{initials}</div>
                          <div className="tq-personnel-info">
                            <span className="tq-personnel-name">{fullName}</span>
                            <span className="tq-personnel-desc">
                              {tx.personnel?.designation || 'Division Personnel'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td
                        className="tabular-nums"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          color: '#4B5563',
                          fontWeight: 500,
                        }}
                      >
                        {tx.personnel?.employeeId || '—'}
                      </td>

                      {/* Transaction Type */}
                      <td>
                        <div style={{ fontWeight: 600, color: '#141416' }}>
                          {tx.transactionType?.name || 'Standard Request'}
                        </div>
                        {isPromotion && (
                          <div style={{ marginTop: 3 }}>
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(139, 92, 246, 0.12)',
                                color: '#7C3AED',
                                border: '1px solid rgba(139, 92, 246, 0.25)',
                                fontWeight: 700,
                                fontSize: 10,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                              }}
                            >
                              <AppIcon name="promotions" size={11} color="#7C3AED" />
                              Promotion Cycle
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td>
                        <StatusBadge status={tx.status} />
                      </td>

                      {/* Submission Date */}
                      <td
                        className="tabular-nums"
                        style={{ color: '#6B7280', fontSize: 13 }}
                      >
                        {tx.submissionDate || (tx as any).createdAt
                          ? new Date(
                              tx.submissionDate || (tx as any).createdAt
                            ).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Not submitted'}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                        <div
                          className="tq-action-group"
                          style={{ justifyContent: 'flex-end' }}
                        >
                          <button
                            type="button"
                            className="tq-btn-view"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTx(tx);
                              navigate(`/admin/transactions/${tx.id}`);
                              loadTransactionDetail(tx.id);
                            }}
                          >
                            View
                          </button>

                          {['PENDING_VALIDATION', 'SUBMITTED_TO_AO2', 'SUBMITTED'].includes(
                            tx.status
                          ) &&
                            canValidate && (
                              <Link
                                to={`/admin/documents?txId=${tx.id}`}
                                className="tq-btn-action"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Validate
                              </Link>
                            )}

                          {tx.status === 'FOR_APPROVAL' && canApprove && (
                            <Link
                              to={`/admin/approvals?txId=${tx.id}`}
                              className="tq-btn-action"
                              style={{ background: '#16A34A' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Approve
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination" style={{ marginTop: 20 }}>
            <button
              className="pagination-btn"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`pagination-btn ${p === page ? 'active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="pagination-btn"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Transaction Dossier & Details Modal */}
      {selectedTx && (
        <ModalOverlay onDismiss={handleCloseModal}
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 1060,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={handleCloseModal}
        >
          <div
            className="animate-scale-in"
            style={{
              maxWidth: '740px',
              width: '100%',
              borderRadius: '20px',
              backgroundColor: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                borderBottom: '1px solid var(--color-border)',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    color: '#3B82F6',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  TRX-{selectedTx.id}
                </span>
                <div>
                  <h3
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedTx.transactionType?.name || 'Personnel Transaction'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    Transaction Dossier & Verification Overview
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <StatusBadge status={selectedTx.status} />
                <button
                  type="button"
                  onClick={handleCloseModal}
                  aria-label="Close modal"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: '20px 24px',
                overflowY: 'auto',
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                backgroundColor: 'var(--color-bg-card)',
              }}
            >
              {isLoadingDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <SkeletonBox width={44} height={44} borderRadius={12} />
                    <div style={{ flex: 1 }}>
                      <SkeletonBox width="60%" height={20} borderRadius={6} style={{ marginBottom: 6 }} />
                      <SkeletonBox width="40%" height={14} borderRadius={4} />
                    </div>
                  </div>
                  <SkeletonBox height={60} borderRadius={12} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-3, repeat(3, 1fr))', gap: 12 }}>
                    <SkeletonBox height={64} borderRadius={10} />
                    <SkeletonBox height={64} borderRadius={10} />
                    <SkeletonBox height={64} borderRadius={10} />
                  </div>
                  <SkeletonBox height={100} borderRadius={12} />
                </div>
              ) : (
                <>
                  {/* Personnel Summary Card */}
                  <div
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      flexShrink: 0,
                    }}
                  >
                    {selectedTx.personnel
                      ? `${selectedTx.personnel.firstName?.[0] || ''}${selectedTx.personnel.lastName?.[0] || ''}`.toUpperCase()
                      : 'EP'}
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      {selectedTx.personnel
                        ? `${selectedTx.personnel.firstName} ${selectedTx.personnel.lastName}`
                        : 'DepEd Personnel'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      {selectedTx.personnel?.designation || 'Division Personnel'} •{' '}
                      <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                        {selectedTx.personnel?.station || selectedTx.personnel?.school || 'SDO Koronadal City'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      fontWeight: 600,
                    }}
                  >
                    EMP: {selectedTx.personnel?.employeeId || '—'}
                  </span>
                </div>
              </div>

              {/* Promotion / Special Context Banner */}
              {(selectedTx.isPromotion || selectedTx.promotionDetails || selectedTx.transactionType?.name?.toLowerCase().includes('promotion')) && (
                <div
                  style={{
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AppIcon name="promotions" size={20} color="#7C3AED" />
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#7C3AED' }}>
                        Official Promotion Cycle Appointment
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {selectedTx.promotionDetails?.cycleName || 'DepEd Merit Selection & Promotion Cycle'}
                      </div>
                    </div>
                  </div>

                  {selectedTx.promotionDetails?.targetPosition && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        backgroundColor: '#7C3AED',
                        color: '#FFFFFF',
                        padding: '3px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      Target: {selectedTx.promotionDetails.targetPosition}
                    </span>
                  )}
                </div>
              )}

              {/* Transaction Key Details Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Submission Date
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
                    {selectedTx.submissionDate || selectedTx.createdAt
                      ? new Date(selectedTx.submissionDate || selectedTx.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Not submitted'}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Current Assignee
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
                    {selectedTx.currentAssignee?.email || 'AO II Evaluation Pool'}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Compliance Score
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
                    {selectedTx.complianceScore !== undefined ? `${selectedTx.complianceScore}% complete` : 'Not calculated'}
                  </div>
                </div>
              </div>

              {/* Remarks / Notes */}
              {selectedTx.remarks && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                    borderLeft: '4px solid var(--color-primary)',
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <strong style={{ color: 'var(--color-text-primary)' }}>Remarks / Notes:</strong> {selectedTx.remarks}
                </div>
              )}

              {/* Uploaded Documents Section */}
              <div>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Uploaded 201 Requirement Documents ({selectedTx.uploadedDocuments?.length || 0})</span>
                  {selectedTx.uploadedDocuments?.length > 0 && canValidate && (
                    <Link
                      to={`/admin/documents?txId=${selectedTx.id}`}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        textDecoration: 'none',
                      }}
                    >
                      Open in Validation Tool →
                    </Link>
                  )}
                </div>

                {selectedTx.uploadedDocuments && selectedTx.uploadedDocuments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedTx.uploadedDocuments.map((doc: any) => (
                      <div
                        key={doc.id}
                        style={{
                          backgroundColor: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <AppIcon name="document" size={16} color="var(--color-text-muted)" />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                color: 'var(--color-text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {doc.requirementTemplate?.name || doc.fileName}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                              {doc.fileName} {doc.validatedBy?.email && `• Verified by ${doc.validatedBy.email}`}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`badge ${
                            doc.status === 'VALIDATED' || doc.status === 'APPROVED'
                              ? 'badge-approved'
                              : doc.status === 'REJECTED' || doc.status === 'DEFICIENT'
                              ? 'badge-deficiency'
                              : 'badge-pending'
                          }`}
                        >
                          {doc.status || 'UPLOADED'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '18px',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      textAlign: 'center',
                      fontSize: '0.8125rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    No uploaded documents attached to this transaction record.
                  </div>
                )}
              </div>

              {/* Audit / Validation History Timeline */}
              {selectedTx.history && selectedTx.history.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-secondary)',
                      marginBottom: '10px',
                    }}
                  >
                    Audit & Processing Timeline
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedTx.history.map((h: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{h.action}</strong>
                          <span style={{ color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                            by {h.user?.email || 'System'} ({h.user?.role?.name || 'ADMIN'})
                          </span>
                        </div>
                        <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-tertiary)',
                flexShrink: 0,
              }}
            >
              {['PENDING_VALIDATION', 'SUBMITTED_TO_AO2', 'SUBMITTED'].includes(selectedTx.status) && canValidate && (
                <Link
                  to={`/admin/documents?txId=${selectedTx.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#2563EB', color: '#FFF' }}
                >
                  Validate Documents
                </Link>
              )}

              {selectedTx.status === 'FOR_APPROVAL' && canApprove && (
                <Link
                  to={`/admin/approvals?txId=${selectedTx.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#16A34A', color: '#FFF' }}
                >
                  Review for Approval
                </Link>
              )}

              {selectedTx.isPromotion && (
                <Link
                  to="/admin/promotions"
                  className="btn btn-secondary btn-sm"
                >
                  Promotions Board
                </Link>
              )}

            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
};
