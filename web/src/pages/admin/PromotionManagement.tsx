import './promo-detail.css';
import './promo-create.css';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import apiClient from '../../api/client';
import { accessDeniedMessage } from '../../api/access';
import { TEACHING_POSITIONS, NON_TEACHING_POSITIONS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';
import { Search, Filter, CheckCircle2, Clock, XCircle, AlertCircle, PlayCircle, Layers, RefreshCw, Archive, ChevronDown, ChevronUp, Building2, Check, X, Sparkles, Plus, Edit3, Trash2 } from 'lucide-react';
import { clickable, clickableRow } from '../../a11y/clickable';
import { deliberationBlockReason, isAppointed, isRequirementsVerified, isSelectedPendingAppointment } from '../../promotions/stageGate';
import { usePending } from '../../hooks/usePending';
import { useFormErrors } from '../../hooks/useFormErrors';
import { FieldError } from '../../components/common/FieldError';
import { normaliseAnnexCItem } from '../personnel/checklistData';
import { AnnexCVerificationModal } from './AnnexCVerificationModal';
import { CandidateDossierModal } from './CandidateDossierModal';
import { useSearchParams } from 'react-router-dom';
import { parsePromotionTarget, resolveTargetApplication, resolveTargetCycle, PromotionTarget } from '../../promotions/deepLink';
import { carErrorMessage, fetchCarDocument } from '../../promotions/carDownload';
import { ANNEX_C_FALLBACK, AnnexCRequirement, loadAnnexCRequirements } from '../../promotions/annexCRequirements';

export const PromotionManagement: React.FC = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { user } = useAuthContext();
  const { theme } = useTheme();

  if (user?.role === 'SYSTEM_ADMIN') {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/50 rounded-2xl flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Restricted: Promotion Management</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            System Administrator accounts are strictly scoped to user provisioning, credentials, security audits, and system configuration. Promotion cycles and CAR evaluations are restricted to HRMO and Administrative Officers.
          </p>
          <div className="pt-2">
            <a
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-semibold hover:bg-opacity-90 transition-all shadow-md"
            >
              Return to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isHR = user?.role === 'HRMO';

  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<any | null>(null);

  const cycleVacantPositions = useMemo(() => {
    return Number(selectedCycle?.rulesConfigurationJson?.vacantPositions || 1);
  }, [selectedCycle]);

  const cyclePlantillaNo = useMemo(() => {
    if (!selectedCycle) return null;
    return selectedCycle.rulesConfigurationJson?.plantillaItemNo || 
      (Array.isArray(selectedCycle.rulesConfigurationJson?.designatedPlantillas) && selectedCycle.rulesConfigurationJson.designatedPlantillas[0]?.itemNumber) ||
      (typeof selectedCycle.rulesConfigurationJson?.designatedPlantillas?.[0] === 'string' ? selectedCycle.rulesConfigurationJson.designatedPlantillas[0] : null) ||
      (selectedCycle.name?.includes('(') && selectedCycle.name.includes(')') ? selectedCycle.name.split('(')[1].split(')')[0] : null);
  }, [selectedCycle]);

  const [cycleStatusFilter, setCycleStatusFilter] = useState<'ALL' | 'ONGOING' | 'PLANNING' | 'FINISHED' | 'CANCELLED'>('ALL');
  const [cycleSearchQuery, setCycleSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'LEADERBOARD' | 'CAR' | 'AO_RATING' | 'HRMO_RANKING' | 'HR_SELECTION' | 'APPLICATIONS'>('LEADERBOARD');
  
  // Realtime Leaderboard Expandable Participants State
  const [expandedParticipants, setExpandedParticipants] = useState<Record<string | number, boolean>>({});
  const [expandAll, setExpandAll] = useState(false);

  const toggleParticipantExpand = (id: string | number) => {
    setExpandedParticipants(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleToggleExpandAll = () => {
    if (expandAll) {
      setExpandedParticipants({});
      setExpandAll(false);
    } else {
      const allExp: Record<string | number, boolean> = {};
      filteredLeaderboard.forEach(item => {
        allExp[item.id] = true;
      });
      setExpandedParticipants(allExp);
      setExpandAll(true);
    }
  };

  const formatDateString = (dateVal?: string | Date): string => {
    if (!dateVal) return 'N/A';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal).split('T')[0];
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return String(dateVal).split('T')[0];
    }
  };

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [submittedApps, setSubmittedApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Plantilla Items for Cycle Configuration
  const [plantillaItems, setPlantillaItems] = useState<any[]>([]);
  const [selectedPlantillaItemForCycle, setSelectedPlantillaItemForCycle] = useState<string>('');
  const [designatedPlantillas, setDesignatedPlantillas] = useState<string[]>(['']);
  const [overridePlantillaFields, setOverridePlantillaFields] = useState<boolean>(false);

  // Helper to reliably find the district from school or division
  const getPlantillaDistrict = useCallback((department?: string, division?: string): string => {
    const cleanSchool = (department || '').toLowerCase().trim();
    const cleanDiv = (division || '').toLowerCase().trim();
    const distFound = DEPED_KORONADAL_DISTRICTS.find((d) =>
      d.schools.some((s) => s.toLowerCase().trim() === cleanSchool)
    );
    if (distFound) return distFound.name;
    if (cleanDiv.includes('district 6') || cleanSchool.includes('district 6')) return 'District 6';
    if (cleanDiv.includes('district 1') || cleanSchool.includes('district 1')) return 'District 1';
    return 'District 1';
  }, []);

  const linkedPlantilla = useMemo(() => {
    const activeItem = designatedPlantillas.find(Boolean) || selectedPlantillaItemForCycle;
    if (!activeItem) return null;
    return plantillaItems.find((p) => p.itemNumber === activeItem) || null;
  }, [designatedPlantillas, selectedPlantillaItemForCycle, plantillaItems]);

  // Synchronize cycle creation fields automatically whenever linkedPlantilla changes
  useEffect(() => {
    if (!linkedPlantilla) return;
    setNewTargetPosition(linkedPlantilla.positionTitle);
    const isT =
      linkedPlantilla.positionTitle.toLowerCase().includes('teacher') ||
      linkedPlantilla.positionTitle.toLowerCase().includes('principal') ||
      linkedPlantilla.positionTitle.toLowerCase().includes('head teacher') ||
      linkedPlantilla.positionTitle.toLowerCase().includes('sped');
    setNewCycleTrack(isT ? 'TEACHING' : 'NON_TEACHING');
    const dist = getPlantillaDistrict(linkedPlantilla.department, linkedPlantilla.division);
    setNewCycleDistrict(dist);
    setNewCycleSchool(linkedPlantilla.department || 'All Schools in District');
    setNewCycleName(`Ranking for Vacancy: ${linkedPlantilla.positionTitle} (${linkedPlantilla.itemNumber})`);
  }, [linkedPlantilla, getPlantillaDistrict]);

  // Modals state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  
  // Rating Modals State
  const [showAoModal, setShowAoModal] = useState(false);
  const [showHrmoModal, setShowHrmoModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedAppForModal, setSelectedAppForModal] = useState<any | null>(null);

  // View Applicant 201 Info Modal State
  const [showApplicantInfoModal, setShowApplicantInfoModal] = useState(false);
  const [selectedApplicantInfo, setSelectedApplicantInfo] = useState<any | null>(null);

  // Notification deep link (?cycleId=&applicationId=). Resolved only against
  // the station-scoped lists this page already fetched; see promotions/deepLink.
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLink, setDeepLink] = useState<{ target: PromotionTarget; stage: 'cycle' | 'application' } | null>(null);
  const [cyclesLoaded, setCyclesLoaded] = useState(false);
  const [appsLoadedForCycleId, setAppsLoadedForCycleId] = useState<number | null>(null);

  // Promotion Selection Confirmation Modal State
  const [showConfirmPromotionModal, setShowConfirmPromotionModal] = useState(false);
  const [selectedCandidateForConfirm, setSelectedCandidateForConfirm] = useState<any | null>(null);
  // Written reason when HR chooses this candidate over higher-ranked ones (server-enforced).
  const [selectionJustification, setSelectionJustification] = useState('');
  const [selectedPlantillaForCandidate, setSelectedPlantillaForCandidate] = useState<string>('');

  // Handlers for dynamic vacancy count and multiple plantilla slots
  const handleVacantPositionsChange = (val: string | number) => {
    if (val === '') {
      setNewVacantPositions('');
      return;
    }
    const rawNum = typeof val === 'number' ? val : parseInt(String(val), 10);
    if (isNaN(rawNum)) {
      setNewVacantPositions('');
      return;
    }
    const count = Math.max(1, Math.min(50, rawNum));
    setNewVacantPositions(count);
    setDesignatedPlantillas(prev => {
      const updated = [...prev];
      if (updated.length < count) {
        while (updated.length < count) updated.push('');
      } else if (updated.length > count) {
        return updated.slice(0, count);
      }
      return updated;
    });
  };

  const handleMaxApplicantsChange = (val: string | number) => {
    if (val === '') {
      setNewMaxApplicants('');
      return;
    }
    const rawNum = typeof val === 'number' ? val : parseInt(String(val), 10);
    if (isNaN(rawNum)) {
      setNewMaxApplicants('');
      return;
    }
    setNewMaxApplicants(Math.max(1, Math.min(500, rawNum)));
  };

  const handleDesignatedPlantillaChange = (index: number, itemNumber: string) => {
    setDesignatedPlantillas(prev => {
      const updated = [...prev];
      updated[index] = itemNumber;
      return updated;
    });
    if (index === 0 || !selectedPlantillaItemForCycle) {
      setSelectedPlantillaItemForCycle(itemNumber);
    }
    setOverridePlantillaFields(false);
  };

  // Search query state
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeaderboard = leaderboard.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = item.name?.toLowerCase().includes(q);
    const empIdMatch = item.employeeId?.toLowerCase().includes(q);
    const appNoMatch = item.applicantNumber?.toLowerCase().includes(q);
    const desigMatch = item.designation?.toLowerCase().includes(q);
    return nameMatch || empIdMatch || appNoMatch || desigMatch;
  });

  const filteredSubmittedApps = submittedApps.filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = app.name?.toLowerCase().includes(q);
    const empIdMatch = app.employeeId?.toLowerCase().includes(q);
    const appNoMatch = app.applicantNumber?.toLowerCase().includes(q) || app.scoreDetailsJson?.applicantNumber?.toLowerCase().includes(q);
    const desigMatch = app.designation?.toLowerCase().includes(q);
    return nameMatch || empIdMatch || appNoMatch || desigMatch;
  });



  // AO & HRMO Workspace Filters
  const [aoFilter, setAoFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'DEFICIENT'>('ALL');
  const [hrmoFilter, setHrmoFilter] = useState<'ALL' | 'PENDING' | 'FINALIZED'>('ALL');
  const [hrmoDistrictFilter, setHrmoDistrictFilter] = useState('ALL');
  const [hrmoSchoolFilter, setHrmoSchoolFilter] = useState('ALL');
  const hrmoDistricts = Array.from(new Set(submittedApps.map(a => a.district).filter(Boolean))).sort();
  const hrmoSchools = Array.from(new Set(submittedApps.filter(a => hrmoDistrictFilter === 'ALL' || a.district === hrmoDistrictFilter).map(a => a.school).filter(Boolean))).sort();
  const hrmoStationApps = filteredSubmittedApps.filter(a =>
    (hrmoDistrictFilter === 'ALL' || a.district === hrmoDistrictFilter) &&
    (hrmoSchoolFilter === 'ALL' || a.school === hrmoSchoolFilter)
  );

  const isApplicantReqVerified = (a: any) =>
    a.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED' ||
    a.scoreDetailsJson?.requirementsCheck?.status === 'COMPLETE' ||
    a.status === 'INITIAL_RATED' ||
    a.status === 'RANKED' ||
    a.status === 'APPROVED';

  const isApplicantReqDeficient = (a: any) =>
    a.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT' ||
    a.scoreDetailsJson?.requirementsCheck?.status === 'INCOMPLETE';

  const aoVerifiedApps = filteredSubmittedApps.filter(a => isApplicantReqVerified(a));
  const aoDeficientApps = filteredSubmittedApps.filter(a => isApplicantReqDeficient(a));
  const aoPendingApps = filteredSubmittedApps.filter(a => !isApplicantReqVerified(a) && !isApplicantReqDeficient(a));
  const displayedAoApps =
    aoFilter === 'PENDING' ? aoPendingApps :
    aoFilter === 'VERIFIED' ? aoVerifiedApps :
    aoFilter === 'DEFICIENT' ? aoDeficientApps :
    filteredSubmittedApps;

  const hrmoFinalizedApps = hrmoStationApps.filter(a => a.status === 'RANKED' || a.status === 'APPROVED' || Boolean(a.scoreDetailsJson?.finalRating));
  const hrmoPendingApps = hrmoStationApps.filter(a => !(a.status === 'RANKED' || a.status === 'APPROVED' || Boolean(a.scoreDetailsJson?.finalRating)));
  const displayedHrmoApps = hrmoFilter === 'PENDING' ? hrmoPendingApps : hrmoFilter === 'FINALIZED' ? hrmoFinalizedApps : hrmoStationApps;

  const handleOpenConfirmSelection = (app: any) => {
    if (!isHR) {
      addToast('Access denied: System Administrator cannot select candidates for promotion. Only HR (HRMO) can select promotion candidates.', 'ERROR');
      return;
    }
    setSelectedCandidateForConfirm(app);
    setSelectionJustification('');
    setSelectionJustification('');

    const cyclePlantillas: string[] = selectedCycle?.rulesConfigurationJson?.plantillaItemNumbers ||
      (selectedCycle?.rulesConfigurationJson?.plantillaItemNumber ? [selectedCycle.rulesConfigurationJson.plantillaItemNumber] : []);

    const assignedMap = new Map<string, string>();
    leaderboard.forEach(l => {
      if (l.id !== app.id) {
        const pNum = l.plantillaItemNumber || l.scoreDetailsJson?.plantillaItemNumber;
        if (pNum) assignedMap.set(pNum, l.name);
      }
    });

    const currentAppPlantilla = app.plantillaItemNumber || app.scoreDetailsJson?.plantillaItemNumber;
    if (currentAppPlantilla) {
      setSelectedPlantillaForCandidate(currentAppPlantilla);
    } else {
      const firstFree = cyclePlantillas.find(p => !assignedMap.has(p));
      setSelectedPlantillaForCandidate(firstFree || cyclePlantillas[0] || '');
    }

    setShowConfirmPromotionModal(true);
  };

  // Deliberated, unselected applicants who outscore the one being confirmed.
  const higherRankedThanCandidate = selectedCandidateForConfirm
    ? leaderboard.filter(l => l.id !== selectedCandidateForConfirm.id
        && !l.scoreDetailsJson?.manuallyPromoted
        && l.scoreDetailsJson?.finalRating
        && Number(l.overallTotalScore) > Number(selectedCandidateForConfirm.overallTotalScore))
    : [];

  const handleConfirmSelectionSubmit = async () => {
    if (!selectedCandidateForConfirm) return;
    if (!isHR) {
      addToast('Access denied: System Administrator cannot create or approve promotions. Only HR (HRMO) has permission to promote candidates.', 'ERROR');
      return;
    }
    const done = await handleTogglePromotionCandidate(selectedCandidateForConfirm, true, selectedPlantillaForCandidate, selectionJustification.trim());
    // A refused selection keeps the dialog open with what was entered.
    if (!done) return;
    setShowConfirmPromotionModal(false);
    setSelectedCandidateForConfirm(null);
  };

  // Track & View Mode State
  const [modalTrack, setModalTrack] = useState<'TEACHING' | 'NON_TEACHING'>('TEACHING');
  const [carViewMode, setCarViewMode] = useState<'TEACHING' | 'NON_TEACHING' | 'ALL'>('ALL');

  // Official DepEd Annex C Standard Documentary Requirements
  // Annex C wording comes from the server (shared with the applicant's form).
  const [annexCRequirements, setAnnexCRequirements] = useState<readonly AnnexCRequirement[]>(ANNEX_C_FALLBACK);
  useEffect(() => {
    let active = true;
    void loadAnnexCRequirements(apiClient).then(list => { if (active) setAnnexCRequirements(list); });
    return () => { active = false; };
  }, []);

  // AO II Requirements Completeness Verification Form State (Annex C Checklist)
  const [reqCompletenessStatus, setReqCompletenessStatus] = useState<'COMPLETE' | 'INCOMPLETE'>('COMPLETE');
  const [reqVerificationRemarks, setReqVerificationRemarks] = useState<string>('');
  const [reqVerificationItems, setReqVerificationItems] = useState<Array<{
    code: string;
    title: string;
    description: string;
    isMandatory: boolean;
    submitted: boolean;
    documentName?: string;
    documentType?: string;
    personnelDocumentId?: number;
    status: 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE';
    remarks?: string;
  }>>([]);

  // Retain legacy score variables for backward-compatibility or display fallbacks
  const [aoEduScore, setAoEduScore] = useState<number | ''>(10);
  const [aoTrainScore, setAoTrainScore] = useState<number | ''>(10);
  const [aoExpScore, setAoExpScore] = useState<number | ''>(10);
  const [aoPerfScore, setAoPerfScore] = useState<number | ''>(30);
  const [aoAccomplishmentsScore, setAoAccomplishmentsScore] = useState<number | ''>(5);
  const [aoAppEduScore, setAoAppEduScore] = useState<number | ''>(15);
  const [aoAppLdScore, setAoAppLdScore] = useState<number | ''>(10);
  const [aoRemarks, setAoRemarks] = useState<string>('Qualifications verified against DepEd CAR standards.');

  // HRMO Staff Final Deliberation Form State (Official DepEd CAR Criteria - 100 pts Deliberation)
  const [hrmoEduScore, setHrmoEduScore] = useState<number | ''>(10); // Max 10
  const [hrmoTrainScore, setHrmoTrainScore] = useState<number | ''>(10); // Max 10
  const [hrmoExpScore, setHrmoExpScore] = useState<number | ''>(10); // Max 10
  const [hrmoPerfScore, setHrmoPerfScore] = useState<number | ''>(30); // Max 30 for Teaching, 20 for Non-Teaching
  // Non-Teaching Specific HRMPSB Criteria
  const [hrmoAccomplishmentsScore, setHrmoAccomplishmentsScore] = useState<number | ''>(5); // Max 5
  const [hrmoAppEduScore, setHrmoAppEduScore] = useState<number | ''>(15); // Max 15
  const [hrmoAppLdScore, setHrmoAppLdScore] = useState<number | ''>(10); // Max 10
  const [hrmoWrittenScore, setHrmoWrittenScore] = useState<number | ''>(5); // Max 5
  const [hrmoBeiScore, setHrmoBeiScore] = useState<number | ''>(5); // Max 5
  const [hrmoSkillsScore, setHrmoSkillsScore] = useState<number | ''>(10); // Max 10
  const [hrmoPotentialScore, setHrmoPotentialScore] = useState<number | ''>(20); // Max 20 Total Potential
  // Teaching Specific HRMPSB Criteria
  const [hrmoPpstCoiScore, setHrmoPpstCoiScore] = useState<number | ''>(25); // Max 25 (Classroom Observation / Demo Teaching)
  const [hrmoPpstNcoiScore, setHrmoPpstNcoiScore] = useState<number | ''>(15); // Max 15 (Teacher Reflection / Portfolio)
  // CAR Governance Fields
  const [hrmoRemarks, setHrmoRemarks] = useState<string>('Deliberated and qualified for appointment.');
  const [forBackgroundInvestigation, setForBackgroundInvestigation] = useState<'YES' | 'NO'>('YES');
  const [forAppointment, setForAppointment] = useState<string>('Recommended for Appointment');
  const [forProbation, setForProbation] = useState<string>('6 months');

  // Application Form Input State
  const [appFormApplicantId, setAppFormApplicantId] = useState<string>('');
  const [appFormApplicantName, setAppFormApplicantName] = useState<string>('');
  const [appFormDesignation, setAppFormDesignation] = useState<string>('');
  const [appFormPerfScore, setAppFormPerfScore] = useState<number | ''>(90);
  const [appFormExpScore, setAppFormExpScore] = useState<number | ''>(85);
  const [appFormEduScore, setAppFormEduScore] = useState<number | ''>(85);
  const [appFormTrainScore, setAppFormTrainScore] = useState<number | ''>(80);
  const [appFormRemarks, setAppFormRemarks] = useState<string>('');

  // Complete PDS Form 212 Fields for External / Teacher 1 Applicants
  const [appFirstName, setAppFirstName] = useState<string>('');
  const [appMiddleName, setAppMiddleName] = useState<string>('');
  const [appLastName, setAppLastName] = useState<string>('');
  const [appSuffix, setAppSuffix] = useState<string>('');
  const [appBirthDate, setAppBirthDate] = useState<string>('1995-01-01');
  const [appGender, setAppGender] = useState<'FEMALE' | 'MALE' | 'OTHER'>('FEMALE');
  const [appCivilStatus, setAppCivilStatus] = useState<'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED'>('SINGLE');
  const [appContactNumber, setAppContactNumber] = useState<string>('');
  const [appAddress, setAppAddress] = useState<string>('');
  const [appEmail, setAppEmail] = useState<string>('');

  // New Cycle Form State
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultEndStr = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleTrack, setNewCycleTrack] = useState<'TEACHING' | 'NON_TEACHING'>('TEACHING');
  const [newCycleType, setNewCycleType] = useState('NATURAL_VACANCY');
  // Who may see and apply: the whole division, or only the vacancy's district.
  const [newOpenTo, setNewOpenTo] = useState<'DIVISION' | 'DISTRICT'>('DIVISION');
  const [newTargetPosition, setNewTargetPosition] = useState<string>('Teacher I');
  const [newCycleStatus, setNewCycleStatus] = useState('ACTIVE');
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newEndDate, setNewEndDate] = useState(defaultEndStr);
  const [newMaxApplicants, setNewMaxApplicants] = useState<number | ''>(10);
  const [newVacantPositions, setNewVacantPositions] = useState<number | ''>(1);
  const [newCycleDistrict, setNewCycleDistrict] = useState<string>('District 1');
  const [newCycleSchool, setNewCycleSchool] = useState<string>('All Schools in District');

  // Plantilla Picker Interactive UI state
  const [openPlantillaPickerIdx, setOpenPlantillaPickerIdx] = useState<number | null>(null);
  const [plantillaPickerSearch, setPlantillaPickerSearch] = useState<string>('');
  const [plantillaPickerTrack, setPlantillaPickerTrack] = useState<'ALL' | 'TEACHING' | 'NON_TEACHING'>('ALL');

  // Which applicants an AO II may see and verify is decided by the server from
  // the officer's station on record: other stations' applicants are never
  // returned, and a cycle restricted to another district is refused with the
  // server's reason. The client does not guess a jurisdiction from displayed text.
  const cycleDistrict = selectedCycle?.rulesConfigurationJson?.district;
  const cycleSchool = selectedCycle?.rulesConfigurationJson?.school;



  const handleTogglePromotionCandidate = async (app: any, shouldPromote: boolean, plantillaItemNumber?: string, justification?: string): Promise<boolean> => {
    if (!selectedCycle) return false;
    if (!isHR) {
      addToast('Access denied: System Administrator cannot create or select promotions. Only HR (HRMO) can select promotion candidates.', 'ERROR');
      return false;
    }
    try {
      const targetPlantilla = shouldPromote
        ? (plantillaItemNumber || app.plantillaItemNumber || app.scoreDetailsJson?.plantillaItemNumber || undefined)
        : undefined;

      await apiClient.post(`/promotions/cycles/${selectedCycle.id}/applications/${app.id}/select-promotion`, {
        isPromoted: shouldPromote,
        remarks: shouldPromote
          ? (targetPlantilla ? `Selected for promotion & assigned to Plantilla Item ${targetPlantilla}` : 'Manually selected for promotion by HRMO')
          : 'Promotion selection removed',
        plantillaItemNumber: targetPlantilla,
        ...(justification ? { justification } : {}),
      });
      addToast(
        shouldPromote
          ? `Applicant ${app.name} (${app.employeeId}) selected for promotion${targetPlantilla ? ` and assigned to Plantilla ${targetPlantilla}` : ''}!`
          : `Promotion selection removed for ${app.name}.`,
        shouldPromote ? 'SUCCESS' : 'INFO'
      );
      await fetchLeaderboard(selectedCycle.id);
      return true;
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to update candidate promotion selection.', 'ERROR');
      return false;
    }
  };

  const handleUpdateCycleStatus = async (cycleId: number, newStatus: string) => {
    if (!isHR) {
      addToast('Access denied: System Administrator cannot modify promotion cycles. Only HR (HRMO) can update cycle status.', 'ERROR');
      return;
    }
    let cancellationReason: string | undefined;
    if (newStatus === 'CANCELLED') {
      const { confirmed, reason } = await confirm({
        title: 'Cancel promotion cycle',
        message: 'This will discontinue every application in the cycle, abandon linked unfinished transactions, and notify affected applicants. Finalized cycles cannot be cancelled.',
        confirmLabel: 'Cancel cycle',
        tone: 'danger',
        reason: { label: 'Reason for cancellation', placeholder: 'Explain why this cycle is being cancelled', required: true },
      });
      if (!confirmed) return;
      cancellationReason = reason;
      if (!cancellationReason || cancellationReason.trim().length < 10) {
        addToast('Enter a cancellation reason of at least 10 characters.', 'ERROR');
        return;
      }
    }
    // FINALIZED and CLOSED close the cycle to applicants and reviewers alike.
    if (newStatus === 'FINALIZED' || newStatus === 'CLOSED') {
      const { confirmed } = await confirm({
        title: `Mark cycle as ${newStatus.toLowerCase()}`,
        message: `Mark this promotion cycle as ${newStatus.toLowerCase()}? Applicants can no longer apply, and ratings lock once it is finalized.`,
        confirmLabel: `Mark as ${newStatus.toLowerCase()}`,
      });
      if (!confirmed) return;
    }

    try {
      await apiClient.patch(`/promotions/cycles/${cycleId}`, { status: newStatus, ...(cancellationReason && { cancellationReason }) });
      addToast(`Cycle marked as ${newStatus === 'ACTIVE' ? 'open for applications' : newStatus.toLowerCase()}.`, 'SUCCESS');
      
      setCycles(prev => prev.map(c => c.id === cycleId ? { ...c, status: newStatus } : c));
      setSelectedCycle((prev: any) => prev && prev.id === cycleId ? { ...prev, status: newStatus } : prev);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to update cycle status.', 'ERROR');
    }
  };

  // Merit Evaluation Criteria Weights
  const [criteria, setCriteria] = useState({
    performanceRating: 30,
    experience: 25,
    education: 20,
    training: 15,
    seniority: 10,
  });

  const fetchCycles = useCallback(async (showLoading = false, filterStatus?: string, search?: string) => {
    if (showLoading) setLoading(true);
    try {
      const activeStatus = filterStatus !== undefined ? filterStatus : cycleStatusFilter;
      const activeSearch = search !== undefined ? search : cycleSearchQuery;
      const params = new URLSearchParams();
      if (activeStatus) params.append('status', activeStatus);
      if (activeSearch && activeSearch.trim()) params.append('search', activeSearch.trim());

      const res = await apiClient.get(`/promotions/cycles?${params.toString()}`);
      const list = res.data?.data || [];
      setCycles(list);
      // Refresh the open cycle only; a reload or filter never opens one by itself.
      setSelectedCycle((prev: any) => (prev ? (list.find((c: any) => c.id === prev.id) ?? prev) : null));
    } catch (err) {
      console.error('Failed to load promotion cycles:', err);
    } finally {
      if (showLoading) setLoading(false);
      setCyclesLoaded(true);
    }
  }, [cycleStatusFilter, cycleSearchQuery]);

  const handleCycleFilterChange = (newStatus: 'ALL' | 'ONGOING' | 'PLANNING' | 'FINISHED' | 'CANCELLED') => {
    setCycleStatusFilter(newStatus);
    fetchCycles(false, newStatus, cycleSearchQuery);
  };

  const handleCycleSearchChange = (newSearch: string) => {
    setCycleSearchQuery(newSearch);
    fetchCycles(false, cycleStatusFilter, newSearch);
  };

  const fetchLeaderboard = useCallback(async (cycleId: number) => {
    try {
      const res = await apiClient.get(`/promotions/cycles/${cycleId}/leaderboard`);
      const list = res.data?.data || [];
      if (list.length > 0) {
        setLeaderboard(list);
      } else {
        generateLocalLeaderboard();
      }
    } catch (err) {
      generateLocalLeaderboard();
    }
  }, []);

  const getApplicantAoScore = (app: any, isTeaching: boolean = true): number => {
    if (!app) return 0;
    const initial = app.scoreDetailsJson?.initialRating || app.initialDetails;
    if (initial && initial.initialTotalScore !== undefined && initial.initialTotalScore !== null && !isNaN(Number(initial.initialTotalScore))) {
      return Number(initial.initialTotalScore);
    }
    if (app.aoSubtotal !== undefined && app.aoSubtotal !== null && !isNaN(Number(app.aoSubtotal)) && (app.hasAoRating || initial)) {
      return Number(app.aoSubtotal);
    }
    if (app.initialTotalScore !== undefined && app.initialTotalScore !== null && !isNaN(Number(app.initialTotalScore)) && (app.hasAoRating || initial)) {
      return Number(app.initialTotalScore);
    }
    if (initial) {
      const edu = Number(initial.educationScore ?? 0);
      const train = Number(initial.trainingScore ?? 0);
      const exp = Number(initial.experienceScore ?? 0);
      const perf = Number(initial.performanceScore ?? 0);
      if (isTeaching) return edu + train + exp + perf;
      const accomp = Number(initial.outstandingAccomplishmentsScore ?? 0);
      const appEdu = Number(initial.applicationOfEducationScore ?? 0);
      const appLd = Number(initial.applicationOfLdScore ?? 0);
      return edu + train + exp + perf + accomp + appEdu + appLd;
    }
    return 0;
  };

  const fetchApplicationsForCycle = useCallback(async (cycleId: number) => {
    try {
      const res = await apiClient.get(`/promotions/cycles/${cycleId}/applications`);
      const backendList = (res.data?.data || []).map((a: any) => {
        const initialRating = a.scoreDetailsJson?.initialRating || {};
        const finalRating = a.scoreDetailsJson?.finalRating || {};
        const aoScore = initialRating.initialTotalScore !== undefined ? Number(initialRating.initialTotalScore) : (a.scoreDetailsJson?.initialTotalScore !== undefined ? Number(a.scoreDetailsJson.initialTotalScore) : (a.initialTotalScore !== undefined ? Number(a.initialTotalScore) : undefined));
        const hrScore = finalRating.finalTotalScore !== undefined ? Number(finalRating.finalTotalScore) : (a.scoreDetailsJson?.finalTotalScore !== undefined ? Number(a.scoreDetailsJson.finalTotalScore) : (a.finalTotalScore !== undefined ? Number(a.finalTotalScore) : undefined));
        const totalScore = a.scoreDetailsJson?.totalScore !== undefined ? Number(a.scoreDetailsJson.totalScore) : (a.totalScore !== undefined ? Number(a.totalScore) : (aoScore !== undefined && hrScore !== undefined ? aoScore + hrScore : aoScore));

        return {
          id: a.id,
          personnelId: a.personnelId,
          employeeId: a.personnel?.employeeId || `EMP-${a.personnelId}`,
          name: `${a.personnel?.firstName || ''} ${a.personnel?.lastName || ''}`.trim() || 'Applicant',
          designation: a.personnel?.designation || 'Staff',
          school: a.personnel?.school || '',
          district: a.personnel?.district || '',
          performanceRating: a.scoreDetailsJson?.performanceRating || 90,
          status: a.status || 'SUBMITTED',
          scoreDetailsJson: a.scoreDetailsJson || {},
          initialTotalScore: aoScore,
          aoSubtotal: aoScore,
          finalTotalScore: hrScore,
          hrmoSubtotal: hrScore,
          overallTotalScore: totalScore,
          dateSubmitted: a.applicationDate ? a.applicationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          remarks: a.scoreDetailsJson?.remarks || 'Submitted Application Form',
          forBackgroundInvestigation: a.scoreDetailsJson?.forBackgroundInvestigation || a.forBackgroundInvestigation,
          forAppointment: a.scoreDetailsJson?.forAppointment || a.forAppointment,
          forProbation: a.scoreDetailsJson?.forProbation || a.forProbation,
        };
      });

      setSubmittedApps(backendList);
    } catch (err) {
      console.warn('Could not fetch applications:', err);
    } finally {
      // Also on failure, so a pending deep link resolves (as unavailable) rather than waiting forever.
      setAppsLoadedForCycleId(cycleId);
    }
  }, []);

  const fetchPlantillaItems = useCallback(async () => {
    try {
      const res = await apiClient.get('/plantilla');
      setPlantillaItems(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load plantilla items:', err);
    }
  }, []);

  useEffect(() => {
    fetchCycles(true);
    fetchPlantillaItems();
  }, [fetchCycles, fetchPlantillaItems]);

  useEffect(() => {
    if (selectedCycle?.id) {
      fetchApplicationsForCycle(selectedCycle.id);
      fetchLeaderboard(selectedCycle.id);
    }
  }, [selectedCycle?.id, fetchApplicationsForCycle, fetchLeaderboard]);

  // Real-time updates: Refreshes leaderboard live whenever AO II or HRMO submits ratings
  useRealtimeNotifications(() => {
    if (selectedCycle?.id) {
      fetchLeaderboard(selectedCycle.id);
      fetchApplicationsForCycle(selectedCycle.id);
    }
    fetchPlantillaItems();
  });

  // 1. Read the link once, then drop it from the URL so refresh/back does not replay it.
  useEffect(() => {
    if (!searchParams.has('cycleId') && !searchParams.has('applicationId')) return;
    const target = parsePromotionTarget(searchParams);
    if (target) {
      setDeepLink({ target, stage: 'cycle' });
    } else {
      addToast('This notification link is invalid. Showing all promotion cycles.', 'WARNING');
    }
    const rest = new URLSearchParams(searchParams);
    rest.delete('cycleId');
    rest.delete('applicationId');
    setSearchParams(rest, { replace: true });
  }, [searchParams, setSearchParams, addToast]);

  // 2. Select the cycle, but only from the list the server scoped for this account.
  useEffect(() => {
    if (!deepLink || deepLink.stage !== 'cycle' || !cyclesLoaded) return;
    const resolved = resolveTargetCycle(deepLink.target, cycles);
    if (resolved.kind === 'unavailable') {
      addToast(resolved.message, 'WARNING');
      setDeepLink(null);
      return;
    }
    setSelectedCycle(resolved.cycle);
    setDeepLink(deepLink.target.applicationId ? { ...deepLink, stage: 'application' } : null);
  }, [deepLink, cyclesLoaded, cycles, addToast]);

  // 3. Once that cycle's (station-scoped) applications arrive, open the applicant.
  useEffect(() => {
    if (!deepLink || deepLink.stage !== 'application') return;
    const { cycleId } = deepLink.target;
    if (selectedCycle?.id !== cycleId || appsLoadedForCycleId !== cycleId) return;
    const resolved = resolveTargetApplication(deepLink.target, submittedApps);
    if (resolved?.kind === 'found') {
      setSelectedApplicantInfo(resolved.application);
      setShowApplicantInfoModal(true);
    } else if (resolved) {
      addToast(resolved.message, 'WARNING');
    }
    setDeepLink(null);
  }, [deepLink, selectedCycle?.id, appsLoadedForCycleId, submittedApps, addToast]);



  const generateLocalLeaderboard = () => {
    if (submittedApps.length === 0) {
      setLeaderboard([]);
      return;
    }

    const currentList = submittedApps.map((a: any) => {
      const initScore = a.scoreDetailsJson?.initialRating?.initialTotalScore || a.performanceRating || 0;
      const finScore = a.scoreDetailsJson?.finalRating?.finalTotalScore || 0;
      return {
        id: a.id,
        employeeId: a.employeeId,
        name: a.name,
        designation: a.designation,
        status: a.status || 'SUBMITTED',
        initialTotalScore: initScore,
        finalTotalScore: finScore,
        overallTotalScore: parseFloat((initScore + finScore).toFixed(2)),
      };
    });

    currentList.sort((a: any, b: any) => b.overallTotalScore - a.overallTotalScore);
    const ranked = currentList.map((item: any, i: number) => ({ ...item, rank: i + 1 }));
    setLeaderboard(ranked);
  };

  // AO II Requirements Completeness Verification Handler (Official DepEd Annex C)
  const handleOpenAoRating = (app: any) => {
    if (user?.role !== 'AO_II' && user?.role !== 'HRMO' && user?.role !== 'SYSTEM_ADMIN') {
      addToast('Forbidden: Only Administrative Officer II (AO II) and HRMO officers can verify requirements completeness.', 'ERROR');
      return;
    }
    setSelectedAppForModal(app);

    const annexC = app.scoreDetailsJson?.annexCChecklist || {};
    const existingItems = Array.isArray(annexC.items) ? annexC.items : [];

    const mappedItems = annexCRequirements.map(def => {
      const raw = existingItems.find((it: any) => it.code === def.code);
      // Applications submitted from the Flutter app spell these fields
      // differently; normaliseAnnexCItem reads either.
      const found = normaliseAnnexCItem(raw);
      const isSubmitted = Boolean(found?.submitted);
      const prevVerification = found?.verificationStatus || (found?.status === 'VERIFIED' ? 'VERIFIED' : (isSubmitted ? 'VERIFIED' : (def.isMandatory ? 'INCOMPLETE' : 'NOT_APPLICABLE')));
      return {
        code: def.code,
        title: found?.title || def.title,
        description: found?.description || def.description,
        isMandatory: found?.isMandatory ?? def.isMandatory,
        submitted: isSubmitted,
        documentName: found?.documentName,
        documentType: raw?.documentType,
        personnelDocumentId: found?.personnelDocumentId,
        status: (prevVerification as 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE') || 'VERIFIED',
        remarks: found?.remarks || '',
      };
    });

    setReqVerificationItems(mappedItems);

    const reqCheck = app.scoreDetailsJson?.requirementsCheck || {};
    const isComplete = reqCheck.status === 'COMPLETE' || app.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
    setReqCompletenessStatus(reqCheck.status || (isComplete ? 'COMPLETE' : 'COMPLETE'));
    setReqVerificationRemarks(reqCheck.remarks || (isComplete ? 'All documentary requirements verified complete and authentic.' : ''));

    setShowAoModal(true);
  };

    const savingAoRating = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleSubmitAoRating = (e: React.FormEvent) => {
    e.preventDefault();
    void savingAoRating.run(() => handleSubmitAoRatingUnguarded(e));
  };

  const handleSubmitAoRatingUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForModal || !selectedCycle) return;
    if (user?.role !== 'AO_II' && user?.role !== 'HRMO' && user?.role !== 'SYSTEM_ADMIN') {
      addToast('Forbidden: Only Administrative Officer II (AO II) and HRMO officers can verify requirements completeness.', 'ERROR');
      return;
    }

    try {
      await apiClient.post(`/promotions/cycles/${selectedCycle.id}/applications/${selectedAppForModal.id}/verify-requirements`, {
        status: reqCompletenessStatus,
        remarks: reqVerificationRemarks || (reqCompletenessStatus === 'COMPLETE' ? 'All documentary requirements verified complete and authentic by AO II.' : 'Documentary requirements incomplete or deficient.'),
        itemVerifications: reqVerificationItems.map(it => ({
          code: it.code,
          status: it.status,
          remarks: it.remarks,
        })),
      });

      addToast(
        reqCompletenessStatus === 'COMPLETE'
          ? `Requirements for ${selectedAppForModal.name} verified as COMPLETE. Endorsed for HRMPSB score deliberation!`
          : `Requirements for ${selectedAppForModal.name} marked INCOMPLETE / DEFICIENT.`,
        reqCompletenessStatus === 'COMPLETE' ? 'SUCCESS' : 'WARNING'
      );
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Not this officer's applicant to review (another station, or gone):
        // close the checklist, drop its contents and reload what the server shows.
        addToast(accessDeniedMessage('applicant'), 'ERROR');
        setShowAoModal(false);
        setSelectedAppForModal(null);
        setReqVerificationItems([]);
        await fetchApplicationsForCycle(selectedCycle.id);
        await fetchLeaderboard(selectedCycle.id);
        return;
      }
      // Keep the modal open so the officer can retry rather than assume it saved.
      // A 403 carries the server's reason, e.g. a cycle restricted to another district.
      addToast(
        err.response?.data?.message || `Could not record the requirements verification for ${selectedAppForModal.name}. Please try again.`,
        'ERROR'
      );
      return;
    }

    await fetchApplicationsForCycle(selectedCycle.id);
    await fetchLeaderboard(selectedCycle.id);
    setShowAoModal(false);
  };

  // HRMO Staff Final Rating Handler (Official DepEd CAR Criteria)
  const handleOpenHrmoRating = (app: any) => {
    if (!isHR) {
      addToast('Forbidden: System Administrator cannot perform HR ratings. Only HRMO staff can finalize promotion ratings.', 'ERROR');
      return;
    }

    // The server enforces this too (REQUIREMENTS_NOT_VERIFIED); checking here
    // means HR is told before filling in the whole assessment, not after.
    const blocked = deliberationBlockReason(app.scoreDetailsJson);
    if (blocked) {
      addToast(blocked, 'ERROR');
      return;
    }
    const desig = (app.designation || '').toLowerCase();
    const isNonTeaching = selectedCycle?.rulesConfigurationJson?.track === 'NON_TEACHING' || app.track === 'NON_TEACHING' || app.scoreDetailsJson?.track === 'NON_TEACHING' || (!isCycleTeaching && (desig.includes('administrative') || desig.includes('registrar') || desig.includes('officer') || desig.includes('assistant')));
    
    setModalTrack(isNonTeaching ? 'NON_TEACHING' : 'TEACHING');

    setSelectedAppForModal(app);

    const existingFinal = app.scoreDetailsJson?.finalRating || {};
    const existingInitial = app.scoreDetailsJson?.initialRating || {};

    // Common qualification criteria (HRMPSB Deliberation)
    setHrmoEduScore(Number(existingFinal.educationScore ?? existingInitial.educationScore ?? 10));
    setHrmoTrainScore(Number(existingFinal.trainingScore ?? existingInitial.trainingScore ?? 10));
    setHrmoExpScore(Number(existingFinal.experienceScore ?? existingInitial.experienceScore ?? 10));
    setHrmoPerfScore(Number(existingFinal.performanceScore ?? existingInitial.performanceScore ?? (isNonTeaching ? 20 : 30)));

    // Non-Teaching Specific Criteria
    setHrmoAccomplishmentsScore(Number(existingFinal.outstandingAccomplishmentsScore ?? existingInitial.outstandingAccomplishmentsScore ?? 5));
    setHrmoAppEduScore(Number(existingFinal.applicationOfEducationScore ?? existingInitial.applicationOfEducationScore ?? 15));
    setHrmoAppLdScore(Number(existingFinal.applicationOfLdScore ?? existingInitial.applicationOfLdScore ?? 10));
    setHrmoWrittenScore(Number(existingFinal.potentialWrittenScore ?? 5));
    setHrmoBeiScore(Number(existingFinal.potentialBeiScore ?? 5));
    setHrmoSkillsScore(Number(existingFinal.potentialSkillsScore ?? 10));
    setHrmoPotentialScore(Number(existingFinal.potentialScore ?? 20));

    // Teaching Specific Criteria
    setHrmoPpstCoiScore(Number(existingFinal.ppstCoiScore ?? 25));
    setHrmoPpstNcoiScore(Number(existingFinal.ppstNcoiScore ?? 15));

    // CAR Governance
    setHrmoRemarks(existingFinal.hrmoRemarks || 'Deliberated and qualified in accordance with DepEd CAR standards.');
    setForBackgroundInvestigation(app.forBackgroundInvestigation || app.scoreDetailsJson?.forBackgroundInvestigation || 'YES');
    setForAppointment(app.forAppointment || app.scoreDetailsJson?.forAppointment || 'Recommended for Appointment');
    setForProbation(app.forProbation || app.scoreDetailsJson?.forProbation || '6 months');
    setShowHrmoModal(true);
  };

    const savingHrmoRating = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleSubmitHrmoRating = (e: React.FormEvent) => {
    e.preventDefault();
    void savingHrmoRating.run(() => handleSubmitHrmoRatingUnguarded(e));
  };

  const handleSubmitHrmoRatingUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForModal || !selectedCycle) return;
    if (!isHR) {
      addToast('Forbidden: Only HRMO staff can finalize promotion ratings.', 'ERROR');
      return;
    }

    const isNonTeaching = modalTrack === 'NON_TEACHING';
    const edu = Number(hrmoEduScore);
    const train = Number(hrmoTrainScore);
    const exp = Number(hrmoExpScore);
    const perf = Number(hrmoPerfScore);

    let totalCar = 0;
    if (isNonTeaching) {
      const outAcc = Number(hrmoAccomplishmentsScore);
      const appEdu = Number(hrmoAppEduScore);
      const appLd = Number(hrmoAppLdScore);
      const written = Number(hrmoWrittenScore);
      const bei = Number(hrmoBeiScore);
      const skills = Number(hrmoSkillsScore);
      totalCar = parseFloat((edu + train + exp + perf + outAcc + appEdu + appLd + written + bei + skills).toFixed(2));
    } else {
      const coi = Number(hrmoPpstCoiScore);
      const ncoi = Number(hrmoPpstNcoiScore);
      totalCar = parseFloat((edu + train + exp + perf + coi + ncoi).toFixed(2));
    }

    const isResubmission = selectedAppForModal.status === 'FINAL_RANKED' || !!selectedAppForModal.scoreDetailsJson?.finalRating;

    try {
      await apiClient.post(`/promotions/cycles/${selectedCycle.id}/applications/${selectedAppForModal.id}/final-rating`, {
        track: modalTrack,
        educationScore: edu,
        trainingScore: train,
        experienceScore: exp,
        performanceScore: perf,
        outstandingAccomplishmentsScore: isNonTeaching ? hrmoAccomplishmentsScore : undefined,
        applicationOfEducationScore: isNonTeaching ? hrmoAppEduScore : undefined,
        applicationOfLdScore: isNonTeaching ? hrmoAppLdScore : undefined,
        ppstCoiScore: isNonTeaching ? undefined : hrmoPpstCoiScore,
        ppstNcoiScore: isNonTeaching ? undefined : hrmoPpstNcoiScore,
        potentialScore: isNonTeaching ? Number(hrmoWrittenScore) + Number(hrmoBeiScore) + Number(hrmoSkillsScore) : undefined,
        potentialWrittenScore: isNonTeaching ? hrmoWrittenScore : undefined,
        potentialBeiScore: isNonTeaching ? hrmoBeiScore : undefined,
        potentialSkillsScore: isNonTeaching ? hrmoSkillsScore : undefined,
        remarks: hrmoRemarks,
        forBackgroundInvestigation,
        forAppointment,
        forProbation,
      });
      addToast(
        isResubmission
          ? `Comparative Assessment Result (${totalCar}/100) revised by HRMPSB Board for ${selectedAppForModal.name}!`
          : `Comparative Assessment Result (${totalCar}/100) finalized by HRMPSB Board for ${selectedAppForModal.name}!`,
        'SUCCESS'
      );
    } catch (err: any) {
      // Keep the modal open so the board can retry rather than assume the score saved.
      addToast(
        err.response?.data?.message || `Could not save the Comparative Assessment Result for ${selectedAppForModal.name}. Please try again.`,
        'ERROR'
      );
      return;
    }

    // Refresh cycle data from backend
    await fetchApplicationsForCycle(selectedCycle.id);
    await fetchLeaderboard(selectedCycle.id);
    setShowHrmoModal(false);
  };

  const [isDownloadingCar, setIsDownloadingCar] = useState(false);
  const carRequestInFlight = useRef(false);

  const handleDownloadCarDocument = async (cycleId?: number) => {
    const id = cycleId || selectedCycle?.id;
    if (!id) {
      addToast('Please select an active promotion cycle first.', 'WARNING');
      return;
    }

    // A ref, not state: a second click in the same render must not start a second download.
    if (carRequestInFlight.current) return;
    carRequestInFlight.current = true;
    try {
      setIsDownloadingCar(true);
      const { blob, filename } = await fetchCarDocument(apiClient, id, `CAR-cycle-${id}.docx`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      // Revoke after the click has been dispatched; the download keeps its own reference.
      setTimeout(() => window.URL.revokeObjectURL(url), 0);

      addToast(`CAR downloaded: ${filename}`, 'SUCCESS');
    } catch (err: any) {
      addToast(err?.response ? await carErrorMessage(err) : (err?.message || 'The CAR could not be generated.'), 'ERROR');
    } finally {
      carRequestInFlight.current = false;
      setIsDownloadingCar(false);
    }
  };

    // The server already returns "field: message" 400s from createCycleSchema;
  // this lands them on the right input instead of a toast that vanishes.
  const cycleErrors = useFormErrors();
  const creatingCycle = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleCreateCycle = (e: React.FormEvent) => {
    e.preventDefault();
    void creatingCycle.run(() => handleCreateCycleUnguarded(e));
  };

  const handleCreateCycleUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHR) {
      addToast('Access denied: System Administrator cannot create promotions. Promotion cycles can only be created by HR (HRMO).', 'ERROR');
      return;
    }
    try {
      const primaryPlantillaItem = designatedPlantillas.find(Boolean) || selectedPlantillaItemForCycle;
      const linked = plantillaItems.find(p => p.itemNumber === primaryPlantillaItem);
      const finalPosition = linked && !overridePlantillaFields ? linked.positionTitle : newTargetPosition;
      const finalSchool = linked && !overridePlantillaFields ? (linked.department || 'All Schools in District') : newCycleSchool;
      const finalDistrict = linked && !overridePlantillaFields
        ? getPlantillaDistrict(linked.department, linked.division)
        : newCycleDistrict;
      const isTeacher = finalPosition.toLowerCase().includes('teacher') ||
        finalPosition.toLowerCase().includes('principal') ||
        finalPosition.toLowerCase().includes('head teacher') ||
        finalPosition.toLowerCase().includes('sped');
      const finalTrack = linked && !overridePlantillaFields ? (isTeacher ? 'TEACHING' : 'NON_TEACHING') : newCycleTrack;

      const activePlantillaNumbers = designatedPlantillas.filter(Boolean);

      const payload = {
        name: newCycleName || '2026 Promotion & Merit Selection',
        type: newCycleType,
        status: newCycleStatus,
        startDate: newStartDate || todayStr,
        endDate: newEndDate || defaultEndStr,
        rulesConfigurationJson: {
          ...criteria,
          track: finalTrack,
          targetPosition: finalPosition,
          plantillaItemNumber: activePlantillaNumbers[0] || primaryPlantillaItem || undefined,
          plantillaItemNumbers: activePlantillaNumbers,
          district: finalDistrict,
          school: finalSchool,
          openTo: newOpenTo === 'DISTRICT' && finalDistrict ? 'DISTRICT' : 'DIVISION',
          maxApplicants: Number(newMaxApplicants) || 10,
          vacantPositions: Number(newVacantPositions) || 1,
        },
      };
      cycleErrors.clear();
      const res = await apiClient.post('/promotions/cycles', payload);
      const createdCycle = res.data?.data;
      addToast(`New promotion cycle '${payload.name}' created for ${finalDistrict} (${finalSchool})! (Track: ${finalTrack === 'TEACHING' ? 'Teaching' : 'Non-Teaching'} | Max Capacity: ${payload.rulesConfigurationJson.maxApplicants} applicants | Vacancies: ${payload.rulesConfigurationJson.vacantPositions} posts | Plantillas: ${activePlantillaNumbers.length} allocated)`, 'SUCCESS');
      setShowConfigModal(false);
      setNewCycleName('');
      setSelectedPlantillaItemForCycle('');
      setDesignatedPlantillas(['']);
      setNewVacantPositions(1);
      setOverridePlantillaFields(false);
      setNewOpenTo('DIVISION');

      if (createdCycle) {
        setCycles(prev => [createdCycle, ...prev]);
        setSelectedCycle(createdCycle);
      }
      await fetchCycles();
    } catch (err: any) {
      // A field-shaped rejection goes to that field; anything else still needs a toast.
      if (!cycleErrors.setFromResponse(err)) {
        addToast(err.response?.data?.message || 'Failed to create promotion cycle.', 'ERROR');
      }
    }
  };

    const savingApplication = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleSubmitApplicationForm = (e: React.FormEvent) => {
    e.preventDefault();
    void savingApplication.run(() => handleSubmitApplicationFormUnguarded(e));
  };

  const handleSubmitApplicationFormUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCycle) return;

    const maxCapacity = selectedCycle.rulesConfigurationJson?.maxApplicants || 10;
    if (submittedApps.length >= maxCapacity) {
      addToast(`Maximum applicant capacity reached! This promotion cycle allows a maximum of ${maxCapacity} applicants.`, 'WARNING');
      return;
    }

    const applicantFirstName = appFirstName.trim() || appFormApplicantName.split(' ')[0] || 'Applicant';
    const applicantLastName = appLastName.trim() || appFormApplicantName.split(' ').slice(1).join(' ') || 'Candidate';
    const applicantFullName = `${applicantFirstName} ${appMiddleName ? appMiddleName.trim() + ' ' : ''}${applicantLastName}${appSuffix ? ' ' + appSuffix.trim() : ''}`.trim();
    const applicantEmail = appEmail.trim() || `${applicantFirstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${applicantLastName.toLowerCase().replace(/[^a-z0-9]/g, '')}@deped.gov.ph`;

    const cyclePos = selectedCycle.rulesConfigurationJson?.targetPosition || 'Teacher I';

    try {
      await apiClient.post(`/promotions/cycles/${selectedCycle.id}/manual-application`, {
        applicantId: appFormApplicantId.trim() || undefined,
        applicantName: applicantFullName,
        designation: cyclePos,
        // Complete PDS Form 212 fields
        firstName: applicantFirstName,
        middleName: appMiddleName.trim() || undefined,
        lastName: applicantLastName,
        suffix: appSuffix.trim() || undefined,
        birthDate: appBirthDate,
        gender: appGender,
        civilStatus: appCivilStatus,
        contactNumber: appContactNumber.trim() || undefined,
        address: appAddress.trim() || undefined,
        email: applicantEmail,
        // Initial scores default to unrated until AO II evaluates
        remarks: appFormRemarks || 'Complete PDS Application Registered - Pending Initial Rating',
      });
      addToast(`Applicant ${applicantFullName} registered successfully for ${selectedCycle.name}! Ready for AO II Initial Rating.`, 'SUCCESS');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to register applicant.';
      addToast(msg, 'ERROR');
      return;
    }

    setShowAppModal(false);
    // Reset form fields
    setAppFirstName('');
    setAppMiddleName('');
    setAppLastName('');
    setAppSuffix('');
    setAppContactNumber('');
    setAppAddress('');
    setAppEmail('');
    setAppFormApplicantId('');
    setAppFormApplicantName('');
    setAppFormDesignation('');

    if (selectedCycle?.id) {
      await fetchApplicationsForCycle(selectedCycle.id);
      await fetchLeaderboard(selectedCycle.id);
    }
  };

  const cycleTrack = selectedCycle?.rulesConfigurationJson?.track;
  const cyclePosName = (selectedCycle?.rulesConfigurationJson?.targetPosition || selectedCycle?.name || '').toLowerCase();
  const isCycleTeaching = cycleTrack
    ? (cycleTrack === 'TEACHING')
    : !(
      cyclePosName.includes('administrative') ||
      cyclePosName.includes('registrar') ||
      cyclePosName.includes('officer') ||
      cyclePosName.includes('non-teaching') ||
      cyclePosName.includes('assistant') ||
      cyclePosName.includes('clerk') ||
      cyclePosName.includes('aide') ||
      cyclePosName.includes('utility')
    );

  return (
    <div className="page-content animate-fade-in" style={{ padding: '24px 32px 100px 32px', maxWidth: '1680px', margin: '0 auto' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 400px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'var(--font-sans)' }}>
            Promotions
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedCycle && (selectedCycle.rulesConfigurationJson?.targetPosition || 'Teacher I') === 'Teacher I' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAppModal(true)} style={{ border: '1px solid var(--glass-border)', background: 'var(--bg-glass-fill)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="checklist" size={14} /> Register Applicant Form (Teacher I)
            </button>
          )}
          {isHR ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowConfigModal(true)} style={{ background: 'var(--color-primary)', color: '#ffffff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="new-transaction" size={14} /> Create Promotion Cycle
            </button>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              fontWeight: 600,
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}>
              <AppIcon name="lock" size={12} color="var(--color-text-secondary)" />
              <span>Cycle Creation: HR Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="promotion-stage" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '20px' }}>
        
        {/* Left Sidebar: Promotion Cycles with Interactive Status Filters */}
        {!selectedCycle && (
        <div className="card glass-surface promotion-cycle-index" style={{ padding: '20px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)', display: 'flex', flexDirection: 'column', gap: '14px', alignSelf: 'start' }}>
          
          {/* Header & Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                Promotion Cycles
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'} found
              </span>
            </div>
            <button
              type="button"
              onClick={() => fetchCycles(true)}
              title="Refresh Cycles"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Quick Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              aria-label="Search cycles"
              type="text"
              className="has-icon-left"
              placeholder="Search cycles..."
              value={cycleSearchQuery}
              onChange={(e) => handleCycleSearchChange(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                fontSize: '0.9375rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            {cycleSearchQuery && (
              <button
                type="button"
                onClick={() => handleCycleSearchChange('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: 0,
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Filter size={11} /> Filter by Status
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { key: 'ALL', label: 'All', color: '#2F7D52', activeBg: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1', activeBorder: '#3F9265' },
                { key: 'ONGOING', label: 'Ongoing', color: '#059669', activeBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5', activeBorder: '#10B981' },
                { key: 'PLANNING', label: 'Upcoming', color: '#D97706', activeBg: theme === 'dark' ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7', activeBorder: '#F59E0B' },
                { key: 'FINISHED', label: 'Finished', color: '#6366F1', activeBg: theme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', activeBorder: '#6366F1' },
                { key: 'CANCELLED', label: 'Cancelled', color: '#DC2626', activeBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2', activeBorder: '#EF4444' },
              ].map(tab => {
                const isActive = cycleStatusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleCycleFilterChange(tab.key as any)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.875rem',
                      fontWeight: isActive ? 800 : 600,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: `1.5px solid ${isActive ? tab.activeBorder : 'var(--color-border)'}`,
                      background: isActive ? tab.activeBg : 'var(--color-bg-tertiary)',
                      color: isActive ? tab.color : 'var(--color-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cycle Cards List */}
          <div className="promotion-cycle-grid" style={{ display: 'grid', gap: '10px', paddingRight: '2px' }}>
            {cycles.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  width: '100%',
                  padding: '56px 24px',
                  textAlign: 'center',
                  background: 'var(--color-bg-tertiary)',
                  borderRadius: '16px',
                  border: '1.5px dashed var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  }}
                >
                  <Archive size={30} style={{ color: 'var(--color-text-muted)' }} />
                </div>
                <div style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  No {cycleStatusFilter !== 'ALL' ? `${cycleStatusFilter.toLowerCase()} ` : ''}cycles found
                </div>
                <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)', margin: '0 0 20px 0', maxWidth: '440px', lineHeight: 1.55 }}>
                  {cycleSearchQuery
                    ? `No promotion cycles match "${cycleSearchQuery}". Try clearing your search query or switching status filters.`
                    : cycleStatusFilter !== 'ALL'
                      ? `There are no ${cycleStatusFilter.toLowerCase()} promotion cycles at this time. Switch back to view all cycles.`
                      : 'No promotion cycles have been registered yet. HR administrators can create a new cycle to get started.'}
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {(cycleStatusFilter !== 'ALL' || cycleSearchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCycleFilterChange('ALL');
                        handleCycleSearchChange('');
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '1rem', fontWeight: 600, padding: '8px 18px', borderRadius: '10px' }}
                    >
                      Reset to All Cycles
                    </button>
                  )}
                  {isHR && (
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(true)}
                      className="btn btn-primary btn-sm"
                      style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        padding: '8px 18px',
                        borderRadius: '10px',
                        background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                        color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AppIcon name="new-transaction" size={14} />
                      Create Promotion Cycle
                    </button>
                  )}
                </div>
              </div>
            ) : (
              cycles.map(cycle => {
                const isSelected = selectedCycle?.id === cycle.id;
                const status = (cycle.status || '').toUpperCase();
                const isOngoing = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT'].includes(status);
                const isPlanning = ['PLANNING', 'CONFIGURED'].includes(status);
                const isFinished = ['CLOSED', 'FINALIZED', 'RESULTS_READY', 'PUBLISHED', 'RESOLVED'].includes(status);
                const isCancelled = status === 'CANCELLED';

                const badgeBg = isOngoing
                  ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                  : isPlanning
                    ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB')
                    : isFinished
                      ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#EEF7F1')
                      : (theme === 'dark' ? 'rgba(244, 63, 94, 0.15)' : '#FFF1F2');

                const badgeColor = isOngoing
                  ? (theme === 'dark' ? '#34D399' : '#059669')
                  : isPlanning
                    ? (theme === 'dark' ? '#FBBF24' : '#D97706')
                    : isFinished
                      ? (theme === 'dark' ? '#8FD3A8' : '#2F7D52')
                      : (theme === 'dark' ? '#FB7185' : '#E11D48');

                const badgeBorder = isOngoing
                  ? 'rgba(16, 185, 129, 0.3)'
                  : isPlanning
                    ? 'rgba(245, 158, 11, 0.3)'
                    : isFinished
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(244, 63, 94, 0.3)';

                const statusLabel = isOngoing ? 'Ongoing' : isPlanning ? 'Upcoming' : isFinished ? 'Finished' : 'Cancelled';

                return (
                  <div
                    key={cycle.id}
                    className="promotion-cycle-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedCycle(cycle);
                      setActiveTab('LEADERBOARD');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedCycle(cycle);
                        setActiveTab('LEADERBOARD');
                      }
                    }}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '14px',
                      background: isSelected ? (theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1') : 'var(--color-bg-tertiary)',
                      border: `1.5px solid ${isSelected ? '#2F7D52' : 'var(--color-border)'}`,
                      boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 700, }}>
                        {String(cycle.type || 'NATURAL_VACANCY').toLowerCase().replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())}
                      </span>
                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeBorder}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: badgeColor }} />
                        {statusLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: isSelected ? (theme === 'dark' ? '#8FD3A8' : '#276A45') : 'var(--color-text-primary)', lineHeight: 1.35, marginBottom: '8px' }}>
                      {String(cycle.name || '').replace(/^Ranking for (Natural )?Vacancy:\s*/i, '')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      <span>{cycle.applicantCount || 0} {(cycle.applicantCount || 0) === 1 ? 'applicant' : 'applicants'}
                        {' · '}{cycle.rulesConfigurationJson?.openTo === 'DISTRICT' && cycle.rulesConfigurationJson?.district ? `${cycle.rulesConfigurationJson.district} only` : 'Whole division'}</span>
                      {cycle.endDate && (
                        <span>Ends {new Date(cycle.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Right Area: Workspace, Tabs & Leaderboard */}
        {selectedCycle && (
        <div className="promotion-cycle-detail" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="promotion-detail-navigation">
            <button
              type="button"
              className="btn btn-secondary btn-sm promotion-back-button"
              onClick={() => setSelectedCycle(null)}
            >
              <AppIcon name="chevron-left" size={14} /> Back to promotion cycles
            </button>
          </div>
          {selectedCycle && (
            <>
              {/* Cycle header: the vacancy, its seats, and the facts HR needs. */}
              {(() => {
                const cycleStatus = (selectedCycle.status || '').toUpperCase();
                const tone = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT'].includes(cycleStatus) ? 'open'
                  : ['PLANNING', 'CONFIGURED'].includes(cycleStatus) ? 'planning'
                  : cycleStatus === 'CANCELLED' ? 'cancelled' : 'closed';
                const statusLabel: Record<string, string> = {
                  ACTIVE: 'Open for applications', PLANNING: 'Planning', CONFIGURED: 'Planning',
                  EVALUATION: 'Under evaluation', COMPARATIVE_ASSESSMENT: 'Comparative assessment',
                  RESULTS_READY: 'Results ready', CLOSED: 'Closed', FINALIZED: 'Finalized',
                  PUBLISHED: 'Published', RESOLVED: 'Resolved', CANCELLED: 'Cancelled',
                };
                const rules = selectedCycle.rulesConfigurationJson || {};
                const school = rules.school && rules.school !== 'All Schools in District' ? rules.school : null;
                // Appointed people first, then those selected and awaiting documents.
                const seated = [
                  ...leaderboard.filter(isAppointed).map(item => ({ item, state: 'appointed' as const })),
                  ...leaderboard.filter(item => !isAppointed(item) && isSelectedPendingAppointment(item)).map(item => ({ item, state: 'selected' as const })),
                ];
                const seats = Array.from({ length: Math.max(cycleVacantPositions, 1) }, (_, i) => seated[i] ?? null);
                const filled = seats.filter(Boolean).length;

                return (
                  <section className="pcd-head">
                    <div className="pcd-head__top">
                      <div className="pcd-head__where">
                        SDO Koronadal City, {rules.district || 'Division Proper'}
                      </div>
                      <div className="pcd-head__actions">
                        {isHR ? (
                          <label className={`pcd-status pcd-status--${tone}`}>
                            <span className="pcd-status__dot" aria-hidden="true" />
                            <select
                              aria-label="Promotion cycle status"
                              value={selectedCycle.status}
                              onChange={(e) => handleUpdateCycleStatus(selectedCycle.id, e.target.value)}
                            >
                              {!['ACTIVE', 'PLANNING', 'CLOSED', 'FINALIZED', 'CANCELLED'].includes(selectedCycle.status) && (
                                <option value={selectedCycle.status} disabled>{statusLabel[cycleStatus] || selectedCycle.status}</option>
                              )}
                              <option value="ACTIVE">Open for applications</option>
                              <option value="PLANNING">Planning</option>
                              <option value="CLOSED">Closed</option>
                              <option value="FINALIZED">Finalized</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                          </label>
                        ) : (
                          <span className={`pcd-status pcd-status--${tone}`}>
                            <span className="pcd-status__dot" aria-hidden="true" />{statusLabel[cycleStatus] || selectedCycle.status}
                          </span>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm pcd-btn" onClick={() => setShowAppModal(true)}>
                          Register applicant
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm pcd-btn"
                          onClick={() => { setActiveTab('CAR'); handleDownloadCarDocument(selectedCycle.id); }}
                          disabled={isDownloadingCar}
                        >
                          <AppIcon name="receipt" size={14} color="#FFFFFF" />
                          {isDownloadingCar ? 'Preparing CAR…' : 'Download CAR'}
                        </button>
                      </div>
                    </div>

                    <h2 className="pcd-head__title">{rules.targetPosition || selectedCycle.name}</h2>
                    {school && <p className="pcd-head__school">{school}</p>}

                    <div className="pcd-seats" aria-label={`${filled} of ${seats.length} positions filled`}>
                      {seats.map((seat, i) => (
                        <div key={i} className={`pcd-seat pcd-seat--${seat ? seat.state : 'open'}`}>
                          <span className="pcd-seat__mark" aria-hidden="true">
                            {seat ? (seat.item.name || '?').split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('') : i + 1}
                          </span>
                          <span className="pcd-seat__text">
                            <strong>{seat ? seat.item.name : 'Open position'}</strong>
                            <span>{seat ? (seat.state === 'appointed' ? 'Appointed' : 'Selected, submitting documents') : 'No one selected yet'}</span>
                          </span>
                        </div>
                      ))}
                    </div>

                    <dl className="pcd-facts">
                      <div><dt>Cycle</dt><dd>{selectedCycle.name}</dd></div>
                      <div><dt>Applications</dt><dd>{formatDateString(selectedCycle.startDate)} to {formatDateString(selectedCycle.endDate)}</dd></div>
                      <div><dt>Plantilla item</dt><dd className="pcd-facts__code">{cyclePlantillaNo || 'Division pool'}</dd></div>
                      <div><dt>Scoring</dt><dd>{isCycleTeaching ? 'Teaching, 100 points' : 'Non-teaching, 100 points'}</dd></div>
                      <div><dt>Applicants</dt><dd>{leaderboard.length}</dd></div>
                    </dl>
                  </section>
                );
              })()}

              <nav className="pcd-tabs" aria-label="Cycle views">
                {([
                  ['LEADERBOARD', 'Ranking', true],
                  ['CAR', 'CAR results', true],
                  ['AO_RATING', 'Requirements check', isHR],
                  ['HRMO_RANKING', 'Board deliberation', user?.role === 'HRMO'],
                  ['HR_SELECTION', 'Candidate selection', user?.role === 'HRMO'],
                ] as const).filter(([, , show]) => show).map(([key, label]) => (
                  <button key={key} type="button" aria-current={activeTab === key ? 'page' : undefined} onClick={() => setActiveTab(key as any)}>
                    {label}
                  </button>
                ))}
              </nav>

                {/* TAB 1: REALTIME RANKING LEADERBOARD */}
                {activeTab === 'LEADERBOARD' && (
                  <div className="card promotion-leaderboard-card" style={{ padding: '20px', borderRadius: '12px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)' }}>
                    {/* Header Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                            Ranking
                          </h3>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            borderRadius: '9999px',
                            background: theme === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            color: theme === 'dark' ? '#34D399' : '#059669',
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }} />
                            Live
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Integrated Candidate Filter Input */}
                        <div style={{ position: 'relative', width: '210px' }}>
                          <input
                            aria-label="Filter applicants"
                            type="text"
                            className="has-icon-left"
                            placeholder="Filter applicants..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 12px 6px 28px',
                              fontSize: '0.9375rem',
                              borderRadius: '7px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-tertiary)',
                              color: 'var(--color-text-primary)',
                              outline: 'none',
                            }}
                          />
                          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>
                            <AppIcon name="search" size={12} color="var(--color-text-muted)" />
                          </span>
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-muted)' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Expand All / Collapse All Button */}
                        <button
                          type="button"
                          onClick={handleToggleExpandAll}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '7px',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          {expandAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {expandAll ? 'Collapse All' : 'Expand All'}
                        </button>

                        {/* Switch to Official CAR Tab Shortcut */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('CAR')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '7px',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <AppIcon name="receipt" size={13} color="var(--color-text-secondary)" />
                          Official CAR Tab
                        </button>
                      </div>
                    </div>

                    {/* Criteria & Vacancy Quota Notice Strip */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '0.9375rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', color: 'var(--color-text-secondary)' }}>
                        <span>Total: <strong style={{ color: 'var(--color-text-primary)' }}>100.00 pts</strong></span>
                        <span style={{ color: 'var(--color-border)' }}>•</span>
                        <span>Stage 1 (AO II): <strong style={{ color: 'var(--color-text-primary)' }}>{isCycleTeaching ? '60.00 pts' : '80.00 pts'}</strong></span>
                        <span style={{ color: 'var(--color-border)' }}>•</span>
                        <span>Stage 2 (HRMO): <strong style={{ color: 'var(--color-text-primary)' }}>{isCycleTeaching ? '40.00 pts' : '20.00 pts'}</strong></span>
                        <span style={{ color: 'var(--color-border)' }}>•</span>
                        <span>Authorized Vacancy: <strong style={{ color: '#059669' }}>{cycleVacantPositions} {cycleVacantPositions === 1 ? 'Slot' : 'Slots'}</strong></span>
                      </div>
                    </div>

                    {/* LEADERBOARD TABLE WITH EXPANDABLE PARTICIPANTS */}
                    <div className="table-wrapper promotion-leaderboard-table-wrapper" style={{ border: '1px solid var(--color-border)', borderRadius: '10px', width: '100%', overflowX: 'auto', background: 'var(--color-bg-card)' }}>
                      <table className="table promotion-leaderboard-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '40px' }} />
                            <th style={{ padding: '10px 10px', textAlign: 'center', width: '55px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.875rem' }}>Rank</th>
                            <th className="promotion-applicant-column" style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.875rem' }}>Applicant</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.875rem' }}>Applicant No.</th>
                            <th style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.875rem' }}>Score</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', width: '1%', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.875rem' }}>Actions</th>
                          </tr>
                        </thead>

                        <tbody>
                          {filteredLeaderboard.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    {searchQuery ? 'No applicants match your search' : 'No candidates registered in this cycle yet'}
                                  </div>
                                  <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', maxWidth: '400px', margin: 0 }}>
                                    {searchQuery ? 'Try clearing or changing your search terms.' : 'Submit applicant dossiers using the Register Applicant button to begin deliberations.'}
                                  </p>
                                  {searchQuery ? (
                                    <button
                                      type="button"
                                      onClick={() => setSearchQuery('')}
                                      className="btn btn-secondary btn-sm"
                                      style={{ marginTop: '8px', fontSize: '0.9375rem' }}
                                    >
                                      Clear Search Filter
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setShowAppModal(true)}
                                      className="btn btn-primary btn-sm"
                                      style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.9375rem' }}
                                    >
                                      <AppIcon name="checklist" size={13} /> Submit Applicant Form
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredLeaderboard.map((item, index) => {
                              const isPromoted = isAppointed(item);
                              const reqCheck = item.scoreDetailsJson?.requirementsCheck;
                              const isComplete = reqCheck?.status === 'COMPLETE' || item.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
                              const isDeficient = reqCheck?.status === 'INCOMPLETE' || item.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT';
                              const hasAoRating = isComplete || Boolean(item.hasAoRating || item.scoreDetailsJson?.initialRating || item.initialDetails || (item.aoSubtotal && item.aoSubtotal > 0));
                              const hasHrmoRating = Boolean(item.hasHrmoRating || item.scoreDetailsJson?.finalRating || item.finalDetails || (item.hrmoSubtotal && item.hrmoSubtotal > 0));

                              const totalScore = Number(item.overallTotalScore || item.totalScore || 0);
                              const pct = Math.min(100, Math.max(0, totalScore));
                              const rank = item.rank || (index + 1);
                              const isWithinQuota = rank <= cycleVacantPositions;
                              const isExpanded = Boolean(expandedParticipants[item.id] || expandAll);

                              // Score breakdown values
                              const initialRating = item.scoreDetailsJson?.initialRating || item.initialDetails || {};
                              const finalRating = item.scoreDetailsJson?.finalRating || item.finalDetails || {};
                              const eduScore = hasAoRating ? Number(initialRating.educationScore ?? 0) : 0;
                              const trainScore = hasAoRating ? Number(initialRating.trainingScore ?? 0) : 0;
                              const expScore = hasAoRating ? Number(initialRating.experienceScore ?? 0) : 0;
                              const perfScore = hasAoRating ? Number(initialRating.performanceScore ?? 0) : 0;
                              const accomplishmentsScore = hasAoRating ? Number(initialRating.outstandingAccomplishmentsScore ?? 0) : 0;
                              const appEduScore = hasAoRating ? Number(initialRating.applicationOfEducationScore ?? 0) : 0;
                              const appLdScore = hasAoRating ? Number(initialRating.applicationOfLdScore ?? 0) : 0;

                              const aoSubtotal = hasAoRating ? getApplicantAoScore(item, isCycleTeaching) : 0;

                              const coiScore = hasHrmoRating ? Number(finalRating.ppstCoiScore ?? 0) : 0;
                              const ncoiScore = hasHrmoRating ? Number(finalRating.ppstNcoiScore ?? 0) : 0;
                              const writtenScore = hasHrmoRating ? Number(finalRating.writtenExamScore ?? 0) : 0;
                              const beiScore = hasHrmoRating ? Number(finalRating.beiScore ?? 0) : 0;
                              const skillsScore = hasHrmoRating ? Number(finalRating.skillsScore ?? 0) : 0;

                              const hrmoSubtotal = hasHrmoRating
                                ? (isCycleTeaching
                                    ? (finalRating.finalTotalScore !== undefined ? Number(finalRating.finalTotalScore) : coiScore + ncoiScore)
                                    : (finalRating.finalTotalScore !== undefined ? Number(finalRating.finalTotalScore) : writtenScore + beiScore + skillsScore))
                                : 0;

                              return (
                                <React.Fragment key={item.id}>
                                  <tr
                                    className="table-row-hover"
                                    aria-expanded={isExpanded}
                                    {...clickableRow(() => toggleParticipantExpand(item.id))}
                                    style={{
                                      borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)',
                                      borderLeft: isWithinQuota ? '3px solid #10B981' : '3px solid transparent',
                                      background: isPromoted
                                        ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4')
                                        : isExpanded
                                          ? 'var(--color-bg-tertiary)'
                                          : 'transparent',
                                      cursor: 'pointer',
                                      transition: 'background 0.15s ease',
                                    }}
                                  >
                                    {/* Expand Chevron */}
                                    <td style={{ padding: '12px 6px 12px 10px', textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleParticipantExpand(item.id);
                                        }}
                                        title={isExpanded ? 'Collapse breakdown' : 'Expand breakdown'}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: isExpanded ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                          borderRadius: '4px',
                                        }}
                                      >
                                        <AppIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
                                      </button>
                                    </td>

                                    {/* Rank Badge */}
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                      <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.9375rem',
                                        fontWeight: 800,
                                        fontFamily: 'var(--font-mono)',
                                        background: rank === 1
                                          ? 'rgba(16, 185, 129, 0.12)'
                                          : isWithinQuota
                                            ? 'var(--color-bg-tertiary)'
                                            : 'transparent',
                                        color: rank === 1
                                          ? '#10B981'
                                          : isWithinQuota
                                            ? 'var(--color-text-primary)'
                                            : 'var(--color-text-secondary)',
                                        border: rank === 1
                                          ? '1px solid rgba(16, 185, 129, 0.3)'
                                          : isWithinQuota
                                            ? '1px solid var(--color-border)'
                                            : '1px solid transparent',
                                      }}>
                                        {rank}
                                      </div>
                                    </td>

                                    {/* Applicant Details */}
                                    <td className="promotion-applicant-column" style={{ padding: '12px 14px' }}>
                                      <div className="promotion-applicant-identity" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          background: isPromoted
                                            ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
                                            : isWithinQuota
                                              ? 'var(--color-bg-tertiary)'
                                              : 'var(--color-bg-tertiary)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontWeight: 700,
                                          fontSize: '0.875rem',
                                          color: isPromoted ? '#ffffff' : 'var(--color-text-secondary)',
                                          border: '1px solid var(--color-border)',
                                          flexShrink: 0,
                                        }}>
                                          {item.name ? item.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2) : 'AP'}
                                        </div>
                                        <div className="promotion-applicant-copy">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                                              {item.name}
                                            </span>
                                            {isWithinQuota && (
                                              <span style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 700,
                                                color: '#059669',
                                                background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                              }}>
                                                ● In Quota
                                              </span>
                                            )}
                                            {isPromoted && (
                                              <span style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 700,
                                                color: '#059669',
                                                background: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
                                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                              }}>
                                                APPOINTED
                                              </span>
                                            )}
                                          </div>
                                          <div className="promotion-applicant-meta" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                            {item.designation || 'Candidate'} • <span>{item.station || 'Division Office'}</span>
                                            {(item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber) && (
                                              <span style={{ marginLeft: '6px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                                                [{item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber}]
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Applicant Number */}
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                      <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontWeight: 600,
                                        fontSize: '0.9375rem',
                                        color: 'var(--color-text-secondary)',
                                        background: 'var(--color-bg-tertiary)',
                                        padding: '3px 8px',
                                        borderRadius: '5px',
                                        border: '1px solid var(--color-border)',
                                        display: 'inline-block',
                                      }}>
                                        {item.applicantNumber ? item.applicantNumber : `APP-${String(item.id).padStart(4, '0')}`}
                                      </span>
                                    </td>

                                    {/* Total CAR Score & Direct Subtotal Breakdown */}
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '160px' }}>
                                        {hasHrmoRating ? (
                                          <>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                                              <span style={{
                                                fontSize: '1.125rem',
                                                fontWeight: 800,
                                                fontFamily: 'var(--font-mono)',
                                                color: 'var(--color-text-primary)',
                                              }}>
                                                {totalScore.toFixed(2)}
                                              </span>
                                              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>/ 100</span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: '#059669', fontFamily: 'var(--font-mono)', marginTop: '1px', fontWeight: 600 }}>
                                              HRMPSB Deliberated
                                            </div>
                                            <div style={{ width: '100%', height: '3px', background: 'var(--color-border)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                                              <div style={{
                                                width: `${pct}%`,
                                                height: '100%',
                                                background: isWithinQuota ? '#10B981' : 'var(--color-text-secondary)',
                                                borderRadius: '2px',
                                              }} />
                                            </div>
                                          </>
                                        ) : (
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <span style={{
                                              fontSize: '0.9375rem',
                                              fontWeight: 700,
                                              color: isComplete ? '#059669' : isDeficient ? '#DC2626' : '#D97706',
                                              background: isComplete
                                                ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#D1FAE5')
                                                : isDeficient
                                                ? (theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEE2E2')
                                                : (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7'),
                                              padding: '2px 8px',
                                              borderRadius: '9999px',
                                              border: isComplete
                                                ? '1px solid rgba(5, 150, 105, 0.3)'
                                                : isDeficient
                                                ? '1px solid rgba(220, 38, 38, 0.3)'
                                                : '1px solid rgba(217, 119, 6, 0.3)',
                                            }}>
                                              {isComplete ? 'Reqs Complete' : isDeficient ? 'Reqs Deficient' : 'Unverified'}
                                            </span>
                                            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                                              {isComplete ? 'Ready for Deliberation' : 'Pending AO II Check'}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    {/* Actions */}
                                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        {/* Requirements Check Button for AO II / Admin */}
                                        {(user?.role === 'AO_II' || user?.role === 'SYSTEM_ADMIN') && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenAoRating(item);
                                            }}
                                            style={{
                                              fontSize: '0.875rem',
                                              color: '#ffffff',
                                              border: 'none',
                                              background: isComplete ? '#059669' : isDeficient ? '#DC2626' : 'var(--color-primary)',
                                              padding: '4px 10px',
                                              borderRadius: '6px',
                                              fontWeight: 700,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              cursor: 'pointer',
                                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                            }}
                                            title={isComplete ? 'Annex C Requirements Complete & Verified' : isDeficient ? 'Annex C Requirements Deficient' : 'Check & Verify Annex C Requirements as AO II'}
                                          >
                                            <AppIcon name={isComplete ? 'check' : 'checklist'} size={12} color="#ffffff" />
                                            {isComplete ? 'Reqs Verified' : isDeficient ? 'Deficient' : 'Check Reqs'}
                                          </button>
                                        )}

                                        {/* Direct Deliberate Button for HRMO */}
                                        {isHR && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenHrmoRating(item);
                                            }}
                                            style={{
                                              fontSize: '0.875rem',
                                              color: '#ffffff',
                                              border: 'none',
                                              background: hasHrmoRating ? '#059669' : '#2F7D52',
                                              padding: '4px 10px',
                                              borderRadius: '6px',
                                              fontWeight: 700,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              cursor: 'pointer',
                                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                            }}
                                            title={hasHrmoRating ? 'Revise HRMO Final Deliberation' : 'Deliberate & Score Candidate as HRMO'}
                                          >
                                            <AppIcon name="check" size={12} color="#ffffff" />
                                            {hasHrmoRating ? 'Revise Delib.' : 'Deliberate'}
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedApplicantInfo(item);
                                            setShowApplicantInfoModal(true);
                                          }}
                                          style={{
                                            fontSize: '0.875rem',
                                            color: 'var(--color-text-primary)',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-bg-card)',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Dossier
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleParticipantExpand(item.id);
                                          }}
                                          style={{
                                            fontSize: '0.875rem',
                                            color: isExpanded ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                            border: '1px solid var(--color-border)',
                                            background: isExpanded ? 'var(--color-bg-tertiary)' : 'var(--color-bg-card)',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          {isExpanded ? 'Hide' : 'Details'}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* EXPANDED PARTICIPANT DOSSIER SCORECARD */}
                                  {isExpanded && (
                                    <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                                      <td colSpan={6} style={{ padding: '14px 18px 18px 18px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px' }}>
                                          {/* Stage 1: AO II Documentary Requirements Check (Annex C) */}
                                          <div style={{
                                            background: 'var(--color-bg-card)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '8px',
                                            padding: '14px',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>
                                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Stage 1 • AO II Documentary Check (Annex C)
                                              </span>
                                              <span style={{
                                                fontSize: '0.9375rem',
                                                fontWeight: 800,
                                                color: isComplete ? '#059669' : isDeficient ? '#DC2626' : '#D97706',
                                                background: isComplete
                                                  ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#D1FAE5')
                                                  : isDeficient
                                                  ? (theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEE2E2')
                                                  : (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FEF3C7'),
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                              }}>
                                                {isComplete ? 'Complete / Verified' : isDeficient ? 'Deficient' : 'Pending Check'}
                                              </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9375rem' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                <span>Verification Status:</span>
                                                <strong style={{ color: isComplete ? '#059669' : isDeficient ? '#DC2626' : '#D97706' }}>
                                                  {isComplete ? 'All Requirements Verified' : isDeficient ? 'Incomplete / Deficient' : 'Pending AO II Verification'}
                                                </strong>
                                              </div>
                                              {reqCheck?.verifiedByName && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                  <span>Verified By:</span>
                                                  <strong style={{ color: 'var(--color-text-primary)' }}>{reqCheck.verifiedByName}</strong>
                                                </div>
                                              )}
                                              {reqCheck?.verifiedAt && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                  <span>Date Verified:</span>
                                                  <strong style={{ color: 'var(--color-text-primary)' }}>{new Date(reqCheck.verifiedAt).toLocaleDateString()}</strong>
                                                </div>
                                              )}
                                              {reqCheck?.remarks && (
                                                <div style={{ marginTop: '4px', padding: '6px 8px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
                                                  "{reqCheck.remarks}"
                                                </div>
                                              )}

                                              {(user?.role === 'AO_II' || user?.role === 'SYSTEM_ADMIN') && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenAoRating(item);
                                                  }}
                                                  className="btn btn-primary btn-sm"
                                                  style={{ fontSize: '0.875rem', padding: '5px 12px', borderRadius: '6px', marginTop: '6px' }}
                                                >
                                                  {isComplete ? 'Review / Update Verification' : 'Check Requirements (Annex C)'}
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Stage 2: HRMO Final Deliberation Card */}
                                          <div style={{
                                            background: 'var(--color-bg-card)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '8px',
                                            padding: '14px',
                                          }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>
                                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Stage 2 • HRMO Deliberation
                                              </span>
                                              <span style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: hasHrmoRating ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                                {hasHrmoRating ? `${hrmoSubtotal.toFixed(2)} / ${isCycleTeaching ? '40.00' : '20.00'}` : 'Pending Deliberation'}
                                              </span>
                                            </div>

                                            {hasHrmoRating ? (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9375rem' }}>
                                                {isCycleTeaching ? (
                                                  <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                      <span>Classroom Observation (COIs):</span>
                                                      <strong style={{ color: 'var(--color-text-primary)' }}>{coiScore.toFixed(2)} / 25.00</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                      <span>Non-Classroom Indicators (NCOIs):</span>
                                                      <strong style={{ color: 'var(--color-text-primary)' }}>{ncoiScore.toFixed(2)} / 15.00</strong>
                                                    </div>
                                                  </>
                                                ) : (
                                                  <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                      <span>Written Examination:</span>
                                                      <strong style={{ color: 'var(--color-text-primary)' }}>{writtenScore.toFixed(2)} / 5.00</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                      <span>BEI Interview:</span>
                                                      <strong style={{ color: 'var(--color-text-primary)' }}>{beiScore.toFixed(2)} / 5.00</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                                      <span>Skills Test:</span>
                                                      <strong style={{ color: 'var(--color-text-primary)' }}>{skillsScore.toFixed(2)} / 10.00</strong>
                                                    </div>
                                                  </>
                                                )}
                                                <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Deliberation Score:</span>
                                                  <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                                                    {(aoSubtotal + hrmoSubtotal).toFixed(2)} / 100.00
                                                  </span>
                                                </div>
                                              </div>
                                            ) : (
                                              <div style={{ padding: '10px 0', textAlign: 'center' }}>
                                                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', margin: '0 0 10px 0' }}>
                                                  {hasAoRating ? 'Awaiting Final Deliberation by HRMO Board.' : 'Stage 2 deliberation opens once AO II evaluation is complete.'}
                                                </p>
                                                {isHR && (() => {
                                                  // Deliberation is gated on AO II verification server-side; show
                                                  // that state here instead of offering a button that will 400.
                                                  const awaitingAo = !isRequirementsVerified(item.scoreDetailsJson);
                                                  return (
                                                    <button
                                                      type="button"
                                                      disabled={awaitingAo}
                                                      title={awaitingAo ? 'Deliberation opens once the Administrative Officer II verifies the documentary requirements.' : undefined}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenHrmoRating(item);
                                                      }}
                                                      className={awaitingAo ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                                                      style={{ fontSize: '0.875rem', padding: '4px 12px', borderRadius: '6px', cursor: awaitingAo ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      {awaitingAo ? 'Awaiting AO II verification' : 'Deliberate Candidate'}
                                                    </button>
                                                  );
                                                })()}
                                              </div>
                                            )}
                                          </div>

                                          {/* Candidate Civil Service & Plantilla Metadata */}
                                          <div style={{
                                            background: 'var(--color-bg-card)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '8px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                          }}>
                                            <div>
                                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>
                                                Candidate Promotion Status
                                              </div>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.9375rem' }}>
                                                <div style={{ color: 'var(--color-text-secondary)' }}>
                                                  <strong>Quota Stand:</strong> <span style={{ color: isWithinQuota ? '#059669' : 'var(--color-text-muted)', fontWeight: 700 }}>{isWithinQuota ? `Rank #${rank} (Within ${cycleVacantPositions} Vacancy Cutoff)` : `Rank #${rank} (Waitlist Eligibility Pool)`}</span>
                                                </div>
                                                <div style={{ color: 'var(--color-text-secondary)' }}>
                                                  <strong>Employee ID:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{item.employeeId || 'N/A'}</span>
                                                </div>
                                                <div style={{ color: 'var(--color-text-secondary)' }}>
                                                  <strong>Designated Plantilla:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber || selectedCycle?.rulesConfigurationJson?.plantillaItemNo || 'Pending Allocation'}</span>
                                                </div>
                                                <div style={{ color: 'var(--color-text-secondary)' }}>
                                                  <strong>Remarks:</strong> <span>{item.remarks || item.scoreDetailsJson?.remarks || 'Formally audited'}</span>
                                                </div>
                                              </div>
                                            </div>

                                            <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedApplicantInfo(item);
                                                  setShowApplicantInfoModal(true);
                                                }}
                                                className="btn btn-secondary btn-sm"
                                                style={{ fontSize: '0.875rem', padding: '4px 10px', borderRadius: '6px' }}
                                              >
                                                Full Profile
                                              </button>
                                              {isHR && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenConfirmSelection(item);
                                                  }}
                                                  className="btn btn-primary btn-sm"
                                                  style={{ fontSize: '0.875rem', padding: '4px 10px', borderRadius: '6px' }}
                                                >
                                                  {isPromoted ? 'Modify Selection' : 'Select for Promotion'}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}

                                  {/* Minimal Vacancy Quota Cutoff Divider Line */}
                                  {index === cycleVacantPositions - 1 && index < filteredLeaderboard.length - 1 && (
                                    <tr key="quota-cutoff-divider">
                                      <td colSpan={6} style={{
                                        padding: '7px 14px',
                                        textAlign: 'center',
                                        background: 'var(--color-bg-tertiary)',
                                        borderTop: '1px dashed var(--color-border)',
                                        borderBottom: '1px dashed var(--color-border)',
                                      }}>
                                        <div style={{
                                          fontSize: '0.875rem',
                                          fontWeight: 700,
                                          letterSpacing: '0.06em',
                                          color: 'var(--color-text-muted)',
                                          textTransform: 'uppercase',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '8px',
                                        }}>
                                          <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                                          <span>Vacancy Quota Cutoff ({cycleVacantPositions} {cycleVacantPositions === 1 ? 'Slot Available' : 'Slots Available'}) • Below are Waitlist Candidates</span>
                                          <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 2: DEDICATED COMPARATIVE ASSESSMENT RESULT (CAR) TAB */}
                {activeTab === 'CAR' && (
                  <div className="card glass-surface" style={{ padding: '24px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)' }}>
                    {/* DepEd CAR Official Header Banner */}
                    <div style={{
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '16px',
                      padding: '24px',
                      marginBottom: '24px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px',
                        borderBottom: '1px solid var(--color-border)',
                        paddingBottom: '18px',
                        marginBottom: '18px',
                      }}>
                        <div>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 800,
                            letterSpacing: '0.1em',
                            color: 'var(--color-primary)',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '4px',
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }} />
                            Republic of the Philippines • Department of Education • Division of Koronadal City
                          </div>
                          <h3 style={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'var(--color-text-primary)',
                            margin: 0,
                            fontFamily: 'var(--font-sans)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            letterSpacing: '-0.02em',
                          }}>
                            <span style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <AppIcon name="receipt" size={18} color="var(--color-primary)" />
                            </span>
                            COMPARATIVE ASSESSMENT RESULT (CAR)
                          </h3>
                        </div>

                        {/* Official Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span className="badge" style={{
                            background: isCycleTeaching
                              ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5')
                              : (theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB'),
                            color: isCycleTeaching ? (theme === 'dark' ? '#34D399' : '#059669') : (theme === 'dark' ? '#FBBF24' : '#D97706'),
                            fontSize: '0.9375rem',
                            padding: '6px 14px',
                            borderRadius: '9999px',
                            fontWeight: 800,
                            border: isCycleTeaching
                              ? '1px solid rgba(5, 150, 105, 0.3)'
                              : '1px solid rgba(245, 158, 11, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}>
                            <AppIcon name={isCycleTeaching ? 'education' : 'employment'} size={14} color={isCycleTeaching ? (theme === 'dark' ? '#34D399' : '#059669') : (theme === 'dark' ? '#FBBF24' : '#D97706')} />
                            {isCycleTeaching ? 'CAR — TEACHING POSITION' : 'CAR — NON-TEACHING POSITION'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDownloadCarDocument(selectedCycle.id)}
                            disabled={isDownloadingCar}
                            className="btn btn-primary btn-sm"
                            style={{
                              background: 'var(--color-primary)',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '9999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontWeight: 700,
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                              cursor: isDownloadingCar ? 'wait' : 'pointer',
                              padding: '8px 18px',
                            }}
                          >
                            <AppIcon name="receipt" size={14} color="#FFFFFF" />
                            {isDownloadingCar ? 'Generating CAR .docx...' : 'Download Official CAR (.docx)'}
                          </button>

                          <button
                            type="button"
                            onClick={() => window.print()}
                            className="btn btn-secondary btn-sm"
                            style={{
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-card)',
                              color: 'var(--color-text-primary)',
                              borderRadius: '9999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              fontWeight: 700,
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                            }}
                          >
                            <AppIcon name="receipt" size={14} color="var(--color-primary)" /> Print Preview
                          </button>
                        </div>
                      </div>

                      {/* Official DepEd Metadata Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px', fontSize: '1rem' }}>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Position:</span>
                          <strong style={{ color: 'var(--color-text-primary)', fontSize: '1.0625rem', fontWeight: 800 }}>{selectedCycle?.rulesConfigurationJson?.targetPosition || 'Teacher / Plantilla Post'}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Office / Unit where vacancy exists:</span>
                          <strong style={{ color: 'var(--color-primary)', fontSize: '1.0625rem', fontWeight: 800 }}>{selectedCycle?.name || 'Schools Division Office — Koronadal'}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Plantilla Item Number:</span>
                          <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '1.0625rem', fontWeight: 700 }}>{selectedCycle?.rulesConfigurationJson?.plantillaItemNo || `DEPEDB-TCHR1-${selectedCycle?.id || '2026'}-001`}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Date of Final Deliberation:</span>
                          <strong style={{ color: '#059669', fontSize: '1.0625rem', fontWeight: 800 }}>
                            {formatDateString(selectedCycle?.endDate)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Official CAR Summary Deliberation Table */}
                    <div className="table-wrapper" style={{ border: '1px solid var(--color-border)', borderRadius: '10px', width: '100%', overflowX: 'auto', background: 'var(--color-bg-card)' }}>
                      <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'center', width: '55px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Rank</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Candidate Name</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '160px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Plantilla Item</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '130px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Stage 1 (AO)</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '130px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Stage 2 (HRMO)</th>
                            <th style={{ padding: '10px 16px', textAlign: 'center', width: '150px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Total CAR Score</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', width: '140px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.04em' }}>Board Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {filteredLeaderboard.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                No candidates finalized for official Comparative Assessment Result.
                              </td>
                            </tr>
                          ) : (
                            filteredLeaderboard.map((item, index) => {
                              // "APPOINTED" only after HRMO approves the appointment, as on every other tab.
                              const isPromoted = isAppointed(item);
                              const totalScore = Number(item.overallTotalScore || item.totalScore || 0);
                              const rank = item.rank || (index + 1);
                              const isWithinQuota = rank <= cycleVacantPositions;

                              const aoSubtotal = getApplicantAoScore(item, isCycleTeaching);
                              const finalRating = item.scoreDetailsJson?.finalRating || {};
                              const coiScore = Number(finalRating.ppstCoiScore ?? 25);
                              const ncoiScore = Number(finalRating.ppstNcoiScore ?? 15);
                              const hrmoSubtotal = isCycleTeaching
                                ? (finalRating.finalTotalScore !== undefined ? Number(finalRating.finalTotalScore) : coiScore + ncoiScore)
                                : (finalRating.finalTotalScore !== undefined ? Number(finalRating.finalTotalScore) : 20);

                              return (
                                <React.Fragment key={item.id}>
                                  <tr
                                    className="table-row-hover"
                                    style={{
                                      borderBottom: '1px solid var(--color-border)',
                                      borderLeft: isWithinQuota ? '3px solid #10B981' : '3px solid transparent',
                                      background: isPromoted
                                        ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4')
                                        : 'transparent',
                                    }}
                                  >
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        fontSize: '0.9375rem',
                                        fontWeight: 800,
                                        fontFamily: 'var(--font-mono)',
                                        background: isWithinQuota ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5') : 'var(--color-bg-tertiary)',
                                        color: isWithinQuota ? '#059669' : 'var(--color-text-secondary)',
                                        border: `1px solid ${isWithinQuota ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-border)'}`,
                                      }}>
                                        {rank}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                      <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span>{item.name}</span>
                                        {isWithinQuota && (
                                          <span style={{
                                            fontSize: '0.875rem',
                                            fontWeight: 700,
                                            color: '#059669',
                                            background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                                            border: '1px solid rgba(16, 185, 129, 0.25)',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                          }}>
                                            ● In Quota
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        {item.designation || 'Teacher'} • {item.station}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>
                                      {item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber || selectedCycle?.rulesConfigurationJson?.plantillaItemNo || 'Pending Allocation'}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                      {aoSubtotal.toFixed(2)} pts
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                      {hrmoSubtotal.toFixed(2)} pts
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
                                        <span style={{
                                          fontSize: '1.1875rem',
                                          fontWeight: 800,
                                          fontFamily: 'var(--font-mono)',
                                          color: isWithinQuota ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                        }}>
                                          {totalScore.toFixed(2)}
                                        </span>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>/ 100</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                      {isPromoted ? (
                                        <span style={{
                                          fontSize: '0.875rem',
                                          background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5',
                                          color: theme === 'dark' ? '#34D399' : '#059669',
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(5, 150, 105, 0.4)',
                                          fontWeight: 700,
                                        }}>
                                          APPOINTED
                                        </span>
                                      ) : isWithinQuota ? (
                                        <span style={{
                                          fontSize: '0.875rem',
                                          background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                                          color: '#059669',
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          border: '1px solid rgba(16, 185, 129, 0.25)',
                                          fontWeight: 700,
                                        }}>
                                          RECOMMENDED
                                        </span>
                                      ) : (
                                        <span style={{
                                          fontSize: '0.875rem',
                                          background: 'var(--color-bg-tertiary)',
                                          color: 'var(--color-text-muted)',
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          border: '1px solid var(--color-border)',
                                          fontWeight: 600,
                                        }}>
                                          WAITLIST POOL
                                        </span>
                                      )}
                                    </td>
                                  </tr>

                                  {/* Minimal Vacancy Quota Cutoff Divider Line */}
                                  {index === cycleVacantPositions - 1 && index < filteredLeaderboard.length - 1 && (
                                    <tr key="car-quota-cutoff-divider">
                                      <td colSpan={7} style={{
                                        padding: '7px 14px',
                                        textAlign: 'center',
                                        background: 'var(--color-bg-tertiary)',
                                        borderTop: '1px dashed var(--color-border)',
                                        borderBottom: '1px dashed var(--color-border)',
                                      }}>
                                        <div style={{
                                          fontSize: '0.875rem',
                                          fontWeight: 700,
                                          letterSpacing: '0.06em',
                                          color: 'var(--color-text-muted)',
                                          textTransform: 'uppercase',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '8px',
                                        }}>
                                          <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                                          <span>Vacancy Quota Cutoff ({cycleVacantPositions} {cycleVacantPositions === 1 ? 'Slot Available' : 'Slots Available'}) • Below are Waitlist Candidates</span>
                                          <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* TAB 2: AO II DOCUMENTARY REQUIREMENTS VERIFICATION DESK */}
              {activeTab === 'AO_RATING' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Hero Stats & KPI Header */}
                  <div style={{
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
                      <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.4)', marginBottom: '8px' }}>
                          <AppIcon name="checklist" size={13} color="var(--color-primary)" />
                          Stage 1
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                          Requirements check (Annex C)
                        </h3>
                        
                        {/* District Jurisdiction Status Pill */}
                        <div style={{ marginTop: '8px' }}>
                          <span style={{ fontSize: '0.9375rem', color: 'var(--color-primary)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <AppIcon name="location" size={12} color="var(--color-primary)" /> Division Scope: {cycleDistrict || 'All Districts'} ({cycleSchool || 'All Schools'})
                          </span>
                        </div>
                      </div>

                      {/* Filter Switcher Pills */}
                      <div style={{ display: 'flex', background: 'var(--color-bg-card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <button
                          type="button"
                          onClick={() => setAoFilter('ALL')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: aoFilter === 'ALL' ? 'var(--color-primary)' : 'transparent',
                            color: aoFilter === 'ALL' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          All ({hrmoStationApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAoFilter('PENDING')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: aoFilter === 'PENDING' ? '#D97706' : 'transparent',
                            color: aoFilter === 'PENDING' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          Pending ({aoPendingApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAoFilter('VERIFIED')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: aoFilter === 'VERIFIED' ? '#059669' : 'transparent',
                            color: aoFilter === 'VERIFIED' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          Complete ({aoVerifiedApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAoFilter('DEFICIENT')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: aoFilter === 'DEFICIENT' ? '#DC2626' : 'transparent',
                            color: aoFilter === 'DEFICIENT' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          Deficient ({aoDeficientApps.length})
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
                      <label htmlFor="hrmo-district-filter" style={{ fontSize: 14, fontWeight: 700 }}>District</label>
                      <select id="hrmo-district-filter" value={hrmoDistrictFilter} onChange={e => { setHrmoDistrictFilter(e.target.value); setHrmoSchoolFilter('ALL'); }} className="form-input" style={{ width: 'auto', minWidth: 160 }}>
                        <option value="ALL">All districts</option>
                        {hrmoDistricts.map(district => <option key={district} value={district}>{district}</option>)}
                      </select>
                      <label htmlFor="hrmo-school-filter" style={{ fontSize: 14, fontWeight: 700 }}>School</label>
                      <select id="hrmo-school-filter" value={hrmoSchoolFilter} onChange={e => setHrmoSchoolFilter(e.target.value)} className="form-input" style={{ width: 'auto', minWidth: 200 }}>
                        <option value="ALL">All schools</option>
                        {hrmoSchools.map(school => <option key={school} value={school}>{school}</option>)}
                      </select>
                      <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{displayedHrmoApps.length} applicants shown</span>
                    </div>

                    {/* KPI Metric Counter Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
                      <div style={{ background: 'var(--color-bg-card)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total Applicants</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{hrmoStationApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #A7F3D0' }}>
                        <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#34D399' : '#059669', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Complete / Verified</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#34D399' : '#059669' }}>{aoVerifiedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid #FECACA' }}>
                        <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#F87171' : '#DC2626', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Incomplete / Deficient</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#F87171' : '#DC2626' }}>{aoDeficientApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A' }}>
                        <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#FBBF24' : '#D97706', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Pending Verification</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#D97706' }}>{aoPendingApps.length}</div>
                      </div>
                    </div>

                    {/* Criteria Reference Strip */}
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)', fontSize: '0.9375rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>Official DepEd Mandate (DepEd Order No. 007, s. 2023 / DepEd Order No. 19, s. 2022):</span>
                      <span>Administrative Officer II verifies completeness and authenticity of Annex C documentary requirements (items a–k). Score deliberation (100 pts) is conducted by the HRMPSB Board.</span>
                    </div>
                  </div>

                  {/* Candidate Requirements Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '18px' }}>
                    {displayedAoApps.map((app) => {
                      const reqCheck = app.scoreDetailsJson?.requirementsCheck;
                      const isComplete = reqCheck?.status === 'COMPLETE' || app.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
                      const isDeficient = reqCheck?.status === 'INCOMPLETE' || app.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT';
                      const isPending = !isComplete && !isDeficient;
                      const checklist = app.scoreDetailsJson?.annexCChecklist;
                      const totalItems = checklist?.items?.length || 11;
                      const attachedDocsCount = (checklist?.items || []).filter((it: any) => it.documentId || it.fileUrl || it.fileName).length;
                      const swornStatement = checklist?.applicantInfo?.omnibusSwornStatement ? 'Certified' : 'Pending Certification';

                      return (
                        <div
                          key={app.id}
                          className="card glass-surface card-hover"
                          style={{
                            padding: '20px',
                            borderRadius: '14px',
                            background: 'var(--color-bg-card)',
                            border: isComplete
                              ? '1px solid rgba(5, 150, 105, 0.4)'
                              : isDeficient
                              ? '1px solid rgba(220, 38, 38, 0.4)'
                              : '1px solid var(--color-border)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            {/* Candidate Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                  width: '42px',
                                  height: '42px',
                                  borderRadius: '10px',
                                  background: isComplete
                                    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                    : isDeficient
                                    ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                                    : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '1.125rem',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                }}>
                                  {app.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                                </div>
                                <div>
                                  <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                                    {app.name}
                                  </div>
                                  <div style={{ fontSize: '0.9375rem', color: isCycleTeaching ? 'var(--color-primary)' : '#D97706', marginTop: '2px', fontWeight: 600 }}>
                                    {app.designation || 'Teacher / Plantilla Candidate'}
                                  </div>
                                </div>
                              </div>

                              <span style={{
                                fontSize: '0.875rem',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                background: isComplete
                                  ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5')
                                  : isDeficient
                                  ? (theme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#FEF2F2')
                                  : (theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FFFBEB'),
                                color: isComplete
                                  ? (theme === 'dark' ? '#34D399' : '#059669')
                                  : isDeficient
                                  ? (theme === 'dark' ? '#F87171' : '#DC2626')
                                  : (theme === 'dark' ? '#FBBF24' : '#D97706'),
                                border: isComplete
                                  ? '1px solid rgba(5, 150, 105, 0.4)'
                                  : isDeficient
                                  ? '1px solid rgba(220, 38, 38, 0.4)'
                                  : '1px solid rgba(217, 119, 6, 0.4)',
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}>
                                {isComplete ? (
                                  <><AppIcon name="check" size={10} color={theme === 'dark' ? '#34D399' : '#059669'} /> Reqs Complete</>
                                ) : isDeficient ? (
                                  <><AppIcon name="close" size={10} color={theme === 'dark' ? '#F87171' : '#DC2626'} /> Deficient</>
                                ) : (
                                  <><AppIcon name="pending" size={10} color={theme === 'dark' ? '#FBBF24' : '#D97706'} /> Pending Check</>
                                )}
                              </span>
                            </div>

                            {/* Application Code & Metadata */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', marginBottom: '14px', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                              <span>Code: <strong style={{ color: 'var(--color-primary)' }}>{app.scoreDetailsJson?.applicantNumber || app.employeeId}</strong></span>
                              <span>Date: {app.dateSubmitted || '2026 Active'}</span>
                            </div>

                            {/* Annex C Requirements Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, repeat(2, 1fr))', gap: '8px', marginBottom: '14px' }}>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Annex C Items</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{totalItems} items <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>(a to k)</span></div>
                              </div>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Scanned / Attached</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: attachedDocsCount > 0 ? '#059669' : 'var(--color-text-muted)' }}>{attachedDocsCount} documents</div>
                              </div>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px', gridColumn: 'span 2' }}>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Omnibus Sworn Statement</div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: checklist?.applicantInfo?.omnibusSwornStatement ? '#059669' : '#D97706' }}>
                                  {swornStatement}
                                </div>
                              </div>
                            </div>

                            {/* Remarks Snippet */}
                            {reqCheck?.remarks && (
                              <div style={{ fontSize: '0.875rem', color: isDeficient ? '#DC2626' : 'var(--color-text-primary)', fontStyle: 'italic', marginBottom: '14px', padding: '8px 12px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', borderLeft: isDeficient ? '3px solid #DC2626' : '3px solid #059669' }}>
                                "{reqCheck.remarks}"
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedApplicantInfo(app);
                                setShowApplicantInfoModal(true);
                              }}
                              style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', borderRadius: '9999px', fontWeight: 700 }}
                            >
                              201 File
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleOpenAoRating(app)}
                              style={{
                                flex: 2,
                                fontSize: '0.9375rem',
                                background: isComplete ? '#059669' : isDeficient ? '#DC2626' : 'var(--color-primary)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '9999px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <AppIcon name={isComplete ? 'check' : 'checklist'} size={14} color="#ffffff" />
                              {isComplete ? 'Review Requirements' : isDeficient ? 'Re-check Requirements' : 'Check Requirements'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: HRMO FINAL SCORING WORKSPACE */}
              {activeTab === 'HRMO_RANKING' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Hero Stats & KPI Header */}
                  <div style={{
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
                      <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#059669', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(5, 150, 105, 0.4)', marginBottom: '8px' }}>
                          <AppIcon name="approvals" size={13} color="#059669" />
                          Stage 2
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                          Board deliberation
                        </h3>
                      </div>

                      {/* Filter Switcher Pills */}
                      <div style={{ display: 'flex', background: 'var(--color-bg-card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <button
                          type="button"
                          onClick={() => setHrmoFilter('ALL')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: hrmoFilter === 'ALL' ? 'var(--color-primary)' : 'transparent',
                            color: hrmoFilter === 'ALL' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          All ({filteredSubmittedApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setHrmoFilter('PENDING')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: hrmoFilter === 'PENDING' ? '#D97706' : 'transparent',
                            color: hrmoFilter === 'PENDING' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          Pending Board ({hrmoPendingApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setHrmoFilter('FINALIZED')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: hrmoFilter === 'FINALIZED' ? '#059669' : 'transparent',
                            color: hrmoFilter === 'FINALIZED' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          Finalized ({hrmoFinalizedApps.length})
                        </button>
                      </div>
                    </div>

                    {/* KPI Metric Counter Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
                      <div style={{ background: 'var(--color-bg-card)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total In Deliberation</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{filteredSubmittedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #A7F3D0' }}>
                        <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#34D399' : '#059669', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Deliberated & Ranked</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#34D399' : '#059669' }}>{hrmoFinalizedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A' }}>
                        <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#FBBF24' : '#D97706', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Pending Board Score</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#D97706' }}>{hrmoPendingApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Combined CAR Target</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-primary)' }}>100.00 pts Master Score</div>
                      </div>
                    </div>

                    {/* Criteria Reference Strip */}
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)', fontSize: '0.9375rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#059669' }}>Scoring:</span>
                      {isCycleTeaching ? (
                        <span>Education (10) + Training (10) + Experience (10) + Performance (30) + PPST COIs Demo (25) + PPST NCOIs (15) = <strong style={{ color: '#059669' }}>100 pts</strong></span>
                      ) : (
                        <span>Education (10) + Training (10) + Experience (10) + Performance (20) + Accomplishments (5) + App Edu (15) + App L&D (10) + Potential/Exams (20) = <strong style={{ color: '#D97706' }}>100 pts</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Candidate Scoring Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '18px' }}>
                    {displayedHrmoApps.map((app) => {
                      const finalRating = app.scoreDetailsJson?.finalRating || {};
                      const isFinalized = Boolean(app.status === 'RANKED' || app.status === 'APPROVED' || finalRating.finalTotalScore !== undefined || finalRating.overallTotalScore !== undefined);
                      
                      const reqCheck = app.scoreDetailsJson?.requirementsCheck;
                      const isReqComplete = reqCheck?.status === 'COMPLETE' || app.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
                      const isReqDeficient = reqCheck?.status === 'INCOMPLETE' || app.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT';

                      const overallScore = Number(finalRating.overallTotalScore ?? app.overallTotalScore ?? app.totalScore ?? 0);
                      const biStatus = app.forBackgroundInvestigation || app.scoreDetailsJson?.forBackgroundInvestigation || 'YES';
                      const probation = app.forProbation || app.scoreDetailsJson?.forProbation || '6 months';
                      const appointment = app.forAppointment || app.scoreDetailsJson?.forAppointment || 'Recommended for Appointment';

                      return (
                        <div
                          key={app.id}
                          className="card glass-surface card-hover"
                          style={{
                            padding: '20px',
                            borderRadius: '14px',
                            border: isFinalized ? '1px solid rgba(5, 150, 105, 0.4)' : '1px solid var(--color-border)',
                            background: 'var(--color-bg-card)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            {/* Candidate Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                  width: '42px',
                                  height: '42px',
                                  borderRadius: '10px',
                                  background: isFinalized ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #2f7d52 0%, #3f9265 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '1.125rem',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                }}>
                                  {app.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                                </div>
                                <div>
                                  <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                                    {app.name}
                                  </div>
                                  <div style={{ fontSize: '0.9375rem', color: isCycleTeaching ? 'var(--color-primary)' : '#D97706', marginTop: '2px', fontWeight: 600 }}>
                                    {app.designation || 'Teacher / Plantilla Candidate'}
                                  </div>
                                </div>
                              </div>

                              <span style={{
                                fontSize: '0.875rem',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                background: isFinalized ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1'),
                                color: isFinalized ? (theme === 'dark' ? '#34D399' : '#059669') : 'var(--color-primary)',
                                border: isFinalized ? '1px solid rgba(5, 150, 105, 0.4)' : '1px solid rgba(37, 99, 235, 0.4)',
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}>
                                {isFinalized ? (
                                  <><AppIcon name="promotions" size={10} color={theme === 'dark' ? '#34D399' : '#059669'} /> Deliberated: {overallScore.toFixed(2)}/100</>
                                ) : (
                                  <><AppIcon name="pending" size={10} color="var(--color-primary)" /> Awaiting Board</>
                                )}
                              </span>
                            </div>

                            {/* Requirements & Score Overview Card */}
                            <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '12px', borderRadius: '10px', marginBottom: '14px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '8px', marginBottom: '10px' }}>
                                <div style={{ background: isReqComplete ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5') : isReqDeficient ? (theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2') : (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB'), padding: '8px 10px', borderRadius: '8px', border: isReqComplete ? '1px solid rgba(5, 150, 105, 0.3)' : isReqDeficient ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)' }}>
                                  <div style={{ fontSize: '0.875rem', color: isReqComplete ? '#059669' : isReqDeficient ? '#DC2626' : '#D97706', textTransform: 'uppercase', fontWeight: 700 }}>Stage 1 • AO Reqs</div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: isReqComplete ? '#059669' : isReqDeficient ? '#DC2626' : '#D97706', marginTop: '2px' }}>
                                    {isReqComplete ? 'Verified Complete' : isReqDeficient ? 'Deficient' : 'Pending Check'}
                                  </div>
                                </div>
                                <div style={{ background: isFinalized ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1'), padding: '8px 10px', borderRadius: '8px', border: isFinalized ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(37, 99, 235, 0.3)' }}>
                                  <div style={{ fontSize: '0.875rem', color: isFinalized ? '#059669' : 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700 }}>Stage 2 • HR Deliberation</div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: isFinalized ? '#059669' : 'var(--color-primary)', marginTop: '2px' }}>
                                    {isFinalized ? `${overallScore.toFixed(2)} / 100` : 'Pending Board'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EEF7F1', padding: '10px 14px', borderRadius: '8px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8' }}>
                                <span style={{ fontSize: '0.9375rem', color: 'var(--color-primary)', fontWeight: 700 }}>Combined CAR Total:</span>
                                <strong style={{ fontSize: '1.125rem', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 900 }}>
                                  {isFinalized ? `${overallScore.toFixed(2)} / 100.00 pts` : 'Awaiting Deliberation'}
                                </strong>
                              </div>
                            </div>

                            {/* Governance Tags */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', fontSize: '0.875rem' }}>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', background: biStatus === 'YES' ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2'), color: biStatus === 'YES' ? '#059669' : '#DC2626', border: biStatus === 'YES' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(220, 38, 38, 0.3)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                BI: {biStatus === 'YES' ? <><AppIcon name="check" size={10} color="#059669" /> Passed</> : <><AppIcon name="close" size={10} color="#DC2626" /> Failed</>}
                              </span>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1', color: 'var(--color-primary)', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8', fontWeight: 700 }}>
                                Probation: {probation}
                              </span>
                            </div>

                            {/* Remarks Snippet */}
                            {finalRating.hrmoRemarks && (
                              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', fontStyle: 'italic', marginBottom: '14px', padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', border: '1px solid var(--color-border)', borderLeft: '3px solid #059669' }}>
                                "{finalRating.hrmoRemarks}"
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedApplicantInfo(app);
                                setShowApplicantInfoModal(true);
                              }}
                              style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', borderRadius: '9999px', fontWeight: 700 }}
                            >
                              201 File
                            </button>
                            {isHR ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleOpenHrmoRating(app)}
                                style={{
                                  flex: 2,
                                  fontSize: '0.9375rem',
                                  background: isFinalized ? 'var(--color-bg-tertiary)' : 'var(--color-primary)',
                                  border: isFinalized ? '1px solid var(--color-border)' : 'none',
                                  color: isFinalized ? 'var(--color-text-primary)' : '#FFFFFF',
                                  fontWeight: 700,
                                  borderRadius: '9999px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  boxShadow: isFinalized ? 'none' : '0 2px 6px rgba(0,0,0,0.1)',
                                }}
                              >
                                <AppIcon name={isFinalized ? 'history' : 'approvals'} size={14} color={isFinalized ? 'var(--color-text-primary)' : '#FFFFFF'} />
                                {isFinalized ? 'Update Board Score' : 'Evaluate & Score'}
                              </button>
                            ) : (
                              <div style={{
                                flex: 2,
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                background: 'var(--color-bg-tertiary)',
                                padding: '6px 10px',
                                borderRadius: '9999px',
                                border: '1px solid var(--color-border)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                fontWeight: 600,
                              }}>
                                <AppIcon name="lock" size={11} color="var(--color-text-secondary)" /> HR Deliberation Only
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: HR CANDIDATE SELECTION WORKSPACE */}
              {activeTab === 'HR_SELECTION' && (
                <div className="card glass-surface" style={{ padding: '24px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                        HR Candidate Selection for Promotion
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.9375rem', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5', color: theme === 'dark' ? '#34D399' : '#059669', padding: '4px 14px', borderRadius: '9999px', fontWeight: 700, border: '1px solid rgba(5, 150, 105, 0.4)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="promotions" size={13} color={theme === 'dark' ? '#34D399' : '#059669'} /> Vacancies Available: {selectedCycle?.rulesConfigurationJson?.vacantPositions || 1} Post(s)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
                    {filteredLeaderboard.map((item) => {
                      const isOfficiallyApproved = isAppointed(item);
                      const isSelectedPendingDocs = isSelectedPendingAppointment(item);
                      
                      return (
                        <div key={item.id} className="card glass-surface card-hover" style={{
                          padding: '20px',
                          borderRadius: '14px',
                          background: isOfficiallyApproved
                            ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4')
                            : isSelectedPendingDocs
                              ? (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB')
                              : 'var(--color-bg-tertiary)',
                          border: isOfficiallyApproved ? '1.5px solid #10b981' : isSelectedPendingDocs ? '1.5px solid #f59e0b' : '1px solid var(--color-border)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                width: '26px', height: '26px', borderRadius: '50%',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, fontSize: '0.9375rem',
                                background: item.rank === 1 ? (theme === 'dark' ? 'rgba(217, 119, 6, 0.25)' : '#FEF3C7') : 'var(--color-bg-card)',
                                color: item.rank === 1 ? '#D97706' : 'var(--color-text-secondary)',
                                border: item.rank === 1 ? '1px solid rgba(217, 119, 6, 0.4)' : '1px solid var(--color-border)',
                              }}>
                                #{item.rank}
                              </span>
                              <span style={{ fontSize: '0.9375rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>
                                {item.applicantNumber ? `App No: ${item.applicantNumber}` : item.employeeId}
                              </span>
                            </div>
                            {isOfficiallyApproved ? (
                              <span style={{ fontSize: '0.875rem', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', border: '1px solid rgba(5, 150, 105, 0.4)', padding: '3px 9px', borderRadius: '9999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="promotions" size={10} color={theme === 'dark' ? '#34D399' : '#15803D'} /> OFFICIALLY PROMOTED
                              </span>
                            ) : isSelectedPendingDocs ? (
                              <span style={{ fontSize: '0.875rem', background: theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7', color: theme === 'dark' ? '#FBBF24' : '#B45309', border: '1px solid rgba(217, 119, 6, 0.4)', padding: '3px 9px', borderRadius: '9999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="pending" size={10} color={theme === 'dark' ? '#FBBF24' : '#B45309'} /> PENDING HR DOC APPROVAL
                              </span>
                            ) : (
                              <StatusBadge status={item.status} />
                            )}
                          </div>

                          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{item.name}</div>
                          <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber ? '6px' : '14px' }}>{item.designation}</div>

                          {(item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber) && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: '0.9375rem',
                              fontWeight: 700,
                              background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1',
                              color: 'var(--color-primary)',
                              border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #CFE8D8',
                              padding: '3px 10px',
                              borderRadius: '8px',
                              marginBottom: '14px',
                            }}>
                              <AppIcon name="employment" size={12} color="var(--color-primary)" />
                              <span>Plantilla: <strong>{item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber}</strong></span>
                            </div>
                          )}

                          <div style={{ background: 'var(--color-bg-card)', padding: '12px 14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>AO Initial Rating:</span>
                              <span style={{ color: '#059669', fontWeight: 700 }}>{item.initialTotalScore > 0 ? `${item.initialTotalScore} / 100` : 'Pending AO'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>HR Board Final Score:</span>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{item.finalTotalScore > 0 ? `+${item.finalTotalScore} pts` : 'Pending HR'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Combined Overall Total:</span>
                              <span style={{ color: 'var(--color-text-primary)', fontWeight: 800 }}>{item.overallTotalScore} pts</span>
                            </div>
                          </div>

                          {isSelectedPendingDocs && item.transactionId && (
                            <div style={{ background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.9375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8' }}>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Appointment TRX #{item.transactionId} ({item.transactionStatus || 'DRAFT'})</span>
                              <a href={`/admin/validation?tx=${item.transactionId}`} style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'underline' }}>Validate Docs →</a>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedApplicantInfo(item);
                                setShowApplicantInfoModal(true);
                              }}
                              style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', flex: 1, borderRadius: '9999px', fontWeight: 700 }}
                            >
                              View Info
                            </button>

                            {isHR ? (
                              isSelectedPendingDocs || isOfficiallyApproved ? (
                                <div style={{ display: 'flex', gap: '6px', flex: 2 }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => handleTogglePromotionCandidate(item, false)}
                                    style={{
                                      flex: 1,
                                      fontSize: '0.9375rem',
                                      background: isOfficiallyApproved ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7') : (theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7'),
                                      color: isOfficiallyApproved ? (theme === 'dark' ? '#34D399' : '#15803D') : (theme === 'dark' ? '#FBBF24' : '#B45309'),
                                      border: isOfficiallyApproved ? '1px solid rgba(5, 150, 105, 0.4)' : '1px solid rgba(217, 119, 6, 0.4)',
                                      borderRadius: '9999px',
                                      fontWeight: 800,
                                    }}
                                  >
                                    <AppIcon name="approved" size={13} color={isOfficiallyApproved ? (theme === 'dark' ? '#34D399' : '#15803D') : (theme === 'dark' ? '#FBBF24' : '#B45309')} /> 
                                    {isOfficiallyApproved ? 'Promoted' : 'Revoke'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleOpenConfirmSelection(item)}
                                    title="Reassign to another designated plantilla post"
                                    style={{
                                      fontSize: '0.875rem',
                                      borderRadius: '9999px',
                                      fontWeight: 700,
                                      padding: '4px 10px',
                                      border: '1px solid var(--color-border)',
                                    }}
                                  >
                                    Reassign
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleOpenConfirmSelection(item)}
                                  style={{
                                    flex: 2,
                                    fontSize: '0.9375rem',
                                    background: 'var(--color-primary)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '9999px',
                                    fontWeight: 800,
                                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <AppIcon name="promotions" size={13} color="#ffffff" /> Select for Promotion
                                </button>
                              )
                            ) : (
                              <div style={{
                                flex: 2,
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                background: 'var(--color-bg-tertiary)',
                                padding: '6px 10px',
                                borderRadius: '9999px',
                                border: '1px solid var(--color-border)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                fontWeight: 600,
                              }}>
                                <AppIcon name="lock" size={11} color="var(--color-text-secondary)" /> Selection Reserved for HR
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}


            </>
          )}
        </div>
        )}
      </div>

      {/* MODAL 1: AO II REQUIREMENTS COMPLETENESS VERIFICATION (ANNEX C CHECKLIST) */}
      <AnnexCVerificationModal
        isOpen={Boolean(showAoModal && selectedAppForModal)}
        onClose={() => setShowAoModal(false)}
        applicant={selectedAppForModal}
        cycle={selectedCycle}
        modalTrack={modalTrack}
        theme={theme}
        items={reqVerificationItems}
        setItems={setReqVerificationItems}
        completenessStatus={reqCompletenessStatus}
        setCompletenessStatus={setReqCompletenessStatus}
        remarks={reqVerificationRemarks}
        setRemarks={setReqVerificationRemarks}
        onSubmit={handleSubmitAoRating}
        isPending={savingAoRating.pending}
      />

      {/* MODAL 2: HRMO STAFF FINAL RATING FORM (OFFICIAL DEPED CAR DELIBERATION) */}
      {showHrmoModal && selectedAppForModal && isHR && createPortal((
        <ModalOverlay onDismiss={() => setShowHrmoModal(false)} className="modal-overlay hrmo-deliberation-overlay" style={{ backdropFilter: 'blur(8px)', zIndex: 1050 }}>
          <div className="modal animate-scale-in hrmo-deliberation-modal" style={{
            maxWidth: '1240px',
            width: 'calc(100vw - 48px)',
            borderRadius: '16px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div className="hrmo-deliberation-header" style={{
              background: 'var(--color-bg-tertiary)',
              borderBottom: '1px solid var(--color-border)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5',
                    color: theme === 'dark' ? '#34D399' : '#059669',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(5, 150, 105, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <AppIcon name="approvals" size={12} color={theme === 'dark' ? '#34D399' : '#059669'} />
                    Stage 2 • Merit Promotion Selection Board (MPSB)
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    DepEd SDO Koronadal City
                  </span>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  HRMO Board Final Deliberation & CAR Rating
                </h3>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowHrmoModal(false)}
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', width: '32px', height: '32px', borderRadius: '8px', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ×
              </button>
            </div>

            <form className="hrmo-deliberation-form" onSubmit={handleSubmitHrmoRating} style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Candidate Info Profile Card */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '1.125rem',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  }}>
                    {selectedAppForModal.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      {selectedAppForModal.name}
                    </div>
                    <div style={{ fontSize: '0.9375rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                      {selectedAppForModal.designation || 'Plantilla Candidate'} • <span style={{ color: 'var(--color-text-secondary)' }}>{selectedAppForModal.station || 'Division of Koronadal City'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.9375rem', fontFamily: 'var(--font-mono)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EEF7F1', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: '6px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8', fontWeight: 600 }}>
                    {selectedAppForModal.applicantNumber || `APP-${String(selectedAppForModal.id).padStart(4, '0')}`}
                  </span>
                  <span style={{ fontSize: '0.9375rem', background: modalTrack === 'NON_TEACHING' ? (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB') : (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5'), color: modalTrack === 'NON_TEACHING' ? '#D97706' : '#059669', padding: '4px 10px', borderRadius: '6px', border: modalTrack === 'NON_TEACHING' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid rgba(5, 150, 105, 0.3)', fontWeight: 700 }}>
                    {modalTrack === 'NON_TEACHING' ? 'Non-Teaching Track' : 'Teaching Track'}
                  </span>
                </div>
              </div>

              {/* Stage 1 AO II Requirements Completeness Verification Card */}
              {(() => {
                const reqCheck = selectedAppForModal.scoreDetailsJson?.requirementsCheck;
                const isReqComplete = reqCheck?.status === 'COMPLETE' || selectedAppForModal.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
                const isReqDeficient = reqCheck?.status === 'INCOMPLETE' || selectedAppForModal.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT';

                return (
                  <div style={{
                    background: isReqComplete ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.12)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(217, 119, 6, 0.12)' : '#FFFBEB'),
                    border: isReqComplete ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: isReqComplete ? '#059669' : '#D97706', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                        Stage 1 • AO II Documentary Requirements Check
                      </div>
                      <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {reqCheck?.remarks || (isReqComplete ? 'All Annex C documentary requirements verified complete and authentic.' : isReqDeficient ? 'Requirements incomplete / deficient.' : 'Awaiting AO II completeness verification.')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: isReqComplete ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7') : (theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7'),
                        color: isReqComplete ? (theme === 'dark' ? '#34D399' : '#15803D') : (theme === 'dark' ? '#FBBF24' : '#D97706'),
                        fontSize: '0.9375rem',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        border: isReqComplete ? '1px solid rgba(5, 150, 105, 0.4)' : '1px solid rgba(217, 119, 6, 0.4)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        <AppIcon name={isReqComplete ? 'check' : 'pending'} size={12} color={isReqComplete ? (theme === 'dark' ? '#34D399' : '#15803D') : (theme === 'dark' ? '#FBBF24' : '#D97706')} />
                        {isReqComplete ? 'Requirements Complete' : isReqDeficient ? 'Requirements Deficient' : 'Pending Verification'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* HRMPSB Core Qualifications Deliberation (Education, Training, Experience, Performance) */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '16px',
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  HRMPSB Deliberation • Basic Qualification Criteria ({modalTrack === 'NON_TEACHING' ? '50.00 pts Max' : '60.00 pts Max'})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Education (Max 10)</label>
                    <input
                      aria-label="Education (Max 10)"
                      type="number"
                      max={10} min={0} step="0.25"
                      className="form-input"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                      value={hrmoEduScore}
                      onChange={(e) => setHrmoEduScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Training (Max 10)</label>
                    <input
                      aria-label="Training (Max 10)"
                      type="number"
                      max={10} min={0} step="0.25"
                      className="form-input"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                      value={hrmoTrainScore}
                      onChange={(e) => setHrmoTrainScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Experience (Max 10)</label>
                    <input
                      aria-label="Experience (Max 10)"
                      type="number"
                      max={10} min={0} step="0.25"
                      className="form-input"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                      value={hrmoExpScore}
                      onChange={(e) => setHrmoExpScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      Performance ({modalTrack === 'NON_TEACHING' ? 'Max 20' : 'Max 30'})
                    </label>
                    <input aria-label="Performance Score"
                      type="number"
                      max={modalTrack === 'NON_TEACHING' ? 20 : 30} min={0} step="0.25"
                      className="form-input"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                      value={hrmoPerfScore}
                      onChange={(e) => setHrmoPerfScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                {modalTrack === 'NON_TEACHING' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Accomplishments (Max 5)</label>
                      <input
                        aria-label="Accomplishments (Max 5)"
                        type="number"
                        max={5} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700 }}
                        value={hrmoAccomplishmentsScore}
                        onChange={(e) => setHrmoAccomplishmentsScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>App of Education (Max 15)</label>
                      <input
                        aria-label="App of Education (Max 15)"
                        type="number"
                        max={15} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700 }}
                        value={hrmoAppEduScore}
                        onChange={(e) => setHrmoAppEduScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>App of L&D (Max 10)</label>
                      <input
                        aria-label="App of L&D (Max 10)"
                        type="number"
                        max={10} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700 }}
                        value={hrmoAppLdScore}
                        onChange={(e) => setHrmoAppLdScore(e.target.value === '' ? '' as any : Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Stage 2 HRMO Evaluation Section */}
              {modalTrack === 'TEACHING' ? (
                <div style={{
                  background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#F0FDF4',
                  border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #BBF7D0',
                  borderRadius: '12px',
                  padding: '18px',
                }}>
                  <div className="hrmo-criteria-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Teaching Merit Criteria (40.00 pts Max)
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      Evaluated via Classroom Observation Tool (COT) & Portfolio MOVs
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Criteria 1: PPST COIs Demo Teaching (25 pts) */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                            1. PPST COIs — Demonstration Teaching / Classroom Observation
                          </label>
                          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Max 25.00 pts (COT Rubric Level 3-7 ratings calibrated to 25 pts)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(25)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.4)', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', cursor: 'pointer', fontWeight: 700 }}>Max (25)</button>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(23.5)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>23.50</button>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(20)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>20.00</button>
                        </div>
                      </div>
                      <div className="hrmo-score-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          aria-label="1. PPST COIs — Demonstration Teaching / Classroom Observation"
                          type="range"
                          min={0} max={25} step="0.25"
                          value={hrmoPpstCoiScore}
                          onChange={(e) => setHrmoPpstCoiScore(Number(e.target.value))}
                          style={{ flex: 1, accentColor: '#059669', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            aria-label="PPST COIs score"
                            type="number"
                            max={25} min={0} step="0.01"
                            className="form-input"
                            style={{ width: '85px', textAlign: 'center', fontWeight: 800, color: '#059669', fontSize: '1.0625rem', fontFamily: 'var(--font-mono)' }}
                            value={hrmoPpstCoiScore}
                            onChange={(e) => setHrmoPpstCoiScore(Number(e.target.value))}
                            required
                          />
                          <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ 25</span>
                        </div>
                      </div>
                    </div>

                    {/* Criteria 2: PPST NCOIs Portfolio & BEI (15 pts) */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                            2. PPST NCOIs — Portfolio Annotation & Behavioral Event Interview (BEI)
                          </label>
                          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Max 15.00 pts (Means of Verification, Portfolio Evidence & Interview)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(15)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.4)', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', cursor: 'pointer', fontWeight: 700 }}>Max (15)</button>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(13.5)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>13.50</button>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(12)} style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>12.00</button>
                        </div>
                      </div>
                      <div className="hrmo-score-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          aria-label="2. PPST NCOIs — Portfolio Annotation & Behavioral Event Interview (BEI)"
                          type="range"
                          min={0} max={15} step="0.25"
                          value={hrmoPpstNcoiScore}
                          onChange={(e) => setHrmoPpstNcoiScore(Number(e.target.value))}
                          style={{ flex: 1, accentColor: '#059669', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            aria-label="PPST NCOIs score"
                            type="number"
                            max={15} min={0} step="0.01"
                            className="form-input"
                            style={{ width: '85px', textAlign: 'center', fontWeight: 800, color: '#059669', fontSize: '1.0625rem', fontFamily: 'var(--font-mono)' }}
                            value={hrmoPpstNcoiScore}
                            onChange={(e) => setHrmoPpstNcoiScore(Number(e.target.value))}
                            required
                          />
                          <span style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ 15</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Non-Teaching Criteria Section */
                <div style={{
                  background: theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
                  border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A',
                  borderRadius: '12px',
                  padding: '18px',
                }}>
                  <div className="hrmo-criteria-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Non-Teaching Potential Criteria (20.00 pts Max)
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      Written Exam + Behavioral Event Interview + Skills Test
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px' }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Written Examination (Max 5)</label>
                      <input
                        aria-label="Written Examination (Max 5)"
                        type="number"
                        max={5} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700, color: '#D97706' }}
                        value={hrmoWrittenScore}
                        onChange={(e) => setHrmoWrittenScore(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px' }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>BEI Interview (Max 5)</label>
                      <input
                        aria-label="BEI Interview (Max 5)"
                        type="number"
                        max={5} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700, color: '#D97706' }}
                        value={hrmoBeiScore}
                        onChange={(e) => setHrmoBeiScore(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px' }}>
                      <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Skills Test (Max 10)</label>
                      <input
                        aria-label="Skills Test (Max 10)"
                        type="number"
                        max={10} min={0} step="0.25"
                        className="form-input"
                        style={{ textAlign: 'center', fontWeight: 700, color: '#D97706' }}
                        value={hrmoSkillsScore}
                        onChange={(e) => setHrmoSkillsScore(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Combined Total Live Score Display Gauge */}
              {(() => {
                const edu = Number(hrmoEduScore) || 0;
                const train = Number(hrmoTrainScore) || 0;
                const exp = Number(hrmoExpScore) || 0;
                const perf = Number(hrmoPerfScore) || 0;

                let combined = 0;
                if (modalTrack === 'NON_TEACHING') {
                  const outAcc = Number(hrmoAccomplishmentsScore) || 0;
                  const appEdu = Number(hrmoAppEduScore) || 0;
                  const appLd = Number(hrmoAppLdScore) || 0;
                  const written = Number(hrmoWrittenScore) || 0;
                  const bei = Number(hrmoBeiScore) || 0;
                  const skills = Number(hrmoSkillsScore) || 0;
                  combined = parseFloat((edu + train + exp + perf + outAcc + appEdu + appLd + written + bei + skills).toFixed(2));
                } else {
                  const coi = Number(hrmoPpstCoiScore) || 0;
                  const ncoi = Number(hrmoPpstNcoiScore) || 0;
                  combined = parseFloat((edu + train + exp + perf + coi + ncoi).toFixed(2));
                }

                const isOutstanding = combined >= 90;

                return (
                  <div style={{
                    background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5',
                    border: theme === 'dark' ? '1.5px solid rgba(5, 150, 105, 0.3)' : '1.5px solid #A7F3D0',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#059669', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                          HRMPSB Deliberated Comparative Assessment Result (CAR) Total
                        </div>
                        <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)' }}>
                          {modalTrack === 'NON_TEACHING'
                            ? `Education (${edu}) + Training (${train}) + Experience (${exp}) + Perf (${perf}) + Accomp (${hrmoAccomplishmentsScore}) + AppEdu (${hrmoAppEduScore}) + AppLD (${hrmoAppLdScore}) + Potential (${(Number(hrmoWrittenScore) + Number(hrmoBeiScore) + Number(hrmoSkillsScore)).toFixed(1)})`
                            : `Education (${edu}) + Training (${train}) + Experience (${exp}) + Perf (${perf}) + PPST COT (${hrmoPpstCoiScore}) + Portfolio (${hrmoPpstNcoiScore})`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                          {combined.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', fontWeight: 700 }}>/ 100.00 pts</span>
                      </div>
                    </div>

                    <div style={{ width: '100%', height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ width: `${Math.min(100, combined)}%`, height: '100%', background: isOutstanding ? 'linear-gradient(90deg, #10b981 0%, #d97706 100%)' : 'linear-gradient(90deg, #2f7d52 0%, #10b981 100%)', borderRadius: '4px', transition: 'width 0.3s ease' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      <span>Grade: <strong style={{ color: isOutstanding ? '#059669' : 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{isOutstanding ? <><AppIcon name="award" size={12} color="#059669" /> Highly Qualified / Superior Merit</> : <><AppIcon name="check" size={12} color="var(--color-primary)" /> Qualified for Deliberation</>}</strong></span>
                      <span>Cut-off Threshold: 50.00 pts</span>
                    </div>
                  </div>
                );
              })()}

              {/* Official DepEd Governance Fields Section */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '18px',
              }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AppIcon name="approvals" size={14} color="var(--color-primary)" />
                  Official DepEd CAR Governance & Appointing Fields
                </div>

                {/* BI, Appointment, Probation Grid */}
                <div className="hrmo-governance-grid" style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-3, 1fr 1fr 1fr)', gap: '14px', marginBottom: '14px', minWidth: 0 }}>
                  {/* Background Investigation Segment */}
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      1. Background Investigation (BI)
                    </label>
                    <div className="hrmo-bi-options" style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setForBackgroundInvestigation('YES')}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '8px',
                          fontSize: '0.9375rem',
                          fontWeight: 700,
                          border: forBackgroundInvestigation === 'YES' ? '1.5px solid #10b981' : '1px solid var(--color-border)',
                          background: forBackgroundInvestigation === 'YES' ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7') : 'var(--color-bg-card)',
                          color: forBackgroundInvestigation === 'YES' ? '#059669' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <AppIcon name="check" size={12} color={forBackgroundInvestigation === 'YES' ? '#059669' : 'var(--color-text-secondary)'} /> YES (Passed)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForBackgroundInvestigation('NO')}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '8px',
                          fontSize: '0.9375rem',
                          fontWeight: 700,
                          border: forBackgroundInvestigation === 'NO' ? '1.5px solid #ef4444' : '1px solid var(--color-border)',
                          background: forBackgroundInvestigation === 'NO' ? (theme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2') : 'var(--color-bg-card)',
                          color: forBackgroundInvestigation === 'NO' ? '#DC2626' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <AppIcon name="close" size={12} color={forBackgroundInvestigation === 'NO' ? '#DC2626' : 'var(--color-text-secondary)'} /> NO (Failed)
                      </button>
                    </div>
                  </div>

                  {/* Probation Selection */}
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      2. Probation Period
                    </label>
                    <select
                      aria-label="2. Probation Period"
                      className="form-input"
                      value={forProbation}
                      onChange={(e) => setForProbation(e.target.value)}
                      style={{ fontSize: '0.9375rem', fontWeight: 600, width: '100%', minWidth: 0 }}
                    >
                      <option value="6 months">6 months (Sec. F of DO 019, s. 2022)</option>
                      <option value="1 year">1 year (Sec. F of DO 019, s. 2022)</option>
                      <option value="Not Applicable">Not Applicable / Permanent</option>
                    </select>
                  </div>

                  {/* For Appointment Status */}
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      3. For Appointment Status
                    </label>
                    <input
                      aria-label="3. For Appointment Status"
                      type="text"
                      className="form-input"
                      value={forAppointment}
                      onChange={(e) => setForAppointment(e.target.value)}
                      placeholder="e.g. Recommended for Appointment"
                      style={{ fontSize: '0.9375rem' }}
                    />
                  </div>
                </div>

                {/* Remarks & Quick Preset Prompts */}
                <div>
                  <div className="hrmo-remarks-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0 }}>
                      4. Board Final Remarks / Deliberation Summary
                    </label>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setHrmoRemarks('Demonstrated proficient pedagogical mastery during demonstration teaching; recommended for plantilla appointment.')}
                        style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #CFE8D8', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 700 }}
                      >
                        + Superior Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => setHrmoRemarks('Meets all DepEd CAR standards with complete authenticated credentials.')}
                        style={{ fontSize: '0.875rem', padding: '3px 8px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EEF7F1', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #CFE8D8', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 700 }}
                      >
                        + Meets Standards
                      </button>
                    </div>
                  </div>
                  <textarea
                    aria-label="Enter board deliberation notes and findings"
                    className="form-input"
                    rows={2}
                    placeholder="Enter board deliberation notes and findings..."
                    value={hrmoRemarks}
                    onChange={(e) => setHrmoRemarks(e.target.value)}
                    style={{ fontSize: '0.9375rem', resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="hrmo-modal-footer" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                paddingTop: '16px',
                borderTop: '1px solid var(--color-border)',
              }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowHrmoModal(false)}
                  style={{ fontSize: '1rem', borderRadius: '9999px', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={savingHrmoRating.pending}
                  className="btn btn-primary"
                  style={{
                    background: 'var(--color-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: '9999px',
                    fontWeight: 800,
                    fontSize: '1rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(37, 99, 235, 0.25)',
                    cursor: 'pointer',
                  }}
                >
                  <AppIcon name="approvals" size={16} color="#FFFFFF" />
                  Finalize & Sync Official CAR Result
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      ), document.body)}

      {/* MODAL 3: APPLICATION FORM FILL (COMPLETE PDS FORM 212) */}
      {showAppModal && (
        <ModalOverlay onDismiss={() => setShowAppModal(false)} className="modal-overlay">
          <div className="modal animate-scale-in" style={{
            maxWidth: 'min(980px, 95vw)',
            width: '95vw',
            maxHeight: '92vh',
            borderRadius: '20px',
            backgroundColor: 'var(--color-bg-card)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
              borderBottom: '1px solid var(--color-border)',
              padding: '18px 26px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              flexShrink: 0,
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2F7D52 0%, #10B981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}>
                <AppIcon name="personnel" size={22} color="#FFFFFF" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.1875rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  Register Applicant Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAppModal(false)}
                aria-label="Close"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitApplicationForm} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflow: 'hidden' }}>
              <div style={{ padding: '22px 28px', overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                {/* Plantilla Station & District Banner (Decided & Read-Only) */}
                <div style={{
                  background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EEF7F1',
                  border: theme === 'dark' ? '1.5px solid rgba(59, 130, 246, 0.35)' : '1.5px solid #CFE8D8',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(37, 99, 235, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2F7D52',
                    }}>
                      <AppIcon name="plantilla" size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2F7D52' }}>
                        Assigned Plantilla Item & School Station (Decided)
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.0625rem', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                        {selectedCycle?.rulesConfigurationJson?.targetPosition || selectedCycle?.name || 'Teacher I'}
                        {cyclePlantillaNo ? ` • Plantilla #${cyclePlantillaNo}` : ''}
                      </div>
                      <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Station: {selectedCycle?.rulesConfigurationJson?.school || selectedCycle?.rulesConfigurationJson?.schoolStation || 'SDO Koronadal City'}</span>
                        <span>•</span>
                        <span>District: {selectedCycle?.rulesConfigurationJson?.district || selectedCycle?.rulesConfigurationJson?.designatedDistrict || 'District 1'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Cycle Capacity
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-primary)' }}>
                      {submittedApps.length} / {selectedCycle?.rulesConfigurationJson?.maxApplicants || 10} Registered
                    </div>
                  </div>
                </div>

                {/* Section 1: Personal Information (PDS Form 212) */}
                <div>
                  <div style={{
                    fontSize: '0.9375rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-primary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AppIcon name="personnel" size={14} /> 1. Personal Information (PDS CS Form 212)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        First Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        aria-label="First Name"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Maria"
                        value={appFirstName}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '');
                          setAppFirstName(val);
                          if (!appEmail && val && appLastName) {
                            setAppEmail(`${val.toLowerCase().replace(/[^a-z0-9]/g, '')}.${appLastName.toLowerCase().replace(/[^a-z0-9]/g, '')}@deped.gov.ph`);
                          }
                        }}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Middle Name
                      </label>
                      <input
                        aria-label="Middle Name"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Bautista"
                        value={appMiddleName}
                        onChange={(e) => setAppMiddleName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Last Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        aria-label="Last Name"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Santos"
                        value={appLastName}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '');
                          setAppLastName(val);
                          if (!appEmail && appFirstName && val) {
                            setAppEmail(`${appFirstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${val.toLowerCase().replace(/[^a-z0-9]/g, '')}@deped.gov.ph`);
                          }
                        }}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Suffix
                      </label>
                      <select
                        aria-label="Suffix"
                        className="form-input"
                        value={appSuffix}
                        onChange={(e) => setAppSuffix(e.target.value)}
                      >
                        {NAME_SUFFIX_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        {appSuffix && !NAME_SUFFIX_OPTIONS.some(opt => opt.value === appSuffix) && (
                          <option value={appSuffix}>{appSuffix}</option>
                        )}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Date of Birth <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input aria-label="Date of Birth"
                        type="date"
                        className="form-input"
                        value={appBirthDate}
                        onChange={(e) => setAppBirthDate(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Sex / Gender <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <select aria-label="Sex / Gender"
                        className="form-input"
                        value={appGender}
                        onChange={(e) => setAppGender(e.target.value as any)}
                      >
                        <option value="FEMALE">Female</option>
                        <option value="MALE">Male</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Civil Status <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <select aria-label="Civil Status"
                        className="form-input"
                        value={appCivilStatus}
                        onChange={(e) => setAppCivilStatus(e.target.value as any)}
                      >
                        <option value="SINGLE">Single</option>
                        <option value="MARRIED">Married</option>
                        <option value="WIDOWED">Widowed</option>
                        <option value="SEPARATED">Separated</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact Details & Residence */}
                <div>
                  <div style={{
                    fontSize: '0.9375rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-primary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AppIcon name="phone" size={14} /> 2. Contact Details & Residential Address
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Email Address (Portal Account) <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        aria-label="Email Address (Portal Account)"
                        type="email"
                        className="form-input"
                        placeholder="maria.santos@deped.gov.ph"
                        value={appEmail}
                        onChange={(e) => setAppEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Mobile / Contact Number
                      </label>
                      <input
                        aria-label="Mobile / Contact Number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={13}
                        className="form-input"
                        placeholder="09171234567"
                        value={appContactNumber}
                        onChange={(e) => setAppContactNumber(e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''))}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '1rem' }}>
                        Residential Address
                      </label>
                      <input
                        aria-label="Residential Address"
                        type="text"
                        className="form-input"
                        placeholder="Barangay, Municipality / City, Province"
                        value={appAddress}
                        onChange={(e) => setAppAddress(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Applicant Registry & Status */}
                <div>
                  <div style={{
                    fontSize: '0.9375rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-primary)',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AppIcon name="security" size={14} /> 3. Candidate Registry Status
                  </div>
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        System Candidate ID
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)', fontSize: '1.0625rem', marginTop: '2px' }}>
                        APP-2026-XXXX (Candidate Applicant)
                      </div>
                      <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        No portal account or login credentials issued during evaluation.
                      </div>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: '14px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <AppIcon name="clock" size={12} /> Evaluation Candidate
                    </span>
                  </div>
                </div>

                {/* Section 4: Account Creation & Onboarding Policy */}
                <div style={{
                  background: theme === 'dark' ? 'rgba(37, 99, 235, 0.08)' : '#EEF7F1',
                  border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #CFE8D8',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}>
                  <div style={{ color: '#2F7D52', marginTop: '2px' }}>
                    <AppIcon name="checklist" size={18} />
                  </div>
                  <div style={{ fontSize: '1rem', lineHeight: '1.45', color: 'var(--color-text-secondary)' }}>
                    <strong style={{ color: 'var(--color-text-primary)' }}>Account Provisioning Policy:</strong> Candidate applicants are not given portal accounts during the evaluation stage. A portal login account will be officially provisioned and activated <strong>only if the candidate is recommended and selected for the plantilla item</strong>. Upon appointment, their Newly Hired Appointment compliance checklist will be unlocked for document submission.
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div style={{
                borderTop: '1px solid var(--color-border)',
                padding: '16px 28px',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '12px',
                background: 'var(--color-bg-tertiary)',
                flexShrink: 0,
              }}>
                <button
                  type="submit" disabled={savingApplication.pending}
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #2F7D52 0%, #276A45 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 24px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <AppIcon name="personnel" size={16} color="#FFFFFF" />
                  Register Applicant
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 4: CREATE PROMOTION CYCLE */}
      {showConfigModal && isHR && (
        <ModalOverlay onDismiss={() => setShowConfigModal(false)} className="modal-overlay">
          <div className="modal animate-scale-in pc-create" role="dialog" aria-modal="true" aria-labelledby="pc-create-title">
            <div className="pc-create__head">
              <div>
                <h3 id="pc-create-title" className="pc-create__title">New promotion cycle</h3>
                <p className="pc-create__sub">Choose the vacant item, then set who can apply and when.</p>
              </div>
              <button type="button" className="pc-create__close" aria-label="Close" onClick={() => setShowConfigModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateCycle} className="pc-create__form">
              <div className="pc-create__main">
              <div className="pc-create__body">
              <section className="pc-sec">
                <div>
                  <h4 className="pc-sec__title">Plantilla item{(Number(newVacantPositions) || 1) > 1 ? 's' : ''}</h4>
                  <p className="pc-sec__hint">
                    {designatedPlantillas.filter(Boolean).length} of {Number(newVacantPositions) || 1} chosen. The position, station and district come from the item.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.from({ length: Number(newVacantPositions) || 1 }).map((_, idx) => {
                      const currentValue = designatedPlantillas[idx] || '';
                      const isFirst = idx === 0;
                      const otherSelected = designatedPlantillas.filter((val, i) => i !== idx && Boolean(val));
                      const availableItems = plantillaItems.filter(p => !p.isOccupied && (!otherSelected.includes(p.itemNumber) || p.itemNumber === currentValue));
                      const selectedPlantilla = plantillaItems.find(p => p.itemNumber === currentValue);
                      const isPickerOpen = openPlantillaPickerIdx === idx;

                      // Filter available items by search query and track
                      const filteredAvailable = availableItems.filter(p => {
                        const isTeaching = p.positionTitle.toLowerCase().includes('teacher') ||
                          p.positionTitle.toLowerCase().includes('principal') ||
                          p.positionTitle.toLowerCase().includes('head');
                        if (plantillaPickerTrack === 'TEACHING' && !isTeaching) return false;
                        if (plantillaPickerTrack === 'NON_TEACHING' && isTeaching) return false;
                        if (!plantillaPickerSearch.trim()) return true;
                        const q = plantillaPickerSearch.toLowerCase().trim();
                        return (
                          p.itemNumber.toLowerCase().includes(q) ||
                          p.positionTitle.toLowerCase().includes(q) ||
                          (p.department && p.department.toLowerCase().includes(q)) ||
                          (p.division && p.division.toLowerCase().includes(q)) ||
                          String(p.salaryGrade).includes(q)
                        );
                      });

                      // One slot needs no numbered card around it.
                      const single = (Number(newVacantPositions) || 1) === 1;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.65)' : '#ffffff',
                            border: currentValue
                              ? (theme === 'dark' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid #CFE8D8')
                              : (theme === 'dark' ? '1px dashed rgba(255, 255, 255, 0.15)' : '1px dashed #C5D4C8'),
                            borderRadius: '12px',
                            padding: '12px 14px',
                            transition: 'all 0.2s ease',
                            boxShadow: currentValue
                              ? (theme === 'dark' ? '0 4px 14px rgba(0, 0, 0, 0.35)' : '0 2px 8px rgba(59, 130, 246, 0.08)')
                              : 'none',
                            ...(single ? { border: 'none', padding: 0, background: 'transparent', boxShadow: 'none' } : {}),
                          }}
                        >
                          {/* Slot Header */}
                          <div style={{ display: single ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: currentValue
                                  ? 'linear-gradient(135deg, #10B981, #059669)'
                                  : (theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#DCE6DE'),
                                color: currentValue ? '#ffffff' : 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.875rem',
                                fontWeight: 900,
                                boxShadow: currentValue ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                              }}>
                                {currentValue ? <Check size={12} strokeWidth={3} /> : idx + 1}
                              </span>
                              <div>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                  Plantilla Post #{idx + 1}
                                </span>
                                
                              </div>
                            </div>

                            {currentValue && !isPickerOpen && (
                              <span style={{
                                fontSize: '0.875rem',
                                fontWeight: 800,
                                color: '#10B981',
                                background: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '3px 8px',
                                borderRadius: '9999px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}>
                                <Sparkles size={11} /> Designated
                              </span>
                            )}
                          </div>

                          {/* Case A: Plantilla is Selected and Picker is closed -> Rich Card Showcase */}
                          {currentValue && !isPickerOpen && selectedPlantilla && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: theme === 'dark' ? 'rgba(0, 0, 0, 0.25)' : '#F7FAF6',
                              border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #DCE6DE',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--color-primary)',
                                    flexShrink: 0,
                                  }}>
                                    <Building2 size={18} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                      {selectedPlantilla.positionTitle}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.875rem',
                                        fontWeight: 800,
                                        background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#DCE6DE',
                                        color: 'var(--color-text-primary)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                      }}>
                                        {selectedPlantilla.itemNumber}
                                      </span>
                                      <span style={{
                                        fontSize: '0.875rem',
                                        fontWeight: 700,
                                        color: '#0284C7',
                                        background: 'rgba(2, 132, 199, 0.1)',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                      }}>
                                        Salary Grade {selectedPlantilla.salaryGrade}
                                      </span>
                                      <span style={{
                                        fontSize: '0.875rem',
                                        fontWeight: 700,
                                        color: '#059669',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                      }}>
                                        Vacant
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPlantillaPickerIdx(idx);
                                      setPlantillaPickerSearch('');
                                    }}
                                    className="btn btn-secondary btn-sm"
                                    style={{
                                      fontSize: '0.875rem',
                                      padding: '4px 10px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      borderRadius: '6px',
                                    }}
                                  >
                                    <Edit3 size={12} /> Change
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDesignatedPlantillaChange(idx, '')}
                                    className="btn btn-danger-outline btn-sm"
                                    style={{
                                      fontSize: '0.875rem',
                                      padding: '4px 8px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      borderRadius: '6px',
                                    }}
                                    title="Remove this selection"
                                  >
                                    <Trash2 size={12} /> Clear
                                  </button>
                                </div>
                              </div>

                              <div style={{
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #EEF2F6',
                                paddingTop: '6px',
                                flexWrap: 'wrap',
                              }}>
                                <span>🏫 <strong>School / Station:</strong> {selectedPlantilla.department || 'Schools Division Office'}</span>
                                <span>📍 <strong>Division:</strong> {selectedPlantilla.division || 'Not recorded'}</span>
                              </div>
                            </div>
                          )}

                          {/* Case B: Picker is OPEN -> Modern Searchable Popover & Catalog */}
                          {isPickerOpen && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              background: theme === 'dark' ? '#1F2A23' : '#ffffff',
                              border: '1px solid var(--color-primary)',
                              borderRadius: '10px',
                              padding: '12px',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                              marginTop: '4px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Building2 size={15} color="var(--color-primary)" />
                                  Browse & Select Vacant Plantilla Post #{idx + 1}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setOpenPlantillaPickerIdx(null)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.875rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  <X size={14} /> Close
                                </button>
                              </div>

                              {/* Search Bar + Quick Track Filters */}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', flex: '1 1 200px' }}>
                                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                                  <input
                                    aria-label="Search by Item No, Position Title, Station, or SG"
                                    type="text"
                                    className="has-icon-left"
                                    autoFocus
                                    placeholder="Search by Item No, Position Title, Station, or SG..."
                                    value={plantillaPickerSearch}
                                    onChange={(e) => setPlantillaPickerSearch(e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '7px 10px 7px 30px',
                                      borderRadius: '8px',
                                      fontSize: '0.9375rem',
                                      border: '1px solid var(--color-border)',
                                      background: theme === 'dark' ? 'rgba(0, 0, 0, 0.4)' : '#F7FAF6',
                                      color: 'var(--color-text-primary)',
                                      fontWeight: 600,
                                    }}
                                  />
                                </div>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {(['ALL', 'TEACHING', 'NON_TEACHING'] as const).map(trackOption => (
                                    <button
                                      key={trackOption}
                                      type="button"
                                      onClick={() => setPlantillaPickerTrack(trackOption)}
                                      style={{
                                        fontSize: '0.875rem',
                                        fontWeight: plantillaPickerTrack === trackOption ? 800 : 600,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: plantillaPickerTrack === trackOption
                                          ? 'var(--color-primary)'
                                          : (theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#DCE6DE'),
                                        color: plantillaPickerTrack === trackOption ? '#ffffff' : 'var(--color-text-secondary)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      {trackOption === 'ALL' ? 'All' : trackOption === 'TEACHING' ? 'Teaching' : 'Non-Teaching'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Plantilla Items Catalog List */}
                              <div style={{
                                maxHeight: '240px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                paddingRight: '4px',
                                marginTop: '4px',
                              }}>
                                {filteredAvailable.length === 0 ? (
                                  <div style={{
                                    textAlign: 'center',
                                    padding: '32px 16px',
                                    color: 'var(--color-text-secondary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}>
                                    <div style={{
                                      width: '48px',
                                      height: '48px',
                                      borderRadius: '50%',
                                      background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#EEF5EF',
                                      border: '1px solid var(--color-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginBottom: '10px',
                                    }}>
                                      <Building2 size={24} style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                                      No vacant plantilla items found
                                    </div>
                                    <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
                                      {plantillaPickerSearch || plantillaPickerTrack !== 'ALL'
                                        ? 'Try clearing your search query or switching to All tracks.'
                                        : 'There are currently no vacant plantilla items available in inventory.'}
                                    </div>
                                  </div>
                                ) : (
                                  filteredAvailable.map(p => {
                                    const isItemChosen = currentValue === p.itemNumber;
                                    return (
                                      <div
                                        key={p.id}
                                        aria-pressed={isItemChosen}
                                        {...clickable<HTMLDivElement>(() => {
                                          handleDesignatedPlantillaChange(idx, p.itemNumber);
                                          setOpenPlantillaPickerIdx(null);
                                          setPlantillaPickerSearch('');
                                        })}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '8px 12px',
                                          borderRadius: '8px',
                                          border: isItemChosen
                                            ? '1.5px solid #10B981'
                                            : (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #DCE6DE'),
                                          background: isItemChosen
                                            ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                                            : (theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF'),
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={e => {
                                          if (!isItemChosen) e.currentTarget.style.borderColor = 'var(--color-primary)';
                                        }}
                                        onMouseLeave={e => {
                                          if (!isItemChosen) e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#DCE6DE';
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                                {p.positionTitle}
                                              </span>
                                              <span style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 800,
                                                color: '#0284C7',
                                                background: 'rgba(2, 132, 199, 0.1)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                              }}>
                                                SG {p.salaryGrade}
                                              </span>
                                              <span style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 800,
                                                color: '#10B981',
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                              }}>
                                                VACANT
                                              </span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                              <strong style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{p.itemNumber}</strong> • {p.department} {p.division ? ` (${p.division})` : ''}
                                            </div>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          className={`btn btn-sm ${isItemChosen ? 'btn-success' : 'btn-primary'}`}
                                          style={{
                                            fontSize: '0.875rem',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontWeight: 700,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {isItemChosen ? '✓ Selected' : 'Choose Post'}
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}

                          {/* Case C: No Plantilla Chosen and Picker is closed -> Sleek Empty Trigger */}
                          {!currentValue && !isPickerOpen && (
                            <div
                              {...clickable<HTMLDivElement>(() => {
                                setOpenPlantillaPickerIdx(idx);
                                setPlantillaPickerSearch('');
                              }, 'Choose a plantilla item')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F7FAF6',
                                border: theme === 'dark' ? '1px dashed rgba(59, 130, 246, 0.3)' : '1px dashed #A8DDBB',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                e.currentTarget.style.background = theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#EEF7F1';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#A8DDBB';
                                e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F7FAF6';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--color-primary)',
                                }}>
                                  <Plus size={16} strokeWidth={2.5} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                    Choose a plantilla item{(Number(newVacantPositions) || 1) > 1 ? ` for post #${idx + 1}` : ''}
                                  </div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    {availableItems.length} vacant item{availableItems.length !== 1 ? 's' : ''} available
                                  </div>
                                </div>
                              </div>

                              <span
                                className="btn btn-primary btn-sm"
                                style={{
                                  fontSize: '0.9375rem',
                                  padding: '6px 14px',
                                  borderRadius: '8px',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Search size={13} /> Browse Vacancies
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="pc-sec">
                <div>
                  <h4 className="pc-sec__title">Slots</h4>
                  <p className="pc-sec__hint">The cycle closes by itself once every position is filled.</p>
                  <div className="pc-grid">
                    <label className="pc-field">
                      <span>Positions to fill <span className="pc-req">*</span></span>
                      <input
                        aria-label="Applicants That Will Be Chosen"
                        type="number" min={1} max={50}
                        className="form-input"
                        placeholder="e.g. 1"
                        value={newVacantPositions}
                        onChange={(e) => handleVacantPositionsChange(e.target.value)}
                        onBlur={() => { if (newVacantPositions === '' || Number(newVacantPositions) < 1) handleVacantPositionsChange(1); }}
                        required
                      />
                      <small>One plantilla item per position.</small>
                    </label>
                    <label className="pc-field">
                      <span>Maximum applicants <span className="pc-req">*</span></span>
                      <input
                        aria-label="Max Applicants Capacity"
                        type="number" min={1} max={500}
                        className="form-input"
                        placeholder="e.g. 10"
                        value={newMaxApplicants}
                        onChange={(e) => handleMaxApplicantsChange(e.target.value)}
                        onBlur={() => { if (newMaxApplicants === '' || Number(newMaxApplicants) < 1) setNewMaxApplicants(10); }}
                        required
                      />
                      <small>Applications stop at this number.</small>
                    </label>
                  </div>
                </div>
              </section>


              <section className="pc-sec">
                <div>
                  <h4 className="pc-sec__title">Details</h4>
                  <p className="pc-sec__hint">What applicants will see.</p>
                  <div className="pc-grid">
                    <label className="pc-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Cycle title <span className="pc-req">*</span></span>
                      <input aria-label="Cycle Title"
                        type="text"
                        className="form-input"
                        placeholder={newCycleTrack === 'TEACHING' ? 'e.g. 2026 Master Teacher I promotion' : 'e.g. 2026 Administrative Officer promotion'}
                        value={newCycleName}
                        onChange={(e) => { setNewCycleName(e.target.value); cycleErrors.clearField('name'); }}
                        aria-invalid={Boolean(cycleErrors.errors.name)}
                        required
                      />
                      <FieldError message={cycleErrors.errors.name} />
                    </label>
                    <label className="pc-field">
                      <span>Promotion type</span>
                      <select aria-label="Promotion Type" className="form-input" value={newCycleType} onChange={(e) => setNewCycleType(e.target.value)}>
                        <option value="NATURAL_VACANCY">Natural vacancy (DO 19)</option>
                        <option value="ECP">ECP reclassification (DO 24)</option>
                      </select>
                    </label>
                    <label className="pc-field">
                      <span>Open to</span>
                      <select aria-label="Open to" className="form-input" value={newOpenTo} onChange={(e) => setNewOpenTo(e.target.value as 'DIVISION' | 'DISTRICT')}>
                        <option value="DIVISION">Whole division</option>
                        <option value="DISTRICT" disabled={!newCycleDistrict}>
                          {newCycleDistrict ? `${newCycleDistrict} only` : 'One district (choose an item first)'}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
              </section>

              <section className="pc-sec">
                <div>
                  <h4 className="pc-sec__title">Schedule</h4>
                  <p className="pc-sec__hint">When personnel can apply.</p>
                  <div className="pc-grid">
                    <label className="pc-field">
                      <span>Opens</span>
                      <input aria-label="Application Start Date" type="date" className="form-input" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} required />
                    </label>
                    <label className="pc-field">
                      <span>Deadline</span>
                      <input aria-label="Application Deadline / End Date" type="date" className="form-input" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} required />
                    </label>
                  </div>
                  <div className="pc-seg" role="group" aria-label="Initial Cycle Status" style={{ marginTop: 14 }}>
                    <button type="button" aria-pressed={newCycleStatus === 'ACTIVE'} onClick={() => setNewCycleStatus('ACTIVE')}>
                      <strong>Publish now</strong><span>Personnel can apply right away</span>
                    </button>
                    <button type="button" aria-pressed={newCycleStatus === 'PLANNING'} onClick={() => setNewCycleStatus('PLANNING')}>
                      <strong>Save as planning</strong><span>Hidden until you activate it</span>
                    </button>
                  </div>
                </div>
              </section>
              </div>
              <aside className="pc-notice" aria-label="Preview of the vacancy notice">
                <p className="pc-notice__kicker">Personnel will see</p>
                <div className="pc-notice__sheet">
                  <p className="pc-notice__type">{newCycleType === 'ECP' ? 'ECP reclassification' : 'Natural vacancy'}</p>
                  <h4 className="pc-notice__position">{linkedPlantilla?.positionTitle || 'Choose a plantilla item'}</h4>
                  {linkedPlantilla && (
                    <p className="pc-notice__place">
                      {linkedPlantilla.department || 'All schools in district'}
                      {newCycleDistrict ? `, ${newCycleDistrict}` : ''}
                    </p>
                  )}
                  <p className="pc-notice__title">{newCycleName.trim() || 'Cycle title'}</p>
                  <dl className="pc-notice__facts">
                    <div><dt>Positions</dt><dd>{Number(newVacantPositions) || 1}</dd></div>
                    <div><dt>Applicants</dt><dd>Up to {Number(newMaxApplicants) || 10}</dd></div>
                    <div><dt>Salary grade</dt><dd>{linkedPlantilla ? linkedPlantilla.salaryGrade : '—'}</dd></div>
                    <div><dt>Apply by</dt><dd>{newEndDate ? formatDateString(newEndDate) : '—'}</dd></div>
                  </dl>
                  <p className="pc-notice__who">
                    {newOpenTo === 'DISTRICT' && newCycleDistrict ? `Only personnel in ${newCycleDistrict} can apply.` : 'Anyone in the division can apply.'}
                  </p>
                </div>
                <p className="pc-notice__state">
                  {newCycleStatus === 'PLANNING' ? 'Saved as planning. Personnel will not see it yet.' : `Goes live ${newStartDate ? `on ${formatDateString(newStartDate)}` : 'when created'}.`}
                </p>
              </aside>
              </div>

              <div className="pc-create__foot">
                <button type="submit" disabled={creatingCycle.pending} className="btn btn-primary">
                  <AppIcon name="new-transaction" size={14} color="#ffffff" /> {creatingCycle.pending ? 'Creating…' : 'Create cycle'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 5: APPLICANT SCORE BREAKDOWN & CAR DOSSIER INFO */}
      {showApplicantInfoModal && selectedApplicantInfo && (
        <CandidateDossierModal
          applicant={selectedApplicantInfo}
          isTeachingTrack={isCycleTeaching || selectedApplicantInfo.track === 'TEACHING' || selectedCycle?.rulesConfigurationJson?.track === 'TEACHING'}
          canDeliberate={isHR}
          onDeliberate={() => {
            const app = selectedApplicantInfo;
            setShowApplicantInfoModal(false);
            handleOpenHrmoRating(app);
          }}
          onClose={() => setShowApplicantInfoModal(false)}
        />
      )}

      {/* MODAL 6: PROMOTION SELECTION CONFIRMATION */}
      {showConfirmPromotionModal && selectedCandidateForConfirm && isHR && (
        <ModalOverlay onDismiss={() => setShowConfirmPromotionModal(false)} className="modal-overlay" style={{ backdropFilter: 'blur(8px)', zIndex: 1060 }}>
          {/* Header and actions stay put; only the body scrolls, and the dialog
              never grows past the viewport, so the actions are always reachable. */}
          <div className="modal animate-scale-in promo-select-dialog" role="dialog" aria-modal="true" aria-labelledby="promo-select-title" style={{
            maxWidth: '560px',
            width: '95%',
            maxHeight: 'calc(100dvh - 32px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            padding: 0,
            overflow: 'hidden'
          }}>
            <div style={{
              flexShrink: 0,
              background: 'var(--color-bg-tertiary)',
              borderBottom: '1px solid var(--color-border)',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5', border: theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AppIcon name="promotions" size={18} color={theme === 'dark' ? '#34D399' : '#059669'} />
                </div>
                <h3 id="promo-select-title" style={{ color: 'var(--color-text-primary)', margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
                  Confirm Candidate Selection for Promotion
                </h3>
              </div>
            </div>

            <div className="promo-select-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              <div style={{ background: theme === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4', padding: '16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #BBF7D0' }}>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  {selectedCandidateForConfirm.name}
                </div>
                <div style={{ fontSize: '1rem', color: theme === 'dark' ? '#34D399' : '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{selectedCandidateForConfirm.employeeId}</span> · 
                  <span>Rank #{selectedCandidateForConfirm.rank} ({selectedCandidateForConfirm.overallTotalScore} pts)</span>
                </div>
              </div>

              <div style={{ background: 'var(--color-bg-tertiary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Current Designation:</span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{selectedCandidateForConfirm.designation}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Target Promoted Rank:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>{selectedCycle?.rulesConfigurationJson?.targetPosition || 'Next Salary Rank'}</strong>
                </div>
              </div>

              {/* Plantilla Assignation Section */}
              {(() => {
                const cyclePlantillas: string[] = selectedCycle?.rulesConfigurationJson?.plantillaItemNumbers ||
                  (selectedCycle?.rulesConfigurationJson?.plantillaItemNumber ? [selectedCycle.rulesConfigurationJson.plantillaItemNumber] : []);

                // Find occupant mapping from leaderboard
                const assignedMap = new Map<string, string>();
                leaderboard.forEach(l => {
                  if (l.id !== selectedCandidateForConfirm.id) {
                    const pNum = l.plantillaItemNumber || l.scoreDetailsJson?.plantillaItemNumber;
                    if (pNum) assignedMap.set(pNum, l.name);
                  }
                });

                return (
                  <div style={{
                    background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EEF7F1',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: theme === 'dark' ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid #CFE8D8',
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '1rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                      marginBottom: '8px',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="employment" size={15} color="var(--color-primary)" />
                        Assignation to Plantilla Item Post <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {cyclePlantillas.length > 0 ? `${cyclePlantillas.length} Post${cyclePlantillas.length > 1 ? 's' : ''} in Cycle` : 'Open Registry'}
                      </span>
                    </label>

                    {cyclePlantillas.length === 1 ? (
                      // A single-post cycle has nothing to choose: the posted item is the one.
                      <div>
                        {(() => {
                          const pNum = cyclePlantillas[0];
                          const pItem = plantillaItems.find(p => p.itemNumber === pNum);
                          return (
                            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: '1rem', fontWeight: 700 }}>
                              {pNum}{pItem ? ` — ${pItem.positionTitle} (SG ${pItem.salaryGrade}) • ${pItem.department}` : ''}
                            </div>
                          );
                        })()}
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                          The plantilla item posted for this promotion. When the promotion appointment is officially approved, this item will be occupied by them.
                        </div>
                      </div>
                    ) : cyclePlantillas.length > 0 ? (
                      <div>
                        <select aria-label="Designated plantilla item for this candidate"
                          className="form-input"
                          value={selectedPlantillaForCandidate}
                          onChange={(e) => setSelectedPlantillaForCandidate(e.target.value)}
                          style={{
                            background: 'var(--color-bg-card)',
                            fontSize: '1rem',
                            fontWeight: 700,
                            padding: '8px 10px',
                            width: '100%',
                          }}
                          required
                        >
                          <option value="">-- Choose Designated Plantilla Item --</option>
                          {cyclePlantillas.map((pNum, pIdx) => {
                            const pItem = plantillaItems.find(p => p.itemNumber === pNum);
                            const assignedTo = assignedMap.get(pNum);
                            const isCurrentCandidateChoice = selectedPlantillaForCandidate === pNum;
                            const label = `${pNum}${pItem ? ` — ${pItem.positionTitle} (SG ${pItem.salaryGrade}) • ${pItem.department}` : ''}${assignedTo ? ` [Currently Assigned to: ${assignedTo}]` : isCurrentCandidateChoice ? ' [Selected for this Candidate]' : ' [Available]'}`;
                            return (
                              <option key={pNum} value={pNum}>
                                Post #{pIdx + 1}: {label}
                              </option>
                            );
                          })}
                        </select>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                          This personnel will be allocated to this specific plantilla post. When the promotion appointment is officially approved, this item will be occupied by them.
                        </div>
                      </div>
                    ) : (
                      <div>
                        <select aria-label="Vacant plantilla item from registry"
                          className="form-input"
                          value={selectedPlantillaForCandidate}
                          onChange={(e) => setSelectedPlantillaForCandidate(e.target.value)}
                          style={{
                            background: 'var(--color-bg-card)',
                            fontSize: '1rem',
                            fontWeight: 700,
                            padding: '8px 10px',
                            width: '100%',
                          }}
                        >
                          <option value="">-- Select Vacant Plantilla from Registry --</option>
                          {plantillaItems.filter(p => !p.isOccupied).map(p => (
                            <option key={p.id} value={p.itemNumber}>
                              {p.itemNumber} — {p.positionTitle} (SG {p.salaryGrade}) • {p.department}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                          Assign one of the available vacant plantilla posts from the Division Registry.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.12)' : '#FFFBEB', padding: '14px 16px', borderRadius: '8px', border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #FDE68A' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#B45309', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AppIcon name="checklist" size={14} color={theme === 'dark' ? '#FBBF24' : '#B45309'} /> Next Steps & Requirements Trigger
                </div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                  Selecting this candidate will send an immediate real-time web & mobile notification requiring <strong>{selectedCandidateForConfirm.name}</strong> to submit official <strong>Promotion Appointment Documents</strong> (CS Form 33, Oath of Office, PDF, IPCRF). The official position update will take effect after verification by AO II and final approval by HRMO.
                </div>
              </div>

              {higherRankedThanCandidate.length > 0 && (
                <label className="promo-select-reason">
                  <span className="promo-select-reason__title">Reason for choosing this applicant <span style={{ color: 'var(--color-danger)' }}>*</span></span>
                  <span className="promo-select-reason__note">
                    {higherRankedThanCandidate.map(l => `${l.name} (${l.overallTotalScore})`).join(', ')} {higherRankedThanCandidate.length === 1 ? 'ranks' : 'rank'} higher.
                    Write why this applicant is chosen instead; it is kept with the selection record.
                  </span>
                  <textarea className="form-input" rows={3} maxLength={1000} value={selectionJustification}
                    onChange={e => setSelectionJustification(e.target.value)} placeholder="At least 15 characters" />
                </label>
              )}
            </div>

            <div style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '16px 24px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-bg-tertiary)',
            }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowConfirmPromotionModal(false)}
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: '8px', padding: '8px 18px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmSelectionSubmit}
                disabled={higherRankedThanCandidate.length > 0 && selectionJustification.trim().length < 15}
                style={{ background: 'var(--color-primary)', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)' }}
              >
                <AppIcon name="promotions" size={15} color="#ffffff" /> Confirm Selection & Request Documents
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}



    </div>
  );
};
