/** A promotion cycle as GET /promotions/cycles returns it to personnel. */
export interface PromotionCycleItem {
  id: number;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  applicantCount?: number;
  hasApplied?: boolean;
  hasChecklist?: boolean;
  myApplication?: {
    id: number;
    status: string;
    checker?: string;
    finalRank?: number | null;
    applicationDate?: string;
    hasChecklist: boolean;
    annexCChecklist?: any;
    applicantNumber?: string;
    stageStatus?: string;
    verificationStatus?: string;
    verificationRemarks?: string;
    totalScore?: number;
    disqualificationReason?: string;
    deliberationRemarks?: string;
    forAppointment?: string;
    cycleStatus?: string;
  } | null;
  targetPosition?: string;
  currentPosition?: string;
  isCurrentPosition?: boolean;
  isEligible?: boolean;
  ineligibilityReason?: string | null;
  applicationsOpen?: boolean;
  applicationsState?: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED';
  applicationsOpenOn?: string;
  applicationsCloseOn?: string;
  jumpPositions?: number | null;
  maxAllowedJump?: number;
  rulesConfigurationJson?: Record<string, any>;
}
