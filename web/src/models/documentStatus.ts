/**
 * Digital 201 - DepEd Document Lifecycle & 201 File Readiness Model
 * Single source of truth for document classification, 9 lifecycle states,
 * and 201 file readiness computation across the personnel portal.
 */

export type DocumentLifecycleStatus =
  | 'MISSING'
  | 'UPLOADED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'RETURNED'
  | 'REPLACEMENT_REQUIRED'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type DepEdDocumentCategory =
  | 'PERSONAL_INFO'
  | 'APPOINTMENT'
  | 'ACADEMIC'
  | 'ELIGIBILITY'
  | 'PERFORMANCE'
  | 'TRAINING'
  | 'OTHER';

export interface DepEdCategoryMeta {
  id: DepEdDocumentCategory;
  name: string;
  description: string;
  icon: string;
  order: number;
}

export const DEPED_DOCUMENT_CATEGORIES: Record<DepEdDocumentCategory, DepEdCategoryMeta> = {
  PERSONAL_INFO: {
    id: 'PERSONAL_INFO',
    name: 'Personal Information & Civil Status',
    description: 'Personal Data Sheet (CS Form 212), Work Experience Sheet, PSA Birth & Marriage Certificates',
    icon: 'profile',
    order: 1,
  },
  APPOINTMENT: {
    id: 'APPOINTMENT',
    name: 'Employment & Appointment Records',
    description: 'Oath of Office, Assumption to Duty, Appointment Papers, Designation Orders',
    icon: 'document',
    order: 2,
  },
  ACADEMIC: {
    id: 'ACADEMIC',
    name: 'Education & Scholastic Records',
    description: 'Transcript of Records (TOR), College/Post-Graduate Diplomas, CAV (DepEd/CHED)',
    icon: 'school',
    order: 3,
  },
  ELIGIBILITY: {
    id: 'ELIGIBILITY',
    name: 'Eligibility & Professional Licenses',
    description: 'PRC Board Rating & License, CSC Professional Eligibility, Valid Certifications',
    icon: 'security',
    order: 4,
  },
  PERFORMANCE: {
    id: 'PERFORMANCE',
    name: 'Performance Management Records',
    description: 'Individual Performance Commitment & Review Form (IPCRF), OPCRF Ratings',
    icon: 'analytics',
    order: 5,
  },
  TRAINING: {
    id: 'TRAINING',
    name: 'Training & Professional Development',
    description: 'Certificates of Training (L&D), DepEd NEAP Accreditations, Scholarships',
    icon: 'calendar',
    order: 6,
  },
  OTHER: {
    id: 'OTHER',
    name: 'Other Official 201 Documents',
    description: 'CS Form 211 (Medical Certificate), NBI Clearance, Annex C Requirements',
    icon: 'folder',
    order: 7,
  },
};

export interface PersonnelDocumentRecord {
  id: number;
  personnelId?: number;
  documentTypeId: string;
  documentTypeName: string;
  originalFileName?: string | null;
  storedFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  fileUrl?: string | null;
  storagePath?: string | null;
  fileHash?: string | null;
  sha256?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  remarks?: string | null;
  status: string;
  rejectionReason?: string | null;
  uploadedAt?: string;
  updatedAt?: string;
  isRequired?: boolean;
  hasFile?: boolean;
  isArchived?: boolean;
  isSuperseded?: boolean;
}

export interface ReadinessSummary {
  total: number;
  verified: number;
  missing: number;
  returned: number;
  underReview: number;
  expiring: number;
  expired: number;
  uploaded: number;
  percent: number;
  statusLevel: 'critical' | 'attention' | 'good' | 'complete';
  isComplete: boolean;
}

