// ─── User & Auth ──────────────────────────────────────────────────────────

export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'AO_II'
  | 'HRMO'
  | 'TEACHING_PERSONNEL'
  | 'NON_TEACHING_PERSONNEL';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  personnelId?: number;
  personnel?: {
    id: number;
    firstName: string;
    lastName: string;
    designation?: string;
    address?: string;
  } | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Personnel ────────────────────────────────────────────────────────────

export type PersonnelStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'RETIRED' | 'ARCHIVED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type CivilStatus = 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED';

export interface Personnel {
  id: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  birthDate: string;
  gender: Gender;
  civilStatus: CivilStatus;
  contactNumber?: string;
  address?: string;
  designation: string;
  dateHired: string;
  status: PersonnelStatus;
  profileComplete: boolean;
  plantillaItem?: PlantillaItem;
  user?: { email: string; lastLogin?: string };
}

export interface PlantillaItem {
  itemNumber: string;
  positionTitle: string;
  salaryGrade: number;
  department: string;
  division: string;
}

// ─── Transactions ─────────────────────────────────────────────────────────

export type TransactionStatus =
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'FOR_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEFICIENCY'
  | 'ESCALATED'
  | 'ABANDONED'
  | 'COMPLETED';

export interface Transaction {
  id: number;
  personnelId: number;
  transactionTypeId: number;
  status: TransactionStatus;
  submissionDate?: string;
  validationDate?: string;
  approvalDate?: string;
  remarks?: string;
  resubmissionCount: number;
  deficiencyDeadline?: string;
  createdAt: string;
  updatedAt: string;
  transactionType: { name: string };
  personnel?: { firstName: string; lastName: string; employeeId: string; designation?: string };
  uploadedDocuments?: UploadedDocument[];
}

export interface TransactionType {
  id: number;
  name: string;
  description?: string;
}

// ─── Documents ────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'DEFICIENT'
  | 'REQUIRES_MANUAL_REVIEW';

export interface UploadedDocument {
  id: number;
  transactionId: number;
  requirementTemplateId: number;
  storagePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadDate: string;
  status: DocumentStatus;
  validationNotes?: string;
  validationDate?: string;
  isDuplicate: boolean;
  requirementTemplate?: { name: string };
  fileUrl?: string;
}

export interface RequirementTemplate {
  id: number;
  name: string;
  description?: string;
  isMandatory: boolean;
  expectedDataType: string;
}

export interface ChecklistItem {
  requirementId: number;
  name: string;
  description?: string;
  isMandatory: boolean;
  isUploaded: boolean;
  uploadedDocumentId?: number;
  status: DocumentStatus | 'PENDING_UPLOAD';
}

// ─── Promotions ───────────────────────────────────────────────────────────

export type PromotionCycleType = 'NATURAL_VACANCY' | 'ECP';
export type PromotionCycleStatus =
  | 'PLANNING' | 'CONFIGURED' | 'ACTIVE' | 'CLOSED' | 'RESULTS_READY' | 'PUBLISHED' | 'FINALIZED';
export type PromotionApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'RANKED' | 'APPROVED' | 'REJECTED';

export interface PromotionCycle {
  id: number;
  name: string;
  type: PromotionCycleType;
  startDate: string;
  endDate: string;
  status: PromotionCycleStatus;
  rulesConfigurationJson?: Record<string, unknown>;
  createdAt: string;
}

export interface PromotionApplication {
  id: number;
  personnelId: number;
  promotionCycleId: number;
  status: PromotionApplicationStatus;
  applicationDate: string;
  finalRank?: number;
  scoreDetailsJson?: { totalScore?: number };
  personnel?: { firstName: string; lastName: string; employeeId: string; designation: string };
}

export interface CareerHistoryEntry {
  id: number;
  eventType: string;
  eventDate: string;
  detailsJson?: Record<string, unknown>;
  supportingDocument?: { fileName: string; storagePath: string };
}

// ─── Notifications ────────────────────────────────────────────────────────

export type NotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';

export interface Notification {
  id: number;
  userId: number;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  relatedEntityId?: number;
  relatedEntityType?: string;
}

// ─── Audit ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  timestamp: string;
  userId: number;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  status: string;
}

// ─── API Response ─────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  code?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

// ─── UI State ─────────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  type: NotificationType;
  message: string;
}

export type ThemeMode = 'dark' | 'light';
