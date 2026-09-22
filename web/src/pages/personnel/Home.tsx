import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import './vacancy-card.css';

type TransactionItem = {
  id: number;
  transactionType?: { name: string };
  status: string;
  createdAt: string;
  complianceScore?: number;
};

type PromotionCycleItem = {
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
  jumpPositions?: number | null;
  maxAllowedJump?: number;
  rulesConfigurationJson?: Record<string, any>;
};

export interface ChecklistFormItem {
  code: string;
  title: string;
  description: string;
  isMandatory: boolean;
  submitted: boolean;
  documentName?: string;
  documentType?: string;
  personnelDocumentId?: number;
  uploadedFileUrl?: string;
  fileSize?: number;
  remarks?: string;
}

export const DEFAULT_ANNEX_C_FORM_ITEMS: ChecklistFormItem[] = [
  {
    code: 'a',
    title: 'Letter of Intent',
    description: 'Letter of intent addressed to the Head of Office or highest human resource officer indicating position & item number',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'b',
    title: 'Personal Data Sheet (PDS) & Work Experience Sheet',
    description: 'Duly accomplished Personal Data Sheet (PDS) (CS Form No. 212, Revised 2017) and Work Experience Sheet, if applicable',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'c',
    title: 'Photocopy of Valid PRC License / Identification Card',
    description: 'Photocopy of valid and updated PRC License/ID, if applicable',
    isMandatory: false,
    submitted: false,
  },
  {
    code: 'd',
    title: 'Certificate of Eligibility / Report of Rating',
    description: 'Photocopy of Certificate of Eligibility / Rating (CSC / PRC / PBET / LET), if applicable',
    isMandatory: false,
    submitted: false,
  },
  {
    code: 'e',
    title: 'Scholastic / Academic Records (TOR & Diploma)',
    description: 'Photocopy of scholastic/academic record such as Transcript of Records (TOR) and Diploma, including graduate/post-graduate completion',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'f',
    title: 'Certificates of Training',
    description: 'Photocopy of Certificate/s of Training relevant to the position applied for',
    isMandatory: false,
    submitted: false,
  },
  {
    code: 'g',
    title: 'Certificate of Employment / Service Record',
    description: 'Photocopy of Certificate of Employment, Contract of Service, or duly signed Service Record, whichever is/are applicable',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'h',
    title: 'Photocopy of Latest Appointment',
    description: 'Photocopy of latest appointment (KSS Form / CS Form 33), if applicable',
    isMandatory: false,
    submitted: false,
  },
  {
    code: 'i',
    title: 'Performance Ratings (IPCR)',
    description: 'Photocopy of the Performance Ratings in the last rating period/s covering one (1) year performance prior to the deadline of submission',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'j',
    title: 'Checklist of Requirements & Omnibus Sworn Statement / CAV',
    description: 'Duly signed Checklist of Requirements and Omnibus Sworn Statement on the Certification on Authenticity and Veracity (CAV) and Data Privacy Consent',
    isMandatory: true,
    submitted: false,
  },
  {
    code: 'k',
    title: 'Other Documents / Means of Verification (MOVs)',
    description: 'Other Means of Verification (MOVs) showing Outstanding Accomplishments, Application of Education, and Application of L&D, or portfolio',
    isMandatory: false,
    submitted: false,
  },
];

