/**
 * Canonical Audit Event Types and Enums for Digital 201
 * Philippine Department of Education HRIS
 */

export const AuditCategory = {
  AUTHENTICATION: 'Authentication',
  ACCOUNT_LIFECYCLE: 'Account lifecycle',
  ROLES_PERMISSIONS: 'Roles and permissions',
  SENSITIVE_RECORD_ACCESS: 'Sensitive record access',
  DOCUMENTS: 'Documents',
  TRANSACTIONS: 'Transactions',
  PERSONNEL_RECORDS: 'Personnel records',
  PROMOTIONS_RANKING: 'Promotions and ranking',
  REPORTS_EXPORTS: 'Reports and exports',
  SYSTEM_CONFIGURATION: 'System configuration',
  EMAIL_NOTIFICATION: 'Email and notification delivery',
  BACKUP_RECOVERY: 'Backup and recovery',
  AUTOMATED_OPERATIONS: 'Automated operations',
} as const;

export type AuditCategoryType = (typeof AuditCategory)[keyof typeof AuditCategory];

export const AuditSeverity = {
  INFO: 'INFO',
  NOTICE: 'NOTICE',
  WARNING: 'WARNING',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type AuditSeverityType = (typeof AuditSeverity)[keyof typeof AuditSeverity];

export const AuditOutcome = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
  PARTIAL: 'PARTIAL',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
} as const;

export type AuditOutcomeType = (typeof AuditOutcome)[keyof typeof AuditOutcome];

export const ClientSource = {
  WEB: 'web',
  MOBILE: 'mobile',
  API: 'api',
  WORKER: 'automated_worker',
} as const;

export type ClientSourceType = (typeof ClientSource)[keyof typeof ClientSource];

export interface CanonicalAuditEvent {
  id: number;
  timestamp: string; // ISO 8601 UTC
  displayTimestamp: string; // Asia/Manila timezone (UTC+8) formatted
  userId: number;
  actorEmail: string;
  actorRole: string; // Raw role enum (e.g. SYSTEM_ADMIN)
  actorRoleLabel: string; // Human-readable label (e.g. System Administrator)
  actorStation: string | null; // Station / school assignment if applicable
  action: string; // Machine-readable code (e.g. LOGIN_SUCCESS, ROLE_MODIFIED)
  actionLabel: string; // Human-readable label (e.g. Signed in successfully)
  category: AuditCategoryType;
  severity: AuditSeverityType;
  outcome: AuditOutcomeType;
  targetType: string; // e.g. User, Document, Transaction, PromotionCycle
  targetId: number;
  targetReference: string; // e.g. TRX-102, Personnel #45, Item #1098
  summary: string; // Human-readable safe narrative summary
  details: Record<string, any> | null; // Recursively sanitized metadata
  ipAddress: string | null;
  userAgent: string | null;
  clientSource: ClientSourceType;
  requestId: string | null;
  failureReason: string | null;
  beforeValue?: Record<string, any> | null;
  afterValue?: Record<string, any> | null;
  recordHash?: string | null;
  previousHash?: string | null;
}

export interface AuditLogQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  userId?: number;
  actorEmail?: string;
  role?: string;
  action?: string;
  targetType?: string;
  targetId?: number;
  ipAddress?: string;
  requestId?: string;
  startDate?: string;
  endDate?: string;
}

export interface SecurityFinding {
  id: string;
  title: string;
  severity: AuditSeverityType;
  category: AuditCategoryType;
  count: number;
  description: string;
  recommendation: string;
  lastDetectedAt: string;
}

export interface AuditSummaryStats {
  total: number;
  criticalCount: number;
  highCount: number;
  warningCount: number;
  failedCount: number;
  deniedCount: number;
  logins24h: number;
  failedLogins24h: number;
  accessDenied24h: number;
  lockedAccounts: number;
  privilegedChanges24h: number;
  exports24h: number;
}