/** Check if document has passed its validity / expiration date */
export const isDocExpired = (doc: { expirationDate?: string | null }): boolean => {
  if (!doc.expirationDate) return false;
  const due = new Date(doc.expirationDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

/** Check if document is expiring within 60 days */
export const isDocExpiringSoon = (doc: { expirationDate?: string | null }): boolean => {
  if (!doc.expirationDate || isDocExpired(doc)) return false;
  const due = new Date(doc.expirationDate).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  return due > now && due - now <= sixtyDaysMs;
};

/**
 * Maps a personnel document record to one of the 9 explicit DepEd lifecycle states.
 */
export function resolveDocumentLifecycle(doc: PersonnelDocumentRecord): DocumentLifecycleStatus {
  // If explicitly flagged as superseded or archived
  if (doc.isSuperseded || doc.isArchived) {
    return 'SUPERSEDED';
  }

  // If no physical file is present
  const hasPhysicalFile = Boolean(doc.hasFile || doc.fileUrl || doc.storedFileName || doc.originalFileName);
  if (!hasPhysicalFile) {
    return 'MISSING';
  }

  // Returned / Deficiency states
  const rawStatus = (doc.status || '').toUpperCase();
  if (rawStatus === 'REPLACEMENT_REQUIRED') {
    return 'REPLACEMENT_REQUIRED';
  }
  if (rawStatus === 'REJECTED' || rawStatus === 'RETURNED' || rawStatus === 'DEFICIENT') {
    return 'RETURNED';
  }

  // Expiration states
  if (isDocExpired(doc)) {
    return 'EXPIRED';
  }
  if (isDocExpiringSoon(doc)) {
    return 'EXPIRING_SOON';
  }

  // Review states
  if (
    rawStatus === 'SUBMITTED' ||
    rawStatus === 'PENDING_VALIDATION' ||
    rawStatus === 'UNDER_REVIEW' ||
    rawStatus === 'PENDING'
  ) {
    return 'UNDER_REVIEW';
  }

  // Verified / Approved states
  if (rawStatus === 'VERIFIED' || rawStatus === 'APPROVED' || rawStatus === 'VALIDATED') {
    return 'VERIFIED';
  }

  // Default uploaded state
  return 'UPLOADED';
}

/**
 * Category assignment for standard DepEd document types
 */
export function categorizeDocument(doc: { documentTypeId: string; documentTypeName?: string }): DepEdDocumentCategory {
  const typeId = (doc.documentTypeId || '').toUpperCase();
  const typeName = (doc.documentTypeName || '').toUpperCase();

  if (
    typeId.includes('PDS') ||
    typeId.includes('PERSONAL_DATA') ||
    typeId.includes('BIRTH_CERT') ||
    typeId.includes('MARRIAGE') ||
    typeId.includes('WES') ||
    typeId.includes('WORK_EXPERIENCE') ||
    typeName.includes('PERSONAL DATA SHEET') ||
    typeName.includes('BIRTH CERT') ||
    typeName.includes('MARRIAGE CONTRACT')
  ) {
    return 'PERSONAL_INFO';
  }

  if (
    typeId.includes('APPOINTMENT') ||
    typeId.includes('OATH') ||
    typeId.includes('ASSUMPTION') ||
    typeId.includes('SERVICE_RECORD') ||
    typeId.includes('DESIGNATION') ||
    typeId.includes('PLANTILLA') ||
    typeName.includes('APPOINTMENT') ||
    typeName.includes('OATH OF OFFICE') ||
    typeName.includes('ASSUMPTION') ||
    typeName.includes('SERVICE RECORD')
  ) {
    return 'APPOINTMENT';
  }

  if (
    typeId.includes('TOR') ||
    typeId.includes('TRANSCRIPT') ||
    typeId.includes('DIPLOMA') ||
    typeId.includes('CAV') ||
    typeName.includes('TRANSCRIPT') ||
    typeName.includes('DIPLOMA') ||
    typeName.includes('CAV')
  ) {
    return 'ACADEMIC';
  }

  if (
    typeId.includes('PRC') ||
    typeId.includes('BOARD_RATING') ||
    typeId.includes('CSC') ||
    typeId.includes('ELIGIBILITY') ||
    typeName.includes('PRC') ||
    typeName.includes('BOARD RATING') ||
    typeName.includes('CIVIL SERVICE')
  ) {
    return 'ELIGIBILITY';
  }

  if (
    typeId.includes('IPCRF') ||
    typeId.includes('OPCRF') ||
    typeId.includes('PERFORMANCE') ||
    typeName.includes('IPCRF') ||
    typeName.includes('PERFORMANCE')
  ) {
    return 'PERFORMANCE';
  }

  if (
    typeId.includes('TRAINING') ||
    typeId.includes('CERT_OF_TRAINING') ||
    typeId.includes('SEMINAR') ||
    typeId.includes('L&D') ||
    typeName.includes('TRAINING') ||
    typeName.includes('SEMINAR')
  ) {
    return 'TRAINING';
  }

  return 'OTHER';
}

/**
 * UNIFIED SINGLE SOURCE OF TRUTH for 201 File Readiness.
 * Used by both Home.tsx (FileReadiness component) and MyDocuments.tsx.
 */
export function computeReadiness(documents: PersonnelDocumentRecord[]): ReadinessSummary {
  if (!documents || documents.length === 0) {
    return {
      total: 0,
      verified: 0,
      missing: 0,
      returned: 0,
      underReview: 0,
      expiring: 0,
      expired: 0,
      uploaded: 0,
      percent: 0,
      statusLevel: 'critical',
      isComplete: false,
    };
  }

  // Filter out superseded documents from base readiness denominator
  const activeRecords = documents.filter(d => !d.isSuperseded && !d.isArchived);
  const total = activeRecords.length;

  let verified = 0;
  let missing = 0;
  let returned = 0;
  let underReview = 0;
  let expiring = 0;
  let expired = 0;
  let uploaded = 0;

  for (const doc of activeRecords) {
    const lifecycle = resolveDocumentLifecycle(doc);
    switch (lifecycle) {
      case 'VERIFIED':
        verified++;
        break;
      case 'MISSING':
        missing++;
        break;
      case 'RETURNED':
      case 'REPLACEMENT_REQUIRED':
        returned++;
        break;
      case 'UNDER_REVIEW':
        underReview++;
        break;
      case 'EXPIRING_SOON':
        expiring++;
        // Expiring soon is still currently valid, but flagged
        verified++;
        break;
      case 'EXPIRED':
        expired++;
        break;
      case 'UPLOADED':
        uploaded++;
        break;
      case 'SUPERSEDED':
        break;
    }
  }

  const percent = total > 0 ? Math.min(100, Math.round((verified / total) * 100)) : 0;

  let statusLevel: 'critical' | 'attention' | 'good' | 'complete' = 'good';
  if (returned > 0 || expired > 0 || percent < 50) {
    statusLevel = 'critical';
  } else if (missing > 0 || expiring > 0 || percent < 90) {
    statusLevel = 'attention';
  } else if (percent === 100) {
    statusLevel = 'complete';
  }

  return {
    total,
    verified,
    missing,
    returned,
    underReview,
    expiring,
    expired,
    uploaded,
    percent,
    statusLevel,
    isComplete: percent === 100 && returned === 0 && expired === 0,
  };
}

/**
 * Detect duplicate file hashes across documents.
 * Returns map of hash -> list of document names.
 */
export function detectDuplicateHashes(documents: PersonnelDocumentRecord[]): Map<string, string[]> {
  const hashMap = new Map<string, string[]>();
  for (const doc of documents) {
    const hash = doc.fileHash || doc.sha256;
    if (hash && doc.hasFile) {
      const existing = hashMap.get(hash) || [];
      existing.push(doc.documentTypeName || doc.documentTypeId);
      hashMap.set(hash, existing);
    }
  }

  // Filter to only hashes associated with 2 or more different documents
  const duplicateMap = new Map<string, string[]>();
  for (const [hash, docNames] of hashMap.entries()) {
    const uniqueDocs = Array.from(new Set(docNames));
    if (uniqueDocs.length > 1) {
      duplicateMap.set(hash, uniqueDocs);
    }
  }
  return duplicateMap;
}

/**
 * Metadata config for rendering document lifecycle badges
 */
export interface LifecycleBadgeConfig {
  label: string;
  bg: string;
  fg: string;
  border: string;
  icon: string;
  description: string;
  primaryActionLabel: string;
  canDelete: boolean;
}

export const LIFECYCLE_CONFIG: Record<DocumentLifecycleStatus, LifecycleBadgeConfig> = {
  MISSING: {
    label: 'Missing Document',
    bg: 'rgba(239, 68, 68, 0.08)',
    fg: '#dc2626',
    border: 'rgba(239, 68, 68, 0.25)',
    icon: 'warning',
    description: 'Mandatory 201 document has not been uploaded yet.',
    primaryActionLabel: 'Upload Document',
    canDelete: false,
  },
  UPLOADED: {
    label: 'Uploaded',
    bg: 'rgba(59, 130, 246, 0.08)',
    fg: '#2563eb',
    border: 'rgba(59, 130, 246, 0.25)',
    icon: 'document',
    description: 'Uploaded and stored in 201 repository.',
    primaryActionLabel: 'View Preview',
    canDelete: true, // Only if not in active transaction
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    bg: 'rgba(245, 158, 11, 0.1)',
    fg: '#b45309',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: 'pending',
    description: 'Currently being examined by AO II or HRMO.',
    primaryActionLabel: 'View Submission',
    canDelete: false, // Strict: cannot delete while in review
  },
  VERIFIED: {
    label: 'Verified Official',
    bg: 'rgba(16, 185, 129, 0.08)',
    fg: '#059669',
    border: 'rgba(16, 185, 129, 0.25)',
    icon: 'approved',
    description: 'Validated and sealed by Division HRMO.',
    primaryActionLabel: 'View Preview',
    canDelete: false, // Strict: cannot delete verified 201 records
  },
  RETURNED: {
    label: 'Returned for Correction',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#dc2626',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: 'warning',
    description: 'Deficiency noted by reviewing officer. Replacement required.',
    primaryActionLabel: 'Replace Document',
    canDelete: false, // Must replace via upload flow
  },
  REPLACEMENT_REQUIRED: {
    label: 'Replacement Required',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#dc2626',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: 'warning',
    description: 'Document must be replaced to proceed with transaction.',
    primaryActionLabel: 'Replace Document',
    canDelete: false,
  },
  EXPIRING_SOON: {
    label: 'Expiring Soon',
    bg: 'rgba(245, 158, 11, 0.12)',
    fg: '#d97706',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: 'warning',
    description: 'Document validity expires in less than 60 days.',
    primaryActionLabel: 'Renew Document',
    canDelete: false,
  },
  EXPIRED: {
    label: 'Expired',
    bg: 'rgba(239, 68, 68, 0.12)',
    fg: '#dc2626',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: 'warning',
    description: 'Document validity has lapsed. Updated copy required.',
    primaryActionLabel: 'Upload Renewed Copy',
    canDelete: false,
  },
  SUPERSEDED: {
    label: 'Superseded',
    bg: 'rgba(100, 116, 139, 0.1)',
    fg: '#64748b',
    border: 'rgba(100, 116, 139, 0.25)',
    icon: 'history',
    description: 'Replaced by a newer verified revision.',
    primaryActionLabel: 'View Version History',
    canDelete: false,
  },
};
