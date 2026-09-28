/**
 * Digital 201 - Transaction State, Workflow Classification, and Event Timeline Model
 * Single source of truth for separating active vs completed transactions,
 * determining DepEd transaction lifecycle stages, and formatting timeline events.
 */

export const ACTIVE_TRANSACTION_STATUSES = [
  'DRAFT',
  'PENDING_VALIDATION',
  'FOR_APPROVAL',
  'DEFICIENCY',
  'ESCALATED',
] as const;

export const COMPLETED_TRANSACTION_STATUSES = [
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'ABANDONED',
  'ARCHIVED',
] as const;

export type ActiveTransactionStatus = typeof ACTIVE_TRANSACTION_STATUSES[number];
export type CompletedTransactionStatus = typeof COMPLETED_TRANSACTION_STATUSES[number];
export type AnyTransactionStatus = ActiveTransactionStatus | CompletedTransactionStatus | string;

export function isActiveTransaction(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase().trim();
  return (ACTIVE_TRANSACTION_STATUSES as readonly string[]).includes(s);
}

export function isCompletedTransaction(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase().trim();
  return (COMPLETED_TRANSACTION_STATUSES as readonly string[]).includes(s);
}

export interface TransactionUploadedDoc {
  id: number;
  fileName: string;
  status: string;
  requirementTemplateId?: number;
  validatedBy?: {
    email?: string;
    personnel?: {
      firstName?: string;
      lastName?: string;
    };
  } | null;
}

export interface TransactionRequirementTemplate {
  id: number;
  name: string;
  description?: string | null;
  isMandatory: boolean;
}

export interface TransactionRecord {
  id: number;
  personnelId?: number;
  transactionTypeId?: number;
  transactionType?: {
    name: string;
    requirementTemplates?: TransactionRequirementTemplate[];
  };
  status: string;
  submissionDate?: string | null;
  validationDate?: string | null;
  approvalDate?: string | null;
  remarks?: string | null;
  currentAssigneeId?: number | null;
  currentAssignee?: {
    id: number;
    email: string;
    role: string;
    personnel?: {
      firstName: string;
      lastName: string;
    };
  } | null;
  resubmissionCount?: number;
  deficiencyDeadline?: string | null;
  createdAt: string;
  updatedAt?: string;
  complianceScore?: number;
  uploadedDocuments?: TransactionUploadedDoc[];
  isPromotion?: boolean;
  promotionDetails?: {
    isSelected?: boolean;
    cycleName?: string | null;
    targetPosition?: string | null;
    cycleType?: string;
  } | null;
}

export interface TimelineEvent {
  stepNumber: number;
  stageName: string;
  actorRole: string;
  actorName?: string;
  timestamp?: string | null;
  status: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'DEFICIENCY' | 'REJECTED';
  description: string;
  remarks?: string | null;
  isDeficiencyBranch?: boolean;
  affectedDocuments?: string[];
  remainingAttempts?: number;
  actionRequired?: {
    label: string;
    route: string;
  };
}

export interface TransactionStageSummary {
  currentStageNumber: number;
  totalStages: number;
  stageTitle: string;
  stageBadgeText: string;
  stageColor: string;
  ownerLabel: string;
  nextExpectedAction: string;
  isActionRequired: boolean;
}

/**
 * Returns human-readable DepEd workflow stage information.
 */
export function getTransactionStageSummary(tx: TransactionRecord): TransactionStageSummary {
  const s = (tx.status || '').toUpperCase().trim();

  switch (s) {
    case 'DRAFT':
      return {
        currentStageNumber: 1,
        totalStages: 5,
        stageTitle: 'Draft Filing & Requirement Upload',
        stageBadgeText: 'Draft',
        stageColor: '#0284c7',
        ownerLabel: 'Personnel (You)',
        nextExpectedAction: 'Upload all required documents and submit for AO II validation',
        isActionRequired: true,
      };

    case 'PENDING_VALIDATION':
      return {
        currentStageNumber: 2,
        totalStages: 5,
        stageTitle: 'AO II Receiving & Completeness Pre-Checking',
        stageBadgeText: 'In Review: AO II',
        stageColor: '#d97706',
        ownerLabel: 'School AO II (Administrative Officer II)',
        nextExpectedAction: 'AO II is verifying uploaded attachments against checklist',
        isActionRequired: false,
      };

    case 'DEFICIENCY':
      return {
        currentStageNumber: 2,
        totalStages: 5,
        stageTitle: 'Returned for Correction (Deficiency)',
        stageBadgeText: 'Action Required: Returned',
        stageColor: '#dc2626',
        ownerLabel: 'Personnel (You)',
        nextExpectedAction: 'Replace flagged documents and re-submit to AO II',
        isActionRequired: true,
      };

    case 'FOR_APPROVAL':
    case 'ESCALATED':
      return {
        currentStageNumber: 3,
        totalStages: 5,
        stageTitle: 'Division HRMO Substantive Review & Approval',
        stageBadgeText: 'In Review: HRMO',
        stageColor: '#8a6a1c',
        ownerLabel: 'Division HRMO (Human Resource Management Officer)',
        nextExpectedAction: 'HRMO deliberation and formal endorsement',
        isActionRequired: false,
      };

    case 'APPROVED':
    case 'COMPLETED':
      return {
        currentStageNumber: 5,
        totalStages: 5,
        stageTitle: 'Approved & Synchronized into Master 201 File',
        stageBadgeText: 'Approved & Synchronized',
        stageColor: '#059669',
        ownerLabel: 'Division Records & Master 201 Database',
        nextExpectedAction: 'Transaction completed. Official record updated.',
        isActionRequired: false,
      };

    case 'REJECTED':
      return {
        currentStageNumber: 4,
        totalStages: 5,
        stageTitle: 'Application Rejected by HRMO',
        stageBadgeText: 'Rejected',
        stageColor: '#dc2626',
        ownerLabel: 'Division HRMO',
        nextExpectedAction: 'Review rejection remarks from HRMO',
        isActionRequired: false,
      };

    default:
      return {
        currentStageNumber: 1,
        totalStages: 5,
        stageTitle: 'Transaction Submitted',
        stageBadgeText: tx.status,
        stageColor: '#64748b',
        ownerLabel: 'Personnel Records',
        nextExpectedAction: 'Processing transaction',
        isActionRequired: false,
      };
  }
}

