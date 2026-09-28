import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../components/common/AppIcon';
import { TransactionRecord, isActiveTransaction } from '../../../models/transactionState';
import {
  PersonnelDocumentRecord,
  resolveDocumentLifecycle,
} from '../../../models/documentStatus';

interface NextActionPanelProps {
  transactions: TransactionRecord[];
  documents: PersonnelDocumentRecord[];
  onOpenChecklist?: (txId: number) => void;
}

interface ActionCardData {
  level: 'critical' | 'attention' | 'info' | 'complete';
  badge: string;
  title: string;
  description: string;
  actionText: string;
  actionRoute?: string;
  onClick?: () => void;
}

export const NextActionPanel: React.FC<NextActionPanelProps> = ({
  transactions,
  documents,
  onOpenChecklist,
}) => {
  const nextAction = useMemo<ActionCardData>(() => {
    // 1. Check for active transaction with DEFICIENCY
    const deficiencyTx = transactions.find(
      tx => isActiveTransaction(tx.status) && (tx.status || '').toUpperCase() === 'DEFICIENCY'
    );
    if (deficiencyTx) {
      return {
        level: 'critical',
        badge: 'ACTION REQUIRED',
        title: `Replace Deficient Document for TRX-${deficiencyTx.id}`,
        description:
          deficiencyTx.remarks
            ? `AO II Remarks: "${deficiencyTx.remarks}"`
            : 'The School AO II returned your filing for attachment correction. Please replace the flagged document to resume review.',
        actionText: 'Replace Document Now',
        actionRoute: `/personnel/checklist?txId=${deficiencyTx.id}`,
        onClick: onOpenChecklist ? () => onOpenChecklist(deficiencyTx.id) : undefined,
      };
    }

    // 2. Check for 201 file RETURNED or REPLACEMENT_REQUIRED
    const returnedDoc = documents.find(d => {
      const lc = resolveDocumentLifecycle(d);
      return lc === 'RETURNED' || lc === 'REPLACEMENT_REQUIRED';
    });
    if (returnedDoc) {
      return {
        level: 'critical',
        badge: 'ACTION REQUIRED',
        title: `Replace Flagged Record: ${returnedDoc.documentTypeName}`,
        description:
          returnedDoc.rejectionReason
            ? `Reviewer note: "${returnedDoc.rejectionReason}". An updated replacement is needed.`
            : `Your ${returnedDoc.documentTypeName} was returned for compliance. Please upload a clear replacement.`,
        actionText: 'Replace 201 Document',
        actionRoute: '/personnel/documents',
      };
    }

    // 3. Check for EXPIRED document
    const expiredDoc = documents.find(d => resolveDocumentLifecycle(d) === 'EXPIRED');
    if (expiredDoc) {
      return {
        level: 'critical',
        badge: 'ACTION REQUIRED',
        title: `Upload Renewed Copy: ${expiredDoc.documentTypeName}`,
        description: `This document has lapsed its official validity date. Upload an updated copy to keep your 201 file active.`,
        actionText: 'Upload Renewed Record',
        actionRoute: '/personnel/documents',
      };
    }

    // 4. Check for DRAFT transaction
    const draftTx = transactions.find(
      tx => isActiveTransaction(tx.status) && (tx.status || '').toUpperCase() === 'DRAFT'
    );
    if (draftTx) {
      return {
        level: 'attention',
        badge: 'FILING IN PROGRESS',
        title: `Complete Submission for TRX-${draftTx.id}`,
        description: `You have an unsubmitted ${draftTx.transactionType?.name || 'HR application'}. Upload required attachments to forward to AO II.`,
        actionText: 'Continue Filing',
        actionRoute: `/personnel/checklist?txId=${draftTx.id}`,
        onClick: onOpenChecklist ? () => onOpenChecklist(draftTx.id) : undefined,
      };
    }

    // 5. Check for MISSING mandatory document
    const missingMandatoryDoc = documents.find(d => d.isRequired && resolveDocumentLifecycle(d) === 'MISSING');
    if (missingMandatoryDoc) {
      return {
        level: 'attention',
        badge: 'RECORD MISSING',
        title: `Upload Missing 201 File: ${missingMandatoryDoc.documentTypeName}`,
        description: `DepEd qualification rules require this record in your master digital dossier. Upload your copy to achieve 100% readiness.`,
        actionText: 'Upload Required Record',
        actionRoute: '/personnel/documents',
      };
    }

    // 6. Check for EXPIRING_SOON document
    const expiringDoc = documents.find(d => resolveDocumentLifecycle(d) === 'EXPIRING_SOON');
    if (expiringDoc) {
      return {
        level: 'info',
        badge: 'EXPIRING SOON',
        title: `Upcoming Renewal: ${expiringDoc.documentTypeName}`,
        description: `This document will expire within the next 60 days. Prepare and upload an updated certificate.`,
        actionText: 'Review Document Expiration',
        actionRoute: '/personnel/documents',
      };
    }

    // 7. No action needed
    return {
      level: 'complete',
      badge: 'ALL UP TO DATE',
      title: 'Nothing to do right now',
      description:
        'Your required 201 files are uploaded. They are checked when you use them for a promotion application or appointment.',
      actionText: 'Browse Open Vacancies',
      actionRoute: '/personnel/home#vacancies',
    };
  }, [transactions, documents, onOpenChecklist]);

  const levelStyles = {
    critical: {
      bg: 'rgba(239, 68, 68, 0.05)',
      border: '1.5px solid #ef4444',
      badgeBg: '#dc2626',
      badgeFg: '#fff',
      iconName: 'warning',
      iconColor: '#dc2626',
      btnBg: '#dc2626',
      btnColor: '#fff',
    },
    attention: {
      bg: 'rgba(245, 158, 11, 0.05)',
      border: '1.5px solid #f59e0b',
      badgeBg: '#d97706',
      badgeFg: '#fff',
      iconName: 'pending',
      iconColor: '#d97706',
      btnBg: '#d97706',
      btnColor: '#fff',
    },
    info: {
      bg: 'rgba(2, 132, 199, 0.05)',
      border: '1px solid #0284c7',
      badgeBg: '#0284c7',
      badgeFg: '#fff',
      iconName: 'document',
      iconColor: '#0284c7',
      btnBg: '#0284c7',
      btnColor: '#fff',
    },
    complete: {
      bg: 'rgba(16, 185, 129, 0.05)',
      border: '1px solid #10b981',
      badgeBg: '#059669',
      badgeFg: '#fff',
      iconName: 'check',
      iconColor: '#059669',
      btnBg: 'var(--color-primary)',
      btnColor: '#fff',
    },
  }[nextAction.level];

  return (
    <div
      className="card mb-4"
      style={{
        borderRadius: 16,
        padding: '20px 24px',
        background: levelStyles.bg,
        border: levelStyles.border,
        boxShadow: nextAction.level === 'critical' ? '0 4px 16px rgba(239, 68, 68, 0.1)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minWidth: 0, flex: '1 1 340px' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `${levelStyles.iconColor}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <AppIcon name={levelStyles.iconName as any} size={22} color={levelStyles.iconColor} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: levelStyles.badgeBg,
                  color: levelStyles.badgeFg,
                  letterSpacing: '0.04em',
                }}
              >
                {nextAction.badge}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                Next Priority Task
              </span>
            </div>

            <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: '2px 0 6px 0', color: 'var(--color-text-primary)' }}>
              {nextAction.title}
            </h2>

            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
              {nextAction.description}
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
          {nextAction.actionRoute ? (
            <Link
              to={nextAction.actionRoute}
              className="btn btn-sm"
              onClick={nextAction.onClick}
              style={{
                background: levelStyles.btnBg,
                borderColor: levelStyles.btnBg,
                color: levelStyles.btnColor,
                fontWeight: 700,
                fontSize: '0.8125rem',
                padding: '8px 16px',
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
              }}
            >
              <span>{nextAction.actionText}</span>
              <AppIcon name="chevron-right" size={14} color="#fff" />
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={nextAction.onClick}
              style={{
                background: levelStyles.btnBg,
                borderColor: levelStyles.btnBg,
                color: levelStyles.btnColor,
                fontWeight: 700,
                fontSize: '0.8125rem',
                padding: '8px 16px',
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{nextAction.actionText}</span>
              <AppIcon name="chevron-right" size={14} color="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
