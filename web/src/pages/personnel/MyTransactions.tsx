import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { clickable } from '../../a11y/clickable';

type TransactionItem = {
  id: number;
  transactionType?: { name: string };
  status: string;
  createdAt: string;
};

export const MyTransactions: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyTransactions = useCallback(async () => {
    try {
      const res = await apiClient.get('/transactions/my-transactions');
      setTransactions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load my transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Supabase Realtime: subscribe to transactions channel for live row updates
  useRealtimeTransactions(fetchMyTransactions);

  // Progressive 4-stage tracking indicator
  const getStepProgress = (status: string) => {
    switch (status) {
      case 'PENDING_VALIDATION':
      case 'SUBMITTED_TO_AO2':
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
      case 'RECEIVED':
        return { step: 2, label: 'Stage 2/4: AO II Receiving & Document Pre-Checking', color: '#f59e0b' };
      case 'FOR_APPROVAL':
      case 'FORWARDED_TO_HRMO':
      case 'FORWARDED_TO_DIVISION':
      case 'UNDER_HR_REVIEW':
        return { step: 3, label: 'Stage 3/4: Division HRMO Review & Final Approval Queue', color: '#8b5cf6' };
      case 'APPROVED':
      case 'APPROVED_BY_HRMO':
      case 'COMPLETED':
        return { step: 4, label: 'Stage 4/4: Approved & Synchronized into Master 201 File', color: '#10b981' };
      case 'DEFICIENCY':
      case 'RETURNED_BY_AO2':
      case 'RETURNED_DEFICIENCY':
      case 'RETURNED_BY_HRMO':
        return { step: 2, label: 'Action Required: Returned by AO II for Document Compliance', color: '#ef4444' };
      case 'REJECTED':
        return { step: 3, label: 'Application Rejected by HRMO', color: '#ef4444' };
      default:
        return { step: 1, label: 'Stage 1/4: Draft Filing (Uploading Documents)', color: '#007bff' };
    }
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24 }}>
        <div>
          <div className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>My 201 File Transactions</div>
          <div className="topbar-subtitle" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Track live submission stages, compliance checking, and approval status
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {transactions.length === 0 ? (
          <div className="card text-center" style={{ padding: '32px' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <AppIcon name="inbox" size={36} color="var(--color-text-muted)" />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No transactions yet</div>
            <div className="text-sm text-muted mb-4">Your appointment transaction will appear here when HR selects you for hiring or promotion. Open it to complete and submit your requirements.</div>
          </div>
        ) : (
          transactions.map(tx => {
            const tracker = getStepProgress(tx.status);
            return (
              <div 
                key={tx.id} 
                className="card card-hover"
                style={{ padding: '16px', cursor: 'pointer', border: '1px solid var(--color-border)' }}
                {...clickable<HTMLDivElement>(() => navigate(`/personnel/checklist?txId=${tx.id}`), `Open checklist for ${tx.transactionType?.name ?? 'transaction'}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#007bff', fontSize: 12, marginRight: 8 }}>
                      TRX-{tx.id}
                    </span>
                    <strong style={{ fontSize: 14 }}>{tx.transactionType?.name || 'HR Transaction'}</strong>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>

                <div className="text-xs text-muted mb-3">
                  Applied: {new Date(tx.createdAt).toLocaleDateString()}
                </div>

                {/* 4-Stage Live Progress Bar */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    <span style={{ color: tracker.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AppIcon name="location" size={12} color={tracker.color} /> {tracker.label}
                    </span>
                    <span className="text-muted">{tracker.step}/4 Steps</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, height: 6 }}>
                    {[1, 2, 3, 4].map(s => (
                      <div
                        key={s}
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          background: s <= tracker.step ? tracker.color : 'rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
