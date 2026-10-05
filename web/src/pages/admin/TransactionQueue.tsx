import { humanizeEnum } from '../../constants/transactionStatus';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { SkeletonBox } from '../../components/common/Skeleton';
import { transactionEmptyTitle, transactionStatusLabel } from '../../constants/transactionStatus';
import { AppIcon } from '../../components/common/AppIcon';
import { transactionsApi } from '../../api/transactions.api';
import { isAccessDenied, accessDeniedMessage } from '../../api/access';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import type { Transaction } from '../../types';
import { activateOnKey } from '../../a11y/clickable';
import { Search, ChevronRight } from 'lucide-react';
import './sysadmin-pages.css';
import { LoadFailure, StaleNotice, PartialNotice } from '../../components/common/LoadFailure';
import { ReviewNotice } from '../../components/common/ReviewNotice';

interface FilterTab {
  id: string;
  label: string;
  dotClass: string;
}

const FILTER_TABS: FilterTab[] = [
  { id: 'All', label: 'All', dotClass: 'dot-all' },
  { id: 'DRAFT', label: transactionStatusLabel('DRAFT'), dotClass: 'dot-draft' },
  { id: 'PENDING_VALIDATION', label: transactionStatusLabel('PENDING_VALIDATION'), dotClass: 'dot-ao2' },
  { id: 'FOR_APPROVAL', label: transactionStatusLabel('FOR_APPROVAL'), dotClass: 'dot-hrmo' },
  { id: 'DEFICIENCY', label: transactionStatusLabel('DEFICIENCY'), dotClass: 'dot-returned' },
  { id: 'APPROVED', label: transactionStatusLabel('APPROVED'), dotClass: 'dot-approved' },
  { id: 'REJECTED', label: transactionStatusLabel('REJECTED'), dotClass: 'dot-rejected' },
];

// Roles as people say them, not as stored (AO_II -> AO II).
const ROLE_NAMES: Record<string, string> = { AO_II: 'AO II', HRMO: 'HRMO', SYSTEM_ADMIN: 'System Administrator', TEACHING_PERSONNEL: 'Teaching personnel', NON_TEACHING_PERSONNEL: 'Non-teaching personnel' };
/** Time in the current stage (from when it arrived, not when it was created). */
const waitingFor = (since: string) => { const d = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000); return d <= 0 ? 'Arrived today' : `Waiting ${d} day${d === 1 ? '' : 's'}`; };
const roleLabel = (role?: string) => (role ? ROLE_NAMES[role] || humanizeEnum(role) : 'System');