/**
 * Builds chronological DepEd event timeline including branching deficiency steps.
 */
export function buildTransactionTimeline(tx: TransactionRecord): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const s = (tx.status || '').toUpperCase().trim();

  // 1. Initial Submission
  events.push({
    stepNumber: 1,
    stageName: 'Transaction Initiated',
    actorRole: 'Personnel',
    timestamp: tx.submissionDate || tx.createdAt,
    status: 'COMPLETED',
    description: `Submitted ${tx.transactionType?.name || 'HR Transaction'} application with initial document attachments.`,
  });

  // 2. AO II Receiving / Validation Stage
  if (s === 'DRAFT') {
    events.push({
      stepNumber: 2,
      stageName: 'School AO II Pre-Checking',
      actorRole: 'School AO II',
      timestamp: null,
      status: 'PENDING',
      description: 'Pending complete document upload and personnel submission.',
    });
  } else if (s === 'DEFICIENCY') {
    // Branching event: Returned by AO II with remarks
    const returnedDocs = (tx.uploadedDocuments || [])
      .filter(d => (d.status || '').toUpperCase() === 'REJECTED' || (d.status || '').toUpperCase() === 'REPLACEMENT_REQUIRED')
      .map(d => d.fileName);

    const maxAttempts = 3;
    const remaining = Math.max(0, maxAttempts - (tx.resubmissionCount || 0));

    events.push({
      stepNumber: 2,
      stageName: 'Returned by AO II for Compliance',
      actorRole: 'School AO II',
      actorName: tx.currentAssignee?.personnel
        ? `${tx.currentAssignee.personnel.firstName} ${tx.currentAssignee.personnel.lastName}`
        : 'Assigned AO II',
      timestamp: tx.updatedAt || tx.validationDate,
      status: 'DEFICIENCY',
      isDeficiencyBranch: true,
      description: 'The Administrative Officer II returned this transaction due to incomplete or non-compliant attachments.',
      remarks: tx.remarks || 'Document attachments did not meet DepEd qualification / clarity standards.',
      affectedDocuments: returnedDocs.length > 0 ? returnedDocs : ['Flagged checklist attachment(s)'],
      remainingAttempts: remaining,
      actionRequired: {
        label: 'Replace Document & Resubmit',
        route: `/personnel/checklist?txId=${tx.id}`,
      },
    });
  } else {
    // Validated or under validation
    const isValidated = s === 'FOR_APPROVAL' || s === 'APPROVED' || s === 'COMPLETED' || s === 'REJECTED';
    events.push({
      stepNumber: 2,
      stageName: isValidated ? 'Validated by AO II' : 'Under AO II Validation',
      actorRole: 'School AO II',
      timestamp: tx.validationDate || (isValidated ? tx.updatedAt : null),
      status: isValidated ? 'COMPLETED' : 'CURRENT',
      description: isValidated
        ? 'AO II verified all attachments and forwarded to Division HRMO.'
        : 'AO II is currently reviewing documents against qualification standards.',
      remarks: isValidated ? tx.remarks : undefined,
    });
  }

  // 3. Division HRMO Review Stage
  if (s === 'FOR_APPROVAL' || s === 'ESCALATED') {
    events.push({
      stepNumber: 3,
      stageName: 'Division HRMO Substantive Review',
      actorRole: 'Division HRMO',
      timestamp: null,
      status: 'CURRENT',
      description: 'Transaction is in the active HRMO queue for evaluation and executive endorsement.',
    });
  } else if (s === 'APPROVED' || s === 'COMPLETED') {
    events.push({
      stepNumber: 3,
      stageName: 'Division HRMO Approved',
      actorRole: 'Division HRMO',
      timestamp: tx.approvalDate || tx.updatedAt,
      status: 'COMPLETED',
      description: 'HRMO evaluated qualifications and officially approved transaction.',
      remarks: tx.remarks,
    });
  } else if (s === 'REJECTED') {
    events.push({
      stepNumber: 3,
      stageName: 'Disapproved by Division HRMO',
      actorRole: 'Division HRMO',
      timestamp: tx.updatedAt,
      status: 'REJECTED',
      description: 'Application was formally disapproved by the Division HRMO.',
      remarks: tx.remarks || 'Does not meet prescribed minimum Civil Service qualifications.',
    });
  } else if (s !== 'DEFICIENCY' && s !== 'DRAFT') {
    events.push({
      stepNumber: 3,
      stageName: 'Division HRMO Review',
      actorRole: 'Division HRMO',
      timestamp: null,
      status: 'PENDING',
      description: 'Will proceed to Division HRMO once AO II validation completes.',
    });
  }

  // 4. Official Master 201 Synchronization
  if (s === 'APPROVED' || s === 'COMPLETED') {
    events.push({
      stepNumber: 4,
      stageName: 'Synchronized into Official 201 Repository',
      actorRole: 'System & Master 201 Records',
      timestamp: tx.approvalDate || tx.updatedAt,
      status: 'COMPLETED',
      description: 'Verified appointment and credentials committed to personnel permanent service record.',
    });
  }

  return events;
}