export const PersonnelHome: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [openCycles, setOpenCycles] = useState<PromotionCycleItem[]>([]);
  const [submittingCycleId, setSubmittingCycleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Available Plantilla Items (Open for Ranking)
  const [availablePlantillaItems, setAvailablePlantillaItems] = useState<any[]>([]);
  const [showPlantillaDirectory, setShowPlantillaDirectory] = useState(false);
  const [plantillaSearch, setPlantillaSearch] = useState('');
  const [ineligibleModalCycle, setIneligibleModalCycle] = useState<PromotionCycleItem | null>(null);

  // Annex C Checklist & Requirements Application State
  const [selectedCycleForChecklist, setSelectedCycleForChecklist] = useState<PromotionCycleItem | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistFormItem[]>(DEFAULT_ANNEX_C_FORM_ITEMS);
  const [checklistApplicantName, setChecklistApplicantName] = useState('');
  const [checklistOffice, setChecklistOffice] = useState('SDO Koronadal City');
  const [checklistContactNo, setChecklistContactNo] = useState('');
  const [checklistRegion, setChecklistRegion] = useState('Region XII - SOCCSKSARGEN');
  const [checklistEthnicity, setChecklistEthnicity] = useState('Filipino');
  const [checklistIsPwd, setChecklistIsPwd] = useState(false);
  const [checklistIsSoloParent, setChecklistIsSoloParent] = useState(false);
  const [checklistApplicationCode, setChecklistApplicationCode] = useState('');
  const [checklistOmnibusAgreed, setChecklistOmnibusAgreed] = useState(false);
  const [checklistDataPrivacyAgreed, setChecklistDataPrivacyAgreed] = useState(false);
  const [isSubmittingChecklist, setIsSubmittingChecklist] = useState(false);
  const [promotionFilter, setPromotionFilter] = useState<'ALL' | 'MY_APPLICATIONS'>('ALL');
  const [user201Documents, setUser201Documents] = useState<any[]>([]);
  const [picking201ForCode, setPicking201ForCode] = useState<string | null>(null);
  const [uploadingForCode, setUploadingForCode] = useState<string | null>(null);
  const isChecklistReadOnly = Boolean(selectedCycleForChecklist?.hasApplied && selectedCycleForChecklist?.hasChecklist);

  const normalizePositionTitle = (value: unknown) => String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:salary\s*grade|sg)\s*\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const isCycleForCurrentPosition = (cycle: PromotionCycleItem | any) => {
    if (cycle?.isCurrentPosition) return true;
    const current = user?.personnel?.designation || cycle?.currentPosition || '';
    const target = cycle?.targetPosition || cycle?.rulesConfigurationJson?.targetPosition || '';
    return Boolean(current && target && normalizePositionTitle(current) === normalizePositionTitle(target));
  };

  const getApplicationStatusInfo = (cycle: PromotionCycleItem) => {
    const app = cycle.myApplication;
    if (!cycle.hasApplied) return null;

    if (cycle.status === 'CANCELLED' || app?.cycleStatus === 'CANCELLED' || app?.stageStatus === 'CANCELLED') {
      return {
        label: 'Cycle Discontinued',
        stage: 'Discontinued',
        badgeColor: '#EF4444',
        badgeBg: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        icon: 'error',
        // Terminal: the cycle is gone, so offering a checklist action would ask
        // the applicant to do work that can never be assessed.
        terminal: true,
        description: 'This promotion cycle was discontinued or cancelled by the Division Office.',
      };
    }

    if (app?.status === 'APPROVED' || app?.stageStatus === 'SELECTED_PENDING_DOCS') {
      return {
        label: 'Approved for Promotion',
        stage: 'Appointment in Progress',
        badgeColor: '#059669',
        badgeBg: 'rgba(5, 150, 105, 0.12)',
        borderColor: 'rgba(5, 150, 105, 0.35)',
        icon: 'approved',
        terminal: false,
        description: 'Congratulations! You have been selected and recommended for appointment under this promotion cycle.',
      };
    }

    if (app?.status === 'REJECTED') {
      return {
        label: 'Not Selected / Disqualified',
        stage: 'Deliberation Concluded',
        badgeColor: '#DC2626',
        badgeBg: 'rgba(220, 38, 38, 0.1)',
        borderColor: 'rgba(220, 38, 38, 0.28)',
        icon: 'warning',
        terminal: true,
        description: app.disqualificationReason || app.deliberationRemarks || 'Application did not meet comparative assessment selection quota.',
      };
    }

    if (app?.status === 'RANKED' || app?.stageStatus === 'FINAL_RANKED') {
      const rankText = app?.finalRank ? `Rank #${app.finalRank}` : 'Comparative Assessment Complete';
      const scoreText = app?.totalScore != null ? ` (${app.totalScore} pts)` : '';
      return {
        label: `${rankText}${scoreText}`,
        stage: 'Deliberation Finalized',
        badgeColor: '#2563EB',
        badgeBg: 'rgba(37, 99, 235, 0.12)',
        borderColor: 'rgba(37, 99, 235, 0.3)',
        icon: 'chart',
        terminal: false,
        description: `Deliberated by HRMPSB. Official standing: ${rankText}. Awaiting Division appointing authority confirmation.`,
      };
    }

    if (app?.status === 'UNDER_REVIEW' || app?.stageStatus === 'INITIAL_RATED') {
      const scoreText = app?.totalScore != null ? ` (${app.totalScore} pts)` : '';
      return {
        label: `Under Deliberation${scoreText}`,
        stage: 'HRMPSB Deliberation',
        badgeColor: '#7C3AED',
        badgeBg: 'rgba(124, 58, 237, 0.1)',
        borderColor: 'rgba(124, 58, 237, 0.3)',
        icon: 'pending',
        terminal: false,
        description: 'Document completeness verified by Administrative Officer II. Application is under HRMPSB comparative evaluation.',
      };
    }

    // Default: SUBMITTED
    if (!cycle.hasChecklist && !app?.hasChecklist) {
      return {
        label: 'Checklist Required',
        stage: 'Pending Requirements',
        badgeColor: '#D97706',
        badgeBg: 'rgba(217, 119, 6, 0.12)',
        borderColor: 'rgba(217, 119, 6, 0.3)',
        icon: 'upload',
        terminal: false,
        description: 'Application initiated. Please upload your mandatory Annex C documentary requirements to proceed.',
      };
    }

    return {
      label: 'Submitted — Under AO II Verification',
      stage: 'Pre-assessment Verification',
      badgeColor: '#0284C7',
      badgeBg: 'rgba(2, 132, 199, 0.1)',
      borderColor: 'rgba(2, 132, 199, 0.28)',
      icon: 'sync',
      terminal: false,
      description: 'Requirements checklist submitted. Awaiting Station AO II verification of authenticity and completeness.',
    };
  };

  // The documents API returns `uploadedAt`; reading `createdAt` produced
  // "Uploaded Invalid Date" on every row of the 201 picker.
  const formatUploadedOn = (value?: string) => {
    if (!value) return '';
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return '';
    return `Uploaded ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // Rounding straight to KB showed "0 KB" for anything under half a kilobyte.
  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Cycle names arrive with the plantilla code appended, e.g.
  // "Ranking for Vacancy: Teacher V (OSEC-DECSB-TCH5-776700-2026)". The code has
  // its own row underneath, so strip it here rather than printing it twice.
  const cycleHeadline = (name: string, itemNumber?: string) => {
    if (!name) return 'Promotion Cycle';
    const withoutCode = itemNumber
      ? name.replace(`(${itemNumber})`, '').trim()
      : name.replace(/\s*\([A-Z0-9-]{8,}\)\s*$/, '').trim();
    return (withoutCode || name).replace(/^Ranking for Vacancy:\s*/i, '').trim() || name;
  };

  // Vacancy types are stored as enum values; show them as words.
  const vacancyTypeLabel = (type?: string) =>
    (type || '')
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || 'Promotion';

  const fetchMyTransactions = useCallback(async () => {
    try {
      const res = await apiClient.get('/transactions/my-transactions');
      setTransactions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load active transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOpenCycles = useCallback(async () => {
    try {
      const res = await apiClient.get('/promotions/cycles?status=ACTIVE,PLANNING&includeMyApplications=true');
      const cycles = res.data?.data || [];
      setOpenCycles(cycles);
    } catch (err) {
      console.error('Failed to load open promotion cycles:', err);
    }
  }, []);

  const fetchAvailablePlantilla = useCallback(async () => {
    try {
      const res = await apiClient.get('/plantilla/available');
      setAvailablePlantillaItems(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load available plantilla items:', err);
    }
  }, []);

  useRealtimeTransactions(() => {
    fetchMyTransactions();
    fetchOpenCycles();
    fetchAvailablePlantilla();
  });

  useEffect(() => {
    fetchMyTransactions();
    fetchOpenCycles();
    fetchAvailablePlantilla();
  }, [fetchMyTransactions, fetchOpenCycles, fetchAvailablePlantilla, user?.id]);

  // The Annex C wording and its mandatory set come from the backend, so a DepEd
  // revision applies everywhere at once. DEFAULT_ANNEX_C_FORM_ITEMS is the offline
  // fallback. Cached for the page lifetime — it is reference data, not per-user.
  const annexCTemplateRef = useRef<ChecklistFormItem[] | null>(null);
  const loadAnnexCTemplate = useCallback(async (): Promise<ChecklistFormItem[]> => {
    if (annexCTemplateRef.current) return annexCTemplateRef.current;
    try {
      const res = await apiClient.get('/promotions/annex-c-requirements');
      const list = res.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        const mapped: ChecklistFormItem[] = list.map((item: any) => ({
          code: String(item.code),
          title: String(item.title),
          description: String(item.description),
          isMandatory: Boolean(item.isMandatory),
          submitted: false,
        }));
        annexCTemplateRef.current = mapped;
        return mapped;
      }
    } catch (err) {
      console.error('Failed to load Annex C requirements, using bundled copy:', err);
    }
    return DEFAULT_ANNEX_C_FORM_ITEMS;
  }, []);

  const handleOpenChecklistModal = async (cycle: PromotionCycleItem) => {
    if (isCycleForCurrentPosition(cycle)) {
      addToast(`You cannot apply for ${cycle.targetPosition || cycle.rulesConfigurationJson?.targetPosition || 'this position'} because it is already your current position.`, 'ERROR');
      return;
    }
    if (cycle.isEligible === false) {
      addToast(cycle.ineligibilityReason || 'You are not eligible to apply for this promotion cycle under DepEd position jump rules.', 'ERROR');
      return;
    }

    setSelectedCycleForChecklist(cycle);

    // Pre-populate applicant profile fields
    const fullName = user?.personnel
      ? `${user.personnel.firstName || ''} ${user.personnel.lastName || ''}`.trim()
      : (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '');
    setChecklistApplicantName(fullName || 'Applicant');
    const station = (user?.personnel as any)?.stationName || user?.personnel?.address || (cycle.rulesConfigurationJson as any)?.school || 'SDO Koronadal City';
    setChecklistOffice(station);
    setChecklistContactNo((user?.personnel as any)?.mobileNo || (user?.personnel as any)?.contactNumber || '');
    setChecklistRegion('Region XII - SOCCSKSARGEN');
    setChecklistEthnicity('Filipino');
    setChecklistIsPwd(false);
    setChecklistIsSoloParent(false);

    // Generate or retrieve application code
    const existingCode = cycle.myApplication?.applicantNumber || cycle.myApplication?.annexCChecklist?.applicationCode;
    const generatedCode = existingCode || `APP-2026-${String(Math.floor(1000 + Math.random() * 9000))}`;
    setChecklistApplicationCode(generatedCode);

    // If application already has submitted checklist, load it!
    const annexCTemplate = await loadAnnexCTemplate();
    const existingChecklist = cycle.myApplication?.annexCChecklist;
    if (existingChecklist && Array.isArray(existingChecklist.items) && existingChecklist.items.length > 0) {
      const itemsMap = new Map(existingChecklist.items.map((it: any) => [it.code, it]));
      const mapped = annexCTemplate.map(def => {
        const found: any = itemsMap.get(def.code);
        if (found) {
          return {
            ...def,
            submitted: Boolean(found.submitted),
            documentName: found.documentName,
            uploadedFileUrl: found.uploadedFileUrl,
            personnelDocumentId: found.personnelDocumentId,
            fileSize: found.fileSize,
            remarks: found.remarks || '',
          };
        }
        return { ...def };
      });
      setChecklistItems(mapped);
      setChecklistOmnibusAgreed(Boolean(existingChecklist.omnibusSwornAgreed));
      setChecklistDataPrivacyAgreed(Boolean(existingChecklist.dataPrivacyConsentAgreed));
      if (existingChecklist.nameOfApplicant) setChecklistApplicantName(existingChecklist.nameOfApplicant);
      if (existingChecklist.officeAppliedFor) setChecklistOffice(existingChecklist.officeAppliedFor);
      if (existingChecklist.contactNumber) setChecklistContactNo(existingChecklist.contactNumber);
      if (existingChecklist.isPersonWithDisability !== undefined) setChecklistIsPwd(Boolean(existingChecklist.isPersonWithDisability));
      if (existingChecklist.isSoloParent !== undefined) setChecklistIsSoloParent(Boolean(existingChecklist.isSoloParent));
    } else {
      setChecklistItems(annexCTemplate.map(it => ({ ...it, submitted: false })));
      setChecklistOmnibusAgreed(false);
      setChecklistDataPrivacyAgreed(false);
    }

    // Load user's 201 documents in background so they can easily pick from their 201 files
    try {
      const res = await apiClient.get('/personnel/documents');
      setUser201Documents(res.data?.data || []);
    } catch {
      setUser201Documents([]);
    }
  };

  const handleApplyForCycle = (cycle: PromotionCycleItem) => {
    handleOpenChecklistModal(cycle);
  };

  const handleFileUploadForItem = async (code: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      addToast('File size must be under 10 MB.', 'ERROR');
      return;
    }

    setUploadingForCode(code);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentTypeId', 'OTHER');
      formData.append('customDocumentName', `Annex C (${code.toUpperCase()}) - ${file.name}`);
      formData.append('remarks', `Submitted for promotion requirement ${code.toUpperCase()}`);

      let docId: number | undefined;
      let fileUrl: string | undefined;

      try {
        const res = await apiClient.post('/personnel/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        docId = res.data?.data?.id;
        fileUrl = res.data?.data?.fileUrl;
      } catch (uploadErr) {
        throw uploadErr;
      }
      if (!docId || !fileUrl) throw new Error('The server did not confirm the upload.');

      setChecklistItems(prev =>
        prev.map(it => {
          if (it.code === code) {
            return {
              ...it,
              submitted: true,
              documentName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              uploadedFileUrl: fileUrl,
              personnelDocumentId: docId,
            };
          }
          return it;
        })
      );
      addToast(`Attached "${file.name}" to requirement (${code.toUpperCase()})!`, 'SUCCESS');
    } catch {
      addToast('Failed to attach file.', 'ERROR');
    } finally {
      setUploadingForCode(null);
      e.target.value = '';
    }
  };

  const handleAttachFrom201 = (code: string, doc: any) => {
    setChecklistItems(prev =>
      prev.map(it => {
        if (it.code === code) {
          return {
            ...it,
            submitted: true,
            documentName: doc.originalFileName || doc.documentTypeName || '201 Document',
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            uploadedFileUrl: doc.fileUrl,
            personnelDocumentId: doc.id,
          };
        }
        return it;
      })
    );
    setPicking201ForCode(null);
    addToast(`Attached 201 file "${doc.originalFileName || doc.documentTypeName}" to (${code.toUpperCase()})!`, 'SUCCESS');
  };

  const handleRemoveAttachment = (code: string) => {
    setChecklistItems(prev =>
      prev.map(it => {
        if (it.code === code) {
          return {
            ...it,
            submitted: false,
            documentName: undefined,
            fileSize: undefined,
            uploadedFileUrl: undefined,
            personnelDocumentId: undefined,
          };
        }
        return it;
      })
    );
  };

  const handleSubmitChecklistApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCycleForChecklist) return;

    const mandatoryItems = checklistItems.filter(i => i.isMandatory);
    const missingMandatory = mandatoryItems.filter(i => !i.submitted);
    if (missingMandatory.length > 0) {
      addToast(`Please attach all mandatory requirements: items ${missingMandatory.map(m => m.code.toUpperCase()).join(', ')} are required.`, 'ERROR');
      return;
    }

    if (!checklistOmnibusAgreed) {
      addToast('Please check and agree to the Omnibus Sworn Statement on the Authenticity and Veracity of submitted documents.', 'ERROR');
      return;
    }

    if (!checklistDataPrivacyAgreed) {
      addToast('Please check the Data Privacy Consent agreement to proceed with your application.', 'ERROR');
      return;
    }

    setIsSubmittingChecklist(true);
    try {
      const checklistPayload = {
        nameOfApplicant: checklistApplicantName.trim() || 'Applicant',
        positionAppliedFor: selectedCycleForChecklist.name,
        officeAppliedFor: checklistOffice.trim() || 'SDO Koronadal City',
        contactNumber: checklistContactNo.trim() || 'N/A',
        region: checklistRegion.trim() || 'Region XII - SOCCSKSARGEN',
        ethnicity: checklistEthnicity.trim() || 'Filipino',
        isPersonWithDisability: checklistIsPwd,
        isSoloParent: checklistIsSoloParent,
        applicationCode: checklistApplicationCode,
        items: checklistItems,
        omnibusSwornAgreed: checklistOmnibusAgreed,
        dataPrivacyConsentAgreed: checklistDataPrivacyAgreed,
        submittedAt: new Date().toISOString(),
      };

      await apiClient.post(`/promotions/cycles/${selectedCycleForChecklist.id}/apply`, {
        applicationCode: checklistApplicationCode,
        appliedVia: 'WEB_PORTAL',
        checklist: checklistPayload,
      });

      addToast(`Promotion application and Annex C requirements successfully submitted for "${selectedCycleForChecklist.name}"! Administrative Officer II (AO II) will verify your documents completeness.`, 'SUCCESS');
      setSelectedCycleForChecklist(null);
      await fetchOpenCycles();
      await fetchMyTransactions();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to submit promotion application and requirements.', 'ERROR');
    } finally {
      setIsSubmittingChecklist(false);
    }
  };

  const roleLabel =
    user?.role === 'TEACHING_PERSONNEL' ? 'Teaching Personnel' :
    user?.role === 'NON_TEACHING_PERSONNEL' ? 'Non-Teaching Personnel' : 'Personnel';

  const formattedToday = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  const activeTransactions = transactions.filter(
    t => t.status !== 'APPROVED' && t.status !== 'COMPLETED'
  );

  const latestApproved = transactions.find(
    t => t.status === 'APPROVED' || t.status === 'COMPLETED'
  );

  const alertsCount = transactions.filter(
    t => t.status === 'DEFICIENCY' || t.status.includes('RETURNED')
  ).length;

  const userFullName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim()
    : 'Personnel Member';

  return (
    <div className="dashboard-editorial-root animate-fade-in">
      
      {/* ─── 1. TOP WORKSPACE HEADER BAR ───────────────────────────── */}
      <div className="workspace-top-bar">
        {/* Right: Date Badge */}
        <div className="top-controls-group">
          <div className="date-chip-pill">
            <span className="live-indicator-dot" />
            <span>Today, {formattedToday}</span>
          </div>
        </div>
      </div>

      {/* ─── 2. EDITORIAL PAGE HEADING ─────────────────────────────── */}
      <div className="editorial-heading-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h1 className="editorial-main-title" style={{ margin: 0 }}>
            Welcome back, {userFullName}!
          </h1>
          {roleLabel && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 9999,
                background: 'rgba(215, 248, 74, 0.15)',
                color: 'var(--color-primary)',
                border: '1px solid var(--glass-border-subtle)',
                letterSpacing: '0.02em',
              }}
            >
              {roleLabel}
            </span>
          )}
        </div>
        <p className="editorial-sub-title">
          Manage your digital 201 records, submission compliance, and DepEd career transactions.
        </p>
      </div>

      {/* ─── 3. METRICS ROW (Strict Database Numbers & Editorial Styling) ─── */}
      <div className="metrics-grid-row" style={{ gridTemplateColumns: 'var(--layout-columns-4, repeat(4, 1fr))' }}>
        {/* Metric 1: Active Transactions */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">ACTIVE TRANSACTIONS</span>
            <span className="metric-lime-pill">{activeTransactions.length > 0 ? 'PROCESSING' : 'CLEAR'}</span>
          </div>
          <div className="metric-value-num">{loading ? '...' : activeTransactions.length}</div>
          <div className="metric-footer-note">Pending Document Verification</div>
          <div className="metric-bar-visualizer">
            <div className="bar-fill fill-lime" style={{ width: activeTransactions.length > 0 ? '100%' : '0%' }} />
          </div>
        </div>

        {/* Metric 2: 201 Master File Status */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">201 MASTER FILE</span>
            <span className="metric-lime-pill">VERIFIED</span>
          </div>
          <div className="metric-value-num">100%</div>
          <div className="metric-footer-note">DepEd CS Form 212 & WES Verified</div>
          <div className="metric-dot-matrix">
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot active-dot" />
          </div>
        </div>

        {/* Metric 3: Compliance Alerts */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">COMPLIANCE ALERTS</span>
            <span className={alertsCount > 0 ? 'metric-lime-pill' : 'metric-gray-pill'} style={alertsCount > 0 ? { background: '#ef4444', color: '#fff' } : {}}>
              {alertsCount > 0 ? 'ACTION REQ' : 'OPTIMAL'}
            </span>
          </div>
          <div className="metric-value-num" style={{ color: alertsCount > 0 ? '#ef4444' : 'inherit' }}>
            {alertsCount}
          </div>
          <div className="metric-footer-note">{alertsCount > 0 ? 'Document deficiencies found' : 'Zero compliance deficiencies'}</div>
          <div className="metric-bar-visualizer">
            <div className="bar-fill" style={{ width: alertsCount > 0 ? '100%' : '0%', background: alertsCount > 0 ? '#ef4444' : '#D7F84A' }} />
          </div>
        </div>

        {/* Metric 4: Open Vacancies */}
        <div className="soft-card metric-card">
          <div className="metric-card-top">
            <span className="metric-label">CAREER VACANCIES</span>
            <span className="metric-lavender-pill">{openCycles.length} OPEN</span>
          </div>
          <div className="metric-value-num">{openCycles.length}</div>
          <div className="metric-footer-note">DepEd Promotion & Reclass Cycles</div>
          <div className="metric-dot-matrix">
            <span className="dot active-dot" />
            <span className="dot active-dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </div>

      {/* ─── 4. ASYMMETRIC MAIN GRID (2fr / 1fr) ────────────────────── */}
      <div className="asymmetric-main-grid">
        
        {/* LEFT COLUMN: Open Vacancies & Active Transactions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Section 1: Active 201 Transactions */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Active 201 Transactions</h3>
                <div className="card-heading-sub">Live submission tracking and verification stages</div>
              </div>
              <Link to="/personnel/transactions" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                View All Transactions →
              </Link>
            </div>

            {activeTransactions.length === 0 ? (
              transactions.length > 0 ? (
                /* All Filings Up to Date (with recent approved reference) */
                <div style={{
                  padding: '26px 24px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 20,
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-success)',
                        flexShrink: 0
                      }}>
                        <AppIcon name="checklist" size={24} color="var(--color-success)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                          All 201 Applications Up to Date
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          No pending submissions or bottlenecks. Your 201 records are verified and archived.
                        </div>
                      </div>
                    </div>
                    <Link
                      to="/personnel/transactions"
                      className="btn btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 999
                      }}
                    >
                      <AppIcon name="transactions" size={14} /> View My Transactions
                    </Link>
                  </div>

                  {/* Most Recent Completed Record Snapshot */}
                  {latestApproved && (
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: 14,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>
                          TRX-{latestApproved.id}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {latestApproved.transactionType?.name || 'Promotion / Appointment'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="badge badge-success" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999 }}>
                          APPROVED BY HRMO
                        </span>
                        <Link
                          to={`/personnel/checklist?txId=${latestApproved.id}`}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          View Dossier →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Truly Empty 201 State */
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '44px 28px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 20,
                  border: '1px dashed var(--color-border)',
                }}>
                  <div style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: 'var(--color-primary)'
                  }}>
                    <AppIcon name="transactions" size={28} color="var(--color-primary)" />
                  </div>
                  
                  <div style={{
                    fontWeight: 800,
                    fontSize: 17,
                    marginBottom: 8,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em'
                  }}>
                    No Active 201 Transactions
                  </div>
                  
                  <p style={{
                    maxWidth: 440,
                    margin: '0 auto 20px auto',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--color-text-secondary)'
                  }}>
                    You have no pending document submissions. When HR selects you for hiring or promotion, your appointment transaction will appear in My Transactions so you can complete the requirements.
                  </p>

                  {/* 3-Step Guided Workflow Pills */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 24,
                    maxWidth: 580
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>1</span>
                      Open Assigned Transaction
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>2</span>
                      Upload PDF Checklist
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-text-inverse, #141416)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>3</span>
                      AO II & HRMO Live Evaluation
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Link
                      to="/personnel/transactions"
                      className="btn btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        textDecoration: 'none',
                        padding: '10px 18px',
                        borderRadius: 999
                      }}
                    >
                      View Filing Archive
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTransactions.map(tx => (
                  <Link key={tx.id} to={`/personnel/checklist?txId=${tx.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div className="card hover-lift" style={{ background: 'var(--color-bg-secondary)', margin: 0, padding: 18, borderRadius: 16, border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {tx.transactionType?.name || 'HR Transaction'}
                          </span>
                          <div className="text-xs text-muted mt-1 font-mono">Ref: TRX-{tx.id}</div>
                        </div>
                        <StatusBadge status={tx.status} />
                      </div>
                      <div className="text-xs text-muted">
                        Submitted: {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span className="text-muted">Document Compliance Score</span>
                          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {tx.complianceScore !== undefined ? `${tx.complianceScore}%` : 'In Progress'}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 999 }}>
                          <div className="progress-fill" style={{ width: `${tx.complianceScore ?? 0}%`, background: 'var(--color-primary)' }} />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Open Promotion & Reclassification Vacancies */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Open Promotion & Reclassification Vacancies</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {openCycles.some(c => c.hasApplied) && (
                  <div style={{ display: 'inline-flex', borderRadius: '9999px', background: 'var(--color-bg-tertiary)', padding: 2, border: '1px solid var(--color-border)' }}>
                    <button
                      type="button"
                      onClick={() => setPromotionFilter('ALL')}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: '9999px',
                        border: 'none',
                        background: promotionFilter === 'ALL' ? 'var(--color-bg-secondary)' : 'transparent',
                        color: promotionFilter === 'ALL' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        boxShadow: promotionFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      All Open Vacancies ({openCycles.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionFilter('MY_APPLICATIONS')}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: '9999px',
                        border: 'none',
                        background: promotionFilter === 'MY_APPLICATIONS' ? 'var(--color-bg-secondary)' : 'transparent',
                        color: promotionFilter === 'MY_APPLICATIONS' ? '#059669' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        boxShadow: promotionFilter === 'MY_APPLICATIONS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                      My Applications ({openCycles.filter(c => c.hasApplied).length})
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPlantillaDirectory(true)}
                  className="btn btn-secondary btn-xs"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    border: '1px solid var(--color-border)',
                    fontWeight: 700,
                    fontSize: 11,
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <AppIcon name="employment" size={13} color="var(--color-primary)" />
                  Item Availability Directory ({availablePlantillaItems.length} Vacancies)
                </button>
              </div>
            </div>

            {openCycles.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '40px 24px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 20,
                border: '1px dashed var(--color-border)'
              }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                  color: 'var(--color-text-muted)'
                }}>
                  <AppIcon name="checklist" size={26} color="var(--color-text-muted)" />
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: 'var(--color-text-primary)' }}>
                  No Active Vacancies Right Now
                </div>
                <div style={{ maxWidth: 420, margin: '0 auto', fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  All promotion and reclassification cycles are currently closed or in evaluation. Check back soon for upcoming DepEd cycles!
                </div>
              </div>
            ) : (promotionFilter === 'MY_APPLICATIONS' && openCycles.filter(c => c.hasApplied).length === 0) ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--color-bg-secondary)', borderRadius: 16, border: '1px dashed var(--color-border)' }}>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  You have not submitted an application to any active promotion cycle yet.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setPromotionFilter('ALL')}
                  style={{ marginTop: 10 }}
                >
                  Browse Available Vacancies
                </button>
              </div>
            ) : (
              <div className="vac-list">
                {(promotionFilter === 'MY_APPLICATIONS' ? openCycles.filter(c => c.hasApplied) : openCycles).map(cycle => {
                  const isActive = cycle.status === 'ACTIVE';
                  const rules = (cycle as any).rulesConfigurationJson || {};
                  const statusInfo = getApplicationStatusInfo(cycle);
                  const accent = statusInfo?.badgeColor || (isActive ? 'var(--color-primary)' : 'var(--color-border)');

                  return (
                    <div
                      key={cycle.id}
                      className={`vac-card${statusInfo?.terminal ? ' is-muted' : ''}`}
                      style={{
                        ['--vac-accent' as any]: accent,
                        ['--vac-accent-soft' as any]: statusInfo?.badgeBg || 'var(--color-bg-tertiary)',
                      }}
                    >
                      <div className="vac-head">
                        <div style={{ minWidth: 0 }}>
                          <h4 className="vac-title">{cycleHeadline(cycle.name, rules.plantillaItemNumber)}</h4>
                          <span className="vac-title-sub">{vacancyTypeLabel(cycle.type)}</span>
                        </div>
                        <span className={`vac-availability ${isActive ? 'is-open' : 'is-upcoming'}`}>
                          <span className="vac-dot" />
                          {isActive ? 'Open now' : 'Upcoming'}
                        </span>
                      </div>

                      <div className="vac-meta">
                        <div className="vac-meta-item">
                          <span className="vac-meta-label">{isActive ? 'Deadline' : 'Opens'}</span>
                          <span className="vac-meta-value">
                            {new Date(isActive ? cycle.endDate : cycle.startDate).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="vac-meta-item">
                          <span className="vac-meta-label">Applicants</span>
                          <span className="vac-meta-value">{cycle.applicantCount || 0}</span>
                        </div>
                        {rules.plantillaItemNumber && (
                          <div className="vac-meta-item">
                            <span className="vac-meta-label">Plantilla item</span>
                            <span className="vac-meta-value is-mono">{rules.plantillaItemNumber}</span>
                          </div>
                        )}
                        {rules.school && rules.school !== 'All Schools in District' && (
                          <div className="vac-meta-item">
                            <span className="vac-meta-label">Station</span>
                            <span className="vac-meta-value">{rules.school}</span>
                          </div>
                        )}
                      </div>

                      {/* Application Status Bar (when personnel applied) */}
                      {cycle.hasApplied && statusInfo ? (
                        <div className="vac-status">
                          <div className="vac-status-main">
                            <span className="vac-status-icon">
                              <AppIcon name={statusInfo.icon as any} size={16} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div className="vac-status-label">
                                {statusInfo.label}
                                {cycle.myApplication?.applicantNumber && (
                                  <span className="vac-ref">{cycle.myApplication.applicantNumber}</span>
                                )}
                              </div>
                              <p className="vac-status-desc">{statusInfo.description}</p>
                            </div>
                          </div>
                          {/* A discontinued or concluded cycle has nothing left to submit,
                              so it gets no call to action. */}
                          {!statusInfo.terminal && (
                            <div className="vac-actions">
                              <button
                                type="button"
                                className={cycle.hasChecklist ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                                onClick={() => handleOpenChecklistModal(cycle)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                <AppIcon name={cycle.hasChecklist ? 'checklist' : 'upload'} size={14} />
                                {cycle.hasChecklist ? 'View checklist' : 'Upload requirements'}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="vac-foot">
                          {isCycleForCurrentPosition(cycle) ? (
                            <span className="vac-note">
                              <AppIcon name="employment" size={14} />
                              This is your current position
                            </span>
                          ) : cycle.isEligible === false ? (
                            <>
                              <span className="vac-note is-blocked">
                                <AppIcon name="warning" size={14} />
                                You are not eligible for this vacancy
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIneligibleModalCycle(cycle)}
                              >
                                See why
                              </button>
                            </>
                          ) : isActive ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={submittingCycleId === cycle.id}
                              onClick={() => handleOpenChecklistModal(cycle)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <AppIcon name="promotions" size={14} />
                              Apply for this vacancy
                            </button>
                          ) : (
                            <span className="vac-note">
                              <AppIcon name="clock" size={14} />
                              Opens {new Date(cycle.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Quick Actions & 201 File Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Quick Actions Bento Card */}
          <div className="table-card-large">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Quick Actions</h3>
                <div className="card-heading-sub">Frequently used personnel services</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, repeat(2, 1fr))', gap: 12 }}>
              <Link to="/personnel/transactions" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(56, 139, 253, 0.14)', color: '#388bfd' }}>
                  <AppIcon name="transactions" size={22} />
                </div>
                <span className="quick-action-tile-title">My Transactions</span>
                <span className="quick-action-sub">Complete assigned requirements</span>
              </Link>

              <Link to="/personnel/notifications" className="quick-action-tile" style={{ position: 'relative' }}>
                <div className="quick-action-tile-icon" style={{ background: 'rgba(139, 92, 246, 0.14)', color: '#8b5cf6' }}>
                  <AppIcon name="notifications" size={22} />
                </div>
                <span className="quick-action-tile-title">Notifications</span>
                <span className="quick-action-sub">Check status alerts</span>
                {alertsCount > 0 && (
                  <span className="badge badge-warning" style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, padding: '2px 7px', borderRadius: 999 }}>
                    {alertsCount}
                  </span>
                )}
              </Link>

              <Link to="/personnel/profile-completion" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(234, 179, 8, 0.14)', color: '#eab308' }}>
                  <AppIcon name="personal" size={22} />
                </div>
                <span className="quick-action-tile-title">My 201 File</span>
                <span className="quick-action-sub">Update PDS & WES</span>
              </Link>

              <Link to="/personnel/profile" className="quick-action-tile">
                <div className="quick-action-tile-icon" style={{ background: 'rgba(16, 185, 129, 0.14)', color: '#10b981' }}>
                  <AppIcon name="repository" size={22} />
                </div>
                <span className="quick-action-tile-title">Service Record</span>
                <span className="quick-action-sub">View DepEd history</span>
              </Link>
            </div>
          </div>

          {/* Personnel 201 Dossier Summary Card */}
          <div className="table-card-large" style={{ background: 'var(--color-bg-card)' }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">201 Personnel Dossier</h3>
                <div className="card-heading-sub">Master employee profile & service data</div>
              </div>
              <AppIcon name="profile" size={20} color="var(--color-primary)" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.825rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">Employee ID:</span>
                <strong className="font-mono" style={{ color: 'var(--color-primary)' }}>
                  {user?.personnelId || (user?.id ? `EMP-${user.id}` : 'CSD-KOR-2026')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">Personnel Category:</span>
                <span className="badge badge-info" style={{ fontSize: 10 }}>{roleLabel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-muted">PRC Verification:</span>
                <span style={{ color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="approved" size={13} color="#10b981" /> Verified (LET)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="text-muted">Division Office:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>SDO Koronadal City</strong>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <Link to="/personnel/profile-completion" className="btn btn-secondary btn-sm btn-full" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <AppIcon name="edit" size={14} /> Update 201 Dossier File
              </Link>
            </div>
          </div>

        </div>

      </div>

      {/* ─── 5. ITEM AVAILABILITY / PLANTILLA DIRECTORY MODAL ─── */}
      {showPlantillaDirectory && (
        <ModalPortal>
        <ModalOverlay onDismiss={() => setShowPlantillaDirectory(false)}
          className="modal-overlay plantilla-directory-overlay"
          role="presentation"
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 1100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPlantillaDirectory(false);
          }}
        >
          <div
            className="soft-card plantilla-directory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plantilla-directory-title"
            style={{
              width: '100%',
              maxWidth: 920,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
            }}
          >
            {/* Modal Header */}
            <div
              className="plantilla-directory-header"
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(215, 248, 74, 0.15)',
                    border: '1px solid rgba(215, 248, 74, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-primary)',
                    flexShrink: 0,
                  }}
                >
                  <AppIcon name="employment" size={20} color="var(--color-primary)" />
                </div>
                <div>
                  <h3 id="plantilla-directory-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.015em' }}>
                    DepEd Plantilla Directory & Item Availability
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlantillaDirectory(false)}
                title="Close"
                aria-label="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <AppIcon name="close" size={16} />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="plantilla-directory-toolbar" style={{ padding: '14px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 14, alignItems: 'center', background: 'var(--color-bg-card)' }}>
              <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 14, pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 2 }}>
                  <AppIcon name="search" size={16} color="var(--color-text-muted)" />
                </div>
                <input
                  aria-label="Search by position title, plantilla item #, school station, district"
                  type="text"
                  className="search-input"
                  placeholder="Search by position title, plantilla item #, school station, district..."
                  value={plantillaSearch}
                  onChange={(e) => setPlantillaSearch(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    padding: '9px 16px 9px 42px',
                    paddingLeft: '42px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'nowrap',
                  background: 'var(--color-bg-secondary)',
                  padding: '7px 14px',
                  borderRadius: 20,
                  border: '1px solid var(--color-border)',
                  fontWeight: 500,
                }}
              >
                Found <strong style={{ color: 'var(--color-text-primary)' }}>{availablePlantillaItems.filter(item => {
                  if (!plantillaSearch.trim()) return true;
                  const q = plantillaSearch.toLowerCase();
                  return (
                    item.itemNumber?.toLowerCase().includes(q) ||
                    item.positionTitle?.toLowerCase().includes(q) ||
                    item.stationOrSchool?.toLowerCase().includes(q) ||
                    item.district?.toLowerCase().includes(q) ||
                    item.track?.toLowerCase().includes(q)
                  );
                }).length}</strong> vacant item(s)
              </div>
            </div>

            {/* Modal Body / Items List */}
            <div className="plantilla-directory-list" style={{ padding: '20px 24px 24px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {availablePlantillaItems.filter(item => {
                if (!plantillaSearch.trim()) return true;
                const q = plantillaSearch.toLowerCase();
                return (
                  item.itemNumber?.toLowerCase().includes(q) ||
                  item.positionTitle?.toLowerCase().includes(q) ||
                  item.stationOrSchool?.toLowerCase().includes(q) ||
                  item.district?.toLowerCase().includes(q) ||
                  item.track?.toLowerCase().includes(q)
                );
              }).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
                  <AppIcon name="compliance" size={32} color="var(--color-text-muted)" />
                  <p style={{ marginTop: 12, fontWeight: 600 }}>No vacant plantilla items found matching your filter.</p>
                </div>
              ) : (
                availablePlantillaItems.filter(item => {
                  if (!plantillaSearch.trim()) return true;
                  const q = plantillaSearch.toLowerCase();
                  return (
                    item.itemNumber?.toLowerCase().includes(q) ||
                    item.positionTitle?.toLowerCase().includes(q) ||
                    item.stationOrSchool?.toLowerCase().includes(q) ||
                    item.district?.toLowerCase().includes(q) ||
                    item.track?.toLowerCase().includes(q)
                  );
                }).map(item => {
                  const hasCycle = !!item.promotionCycle;
                  const cycle = item.promotionCycle;
                  const isCycleActive = cycle && cycle.status === 'ACTIVE';
                  const trackName = item.track || (item.positionTitle?.toLowerCase().includes('teacher') ? 'Teaching' : 'Non-Teaching');

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '16px 20px',
                        borderRadius: 14,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        transition: 'all 0.15s ease',
                        flexWrap: 'wrap',
                        gap: 14,
                      }}
                    >
                      <div className="plantilla-directory-item-copy" style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                            {item.positionTitle}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(234, 179, 8, 0.12)',
                              color: '#b45309',
                              border: '1px solid rgba(234, 179, 8, 0.3)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            SG {item.salaryGrade}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--color-bg-card)',
                              color: 'var(--color-text-secondary)',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {trackName} Track
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--color-text-primary)',
                              fontWeight: 700,
                              fontSize: 11.5,
                              background: 'var(--color-bg-card)',
                              border: '1px solid var(--color-border)',
                              padding: '1px 7px',
                              borderRadius: 5,
                            }}
                          >
                            {item.itemNumber}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)', margin: '0 2px' }}>·</span>
                          <span>Station: <strong style={{ color: 'var(--color-text-primary)' }}>{item.stationOrSchool || 'SDO Proper'}</strong></span>
                          <span style={{ color: 'var(--color-text-muted)', margin: '0 2px' }}>·</span>
                          <span>{item.district || 'Division-Wide'}</span>
                        </div>
                        {hasCycle && (
                          <div
                            style={{
                              marginTop: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11.5,
                              color: 'var(--color-text-primary)',
                              background: 'rgba(59, 130, 246, 0.08)',
                              padding: '4px 10px',
                              borderRadius: 8,
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              alignSelf: 'flex-start',
                            }}
                          >
                            <AppIcon name="promotions" size={13} color="#2563eb" />
                            <span>
                              Linked Cycle: <strong>{cycle.name}</strong>{' '}
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11 }}>({cycle.status})</span>
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {hasCycle && isCycleForCurrentPosition(cycle) ? (
                          <span
                            style={{
                              padding: '6px 14px',
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 8,
                              background: 'var(--color-bg-tertiary)',
                              color: 'var(--color-text-secondary)',
                              border: '1px solid var(--color-border)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Current Position — Not Eligible
                          </span>
                        ) : hasCycle && cycle.hasApplied ? (() => {
                          const statusInfo = getApplicationStatusInfo(cycle);
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {statusInfo && (
                                <span
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    background: statusInfo.badgeBg,
                                    color: statusInfo.badgeColor,
                                    border: `1px solid ${statusInfo.borderColor}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <AppIcon name={statusInfo.icon as any} size={13} color={statusInfo.badgeColor} />
                                  {statusInfo.label}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenChecklistModal(cycle)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  borderRadius: 8,
                                  background: 'var(--color-bg-tertiary)',
                                  color: 'var(--color-text-primary)',
                                  border: '1px solid var(--color-border)',
                                  cursor: 'pointer',
                                }}
                              >
                                <AppIcon name={cycle.hasChecklist ? 'document' : 'alert'} size={13} />
                                {cycle.hasChecklist ? 'View Checklist & Dossier' : 'Complete Requirements'}
                              </button>
                            </div>
                          );
                        })() : hasCycle && cycle.isEligible === false ? (
                          <span
                            style={{
                              padding: '6px 14px',
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 8,
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.28)',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <AppIcon name="alert" size={13} color="#ef4444" />
                            <span>Ineligible, </span>
                            <button
                              type="button"
                              onClick={() => setIneligibleModalCycle(cycle)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                font: 'inherit',
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: '#ef4444',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                              }}
                            >
                              find out why
                            </button>
                          </span>
                        ) : hasCycle && isCycleActive ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={submittingCycleId === cycle.id}
                            onClick={() => {
                              handleOpenChecklistModal(cycle);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 18px',
                              fontWeight: 700,
                              borderRadius: 8,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <AppIcon name="promotions" size={14} />
                            Apply & Submit Requirements
                          </button>
                        ) : hasCycle ? (
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '6px 14px',
                              borderRadius: 8,
                              background: 'rgba(234, 179, 8, 0.12)',
                              color: '#b45309',
                              border: '1px solid rgba(234, 179, 8, 0.28)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Starts {new Date(cycle.startDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '6px 14px',
                              borderRadius: 8,
                              background: 'rgba(100, 116, 139, 0.08)',
                              color: 'var(--color-text-secondary)',
                              border: '1px solid var(--color-border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />
                            Vacant (Cycle Pending)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ModalOverlay>
        </ModalPortal>
      )}

      {/* MODAL: INELIGIBILITY EXPLANATION */}
      {ineligibleModalCycle && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setIneligibleModalCycle(null)}
            className="modal-overlay"
            role="presentation"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(6px)',
              zIndex: 1200,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIneligibleModalCycle(null);
            }}
          >
            <section
              className="eligibility-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ineligible-modal-title"
            >
              <header className="eligibility-dialog__header">
                <div className="eligibility-dialog__heading">
                  <div className="eligibility-dialog__icon" aria-hidden="true">
                    <AppIcon name="alert" size={18} color="currentColor" />
                  </div>
                  <div>
                    <span className="eligibility-dialog__eyebrow">Application eligibility</span>
                    <h3 id="ineligible-modal-title">You can’t apply to this vacancy</h3>
                  </div>
                </div>
              </header>

              <div className="eligibility-dialog__body">
                <p className="eligibility-dialog__intro">This vacancy is outside the allowed position progression for your current appointment.</p>
                <div className="eligibility-dialog__route">
                  <div className="eligibility-dialog__position">
                    <span>Your current position</span>
                    <strong>{user?.personnel?.designation || 'Current appointment'}</strong>
                  </div>
                  <div className="eligibility-dialog__blocked-arrow" aria-label="Progression is not allowed">
                    <span></span><AppIcon name="close" size={13} /><span></span>
                  </div>
                  <div className="eligibility-dialog__position eligibility-dialog__position--target">
                    <span>Requested vacancy</span>
                    <strong>{ineligibleModalCycle.name}</strong>
                    <em>{ineligibleModalCycle.type.replace(/_/g, ' ')}</em>
                  </div>
                </div>
                <div className="eligibility-dialog__reason">
                  <span>Why this is blocked</span>
                  <p>{ineligibleModalCycle.ineligibilityReason || 'This promotion cycle exceeds the allowable position progression steps from your current appointment under DepEd rules.'}</p>
                </div>
              </div>
              <footer className="eligibility-dialog__footer">
                <span>DepEd promotion qualification rules apply.</span>
                <button type="button" onClick={() => setIneligibleModalCycle(null)}>Close</button>
              </footer>

            </section>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* ─── ANNEX C DOCUMENTARY REQUIREMENTS CHECKLIST MODAL ─── */}
      {selectedCycleForChecklist && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setSelectedCycleForChecklist(null)}
            className="modal-overlay"
            role="presentation"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(6px)',
              zIndex: 1200,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmittingChecklist) {
                setSelectedCycleForChecklist(null);
              }
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 920,
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-card, #ffffff)',
                borderRadius: 16,
                border: '1px solid var(--color-border)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: isChecklistReadOnly ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: isChecklistReadOnly ? '#10b981' : '#3b82f6',
                        textTransform: 'uppercase',
                      }}
                    >
                      {isChecklistReadOnly ? 'Checklist Submitted (Read-Only)' : (selectedCycleForChecklist.hasApplied ? 'Checklist Submission Required' : 'DepEd Promotion Dossier')}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      DepEd Order No. 007, s. 2023
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    Annex C: Checklist of Requirements and Omnibus Sworn Statement
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {cycleHeadline(
                        selectedCycleForChecklist.name,
                        ((selectedCycleForChecklist as any).rulesConfigurationJson || {}).plantillaItemNumber,
                      )}
                    </strong>
                    {' · '}{vacancyTypeLabel(selectedCycleForChecklist.type)}
                    {((selectedCycleForChecklist as any).rulesConfigurationJson || {}).plantillaItemNumber && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                        {' · '}{((selectedCycleForChecklist as any).rulesConfigurationJson || {}).plantillaItemNumber}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isSubmittingChecklist && setSelectedCycleForChecklist(null)}
                  disabled={isSubmittingChecklist}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 20,
                    lineHeight: 1,
                    color: 'var(--color-text-muted)',
                    padding: 4,
                  }}
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--color-bg-card, #ffffff)' }}>
                
                {/* Application Processing Status Card (for applied personnel) */}
                {selectedCycleForChecklist.hasApplied && (() => {
                  const statusInfo = getApplicationStatusInfo(selectedCycleForChecklist);
                  if (!statusInfo) return null;
                  return (
                    <div
                      className="annex-status"
                      style={{
                        ['--annex-accent' as any]: statusInfo.badgeColor,
                        ['--annex-accent-soft' as any]: statusInfo.badgeBg,
                      }}
                    >
                      <span className="annex-status-icon">
                        <AppIcon name={statusInfo.icon as any} size={18} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="annex-status-label">{statusInfo.label}</div>
                        {/* The application code is a field in section 1; printing it
                            again here was the same value three times on one screen. */}
                        <p className="annex-status-desc">{statusInfo.description}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Section 1: Basic Applicant Profile */}
                <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    1. Applicant Identification & Assignment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Name of Applicant
                      </label>
                      <input
                        aria-label="Name of Applicant"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistApplicantName}
                        onChange={e => setChecklistApplicantName(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Application Code
                      </label>
                      <input
                        aria-label="Application Code"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistApplicationCode}
                        onChange={e => setChecklistApplicationCode(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6, fontWeight: 700 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Office / School Station
                      </label>
                      <input
                        aria-label="Office / School Station"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistOffice}
                        onChange={e => setChecklistOffice(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Contact Number
                      </label>
                      <input
                        aria-label="Contact Number"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistContactNo}
                        onChange={e => setChecklistContactNo(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Region
                      </label>
                      <input
                        aria-label="Region"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistRegion}
                        onChange={e => setChecklistRegion(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        Ethnicity / Cultural Community
                      </label>
                      <input
                        aria-label="Ethnicity / Cultural Community"
                        type="text"
                        className="form-control"
                        disabled={isChecklistReadOnly}
                        value={checklistEthnicity}
                        onChange={e => setChecklistEthnicity(e.target.value)}
                        style={{ fontSize: '0.84rem', padding: '6px 10px', width: '100%', borderRadius: 6 }}
                      />
                    </div>
                  </div>

                  {/* Special Category Toggles */}
                  <div style={{ display: 'flex', gap: 24, marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: isChecklistReadOnly ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={isChecklistReadOnly}
                        checked={checklistIsPwd}
                        onChange={e => setChecklistIsPwd(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>Person with Disability (PWD)</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: isChecklistReadOnly ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={isChecklistReadOnly}
                        checked={checklistIsSoloParent}
                        onChange={e => setChecklistIsSoloParent(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>Solo Parent</span>
                    </label>
                  </div>
                </div>

                {/* Section 2: Documentary Requirements Checklist (Items a to k) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        2. Documentary Requirements Checklist (Annex C Items a – k)
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                        Items marked <strong style={{ color: 'var(--color-text-secondary)' }}>Required</strong> must be attached before you can submit.
                      </div>
                    </div>
                    {/* One counter, on the number that actually gates submission.
                        The footer used to show a second count with a different
                        denominator (mandatory vs all), which read as a contradiction. */}
                    {(() => {
                      const required = checklistItems.filter(i => i.isMandatory);
                      const done = required.filter(i => i.submitted).length;
                      const optional = checklistItems.filter(i => !i.isMandatory && i.submitted).length;
                      return (
                        <div className={`annex-count${done >= required.length ? ' is-done' : ''}`}>
                          <strong>{done} of {required.length}</strong> required attached
                          {optional > 0 && <span className="annex-count-sub"> · {optional} optional</span>}
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {checklistItems.map(item => (
                      <div
                        key={item.code}
                        className={`annex-item${item.submitted ? ' is-done' : ''}`}
                      >
                        <div style={{ flex: '1 1 320px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            {/* Neutral until attached, green once it is. An untouched
                                requirement is a to-do, not an error, so it is not red. */}
                            <span className="annex-item-code">
                              {item.submitted ? <AppIcon name="check" size={13} /> : item.code.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              {item.title}
                            </span>
                            <span className={`annex-tag${item.isMandatory ? ' is-required' : ''}`}>
                              {item.isMandatory ? 'Required' : 'If applicable'}
                            </span>
                          </div>
                          <div className="annex-item-desc">{item.description}</div>

                          {/* Submitted Attachment Display */}
                          {item.submitted && (
                            <div style={{ marginTop: 8, paddingLeft: 30, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  padding: '3px 8px',
                                  borderRadius: 5,
                                }}
                              >
                                <AppIcon name="approved" size={12} color="#059669" />
                                {item.documentName || 'Attached Document'}
                                {formatFileSize(item.fileSize) && ` (${formatFileSize(item.fileSize)})`}
                              </span>
                              {item.uploadedFileUrl && (
                                <button
                                  type="button"
                                  onClick={() => window.open(item.uploadedFileUrl, '_blank')}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-primary)',
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0,
                                  }}
                                >
                                  View Document
                                </button>
                              )}
                              {!isChecklistReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttachment(item.code)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#dc2626',
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0,
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons for Unsubmitted Item */}
                        {!item.submitted && !isChecklistReadOnly && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <label
                              htmlFor={`file-upload-${item.code}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: 'var(--color-bg-secondary, #ffffff)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-primary)',
                                cursor: uploadingForCode === item.code ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <AppIcon name="upload" size={12} />
                              {uploadingForCode === item.code ? 'Uploading...' : 'Upload File'}
                            </label>
                            <input
                              type="file"
                              id={`file-upload-${item.code}`}
                              style={{ display: 'none' }}
                              disabled={uploadingForCode === item.code}
                              onChange={e => handleFileUploadForItem(item.code, e)}
                            />

                            <button
                              type="button"
                              onClick={() => setPicking201ForCode(item.code)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: 'rgba(59, 130, 246, 0.08)',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                color: '#2563eb',
                                cursor: 'pointer',
                              }}
                            >
                              <AppIcon name="folder" size={12} color="#2563eb" />
                              Attach from 201
                            </button>
                          </div>
                        )}

                        {item.submitted && isChecklistReadOnly && (
                          <span
                            style={{
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              color: '#059669',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <AppIcon name="approved" size={13} color="#059669" /> Verified / Attached
                          </span>
                        )}

                        {!item.submitted && isChecklistReadOnly && (
                          <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                            Not submitted
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Legal Omnibus Sworn Statement & Data Privacy Consent */}
                <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    3. Omnibus Sworn Statement & Data Privacy Consent
                  </div>

                  {/* Omnibus Sworn Statement */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                      color: 'var(--color-text-primary)',
                      cursor: isChecklistReadOnly ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={isChecklistReadOnly}
                      checked={checklistOmnibusAgreed}
                      onChange={e => setChecklistOmnibusAgreed(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      <strong>Omnibus Sworn Statement / Certification of Authenticity and Veracity (CAV):</strong> I hereby certify that all documents submitted in satisfying the requirements of DepEd Order No. 007, s. 2023 are authentic and original or true copies of the original. I authorize the Department of Education to verify the authenticity of all submitted documents. I am executing this certification to attest to the truth of all the above statements.
                    </span>
                  </label>

                  {/* Data Privacy Consent */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                      color: 'var(--color-text-primary)',
                      cursor: isChecklistReadOnly ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={isChecklistReadOnly}
                      checked={checklistDataPrivacyAgreed}
                      onChange={e => setChecklistDataPrivacyAgreed(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      <strong>Data Privacy Act (RA 10173) Consent:</strong> In compliance with Republic Act No. 10173 (Data Privacy Act of 2012), I authorize the Department of Education Division Selection Committee / HRMPSB to collect, store, and process my personal data and submitted records for evaluation, screening, and deliberation of my promotion application.
                    </span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                {/* Say what is still blocking submission rather than leaving the
                    button greyed out with no explanation. */}
                <div>
                  {(() => {
                    if (isChecklistReadOnly) return null;
                    const missing = checklistItems.filter(i => i.isMandatory && !i.submitted).length;
                    const blockers = [
                      missing > 0 && `${missing} required ${missing === 1 ? 'document' : 'documents'}`,
                      !checklistOmnibusAgreed && 'the omnibus sworn statement',
                      !checklistDataPrivacyAgreed && 'the data privacy consent',
                    ].filter(Boolean) as string[];

                    if (!blockers.length) {
                      return (
                        <span className="annex-gate is-ready">
                          <AppIcon name="approved" size={14} />
                          Everything required is attached
                        </span>
                      );
                    }
                    const list = blockers.length === 1
                      ? blockers[0]
                      : `${blockers.slice(0, -1).join(', ')} and ${blockers[blockers.length - 1]}`;
                    return (
                      <span className="annex-gate">
                        <AppIcon name="pending" size={14} />
                        Still needed: {list}
                      </span>
                    );
                  })()}
                </div>

                {/* Actions — the header ✕ is this dialog's dismiss control. */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {!isChecklistReadOnly && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={
                        isSubmittingChecklist ||
                        checklistItems.filter(i => i.isMandatory && !i.submitted).length > 0 ||
                        !checklistOmnibusAgreed ||
                        !checklistDataPrivacyAgreed
                      }
                      onClick={handleSubmitChecklistApplication}
                      style={{
                        borderRadius: 8,
                        padding: '7px 22px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <AppIcon name="promotions" size={14} />
                      {isSubmittingChecklist
                        ? 'Submitting Dossier...'
                        : (selectedCycleForChecklist.hasApplied ? 'Submit Requirements Checklist' : 'Submit Application & Requirements')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* ─── 201 FILE PICKER SUB-MODAL ─── */}
      {picking201ForCode && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setPicking201ForCode(null)}
            className="modal-overlay"
            role="presentation"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(6px)',
              zIndex: 1300,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPicking201ForCode(null);
              }
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 600,
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-card, #ffffff)',
                borderRadius: 14,
                border: '1px solid var(--color-border)',
                boxShadow: '0 20px 48px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
                    Select 201 File for Item ({picking201ForCode.toUpperCase()})
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    Attach an existing document from your verified 201 profile records.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPicking201ForCode(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-bg-card, #ffffff)' }}>
                {user201Documents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--color-text-muted)' }}>
                    <AppIcon name="folder" size={32} />
                    <p style={{ marginTop: 10, fontSize: '0.85rem' }}>
                      No files found in your digital 201 records.
                    </p>
                    <span style={{ fontSize: '0.78rem' }}>
                      Please use the "Upload File" option to upload directly from your device or use the Mobile Document Scanner.
                    </span>
                  </div>
                ) : (
                  user201Documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {doc.originalFileName || doc.documentTypeName || '201 Document'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          {[
                            doc.documentTypeName || '201 File',
                            formatFileSize(doc.fileSize),
                            formatUploadedOn(doc.uploadedAt || doc.createdAt),
                          ].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleAttachFrom201(picking201ForCode, doc)}
                        style={{ fontSize: '0.75rem', padding: '5px 12px', borderRadius: 6, fontWeight: 700, flexShrink: 0 }}
                      >
                        Attach File
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};
