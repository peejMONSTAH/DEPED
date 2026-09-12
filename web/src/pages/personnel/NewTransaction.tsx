import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';

// Step 4: Available transactions per 201-System-Workflow.md
const TRANSACTION_TYPES = [
  {
    id: 'PROMOTION_APPOINTMENT',
    label: 'Promotion Appointment',
    icon: 'promotions',
    description: 'Apply for a promotion to a higher position or salary grade.',
    color: '#8b5cf6',
  },
  {
    id: 'NEWLY_HIRED_APPOINTMENT',
    label: 'Newly Hired Appointment',
    icon: 'new-transaction',
    description: 'Process initial appointment documents as a newly hired employee.',
    color: '#10b981',
  },
];

export const NewTransaction: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('');
  const [promoStatus, setPromoStatus] = useState<{ isPromoted: boolean; message: string; promotionDetails?: any } | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [activeTransaction, setActiveTransaction] = useState<any | null>(null);

  // Determine personnel category from role
  const isTeachingPersonnel = user?.role === 'TEACHING_PERSONNEL';
  const personnelCategory = isTeachingPersonnel ? 'Teaching Personnel' : 'Non-Teaching Personnel';

  useEffect(() => {
    const fetchData = async () => {
      setCheckingEligibility(true);
      try {
        const [promoRes, txRes] = await Promise.all([
          apiClient.get('/promotions/my-promotion-status').catch(() => null),
          apiClient.get('/transactions/my-transactions').catch(() => null),
        ]);

        setPromoStatus(promoRes?.data?.data || { isPromoted: false, message: 'You are ineligible yet.' });

        const myTxs = txRes?.data?.data || [];
        const active = myTxs.find((t: any) => t.status !== 'REJECTED');
        if (active) {
          setActiveTransaction(active);
        }
      } catch (_) {
        setPromoStatus({ isPromoted: false, message: 'You are ineligible yet. Promotion selection in an active cycle is required.' });
      } finally {
        setCheckingEligibility(false);
      }
    };
    fetchData();
  }, []);

  const handleStart = async () => {
    if (activeTransaction) {
      addToast(`You already have an active transaction (#TRX-${activeTransaction.id}). You cannot initiate another transaction unless your previous submission was rejected.`, 'ERROR');
      return;
    }

    if (!selectedType) {
      addToast('Please select a transaction type to continue.', 'ERROR');
      return;
    }

    if (selectedType === 'PROMOTION_APPOINTMENT' && promoStatus?.isPromoted !== true) {
      addToast('You are ineligible yet. Selection by HRMO in an active Promotion Cycle is required.', 'ERROR');
      return;
    }

    try {
      let targetTxId = promoStatus?.promotionDetails?.transactionId;
      if (!targetTxId) {
        const typeName = selectedType === 'PROMOTION_APPOINTMENT' ? 'Promotion' : 'Newly Hired Appointment';
        const res = await apiClient.post('/transactions', {
          type: typeName,
          notes: `Initiated ${typeName} appointment document upload`,
        });
        targetTxId = res.data?.data?.id;
      }

      addToast(`Transaction started. Loading requirements checklist for ${TRANSACTION_TYPES.find(t => t.id === selectedType)?.label}…`, 'SUCCESS');
      navigate(`/personnel/checklist?txType=${selectedType}&category=${isTeachingPersonnel ? 'TEACHING' : 'NON_TEACHING'}&txId=${targetTxId || ''}`);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to initiate transaction.', 'ERROR');
    }
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24 }}>
        <div>
          <div className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>Start New 201 Transaction</div>
          <div className="topbar-subtitle" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Select your appointment, promotion, reclassification, or document update transaction
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Personnel Category Indicator Card */}
        <div className="card mb-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 18, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AppIcon name={isTeachingPersonnel ? 'personnel' : 'wes'} size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Official Station Scope: <strong>{(user as any)?.address?.split(',')[0] || (user as any)?.designation || 'CSD Koronadal City'}</strong>
                </div>
              </div>
            </div>
            <span className="badge badge-info" style={{ fontSize: 11, padding: '4px 12px', fontWeight: 700 }}>
              {personnelCategory}
            </span>
          </div>
        </div>

        {/* Active Transaction in Progress Warning & Resume Banner */}
        {activeTransaction && (
          <div
            className="card mb-5 animate-scale-in"
            style={{
              background: 'rgba(234, 179, 8, 0.08)',
              border: '2px solid rgba(234, 179, 8, 0.4)',
              borderRadius: 20,
              padding: 22,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ padding: 12, borderRadius: 14, background: 'rgba(234, 179, 8, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AppIcon name="warning" size={24} color="#eab308" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#eab308' }}>
                      Active Transaction In Progress: TRX-{activeTransaction.id}
                    </span>
                    <span className="badge badge-warning" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                      {activeTransaction.status}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Type: <strong style={{ color: 'var(--color-text-primary)' }}>{activeTransaction.transactionType?.name || 'Appointment'}</strong>
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
                  You currently have an active transaction in <strong>{activeTransaction.status}</strong> status. Under DepEd 201 system policy, personnel cannot initiate another transaction unless their previous submission has been evaluated and rejected.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(`/personnel/checklist?txId=${activeTransaction.id}&txType=${activeTransaction.transactionType?.name?.toUpperCase().includes('PROMOTION') ? 'PROMOTION_APPOINTMENT' : 'NEWLY_HIRED_APPOINTMENT'}&category=${isTeachingPersonnel ? 'TEACHING' : 'NON_TEACHING'}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <AppIcon name="checklist" size={14} /> Resume Active Transaction #TRX-{activeTransaction.id} →
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate('/personnel/transactions')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <AppIcon name="transactions" size={14} /> View Submissions
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Type Cards in 2-Column Responsive Grid */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Available 201 Transaction Workflows
          </div>
          <p className="text-xs text-muted mb-4" style={{ lineHeight: 1.5 }}>
            Select the transaction you wish to process. The system will automatically load the corresponding requirements and compliance checklist based on your personnel category.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
          {TRANSACTION_TYPES.map(tx => {
            const isPromo = tx.id === 'PROMOTION_APPOINTMENT';
            const isIneligible = isPromo && promoStatus?.isPromoted === false;
            const isSelected = selectedType === tx.id;

            return (
              <div
                key={tx.id}
                onClick={() => setSelectedType(tx.id)}
                className="hover-lift"
                style={{
                  border: `2px solid ${isSelected ? (isIneligible ? '#ef4444' : 'var(--color-primary)') : 'var(--color-border)'}`,
                  borderRadius: 20,
                  padding: 20,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--color-bg-card)' : 'var(--color-bg-secondary)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  boxShadow: isSelected ? '0 8px 24px rgba(0, 0, 0, 0.08)' : 'none',
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'var(--color-bg-tertiary)',
                  color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  <AppIcon name={tx.icon} size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                      {tx.label}
                    </span>
                    {isPromo && promoStatus?.isPromoted === false && (
                      <span style={{ fontSize: '10px', background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
                        Ineligible Yet
                      </span>
                    )}
                    {isPromo && promoStatus?.isPromoted === true && (
                      <span style={{ fontSize: '10px', background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <AppIcon name="approved" size={11} color="#fff" /> Promoted
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted" style={{ lineHeight: 1.5 }}>{tx.description}</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-primary)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                }}>
                  {isSelected && <AppIcon name="approved" size={12} color="white" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Action Button */}
        <button
          className="btn btn-primary btn-full"
          onClick={handleStart}
          disabled={!!activeTransaction || (selectedType === 'PROMOTION_APPOINTMENT' && promoStatus?.isPromoted === false)}
          style={{
            fontSize: '1rem',
            padding: '14px 24px',
            borderRadius: 14,
            opacity: (!!activeTransaction || (selectedType === 'PROMOTION_APPOINTMENT' && promoStatus?.isPromoted === false)) ? 0.5 : 1,
            cursor: (!!activeTransaction || (selectedType === 'PROMOTION_APPOINTMENT' && promoStatus?.isPromoted === false)) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontWeight: 800,
          }}
        >
          {activeTransaction ? (
            <>
              <AppIcon name="warning" size={18} color="#ffffff" />
              <span>Active Transaction #TRX-{activeTransaction.id} in Progress — Initiation Blocked</span>
            </>
          ) : selectedType === 'PROMOTION_APPOINTMENT' && promoStatus?.isPromoted === false ? (
            <>
              <AppIcon name="warning" size={18} color="#ffffff" />
              <span>Ineligible for Promotion Appointment Upload</span>
            </>
          ) : (
            <span>Continue & Generate Requirement Checklist →</span>
          )}
        </button>

        <p className="text-xs text-muted mt-3" style={{ textAlign: 'center' }}>
          Official DepEd Electronic 201 System • Requirements governed under DO 7 s.2023 & DO 19/24 s.2025
        </p>
      </div>
    </div>
  );
};