export const TransactionQueue: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  // Review queues, computed and counted on the server within your scope.
  const [queue, setQueue] = useState<'' | 'awaiting' | 'resubmitted' | 'oldest'>('awaiting');
  const [queueCounts, setQueueCounts] = useState<{ awaitingMyReview?: number; resubmitted?: number; all?: number; pendingValidation?: number; forApproval?: number; approved?: number }>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const { id: routeTxId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  // The record whose full detail is on screen; a re-fetch of it keeps showing it.
  const [loadedDetailId, setLoadedDetailId] = useState<number | null>(null);
  // The row is known but its files and history did not load: say so instead of showing them as absent.
  const [detailFailed, setDetailFailed] = useState(false);
  const hasLoadedList = useRef(false);
  // A failed load is not an empty queue: say so, keep what was loaded (marked stale) and offer Retry.
  const [listFailed, setListFailed] = useState(false);
  const [listLoadedAt, setListLoadedAt] = useState<Date | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { user } = useAuthContext();
  const { addToast } = useToast();
  // What this account may do is decided by the server per transaction (tx.review), not guessed from the role.
  const canApprove = user?.role === 'HRMO';

  // The record the officer is looking at now. A response for any other id
  // arrived late and must not replace what is on screen.
  const requestedTxId = useRef<number | null>(null);

  const loadTransactionDetail = useCallback(async (txId: number) => {
    requestedTxId.current = txId;
    setIsLoadingDetail(true);
    setDetailFailed(false);
    try {
      const res = await transactionsApi.getById(txId);
      if (requestedTxId.current !== txId) return;
      setSelectedTx(res.data?.data ?? null);
      setLoadedDetailId(txId);
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
        setDetailFailed(true);
      }
    } finally {
      if (requestedTxId.current === txId || requestedTxId.current === null) setIsLoadingDetail(false);
    }
  }, [addToast, navigate]);

  // HRMO can undo a disqualification made in error.
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const reopenSelected = async () => {
    if (!selectedTx || reopenReason.trim().length < 10) return;
    setReopening(true);
    try {
      await transactionsApi.reopen(selectedTx.id, reopenReason.trim());
      addToast(`TRX-${selectedTx.id} reopened. The personnel can now replace the deficient documents.`, 'SUCCESS');
      setReopenReason('');
      await loadTransactionDetail(selectedTx.id);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not reopen this transaction.', 'ERROR');
    } finally { setReopening(false); }
  };

  // Read through a ref so a list reload (realtime, paging) does not re-run
  // the effect below and re-fetch or blank the open record.
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  useEffect(() => {
    if (routeTxId) {
      const parsedId = parseInt(routeTxId, 10);
      if (!isNaN(parsedId)) {
        const found = transactionsRef.current.find(t => t.id === parsedId);
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
  }, [routeTxId, loadTransactionDetail, navigate]);

  const handleCloseModal = () => {
    setSelectedTx(null);
    navigate('/admin/transactions');
  };

  const loadTransactions = useCallback(async () => {
    try {
      // Skeleton on the first load only; live reloads refresh in place.
      if (!hasLoadedList.current) setIsLoading(true);
      const params: Record<string, any> = { page, limit: 15 };
      if (queue) params.queue = queue;
      else if (statusFilter !== 'All') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await transactionsApi.getAll(params);
      const data = res.data?.data || [];
      setTransactions(data);
      setTotalPages(res.data?.pagination?.totalPages || 1);
      setTotalItems(res.data?.pagination?.totalItems ?? data.length);
      setQueueCounts((res.data as any)?.counts || {});
      setListFailed(false);
      setListLoadedAt(new Date());
    } catch {
      setListFailed(true);
    } finally {
      setIsLoading(false);
      hasLoadedList.current = true;
    }
  }, [page, statusFilter, search, queue]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const retryList = async () => { setRetrying(true); try { await loadTransactions(); } finally { setRetrying(false); } };

  // Realtime updates
  useRealtimeTransactions(loadTransactions);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTransactions();
  };

  // Quick stats summary computation
  // Totals from the server for everything in your scope, not the rows on this page.
  const stats = useMemo(() => ({
    total: queueCounts.all ?? totalItems,
    pendingAO2: queueCounts.pendingValidation ?? 0,
    pendingHRMO: queueCounts.forApproval ?? 0,
    approved: queueCounts.approved ?? 0,
  }), [queueCounts, totalItems]);

  const dash = listFailed && !listLoadedAt;
  const openTx = (tx: Transaction) => { setSelectedTx(tx); navigate(`/admin/transactions/${tx.id}`); loadTransactionDetail(tx.id); };
  const txTone = (s: string) => (['APPROVED', 'COMPLETED'].includes(s) ? 'is-ok' : ['REJECTED', 'DISQUALIFIED'].includes(s) ? 'is-bad' : ['DEFICIENCY', 'RETURNED', 'FOR_APPROVAL', 'PENDING_VALIDATION'].includes(s) ? 'is-warn' : 'is-muted');

  return (
    <div className="sap animate-fade-in">
      <header className="sap-head"><h1>Transaction queue</h1></header>

      <section className="sap-stats" aria-label="Queue summary">
        <div className="sap-stat"><span className="sap-stat__label">In the queue</span><span className="sap-stat__num">{dash ? '–' : stats.total}</span></div>
        <div className={`sap-stat${stats.pendingAO2 ? ' is-warn' : ''}`}><span className="sap-stat__label">Waiting for validation</span><span className="sap-stat__num">{dash ? '–' : stats.pendingAO2}</span></div>
        <div className={`sap-stat${stats.pendingHRMO ? ' is-warn' : ''}`}><span className="sap-stat__label">Waiting for final approval</span><span className="sap-stat__num">{dash ? '–' : stats.pendingHRMO}</span></div>
        <div className="sap-stat"><span className="sap-stat__label">Approved</span><span className="sap-stat__num">{dash ? '–' : stats.approved}</span></div>
      </section>

      <section className="sap-card">
        <div className="sap-card__head sap-card__head--stack">
          <form onSubmit={handleSearchSubmit} className="sap-toolbar" role="search">
            <label className="sap-search">
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Search transactions</span>
              <input type="search" placeholder="Search name, employee ID or type" value={search}
                onChange={e => { setSearch(e.target.value); if (!e.target.value) setPage(1); }} />
            </label>
            <div className="sap-seg" role="group" aria-label="Review queues">
              {([['awaiting', 'Needs my action', queueCounts.awaitingMyReview], ['resubmitted', 'Resubmitted', queueCounts.resubmitted], ['oldest', 'Oldest first', undefined]] as const).map(([id, label, count]) => (
                <button key={id} type="button" aria-pressed={queue === id} onClick={() => { setQueue(queue === id ? '' : id); setPage(1); }}>
                  {label}{count !== undefined && <b className={count ? 'is-warn' : ''}>{count ?? '…'}</b>}
                </button>
              ))}
            </div>
          </form>
          <div className="sap-seg" role="group" aria-label="Filter by status" style={{ justifySelf: 'start' }}>
            {FILTER_TABS.map(tab => (
              <button key={tab.id} type="button" aria-pressed={!queue && statusFilter === tab.id}
                onClick={() => { setQueue(''); setStatusFilter(tab.id); setPage(1); }}>{tab.label}</button>
            ))}
          </div>
        </div>

        {listFailed && listLoadedAt && <div className="sap-card__body"><StaleNotice what="the transaction queue" since={listLoadedAt} onRetry={() => void retryList()} retrying={retrying} /></div>}
        {isLoading ? (
          <div className="sap-card__body" aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[0, 1, 2, 3].map(i => <div key={i} className="sap-skel" />)}</div>
        ) : dash ? (
          <div className="sap-card__body"><LoadFailure what="the transaction queue" onRetry={() => void retryList()} retrying={retrying} /></div>
        ) : transactions.length === 0 ? (
          <div className="sap-empty">
            {search ? <>No results for “{search}”. <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => setSearch('')}>Clear search</button></>
              : statusFilter !== 'All' ? <>{transactionEmptyTitle(statusFilter)}. <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => { setStatusFilter('All'); setPage(1); }}>Show all</button></>
              : queue ? 'Nothing needs your action.' : 'No transactions yet.'}
          </div>
        ) : (
          <ul className="sap-rows">
            {transactions.map(tx => {
              const initials = tx.personnel ? `${tx.personnel.firstName?.[0] || ''}${tx.personnel.lastName?.[0] || ''}`.toUpperCase() : '?';
              const fullName = tx.personnel ? `${tx.personnel.firstName} ${tx.personnel.lastName}` : 'Personnel';
              const isPromotion = (tx as any).isPromotion || tx.transactionType?.name?.toLowerCase().includes('promotion');
              const when = queue && (tx as any).waitingSince ? waitingFor((tx as any).waitingSince)
                : tx.submissionDate || (tx as any).createdAt ? new Date(tx.submissionDate || (tx as any).createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not submitted';
              return (
                <li key={tx.id} className="sap-row is-click" tabIndex={0} onClick={() => openTx(tx)} onKeyDown={activateOnKey<HTMLLIElement>(() => openTx(tx))}>
                  <span className="sap-avatar">{initials}</span>
                  <div className="sap-who">
                    <span className="sap-who__name">{fullName}{isPromotion && <span className="sap-tag">Promotion</span>}</span>
                    <span className="sap-who__line">{tx.transactionType?.name || 'Transaction'} · {tx.personnel?.designation || 'Personnel'}</span>
                    <span className="sap-who__mono">TRX-{tx.id}{tx.personnel?.employeeId ? ` · ${tx.personnel.employeeId}` : ''} · {when}</span>
                  </div>
                  <span className={`sap-pill ${txTone(tx.status)}`}>{transactionStatusLabel(tx.status)}</span>
                  <div className="sap-row__actions" onClick={e => e.stopPropagation()}>
                    {tx.status === 'PENDING_VALIDATION' && (tx as any).review?.canValidate && (
                      <Link to={`/admin/documents?txId=${tx.id}`} className="sap-btn sap-btn--primary sap-btn--sm">Validate</Link>
                    )}
                    {tx.status === 'FOR_APPROVAL' && (tx as any).review?.canApprove && (
                      <Link to={`/admin/approvals?txId=${tx.id}`} className="sap-btn sap-btn--primary sap-btn--sm">Approve</Link>
                    )}
                    <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => openTx(tx)}>View <ChevronRight size={17} aria-hidden="true" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="sap-pager">
            <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </section>

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
                    color: '#3F9265',
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
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
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
              {isLoadingDetail && loadedDetailId !== selectedTx?.id ? (
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
                      background: 'linear-gradient(135deg, #2f7d52 0%, #3f9265 100%)',
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
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
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
                      fontSize: '0.8125rem',
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
                    <AppIcon name="promotions" size={20} color="#A07A1F" />
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#A07A1F' }}>
                        Official Promotion Cycle Appointment
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {selectedTx.promotionDetails?.cycleName || 'DepEd Merit Selection & Promotion Cycle'}
                      </div>
                    </div>
                  </div>

                  {selectedTx.promotionDetails?.targetPosition && (
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 800,
                        backgroundColor: '#A07A1F',
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
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
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
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Current Assignee
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
                    {selectedTx.currentAssignee?.email || selectedTx.review?.owner?.label || 'Not assigned'}
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
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Compliance Score
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
                    {selectedTx.complianceScore !== undefined ? `${selectedTx.complianceScore}% complete` : 'Not calculated'}
                  </div>
                </div>
              </div>

              {detailFailed && <PartialNotice missing="The uploaded documents, review status and history of this transaction did not load, so none of them are shown as empty." onRetry={() => void loadTransactionDetail(selectedTx.id)} />}
              <ReviewNotice review={selectedTx.review} />

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

              {canApprove && selectedTx.status === 'REJECTED' && (
                <div style={{ display: 'grid', gap: 8, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                  <label htmlFor="reopen-reason" style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Disqualified by mistake?</label>
                  <textarea id="reopen-reason" className="form-input" rows={2} maxLength={500}
                    placeholder="Reason for reopening (at least 10 characters)"
                    value={reopenReason} onChange={e => setReopenReason(e.target.value)} disabled={reopening} />
                  <button type="button" className="btn btn-primary btn-sm" style={{ justifySelf: 'end' }}
                    disabled={reopening || reopenReason.trim().length < 10} onClick={() => void reopenSelected()}>
                    {reopening ? 'Reopening…' : 'Reopen for correction'}
                  </button>
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
                  {selectedTx.uploadedDocuments?.length > 0 && selectedTx.review?.canValidate && (
                    <Link
                      to={`/admin/documents?txId=${selectedTx.id}`}
                      style={{
                        fontSize: '0.8125rem',
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
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
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
                ) : detailFailed ? null : (
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
                          fontSize: '0.8125rem',
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{humanizeEnum(h.action)}</strong>
                          <span style={{ color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                            by {h.user?.email || 'System'} ({roleLabel(h.user?.role?.name)})
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
              {selectedTx.status === 'PENDING_VALIDATION' && selectedTx.review?.canValidate && (
                <Link
                  to={`/admin/documents?txId=${selectedTx.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#2F7D52', color: '#FFF' }}
                >
                  Validate Documents
                </Link>
              )}

              {selectedTx.status === 'FOR_APPROVAL' && selectedTx.review?.canApprove && (
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
