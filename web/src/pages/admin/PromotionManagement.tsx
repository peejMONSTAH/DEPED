import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import apiClient from '../../api/client';
import { TEACHING_POSITIONS, NON_TEACHING_POSITIONS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';
import { Search, Filter, CheckCircle2, Clock, XCircle, AlertCircle, PlayCircle, Layers, RefreshCw, Archive, ChevronDown, ChevronUp, Building2, Check, X, Sparkles, Plus, Edit3, Trash2 } from 'lucide-react';
import { clickable, clickableRow } from '../../a11y/clickable';
import { deliberationBlockReason, isRequirementsVerified } from '../../promotions/stageGate';
import { usePending } from '../../hooks/usePending';

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

  // Promotion Selection Confirmation Modal State
  const [showConfirmPromotionModal, setShowConfirmPromotionModal] = useState(false);
  const [selectedCandidateForConfirm, setSelectedCandidateForConfirm] = useState<any | null>(null);
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

  const isApplicantReqVerified = (a: any) =>
    a.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED' ||
    a.scoreDetailsJson?.requirementsCheck?.status === 'COMPLETE' ||
    a.status === 'INITIAL_RATED' ||
    a.status === 'RANKED' ||
    a.status === 'APPROVED' ||
    a.status === 'PROMOTED';

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

  const hrmoFinalizedApps = filteredSubmittedApps.filter(a => a.status === 'RANKED' || a.status === 'APPROVED' || a.status === 'PROMOTED' || Boolean(a.scoreDetailsJson?.finalRating));
  const hrmoPendingApps = filteredSubmittedApps.filter(a => !(a.status === 'RANKED' || a.status === 'APPROVED' || a.status === 'PROMOTED' || Boolean(a.scoreDetailsJson?.finalRating)));
  const displayedHrmoApps = hrmoFilter === 'PENDING' ? hrmoPendingApps : hrmoFilter === 'FINALIZED' ? hrmoFinalizedApps : filteredSubmittedApps;

  const handleOpenConfirmSelection = (app: any) => {
    if (!isHR) {
      addToast('Access denied: System Administrator cannot select candidates for promotion. Only HR (HRMO) can select promotion candidates.', 'ERROR');
      return;
    }
    setSelectedCandidateForConfirm(app);

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

  const handleConfirmSelectionSubmit = async () => {
    if (!selectedCandidateForConfirm) return;
    if (!isHR) {
      addToast('Access denied: System Administrator cannot create or approve promotions. Only HR (HRMO) has permission to promote candidates.', 'ERROR');
      return;
    }
    await handleTogglePromotionCandidate(selectedCandidateForConfirm, true, selectedPlantillaForCandidate);
    setShowConfirmPromotionModal(false);
    setSelectedCandidateForConfirm(null);
  };

  // Track & View Mode State
  const [modalTrack, setModalTrack] = useState<'TEACHING' | 'NON_TEACHING'>('TEACHING');
  const [carViewMode, setCarViewMode] = useState<'TEACHING' | 'NON_TEACHING' | 'ALL'>('ALL');

  // Official DepEd Annex C Standard Documentary Requirements
  const DEFAULT_ANNEX_C_ITEMS = [
    { code: 'a', title: 'Letter of Intent', description: 'Addressed to Head of Office with information on vacancy', isMandatory: true },
    { code: 'b', title: 'Duly Accomplished PDS & WES', description: 'Personal Data Sheet (CS Form 212 Revised 2017) and Work Experience Sheet', isMandatory: true },
    { code: 'c', title: 'PRC License / Identification Card', description: 'Photocopy of Valid and Updated PRC License/ID, if applicable', isMandatory: false },
    { code: 'd', title: 'Certificate of Eligibility / Rating', description: 'Photocopy of Certificate of Eligibility / Rating, if applicable', isMandatory: false },
    { code: 'e', title: 'Scholastic / Academic Records', description: 'Transcript of Records (TOR) & Diploma (including Masteral/Doctorate completion)', isMandatory: true },
    { code: 'f', title: 'Certificates of Training', description: 'Certificates of Training within 5 years or since last promotion', isMandatory: false },
    { code: 'g', title: 'Certificate of Employment / Service Record', description: 'Certificate of Employment, Contract of Service, or duly signed Service Record', isMandatory: true },
    { code: 'h', title: 'Latest Appointment', description: 'Photocopy of Latest Appointment, if applicable', isMandatory: false },
    { code: 'i', title: 'Performance Ratings (IPCR / OPCR)', description: 'Performance Rating in the last rating period covering 1 year in current/previous position', isMandatory: true },
    { code: 'j', title: 'Checklist & Omnibus Sworn Statement / Consent', description: 'Checklist of Requirements, Omnibus Sworn Statement on Authenticity & Data Privacy Consent', isMandatory: true },
    { code: 'k', title: 'Other MOVs / Relevant Documents', description: 'Other Means of Verification relevant to the position applied for', isMandatory: false },
  ];

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

  // Detect current user's AO district jurisdiction
  const currentUserDistrict = (() => {
    if (!user) return undefined;
    const u = user as any;
    const text = `${u.firstName || ''} ${u.lastName || ''} ${u.email || ''} ${u.role || ''} ${u.school || ''} ${u.address || ''} ${u.designation || ''}`.toLowerCase();
    if (text.includes('district 1') || text.includes('district1') || text.includes('dist 1') || text.includes('ao1') || text.includes('ao_1')) return 'District 1';
    if (text.includes('district 6') || text.includes('district6') || text.includes('dist 6') || text.includes('ao6') || text.includes('ao_6')) return 'District 6';
    
    // Check school keywords
    const s1 = ['matulas', 'morales', 'salkan', 'koronadal central'];
    if (s1.some(s => text.includes(s))) return 'District 1';
    const s6 = ['villegas', 'carpenter', 'mapambucol', 'barrio 8', 'mangga', 'gawel', 'takilay'];
    if (s6.some(s => text.includes(s))) return 'District 6';
    return undefined;
  })();

  const cycleDistrict = selectedCycle?.rulesConfigurationJson?.district;
  const cycleSchool = selectedCycle?.rulesConfigurationJson?.school;

  const isAoDistrictAllowed = (() => {
    if (user?.role === 'HRMO') return true;
    if (user?.role !== 'AO_II') return true;
    if (!cycleDistrict || cycleDistrict === 'ALL' || cycleDistrict === 'All Districts / Division-Wide') return true;
    if (!currentUserDistrict) return true;
    return currentUserDistrict.toLowerCase().trim() === cycleDistrict.toLowerCase().trim();
  })();



  const handleTogglePromotionCandidate = async (app: any, shouldPromote: boolean, plantillaItemNumber?: string) => {
    if (!selectedCycle) return;
    if (!isHR) {
      addToast('Access denied: System Administrator cannot create or select promotions. Only HR (HRMO) can select promotion candidates.', 'ERROR');
      return;
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
      });
      addToast(
        shouldPromote
          ? `Applicant ${app.name} (${app.employeeId}) selected for promotion${targetPlantilla ? ` and assigned to Plantilla ${targetPlantilla}` : ''}!`
          : `Promotion selection removed for ${app.name}.`,
        shouldPromote ? 'SUCCESS' : 'INFO'
      );
      await fetchLeaderboard(selectedCycle.id);
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to update candidate promotion selection.', 'ERROR');
    }
  };

  const handleUpdateCycleStatus = async (cycleId: number, newStatus: string) => {
    if (!isHR) {
      addToast('Access denied: System Administrator cannot modify promotion cycles. Only HR (HRMO) can update cycle status.', 'ERROR');
      return;
    }
    // CANCELLED and FINALIZED close the cycle to applicants and reviewers alike.
    if (newStatus === 'CANCELLED' || newStatus === 'FINALIZED' || newStatus === 'CLOSED') {
      const { confirmed } = await confirm({
        title: `Set cycle to ${newStatus}`,
        message: `Change this promotion cycle to ${newStatus}? Applicants and reviewers lose access to it in its current state.`,
        confirmLabel: `Set ${newStatus}`,
      });
      if (!confirmed) return;
    }

    try {
      await apiClient.patch(`/promotions/cycles/${cycleId}`, { status: newStatus });
      addToast(`Promotion cycle status updated to "${newStatus}"! Real-time synchronization active.`, 'SUCCESS');
      
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
      setSelectedCycle((prev: any) => {
        if (!prev) return list.length > 0 ? list[0] : null;
        const matching = list.find((c: any) => c.id === prev.id);
        return matching ? matching : (list.length > 0 ? list[0] : null);
      });
    } catch (err) {
      console.error('Failed to load promotion cycles:', err);
    } finally {
      if (showLoading) setLoading(false);
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
    if (!isAoDistrictAllowed) {
      addToast(`District Jurisdiction Restriction: Only AO II officers assigned to ${cycleDistrict || 'the designated district'} can evaluate candidates in this promotion cycle. Your assigned district is ${currentUserDistrict || 'Unassigned / Different District'}.`, 'ERROR');
      return;
    }
    setSelectedAppForModal(app);

    const annexC = app.scoreDetailsJson?.annexCChecklist || {};
    const existingItems = Array.isArray(annexC.items) ? annexC.items : [];

    const mappedItems = DEFAULT_ANNEX_C_ITEMS.map(def => {
      const found = existingItems.find((it: any) => it.code === def.code);
      const isSubmitted = Boolean(found?.submitted);
      const prevVerification = found?.verificationStatus || (found?.status === 'VERIFIED' ? 'VERIFIED' : (isSubmitted ? 'VERIFIED' : (def.isMandatory ? 'INCOMPLETE' : 'NOT_APPLICABLE')));
      return {
        code: def.code,
        title: found?.title || def.title,
        description: found?.description || def.description,
        isMandatory: found?.isMandatory ?? def.isMandatory,
        submitted: isSubmitted,
        documentName: found?.documentName,
        documentType: found?.documentType,
        personnelDocumentId: found?.personnelDocumentId,
        status: (prevVerification as 'VERIFIED' | 'INCOMPLETE' | 'NOT_APPLICABLE') || 'VERIFIED',
        remarks: found?.verificationRemarks || found?.remarks || '',
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
      // Keep the modal open so the officer can retry rather than assume it saved.
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

  const handleDownloadCarDocument = async (cycleId?: number) => {
    const id = cycleId || selectedCycle?.id;
    if (!id) {
      addToast('Please select an active promotion cycle first.', 'WARNING');
      return;
    }

    try {
      setIsDownloadingCar(true);
      addToast('Generating official DepEd Comparative Assessment Result (CAR) .docx document...', 'INFO');

      const response = await apiClient.get(`/promotions/cycles/${id}/car-document`, {
        responseType: 'blob',
      });

      const contentDisposition = response.headers['content-disposition'];
      let filename = `CAR-${selectedCycle?.rulesConfigurationJson?.track === 'NON_TEACHING' ? 'NonTeaching' : 'Teaching'}-${selectedCycle?.rulesConfigurationJson?.targetPosition || 'Position'}-${id}.docx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      addToast(`CAR Document (${filename}) successfully generated and downloaded!`, 'SUCCESS');
    } catch (err: any) {
      console.error('Failed to download CAR document:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to generate CAR document.';
      addToast(`Error generating CAR document: ${errMsg}`, 'ERROR');
    } finally {
      setIsDownloadingCar(false);
    }
  };

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
          maxApplicants: Number(newMaxApplicants) || 10,
          vacantPositions: Number(newVacantPositions) || 1,
        },
      };
      const res = await apiClient.post('/promotions/cycles', payload);
      const createdCycle = res.data?.data;
      addToast(`New promotion cycle '${payload.name}' created for ${finalDistrict} (${finalSchool})! (Track: ${finalTrack === 'TEACHING' ? 'Teaching' : 'Non-Teaching'} | Max Capacity: ${payload.rulesConfigurationJson.maxApplicants} applicants | Vacancies: ${payload.rulesConfigurationJson.vacantPositions} posts | Plantillas: ${activePlantillaNumbers.length} allocated)`, 'SUCCESS');
      setShowConfigModal(false);
      setNewCycleName('');
      setSelectedPlantillaItemForCycle('');
      setDesignatedPlantillas(['']);
      setNewVacantPositions(1);
      setOverridePlantillaFields(false);

      if (createdCycle) {
        setCycles(prev => [createdCycle, ...prev]);
        setSelectedCycle(createdCycle);
      }
      await fetchCycles();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create promotion cycle.';
      addToast(msg, 'ERROR');
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
            Two-Stage Merit Selection & Ranking System
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
            AO II submits initial candidate ratings → HRMO Staff finalizes scores → Realtime Ranking Leaderboard updates live across dashboards.
          </p>
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
              fontSize: '0.75rem',
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
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                Promotion Cycles
              </h3>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
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
                fontSize: '0.75rem',
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
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Filter size={11} /> Filter by Status
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { key: 'ALL', label: 'All', color: '#2563EB', activeBg: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF', activeBorder: '#3B82F6' },
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
                      fontSize: '0.6875rem',
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
                <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                  No {cycleStatusFilter !== 'ALL' ? `${cycleStatusFilter.toLowerCase()} ` : ''}cycles found
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 20px 0', maxWidth: '440px', lineHeight: 1.55 }}>
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
                      style={{ fontSize: '0.8125rem', fontWeight: 600, padding: '8px 18px', borderRadius: '10px' }}
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
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        padding: '8px 18px',
                        borderRadius: '10px',
                        background: theme === 'dark' ? '#D7F84A' : '#141416',
                        color: theme === 'dark' ? '#141416' : '#FFFFFF',
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
                      ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF')
                      : (theme === 'dark' ? 'rgba(244, 63, 94, 0.15)' : '#FFF1F2');

                const badgeColor = isOngoing
                  ? (theme === 'dark' ? '#34D399' : '#059669')
                  : isPlanning
                    ? (theme === 'dark' ? '#FBBF24' : '#D97706')
                    : isFinished
                      ? (theme === 'dark' ? '#60A5FA' : '#2563EB')
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
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: isSelected ? (theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF') : 'var(--color-bg-tertiary)',
                      border: `1.5px solid ${isSelected ? '#2563EB' : 'var(--color-border)'}`,
                      boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {cycle.type || 'Natural Vacancy'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.625rem',
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
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: isSelected ? (theme === 'dark' ? '#60A5FA' : '#1D4ED8') : 'var(--color-text-primary)', lineHeight: 1.3, marginBottom: '6px' }}>
                      {cycle.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                      <span>{cycle.applicantCount || 0} applicants</span>
                      {cycle.endDate && (
                        <span>End: {new Date(cycle.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
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
            <span className="promotion-detail-context">Viewing cycle details, applicants, ratings and CAR</span>
          </div>
          {selectedCycle && (
            <>
              {/* Selected Cycle Header */}
              {(() => {
                const cycleStatus = (selectedCycle.status || '').toUpperCase();
                const isCycleOngoing = ['ACTIVE', 'EVALUATION', 'COMPARATIVE_ASSESSMENT'].includes(cycleStatus);
                const isCyclePlanning = ['PLANNING', 'CONFIGURED'].includes(cycleStatus);
                const isCycleFinished = ['CLOSED', 'FINALIZED', 'RESULTS_READY', 'PUBLISHED', 'RESOLVED'].includes(cycleStatus);
                const isCycleCancelled = cycleStatus === 'CANCELLED';

                const statusBadgeBg = isCycleOngoing
                  ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                  : isCyclePlanning
                    ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB')
                    : isCycleFinished
                      ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF')
                      : (theme === 'dark' ? 'rgba(244, 63, 94, 0.15)' : '#FFF1F2');

                const statusBadgeColor = isCycleOngoing
                  ? (theme === 'dark' ? '#34D399' : '#059669')
                  : isCyclePlanning
                    ? (theme === 'dark' ? '#FBBF24' : '#D97706')
                    : isCycleFinished
                      ? (theme === 'dark' ? '#60A5FA' : '#2563EB')
                      : (theme === 'dark' ? '#FB7185' : '#E11D48');

                const statusBadgeBorder = isCycleOngoing
                  ? 'rgba(16, 185, 129, 0.3)'
                  : isCyclePlanning
                    ? 'rgba(245, 158, 11, 0.3)'
                    : isCycleFinished
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(244, 63, 94, 0.3)';

                return (
                  <div className="card" style={{ padding: '24px', borderRadius: '12px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)' }}>
                    {/* Top Meta Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          SDO Koronadal City • {selectedCycle.rulesConfigurationJson?.district || 'Division Proper'}
                        </span>
                        <span style={{ color: 'var(--color-border)' }}>•</span>
                        <span style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: statusBadgeBg,
                          color: statusBadgeColor,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusBadgeColor }} />
                          {selectedCycle.status}
                        </span>

                        {isHR && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Status:</span>
                            <select
                              aria-label="Promotion cycle status"
                              value={selectedCycle.status}
                              onChange={(e) => handleUpdateCycleStatus(selectedCycle.id, e.target.value)}
                              style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                borderRadius: '6px',
                                background: 'var(--color-bg-tertiary)',
                                color: 'var(--color-text-primary)',
                                border: '1px solid var(--color-border)',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="PLANNING">PLANNING</option>
                              <option value="CLOSED">CLOSED</option>
                              <option value="FINALIZED">FINALIZED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Header Actions */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setActiveTab('CAR');
                            handleDownloadCarDocument(selectedCycle.id);
                          }}
                          disabled={isDownloadingCar}
                          style={{
                            background: 'var(--color-primary)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '7px 15px',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 700,
                            cursor: isDownloadingCar ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <AppIcon name="receipt" size={13} color="#FFFFFF" />
                          {isDownloadingCar ? 'Generating CAR...' : 'Official CAR (.docx)'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setShowAppModal(true)}
                          style={{
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-primary)',
                            borderRadius: '8px',
                            padding: '7px 14px',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 600,
                          }}
                        >
                          <AppIcon name="checklist" size={13} color="var(--color-text-secondary)" />
                          + Register Applicant
                        </button>
                      </div>
                    </div>

                    {/* Promotion Core Title */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                          {selectedCycle.rulesConfigurationJson?.targetPosition || selectedCycle.name}
                        </h2>
                        {selectedCycle.rulesConfigurationJson?.school && selectedCycle.rulesConfigurationJson?.school !== 'All Schools in District' && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            @ {selectedCycle.rulesConfigurationJson.school}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>Cycle: <strong>{selectedCycle.name}</strong></span>
                        <span>•</span>
                        <span>{formatDateString(selectedCycle.startDate)} to {formatDateString(selectedCycle.endDate)}</span>
                        <span>•</span>
                        <span>DepEd Merit Selection Plan</span>
                      </div>
                    </div>

                    {/* Important Highlights Strip (Bento Row) */}
                    <div className="promotion-summary-grid" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                      gap: '12px',
                    }}>
                      {/* Highlight 1: Quota Available */}
                      <div className="promotion-summary-card promotion-summary-card--slots">
                        <div className="promotion-summary-label">
                          <span className="promotion-summary-icon"><AppIcon name="checklist" size={15} /></span>
                          Available Openings
                        </div>
                        <div className="promotion-summary-value-row">
                          <span className="promotion-summary-value promotion-summary-value--large">
                            {cycleVacantPositions} {cycleVacantPositions === 1 ? 'Slot' : 'Slots'}
                          </span>
                          <span style={{
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                            color: theme === 'dark' ? '#34D399' : '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                          }}>
                            ● Available Quota
                          </span>
                        </div>
                      </div>

                      {/* Highlight 2: Plantilla Item */}
                      <div className="promotion-summary-card promotion-summary-card--plantilla">
                        <div className="promotion-summary-label">
                          <span className="promotion-summary-icon"><AppIcon name="employment" size={15} /></span>
                          Plantilla Item
                        </div>
                        <div className="promotion-summary-value promotion-summary-value--code">
                          {cyclePlantillaNo || 'Division Pool'}
                        </div>
                      </div>

                      {/* Highlight 3: Evaluation Track */}
                      <div className="promotion-summary-card promotion-summary-card--track">
                        <div className="promotion-summary-label">
                          <span className="promotion-summary-icon"><AppIcon name="promotions" size={15} /></span>
                          Evaluation Track
                        </div>
                        <div className="promotion-summary-value">
                          {isCycleTeaching ? 'Teaching Personnel Track (100 pts)' : 'Non-Teaching Track (100 pts)'}
                        </div>
                      </div>

                      {/* Highlight 4: Candidate Pool */}
                      <div className="promotion-summary-card promotion-summary-card--candidates">
                        <div className="promotion-summary-label">
                          <span className="promotion-summary-icon"><AppIcon name="personnel" size={15} /></span>
                          Candidate Pool
                        </div>
                        <div className="promotion-summary-value promotion-summary-value--large">
                          {filteredLeaderboard.length} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Applicants</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Navigation Subtabs (Minimalist Segmented Control) */}
              <div style={{
                display: 'flex',
                gap: '4px',
                padding: '4px',
                background: 'var(--color-bg-tertiary)',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                width: 'fit-content',
                flexWrap: 'wrap',
                marginBottom: '4px',
              }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('LEADERBOARD')}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '7px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: activeTab === 'LEADERBOARD' ? 'var(--color-primary)' : 'transparent',
                    color: activeTab === 'LEADERBOARD' ? '#ffffff' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Realtime Ranking Leaderboard
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('CAR')}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '7px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: activeTab === 'CAR' ? 'var(--color-primary)' : 'transparent',
                    color: activeTab === 'CAR' ? '#ffffff' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Comparative Assessment Result (CAR)
                </button>

                {isHR && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('AO_RATING')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '7px',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: activeTab === 'AO_RATING' ? 'var(--color-primary)' : 'transparent',
                      color: activeTab === 'AO_RATING' ? '#ffffff' : 'var(--color-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    AO II Requirements Desk
                  </button>
                )}

                {(user?.role === 'HRMO') && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('HRMO_RANKING')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '7px',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: activeTab === 'HRMO_RANKING' ? 'var(--color-primary)' : 'transparent',
                      color: activeTab === 'HRMO_RANKING' ? '#ffffff' : 'var(--color-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    HRMO Deliberation Workspace
                  </button>
                )}

                {(user?.role === 'HRMO') && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('HR_SELECTION')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '7px',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: activeTab === 'HR_SELECTION' ? 'var(--color-primary)' : 'transparent',
                      color: activeTab === 'HR_SELECTION' ? '#ffffff' : 'var(--color-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    HR Candidate Selection
                  </button>
                )}
              </div>

                {/* TAB 1: REALTIME RANKING LEADERBOARD */}
                {activeTab === 'LEADERBOARD' && (
                  <div className="card promotion-leaderboard-card" style={{ padding: '20px', borderRadius: '12px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)' }}>
                    {/* Header Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                            Realtime Ranking Leaderboard
                          </h3>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            borderRadius: '9999px',
                            background: theme === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: theme === 'dark' ? '#34D399' : '#059669',
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }} />
                            Live
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                          Synchronized standings across AO II initial evaluations and HRMO deliberations.
                        </p>
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
                              fontSize: '0.75rem',
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
                              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '10px', color: 'var(--color-text-muted)' }}
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
                            fontSize: '0.75rem',
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
                            fontSize: '0.75rem',
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
                      fontSize: '0.75rem',
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
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6875rem' }}>
                        Rows with green accent are within available vacancy quota
                      </span>
                    </div>

                    {/* LEADERBOARD TABLE WITH EXPANDABLE PARTICIPANTS */}
                    <div className="table-wrapper promotion-leaderboard-table-wrapper" style={{ border: '1px solid var(--color-border)', borderRadius: '10px', width: '100%', overflowX: 'auto', background: 'var(--color-bg-card)' }}>
                      <table className="table promotion-leaderboard-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '40px' }} />
                            <th style={{ padding: '10px 10px', textAlign: 'center', width: '55px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6875rem' }}>Rank</th>
                            <th className="promotion-applicant-column" style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6875rem' }}>Applicant</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '150px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6875rem' }}>Applicant No.</th>
                            <th style={{ padding: '10px 16px', textAlign: 'center', width: '200px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6875rem' }}>Score Breakdown & Total</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', width: '150px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6875rem' }}>Actions</th>
                          </tr>
                        </thead>

                        <tbody>
                          {filteredLeaderboard.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    {searchQuery ? 'No applicants match your search' : 'No candidates registered in this cycle yet'}
                                  </div>
                                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '400px', margin: 0 }}>
                                    {searchQuery ? 'Try clearing or changing your search terms.' : 'Submit applicant dossiers using the Register Applicant button to begin deliberations.'}
                                  </p>
                                  {searchQuery ? (
                                    <button
                                      type="button"
                                      onClick={() => setSearchQuery('')}
                                      className="btn btn-secondary btn-sm"
                                      style={{ marginTop: '8px', fontSize: '0.75rem' }}
                                    >
                                      Clear Search Filter
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setShowAppModal(true)}
                                      className="btn btn-primary btn-sm"
                                      style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem' }}
                                    >
                                      <AppIcon name="checklist" size={13} /> Submit Applicant Form
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredLeaderboard.map((item, index) => {
                              const isPromoted = Boolean(item.isPromoted || item.status === 'OFFICIALLY_PROMOTED' || item.scoreDetailsJson?.appointmentApproved);
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
                                        fontSize: '0.75rem',
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
                                          fontSize: '0.6875rem',
                                          color: isPromoted ? '#ffffff' : 'var(--color-text-secondary)',
                                          border: '1px solid var(--color-border)',
                                          flexShrink: 0,
                                        }}>
                                          {item.name ? item.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2) : 'AP'}
                                        </div>
                                        <div className="promotion-applicant-copy">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                                              {item.name}
                                            </span>
                                            {isWithinQuota && (
                                              <span style={{
                                                fontSize: '0.625rem',
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
                                                fontSize: '0.625rem',
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
                                          <div className="promotion-applicant-meta" style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
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
                                        fontSize: '0.75rem',
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
                                              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>/ 100</span>
                                            </div>
                                            <div style={{ fontSize: '0.6875rem', color: '#059669', fontFamily: 'var(--font-mono)', marginTop: '1px', fontWeight: 600 }}>
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
                                              fontSize: '0.75rem',
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
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
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
                                              fontSize: '0.6875rem',
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
                                              fontSize: '0.6875rem',
                                              color: '#ffffff',
                                              border: 'none',
                                              background: hasHrmoRating ? '#059669' : '#2563EB',
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
                                            fontSize: '0.6875rem',
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
                                            fontSize: '0.6875rem',
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
                                              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Stage 1 • AO II Documentary Check (Annex C)
                                              </span>
                                              <span style={{
                                                fontSize: '0.75rem',
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

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
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
                                                <div style={{ marginTop: '4px', padding: '6px 8px', background: 'var(--color-bg-tertiary)', borderRadius: '6px', fontSize: '0.6875rem', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
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
                                                  style={{ fontSize: '0.6875rem', padding: '5px 12px', borderRadius: '6px', marginTop: '6px' }}
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
                                              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Stage 2 • HRMO Deliberation
                                              </span>
                                              <span style={{ fontSize: '0.8125rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: hasHrmoRating ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                                {hasHrmoRating ? `${hrmoSubtotal.toFixed(2)} / ${isCycleTeaching ? '40.00' : '20.00'}` : 'Pending Deliberation'}
                                              </span>
                                            </div>

                                            {hasHrmoRating ? (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem' }}>
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
                                                  <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                                                    {(aoSubtotal + hrmoSubtotal).toFixed(2)} / 100.00
                                                  </span>
                                                </div>
                                              </div>
                                            ) : (
                                              <div style={{ padding: '10px 0', textAlign: 'center' }}>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0 0 10px 0' }}>
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
                                                      style={{ fontSize: '0.6875rem', padding: '4px 12px', borderRadius: '6px', cursor: awaitingAo ? 'not-allowed' : 'pointer' }}
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
                                              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>
                                                Candidate Promotion Status
                                              </div>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.75rem' }}>
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
                                                style={{ fontSize: '0.6875rem', padding: '4px 10px', borderRadius: '6px' }}
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
                                                  style={{ fontSize: '0.6875rem', padding: '4px 10px', borderRadius: '6px' }}
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
                                          fontSize: '0.6875rem',
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
                            fontSize: '0.6875rem',
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
                              background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
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
                            fontSize: '0.75rem',
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
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px', fontSize: '0.8125rem' }}>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Position:</span>
                          <strong style={{ color: 'var(--color-text-primary)', fontSize: '0.9375rem', fontWeight: 800 }}>{selectedCycle?.rulesConfigurationJson?.targetPosition || 'Teacher / Plantilla Post'}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Office / Unit where vacancy exists:</span>
                          <strong style={{ color: 'var(--color-primary)', fontSize: '0.9375rem', fontWeight: 800 }}>{selectedCycle?.name || 'Schools Division Office — Koronadal'}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Plantilla Item Number:</span>
                          <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', fontWeight: 700 }}>{selectedCycle?.rulesConfigurationJson?.plantillaItemNo || `DEPEDB-TCHR1-${selectedCycle?.id || '2026'}-001`}</strong>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '4px' }}>Date of Final Deliberation:</span>
                          <strong style={{ color: '#059669', fontSize: '0.9375rem', fontWeight: 800 }}>
                            {formatDateString(selectedCycle?.endDate)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Official CAR Summary Deliberation Table */}
                    <div className="table-wrapper" style={{ border: '1px solid var(--color-border)', borderRadius: '10px', width: '100%', overflowX: 'auto', background: 'var(--color-bg-card)' }}>
                      <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'center', width: '55px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Rank</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Candidate Name</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '160px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Plantilla Item</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '130px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Stage 1 (AO)</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '130px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Stage 2 (HRMO)</th>
                            <th style={{ padding: '10px 16px', textAlign: 'center', width: '150px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Total CAR Score</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', width: '140px', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>Board Status</th>
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
                              const isPromoted = Boolean(item.isPromoted || item.status === 'PROMOTED' || item.status === 'APPROVED');
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
                                        fontSize: '0.75rem',
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
                                      <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span>{item.name}</span>
                                        {isWithinQuota && (
                                          <span style={{
                                            fontSize: '0.625rem',
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
                                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        {item.designation || 'Teacher'} • {item.station}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
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
                                          fontSize: '1.0625rem',
                                          fontWeight: 800,
                                          fontFamily: 'var(--font-mono)',
                                          color: isWithinQuota ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                        }}>
                                          {totalScore.toFixed(2)}
                                        </span>
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>/ 100</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                      {isPromoted ? (
                                        <span style={{
                                          fontSize: '0.625rem',
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
                                          fontSize: '0.625rem',
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
                                          fontSize: '0.625rem',
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
                                          fontSize: '0.6875rem',
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.4)', marginBottom: '8px' }}>
                          <AppIcon name="checklist" size={13} color="var(--color-primary)" />
                          Stage 1 • AO II Documentary Completeness Verification
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                          Administrative Officer II Requirements Desk (Annex C Checklist)
                        </h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                          Inspect submitted documents for items a–k, verify authenticity and completeness, and endorse applicants for HRMPSB score deliberation.
                        </p>
                        
                        {/* District Jurisdiction Status Pill */}
                        <div style={{ marginTop: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <AppIcon name="location" size={12} color="var(--color-primary)" /> Division Scope: {cycleDistrict || 'Division-Wide'} ({cycleSchool || 'All Schools'})
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
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: aoFilter === 'ALL' ? 'var(--color-primary)' : 'transparent',
                            color: aoFilter === 'ALL' ? '#FFFFFF' : 'var(--color-text-secondary)',
                          }}
                        >
                          All ({filteredSubmittedApps.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAoFilter('PENDING')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.75rem',
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
                            fontSize: '0.75rem',
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
                            fontSize: '0.75rem',
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

                    {/* KPI Metric Counter Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
                      <div style={{ background: 'var(--color-bg-card)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total Applicants</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{filteredSubmittedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #A7F3D0' }}>
                        <div style={{ fontSize: '0.6875rem', color: theme === 'dark' ? '#34D399' : '#059669', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Complete / Verified</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#34D399' : '#059669' }}>{aoVerifiedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid #FECACA' }}>
                        <div style={{ fontSize: '0.6875rem', color: theme === 'dark' ? '#F87171' : '#DC2626', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Incomplete / Deficient</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#F87171' : '#DC2626' }}>{aoDeficientApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A' }}>
                        <div style={{ fontSize: '0.6875rem', color: theme === 'dark' ? '#FBBF24' : '#D97706', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Pending Verification</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#D97706' }}>{aoPendingApps.length}</div>
                      </div>
                    </div>

                    {/* Criteria Reference Strip */}
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                                  fontSize: '1rem',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                }}>
                                  {app.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                                </div>
                                <div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                                    {app.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: isCycleTeaching ? 'var(--color-primary)' : '#D97706', marginTop: '2px', fontWeight: 600 }}>
                                    {app.designation || 'Teacher / Plantilla Candidate'}
                                  </div>
                                </div>
                              </div>

                              <span style={{
                                fontSize: '0.6875rem',
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-secondary)', padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', marginBottom: '14px', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                              <span>Code: <strong style={{ color: 'var(--color-primary)' }}>{app.scoreDetailsJson?.applicantNumber || app.employeeId}</strong></span>
                              <span>Date: {app.dateSubmitted || '2026 Active'}</span>
                            </div>

                            {/* Annex C Requirements Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, repeat(2, 1fr))', gap: '8px', marginBottom: '14px' }}>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Annex C Items</div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{totalItems} items <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>(a to k)</span></div>
                              </div>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Scanned / Attached</div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: attachedDocsCount > 0 ? '#059669' : 'var(--color-text-muted)' }}>{attachedDocsCount} documents</div>
                              </div>
                              <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: '8px', gridColumn: 'span 2' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Omnibus Sworn Statement</div>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: checklist?.applicantInfo?.omnibusSwornStatement ? '#059669' : '#D97706' }}>
                                  {swornStatement}
                                </div>
                              </div>
                            </div>

                            {/* Remarks Snippet */}
                            {reqCheck?.remarks && (
                              <div style={{ fontSize: '0.6875rem', color: isDeficient ? '#DC2626' : 'var(--color-text-primary)', fontStyle: 'italic', marginBottom: '14px', padding: '8px 12px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', borderLeft: isDeficient ? '3px solid #DC2626' : '3px solid #059669' }}>
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
                              style={{ flex: 1, fontSize: '0.75rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', borderRadius: '9999px', fontWeight: 700 }}
                            >
                              201 File
                            </button>
                            {user?.role === 'AO_II' && !isAoDistrictAllowed ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled
                                title={`District Scope Locked: Only AO II from ${cycleDistrict || 'District 1'} can evaluate candidates in this cycle.`}
                                style={{
                                  flex: 2,
                                  fontSize: '0.75rem',
                                  background: 'var(--color-bg-tertiary)',
                                  color: 'var(--color-text-secondary)',
                                  border: '1px solid var(--color-border)',
                                  cursor: 'not-allowed',
                                  opacity: 0.6,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  borderRadius: '9999px',
                                }}
                              >
                                <AppIcon name="lock" size={12} color="#94a3b8" /> District Restricted
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleOpenAoRating(app)}
                                style={{
                                  flex: 2,
                                  fontSize: '0.75rem',
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
                            )}
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#059669', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(5, 150, 105, 0.4)', marginBottom: '8px' }}>
                          <AppIcon name="approvals" size={13} color="#059669" />
                          Stage 2 • HRMO Merit Promotion Board Final Deliberation
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                          HRMO Board Final Deliberation & CAR Ranking Desk
                        </h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                          Evaluate demo teaching / potential tests, record board remarks, background investigation status, and lock final 100.00-point CAR results.
                        </p>
                      </div>

                      {/* Filter Switcher Pills */}
                      <div style={{ display: 'flex', background: 'var(--color-bg-card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <button
                          type="button"
                          onClick={() => setHrmoFilter('ALL')}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.75rem',
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
                            fontSize: '0.75rem',
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
                            fontSize: '0.75rem',
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
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total In Deliberation</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{filteredSubmittedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #A7F3D0' }}>
                        <div style={{ fontSize: '0.6875rem', color: theme === 'dark' ? '#34D399' : '#059669', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Deliberated & Ranked</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#34D399' : '#059669' }}>{hrmoFinalizedApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A' }}>
                        <div style={{ fontSize: '0.6875rem', color: theme === 'dark' ? '#FBBF24' : '#D97706', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Pending Board Score</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#D97706' }}>{hrmoPendingApps.length}</div>
                      </div>
                      <div style={{ background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', padding: '14px 16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Combined CAR Target</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-primary)' }}>100.00 pts Master Score</div>
                      </div>
                    </div>

                    {/* Criteria Reference Strip */}
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#059669' }}>Official DepEd Deliberation Criteria (100.00 pts HR Deliberation):</span>
                      {isCycleTeaching ? (
                        <span>Education (10) + Training (10) + Experience (10) + Performance (30) + PPST COIs Demo (25) + PPST NCOIs (15) = <strong style={{ color: '#059669' }}>100.00 pts CAR Deliberation Total</strong></span>
                      ) : (
                        <span>Education (10) + Training (10) + Experience (10) + Performance (20) + Accomplishments (5) + App Edu (15) + App L&D (10) + Potential/Exams (20) = <strong style={{ color: '#D97706' }}>100.00 pts CAR Deliberation Total</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Candidate Scoring Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '18px' }}>
                    {displayedHrmoApps.map((app) => {
                      const finalRating = app.scoreDetailsJson?.finalRating || {};
                      const isFinalized = Boolean(app.status === 'RANKED' || app.status === 'APPROVED' || app.status === 'PROMOTED' || finalRating.finalTotalScore !== undefined || finalRating.overallTotalScore !== undefined);
                      
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
                                  background: isFinalized ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '1rem',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                                }}>
                                  {app.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                                </div>
                                <div>
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                                    {app.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: isCycleTeaching ? 'var(--color-primary)' : '#D97706', marginTop: '2px', fontWeight: 600 }}>
                                    {app.designation || 'Teacher / Plantilla Candidate'}
                                  </div>
                                </div>
                              </div>

                              <span style={{
                                fontSize: '0.6875rem',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                background: isFinalized ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'),
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
                                  <div style={{ fontSize: '0.625rem', color: isReqComplete ? '#059669' : isReqDeficient ? '#DC2626' : '#D97706', textTransform: 'uppercase', fontWeight: 700 }}>Stage 1 • AO Reqs</div>
                                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: isReqComplete ? '#059669' : isReqDeficient ? '#DC2626' : '#D97706', marginTop: '2px' }}>
                                    {isReqComplete ? 'Verified Complete' : isReqDeficient ? 'Deficient' : 'Pending Check'}
                                  </div>
                                </div>
                                <div style={{ background: isFinalized ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF'), padding: '8px 10px', borderRadius: '8px', border: isFinalized ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(37, 99, 235, 0.3)' }}>
                                  <div style={{ fontSize: '0.625rem', color: isFinalized ? '#059669' : 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700 }}>Stage 2 • HR Deliberation</div>
                                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: isFinalized ? '#059669' : 'var(--color-primary)', marginTop: '2px' }}>
                                    {isFinalized ? `${overallScore.toFixed(2)} / 100` : 'Pending Board'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700 }}>Combined CAR Total:</span>
                                <strong style={{ fontSize: '1.125rem', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 900 }}>
                                  {isFinalized ? `${overallScore.toFixed(2)} / 100.00 pts` : 'Awaiting Deliberation'}
                                </strong>
                              </div>
                            </div>

                            {/* Governance Tags */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', fontSize: '0.6875rem' }}>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', background: biStatus === 'YES' ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5') : (theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2'), color: biStatus === 'YES' ? '#059669' : '#DC2626', border: biStatus === 'YES' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(220, 38, 38, 0.3)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                BI: {biStatus === 'YES' ? <><AppIcon name="check" size={10} color="#059669" /> Passed</> : <><AppIcon name="close" size={10} color="#DC2626" /> Failed</>}
                              </span>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', color: 'var(--color-primary)', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE', fontWeight: 700 }}>
                                Probation: {probation}
                              </span>
                            </div>

                            {/* Remarks Snippet */}
                            {finalRating.hrmoRemarks && (
                              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-primary)', fontStyle: 'italic', marginBottom: '14px', padding: '8px 12px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', border: '1px solid var(--color-border)', borderLeft: '3px solid #059669' }}>
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
                              style={{ flex: 1, fontSize: '0.75rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', borderRadius: '9999px', fontWeight: 700 }}
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
                                  fontSize: '0.75rem',
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
                                fontSize: '0.6875rem',
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
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                        Review final overall candidate scores and select qualified personnel for promotion. Candidate selection triggers automated document submission notifications to the applicant.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5', color: theme === 'dark' ? '#34D399' : '#059669', padding: '4px 14px', borderRadius: '9999px', fontWeight: 700, border: '1px solid rgba(5, 150, 105, 0.4)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="promotions" size={13} color={theme === 'dark' ? '#34D399' : '#059669'} /> Vacancies Available: {selectedCycle?.rulesConfigurationJson?.vacantPositions || 1} Post(s)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
                    {filteredLeaderboard.map((item) => {
                      const isOfficiallyApproved = Boolean(item.isPromoted || item.status === 'OFFICIALLY_PROMOTED');
                      const isSelectedPendingDocs = Boolean(item.isSelectedForPromotion || item.status === 'SELECTED_PENDING_DOCS' || item.status === 'PROMOTED' || item.status === 'APPROVED');
                      
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
                                fontWeight: 800, fontSize: '0.75rem',
                                background: item.rank === 1 ? (theme === 'dark' ? 'rgba(217, 119, 6, 0.25)' : '#FEF3C7') : 'var(--color-bg-card)',
                                color: item.rank === 1 ? '#D97706' : 'var(--color-text-secondary)',
                                border: item.rank === 1 ? '1px solid rgba(217, 119, 6, 0.4)' : '1px solid var(--color-border)',
                              }}>
                                #{item.rank}
                              </span>
                              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>
                                {item.applicantNumber ? `App No: ${item.applicantNumber}` : item.employeeId}
                              </span>
                            </div>
                            {isOfficiallyApproved ? (
                              <span style={{ fontSize: '0.6875rem', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', border: '1px solid rgba(5, 150, 105, 0.4)', padding: '3px 9px', borderRadius: '9999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="promotions" size={10} color={theme === 'dark' ? '#34D399' : '#15803D'} /> OFFICIALLY PROMOTED
                              </span>
                            ) : isSelectedPendingDocs ? (
                              <span style={{ fontSize: '0.6875rem', background: theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7', color: theme === 'dark' ? '#FBBF24' : '#B45309', border: '1px solid rgba(217, 119, 6, 0.4)', padding: '3px 9px', borderRadius: '9999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="pending" size={10} color={theme === 'dark' ? '#FBBF24' : '#B45309'} /> PENDING HR DOC APPROVAL
                              </span>
                            ) : (
                              <StatusBadge status={item.status} />
                            )}
                          </div>

                          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{item.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber ? '6px' : '14px' }}>{item.designation}</div>

                          {(item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber) && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
                              color: 'var(--color-primary)',
                              border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #BFDBFE',
                              padding: '3px 10px',
                              borderRadius: '8px',
                              marginBottom: '14px',
                            }}>
                              <AppIcon name="employment" size={12} color="var(--color-primary)" />
                              <span>Plantilla: <strong>{item.plantillaItemNumber || item.scoreDetailsJson?.plantillaItemNumber}</strong></span>
                            </div>
                          )}

                          <div style={{ background: 'var(--color-bg-card)', padding: '12px 14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>AO Initial Rating:</span>
                              <span style={{ color: '#059669', fontWeight: 700 }}>{item.initialTotalScore > 0 ? `${item.initialTotalScore} / 100` : 'Pending AO'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>HR Board Final Score:</span>
                              <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{item.finalTotalScore > 0 ? `+${item.finalTotalScore} pts` : 'Pending HR'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Combined Overall Total:</span>
                              <span style={{ color: 'var(--color-text-primary)', fontWeight: 800 }}>{item.overallTotalScore} pts</span>
                            </div>
                          </div>

                          {isSelectedPendingDocs && item.transactionId && (
                            <div style={{ background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE' }}>
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
                              style={{ fontSize: '0.75rem', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', flex: 1, borderRadius: '9999px', fontWeight: 700 }}
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
                                      fontSize: '0.75rem',
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
                                      fontSize: '0.6875rem',
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
                                    fontSize: '0.75rem',
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
                                fontSize: '0.6875rem',
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
      {showAoModal && selectedAppForModal && (
        <ModalOverlay onDismiss={() => setShowAoModal(false)} className="modal-overlay">
          <div className="modal animate-scale-in" style={{ maxWidth: '840px', width: 'calc(100vw - 32px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                    Stage 1 • Administrative Officer II (AO II)
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                    DepEd Order No. 007, s. 2023 Guidelines
                  </span>
                </div>
                <h3 className="modal-title" style={{ color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>
                  <AppIcon name="checklist" size={18} color="var(--color-primary)" />
                  Requirements Completeness Verification (Annex C)
                </h3>
              </div>
              <button className="modal-close" onClick={() => setShowAoModal(false)} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', width: '32px', height: '32px', borderRadius: '8px', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <form onSubmit={handleSubmitAoRating} style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Applicant Header Information Card */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                fontSize: '0.8125rem',
              }}>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>Name of Applicant</span>
                  <strong style={{ color: 'var(--color-text-primary)', fontSize: '0.9375rem' }}>{selectedAppForModal.name}</strong>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>ID: {selectedAppForModal.employeeId}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>Position Applied For</span>
                  <strong style={{ color: 'var(--color-primary)' }}>{selectedCycle?.name || selectedAppForModal.designation || 'Teacher Position'}</strong>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>Track: {modalTrack === 'NON_TEACHING' ? 'Non-Teaching' : 'Teaching'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>Office / School Unit</span>
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{selectedAppForModal.station || selectedCycle?.rulesConfigurationJson?.officeUnit || 'Division of Koronadal City'}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'block' }}>Region XII</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>Application Code</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)', display: 'inline-block' }}>
                    {selectedAppForModal.scoreDetailsJson?.applicantNumber || selectedAppForModal.scoreDetailsJson?.annexCChecklist?.applicationCode || `APP-${String(selectedAppForModal.id).padStart(4, '0')}`}
                  </span>
                </div>
              </div>

              {/* Checklist Action Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Annex C Documentary Requirements Checklist ({reqVerificationItems.length} items)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReqVerificationItems(prev => prev.map(it => ({
                      ...it,
                      status: it.submitted ? 'VERIFIED' : (it.isMandatory ? 'INCOMPLETE' : 'NOT_APPLICABLE'),
                    })));
                    setReqCompletenessStatus('COMPLETE');
                  }}
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    color: 'var(--color-primary)',
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  ✓ Mark Submitted as Verified
                </button>
              </div>

              {/* Checklist Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {reqVerificationItems.map((item, idx) => {
                  const isVerified = item.status === 'VERIFIED';
                  const isIncomplete = item.status === 'INCOMPLETE';
                  const isNA = item.status === 'NOT_APPLICABLE';

                  return (
                    <div
                      key={item.code}
                      style={{
                        background: 'var(--color-bg-card)',
                        border: isIncomplete
                          ? '1.5px solid #F87171'
                          : isVerified
                            ? '1.5px solid rgba(16, 185, 129, 0.4)'
                            : '1px solid var(--color-border)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              background: 'var(--color-bg-tertiary)',
                              color: 'var(--color-primary)',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid var(--color-border)',
                            }}>
                              {item.code}
                            </span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              {item.title}
                            </span>
                            {item.isMandatory ? (
                              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#DC2626', background: theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#FEE2E2', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
                                Mandatory
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                                If Applicable
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', margin: '0 0 6px 0', lineHeight: 1.35 }}>
                            {item.description}
                          </p>

                          {/* Attached Document Reference Indicator */}
                          {item.submitted || item.documentName ? (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.6875rem',
                              background: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: theme === 'dark' ? '#34D399' : '#059669',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: 600,
                            }}>
                              <AppIcon name="document" size={12} color={theme === 'dark' ? '#34D399' : '#059669'} />
                              <span>Attached: {item.documentName || `${item.title}.pdf`}</span>
                              {item.personnelDocumentId && (
                                <a
                                  href={`${apiClient.defaults.baseURL || '/api/v1'}/personnel/documents/${item.personnelDocumentId}/file`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    marginLeft: '4px',
                                    color: 'var(--color-primary)',
                                    textDecoration: 'underline',
                                    fontWeight: 700,
                                  }}
                                >
                                  View
                                </a>
                              )}
                            </div>
                          ) : (
                            <span style={{
                              fontSize: '0.6875rem',
                              color: item.isMandatory ? '#DC2626' : 'var(--color-text-muted)',
                              fontStyle: 'italic',
                              display: 'inline-block',
                            }}>
                              {item.isMandatory ? '⚠️ No document attached by applicant' : 'No document attached'}
                            </span>
                          )}
                        </div>

                        {/* Status Selection Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setReqVerificationItems(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], status: 'VERIFIED' };
                                return next;
                              });
                            }}
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: isVerified ? '1.5px solid #10B981' : '1px solid var(--color-border)',
                              background: isVerified ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5') : 'var(--color-bg-tertiary)',
                              color: isVerified ? (theme === 'dark' ? '#34D399' : '#059669') : 'var(--color-text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Verified
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReqVerificationItems(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], status: 'INCOMPLETE' };
                                return next;
                              });
                              setReqCompletenessStatus('INCOMPLETE');
                            }}
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: isIncomplete ? '1.5px solid #EF4444' : '1px solid var(--color-border)',
                              background: isIncomplete ? (theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2') : 'var(--color-bg-tertiary)',
                              color: isIncomplete ? (theme === 'dark' ? '#F87171' : '#DC2626') : 'var(--color-text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            ✗ Deficient
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReqVerificationItems(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], status: 'NOT_APPLICABLE' };
                                return next;
                              });
                            }}
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: isNA ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                              background: isNA ? (theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF') : 'var(--color-bg-tertiary)',
                              color: isNA ? 'var(--color-primary)' : 'var(--color-text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            N/A
                          </button>
                        </div>
                      </div>

                      {/* Optional Item-specific deficiency remark */}
                      {isIncomplete && (
                        <input
                          aria-label={`Deficiency remark for item ${item.code}`}
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', borderColor: '#FCA5A5' }}
                          placeholder={`Specify deficiency for item (${item.code})...`}
                          value={item.remarks || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReqVerificationItems(prev => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], remarks: val };
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Omnibus Sworn Statement Status */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AppIcon name="check" size={16} color="#059669" />
                  <div>
                    <strong style={{ fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>
                      Omnibus Sworn Statement & Data Privacy Consent
                    </strong>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                      Certified and digitally signed under Republic Act No. 8792 (E-Commerce Act of 2000)
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.3)' }}>
                  Acknowledged
                </span>
              </div>

              {/* AO II Overall Finding & Remarks */}
              <div style={{
                background: reqCompletenessStatus === 'COMPLETE'
                  ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5')
                  : (theme === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2'),
                border: reqCompletenessStatus === 'COMPLETE'
                  ? '1.5px solid rgba(16, 185, 129, 0.3)'
                  : '1.5px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '14px 16px',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: reqCompletenessStatus === 'COMPLETE' ? '#059669' : '#DC2626', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  AO II Overall Requirements Verification Finding
                </span>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="reqFinding"
                      value="COMPLETE"
                      checked={reqCompletenessStatus === 'COMPLETE'}
                      onChange={() => setReqCompletenessStatus('COMPLETE')}
                    />
                    <span style={{ color: '#059669' }}>Complete & Verified</span> (Endorsed for HRMPSB Deliberation)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="reqFinding"
                      value="INCOMPLETE"
                      checked={reqCompletenessStatus === 'INCOMPLETE'}
                      onChange={() => setReqCompletenessStatus('INCOMPLETE')}
                    />
                    <span style={{ color: '#DC2626' }}>Incomplete / Deficient</span> (Flagged for Deficiency)
                  </label>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    AO II Verification Remarks / Notes for HRMPSB
                  </label>
                  <textarea
                    aria-label="AO II Verification Remarks / Notes for HRMPSB"
                    className="form-input"
                    rows={2}
                    value={reqVerificationRemarks}
                    onChange={(e) => setReqVerificationRemarks(e.target.value)}
                    placeholder={reqCompletenessStatus === 'COMPLETE' ? 'All documentary requirements verified complete and authentic...' : 'Specify missing or deficient requirements...'}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="submit" disabled={savingAoRating.pending}
                  className="btn btn-primary"
                  style={{
                    background: reqCompletenessStatus === 'COMPLETE' ? '#059669' : '#DC2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '9px 22px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  <AppIcon name="check" size={14} color="#ffffff" />
                  {reqCompletenessStatus === 'COMPLETE' ? 'Confirm Requirements Complete' : 'Record Deficiencies'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

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
                    fontSize: '0.6875rem',
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
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
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
                    <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      {selectedAppForModal.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                      {selectedAppForModal.designation || 'Plantilla Candidate'} • <span style={{ color: 'var(--color-text-secondary)' }}>{selectedAppForModal.station || 'Division of Koronadal City'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: '6px', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE', fontWeight: 600 }}>
                    {selectedAppForModal.applicantNumber || `APP-${String(selectedAppForModal.id).padStart(4, '0')}`}
                  </span>
                  <span style={{ fontSize: '0.75rem', background: modalTrack === 'NON_TEACHING' ? (theme === 'dark' ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB') : (theme === 'dark' ? 'rgba(5, 150, 105, 0.15)' : '#ECFDF5'), color: modalTrack === 'NON_TEACHING' ? '#D97706' : '#059669', padding: '4px 10px', borderRadius: '6px', border: modalTrack === 'NON_TEACHING' ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid rgba(5, 150, 105, 0.3)', fontWeight: 700 }}>
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
                      <div style={{ fontSize: '0.6875rem', color: isReqComplete ? '#059669' : '#D97706', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                        Stage 1 • AO II Documentary Requirements Check
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {reqCheck?.remarks || (isReqComplete ? 'All Annex C documentary requirements verified complete and authentic.' : isReqDeficient ? 'Requirements incomplete / deficient.' : 'Awaiting AO II completeness verification.')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: isReqComplete ? (theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7') : (theme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7'),
                        color: isReqComplete ? (theme === 'dark' ? '#34D399' : '#15803D') : (theme === 'dark' ? '#FBBF24' : '#D97706'),
                        fontSize: '0.75rem',
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
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  HRMPSB Deliberation • Basic Qualification Criteria ({modalTrack === 'NON_TEACHING' ? '50.00 pts Max' : '60.00 pts Max'})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Education (Max 10)</label>
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
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Training (Max 10)</label>
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
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Experience (Max 10)</label>
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
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
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
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Accomplishments (Max 5)</label>
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
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>App of Education (Max 15)</label>
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
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>App of L&D (Max 10)</label>
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
                    <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Teaching Merit Criteria (40.00 pts Max)
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                      Evaluated via Classroom Observation Tool (COT) & Portfolio MOVs
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Criteria 1: PPST COIs Demo Teaching (25 pts) */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                            1. PPST COIs — Demonstration Teaching / Classroom Observation
                          </label>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                            Max 25.00 pts (COT Rubric Level 3-7 ratings calibrated to 25 pts)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(25)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.4)', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', cursor: 'pointer', fontWeight: 700 }}>Max (25)</button>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(23.5)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>23.50</button>
                          <button type="button" onClick={() => setHrmoPpstCoiScore(20)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>20.00</button>
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
                            style={{ width: '85px', textAlign: 'center', fontWeight: 800, color: '#059669', fontSize: '0.9375rem', fontFamily: 'var(--font-mono)' }}
                            value={hrmoPpstCoiScore}
                            onChange={(e) => setHrmoPpstCoiScore(Number(e.target.value))}
                            required
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ 25</span>
                        </div>
                      </div>
                    </div>

                    {/* Criteria 2: PPST NCOIs Portfolio & BEI (15 pts) */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                            2. PPST NCOIs — Portfolio Annotation & Behavioral Event Interview (BEI)
                          </label>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                            Max 15.00 pts (Means of Verification, Portfolio Evidence & Interview)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(15)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(5, 150, 105, 0.4)', background: theme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7', color: theme === 'dark' ? '#34D399' : '#15803D', cursor: 'pointer', fontWeight: 700 }}>Max (15)</button>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(13.5)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>13.50</button>
                          <button type="button" onClick={() => setHrmoPpstNcoiScore(12)} style={{ fontSize: '0.6875rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>12.00</button>
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
                            style={{ width: '85px', textAlign: 'center', fontWeight: 800, color: '#059669', fontSize: '0.9375rem', fontFamily: 'var(--font-mono)' }}
                            value={hrmoPpstNcoiScore}
                            onChange={(e) => setHrmoPpstNcoiScore(Number(e.target.value))}
                            required
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ 15</span>
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
                    <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Non-Teaching Potential Criteria (20.00 pts Max)
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                      Written Exam + Behavioral Event Interview + Skills Test
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px' }}>
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px' }}>
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Written Examination (Max 5)</label>
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
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>BEI Interview (Max 5)</label>
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
                      <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Skills Test (Max 10)</label>
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
                        <div style={{ fontSize: '0.6875rem', color: '#059669', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                          HRMPSB Deliberated Comparative Assessment Result (CAR) Total
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          {modalTrack === 'NON_TEACHING'
                            ? `Education (${edu}) + Training (${train}) + Experience (${exp}) + Perf (${perf}) + Accomp (${hrmoAccomplishmentsScore}) + AppEdu (${hrmoAppEduScore}) + AppLD (${hrmoAppLdScore}) + Potential (${(Number(hrmoWrittenScore) + Number(hrmoBeiScore) + Number(hrmoSkillsScore)).toFixed(1)})`
                            : `Education (${edu}) + Training (${train}) + Experience (${exp}) + Perf (${perf}) + PPST COT (${hrmoPpstCoiScore}) + Portfolio (${hrmoPpstNcoiScore})`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                          {combined.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 700 }}>/ 100.00 pts</span>
                      </div>
                    </div>

                    <div style={{ width: '100%', height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ width: `${Math.min(100, combined)}%`, height: '100%', background: isOutstanding ? 'linear-gradient(90deg, #10b981 0%, #d97706 100%)' : 'linear-gradient(90deg, #2563eb 0%, #10b981 100%)', borderRadius: '4px', transition: 'width 0.3s ease' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
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
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AppIcon name="approvals" size={14} color="var(--color-primary)" />
                  Official DepEd CAR Governance & Appointing Fields
                </div>

                {/* BI, Appointment, Probation Grid */}
                <div className="hrmo-governance-grid" style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-3, 1fr 1fr 1fr)', gap: '14px', marginBottom: '14px', minWidth: 0 }}>
                  {/* Background Investigation Segment */}
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      1. Background Investigation (BI)
                    </label>
                    <div className="hrmo-bi-options" style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setForBackgroundInvestigation('YES')}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
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
                          fontSize: '0.75rem',
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
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      2. Probation Period
                    </label>
                    <select
                      aria-label="2. Probation Period"
                      className="form-input"
                      value={forProbation}
                      onChange={(e) => setForProbation(e.target.value)}
                      style={{ fontSize: '0.75rem', fontWeight: 600, width: '100%', minWidth: 0 }}
                    >
                      <option value="6 months">6 months (Sec. F of DO 019, s. 2022)</option>
                      <option value="1 year">1 year (Sec. F of DO 019, s. 2022)</option>
                      <option value="Not Applicable">Not Applicable / Permanent</option>
                    </select>
                  </div>

                  {/* For Appointment Status */}
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      3. For Appointment Status
                    </label>
                    <input
                      aria-label="3. For Appointment Status"
                      type="text"
                      className="form-input"
                      value={forAppointment}
                      onChange={(e) => setForAppointment(e.target.value)}
                      placeholder="e.g. Recommended for Appointment"
                      style={{ fontSize: '0.75rem' }}
                    />
                  </div>
                </div>

                {/* Remarks & Quick Preset Prompts */}
                <div>
                  <div className="hrmo-remarks-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0 }}>
                      4. Board Final Remarks / Deliberation Summary
                    </label>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setHrmoRemarks('Demonstrated proficient pedagogical mastery during demonstration teaching; recommended for plantilla appointment.')}
                        style={{ fontSize: '0.625rem', padding: '3px 8px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #BFDBFE', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 700 }}
                      >
                        + Superior Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => setHrmoRemarks('Meets all DepEd CAR standards with complete authenticated credentials.')}
                        style={{ fontSize: '0.625rem', padding: '3px 8px', borderRadius: '6px', background: theme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF', border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #BFDBFE', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 700 }}
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
                    style={{ fontSize: '0.75rem', resize: 'vertical' }}
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
                  style={{ fontSize: '0.8125rem', borderRadius: '9999px', fontWeight: 700 }}
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
                    fontSize: '0.875rem',
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
                background: 'linear-gradient(135deg, #2563EB 0%, #10B981 100%)',
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
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  Civil Service Form No. 212 (Personal Data Sheet) — Complete applicant information for onboarding & merit ranking
                </p>
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
                  fontSize: '15px',
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
                  background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
                  border: theme === 'dark' ? '1.5px solid rgba(59, 130, 246, 0.35)' : '1.5px solid #BFDBFE',
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
                      color: '#2563EB',
                    }}>
                      <AppIcon name="plantilla" size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2563EB' }}>
                        Assigned Plantilla Item & School Station (Decided)
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                        {selectedCycle?.rulesConfigurationJson?.targetPosition || selectedCycle?.name || 'Teacher I'}
                        {cyclePlantillaNo ? ` • Plantilla #${cyclePlantillaNo}` : ''}
                      </div>
                      <div style={{ fontSize: '0.78125rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Station: {selectedCycle?.rulesConfigurationJson?.school || selectedCycle?.rulesConfigurationJson?.schoolStation || 'SDO Koronadal City'}</span>
                        <span>•</span>
                        <span>District: {selectedCycle?.rulesConfigurationJson?.district || selectedCycle?.rulesConfigurationJson?.designatedDistrict || 'District 1'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Cycle Capacity
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--color-primary)' }}>
                      {submittedApps.length} / {selectedCycle?.rulesConfigurationJson?.maxApplicants || 10} Registered
                    </div>
                  </div>
                </div>

                {/* Section 1: Personal Information (PDS Form 212) */}
                <div>
                  <div style={{
                    fontSize: '0.75rem',
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                    fontSize: '0.75rem',
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                      <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
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
                    fontSize: '0.75rem',
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
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        System Candidate ID
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.9375rem', marginTop: '2px' }}>
                        APP-2026-XXXX (Candidate Applicant)
                      </div>
                      <div style={{ fontSize: '0.78125rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        No portal account or login credentials issued during evaluation.
                      </div>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <AppIcon name="clock" size={12} /> Evaluation Candidate
                    </span>
                  </div>
                </div>

                {/* Section 4: Account Creation & Onboarding Policy */}
                <div style={{
                  background: theme === 'dark' ? 'rgba(37, 99, 235, 0.08)' : '#EFF6FF',
                  border: theme === 'dark' ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid #BFDBFE',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}>
                  <div style={{ color: '#2563EB', marginTop: '2px' }}>
                    <AppIcon name="checklist" size={18} />
                  </div>
                  <div style={{ fontSize: '0.8125rem', lineHeight: '1.45', color: 'var(--color-text-secondary)' }}>
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
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
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
          <div className="modal animate-scale-in" style={{
            maxWidth: '780px',
            width: '92vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }}>
            <div className="modal-header" style={{
              background: 'var(--color-bg-tertiary)',
              borderBottom: '1px solid var(--color-border)',
              padding: '16px 24px',
              borderRadius: '16px 16px 0 0',
              flexShrink: 0,
            }}>
              <h3 className="modal-title" style={{ color: 'var(--color-text-primary)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AppIcon name="new-transaction" size={18} color="#2563EB" />
                Create New Promotion Cycle
              </h3>
              <button className="modal-close" onClick={() => setShowConfigModal(false)} style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', width: '32px', height: '32px', borderRadius: '8px', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <form onSubmit={handleCreateCycle} style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* TOP SECTION: Number of Applicants & Number of Chosen Applicants (Vacancies) */}
              <div style={{
                background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
                border: theme === 'dark' ? '1.5px solid rgba(59, 130, 246, 0.4)' : '1.5px solid #BFDBFE',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AppIcon name="promotions" size={15} color="#ffffff" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                        Applicant Capacity & Vacant Plantilla Quota
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                        Input total applicant capacity and how many applicants will be chosen for promotion.
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 800, background: 'var(--color-primary)', color: '#ffffff', padding: '3px 10px', borderRadius: '9999px' }}>
                    Top Priority
                  </span>
                </div>

                {/* 2-Column Grid at Top: Max Applicants Capacity & Applicants to be Chosen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '12px', marginBottom: '14px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AppIcon name="users" size={13} color="var(--color-primary)" />
                      Max Applicants Capacity <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      aria-label="Max Applicants Capacity"
                      type="number"
                      min={1} max={500}
                      className="form-input"
                      placeholder="e.g. 10"
                      value={newMaxApplicants}
                      onChange={(e) => handleMaxApplicantsChange(e.target.value)}
                      onBlur={() => {
                        if (newMaxApplicants === '' || Number(newMaxApplicants) < 1) {
                          setNewMaxApplicants(10);
                        }
                      }}
                      style={{ fontWeight: 700, fontSize: '0.9375rem' }}
                      required
                    />
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      Total applicant submissions allowed before pool closes.
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AppIcon name="approved" size={13} color="#10B981" />
                      Applicants That Will Be Chosen <span style={{ color: 'var(--color-danger)' }}>*</span>
                    </label>
                    <input
                      aria-label="Applicants That Will Be Chosen"
                      type="number"
                      min={1} max={50}
                      className="form-input"
                      placeholder="e.g. 5"
                      value={newVacantPositions}
                      onChange={(e) => handleVacantPositionsChange(e.target.value)}
                      onBlur={() => {
                        if (newVacantPositions === '' || Number(newVacantPositions) < 1) {
                          handleVacantPositionsChange(1);
                        }
                      }}
                      style={{ fontWeight: 700, fontSize: '0.9375rem', borderColor: '#10B981' }}
                      required
                    />
                    <div style={{ fontSize: '0.6875rem', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
                      {Number(newVacantPositions) || 1} applicant{(Number(newVacantPositions) || 1) > 1 ? 's' : ''} to be promoted ({Number(newVacantPositions) || 1} plantilla slot{(Number(newVacantPositions) || 1) > 1 ? 's' : ''} below).
                    </div>
                  </div>
                </div>

                {/* Dynamic Plantilla Input Slots (If N applicants chosen => N plantillas inputted) */}
                <div style={{ paddingTop: '12px', borderTop: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #DBEAFE' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AppIcon name="employment" size={14} color="var(--color-primary)" />
                      Designated Vacant Plantilla Items ({Number(newVacantPositions) || 1} Required)
                    </label>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {designatedPlantillas.filter(Boolean).length} of {Number(newVacantPositions) || 1} Selected
                    </span>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                    Because <strong>{Number(newVacantPositions) || 1} applicant{(Number(newVacantPositions) || 1) > 1 ? 's' : ''}</strong> will be chosen, input/select <strong>{Number(newVacantPositions) || 1} vacant plantilla post{(Number(newVacantPositions) || 1) > 1 ? 's' : ''}</strong>. Chosen personnels will be assigned to these plantillas.
                  </div>

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

                      return (
                        <div
                          key={idx}
                          style={{
                            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.65)' : '#ffffff',
                            border: currentValue
                              ? (theme === 'dark' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid #BFDBFE')
                              : (theme === 'dark' ? '1px dashed rgba(255, 255, 255, 0.15)' : '1px dashed #CBD5E1'),
                            borderRadius: '12px',
                            padding: '12px 14px',
                            transition: 'all 0.2s ease',
                            boxShadow: currentValue
                              ? (theme === 'dark' ? '0 4px 14px rgba(0, 0, 0, 0.35)' : '0 2px 8px rgba(59, 130, 246, 0.08)')
                              : 'none',
                          }}
                        >
                          {/* Slot Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: currentValue
                                  ? 'linear-gradient(135deg, #10B981, #059669)'
                                  : (theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'),
                                color: currentValue ? '#ffffff' : 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.6875rem',
                                fontWeight: 900,
                                boxShadow: currentValue ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                              }}>
                                {currentValue ? <Check size={12} strokeWidth={3} /> : idx + 1}
                              </span>
                              <div>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                  Plantilla Post #{idx + 1}
                                </span>
                                {isFirst && (
                                  <span style={{
                                    marginLeft: '8px',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    color: 'var(--color-primary)',
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    padding: '2px 7px',
                                    borderRadius: '9999px',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                  }}>
                                    Primary Post • Auto-Sync
                                  </span>
                                )}
                              </div>
                            </div>

                            {currentValue && !isPickerOpen && (
                              <span style={{
                                fontSize: '0.6875rem',
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
                              background: theme === 'dark' ? 'rgba(0, 0, 0, 0.25)' : '#F8FAFC',
                              border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #E2E8F0',
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
                                    <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                      {selectedPlantilla.positionTitle}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.6875rem',
                                        fontWeight: 800,
                                        background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
                                        color: 'var(--color-text-primary)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                      }}>
                                        {selectedPlantilla.itemNumber}
                                      </span>
                                      <span style={{
                                        fontSize: '0.6875rem',
                                        fontWeight: 700,
                                        color: '#0284C7',
                                        background: 'rgba(2, 132, 199, 0.1)',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                      }}>
                                        Salary Grade {selectedPlantilla.salaryGrade}
                                      </span>
                                      <span style={{
                                        fontSize: '0.6875rem',
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
                                      fontSize: '0.6875rem',
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
                                      fontSize: '0.6875rem',
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
                                fontSize: '0.6875rem',
                                color: 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #EEF2F6',
                                paddingTop: '6px',
                                flexWrap: 'wrap',
                              }}>
                                <span>🏫 <strong>School / Station:</strong> {selectedPlantilla.department || 'Schools Division Office'}</span>
                                <span>📍 <strong>Division:</strong> {selectedPlantilla.division || 'CSD Koronadal City'}</span>
                              </div>
                            </div>
                          )}

                          {/* Case B: Picker is OPEN -> Modern Searchable Popover & Catalog */}
                          {isPickerOpen && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              background: theme === 'dark' ? '#0F172A' : '#ffffff',
                              border: '1px solid var(--color-primary)',
                              borderRadius: '10px',
                              padding: '12px',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                              marginTop: '4px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                    fontSize: '0.6875rem',
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
                                      fontSize: '0.75rem',
                                      border: '1px solid var(--color-border)',
                                      background: theme === 'dark' ? 'rgba(0, 0, 0, 0.4)' : '#F8FAFC',
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
                                        fontSize: '0.6875rem',
                                        fontWeight: plantillaPickerTrack === trackOption ? 800 : 600,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: plantillaPickerTrack === trackOption
                                          ? 'var(--color-primary)'
                                          : (theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'),
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
                                      background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                                      border: '1px solid var(--color-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginBottom: '10px',
                                    }}>
                                      <Building2 size={24} style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                                      No vacant plantilla items found
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
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
                                            : (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0'),
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
                                          if (!isItemChosen) e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0';
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                                {p.positionTitle}
                                              </span>
                                              <span style={{
                                                fontSize: '0.625rem',
                                                fontWeight: 800,
                                                color: '#0284C7',
                                                background: 'rgba(2, 132, 199, 0.1)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                              }}>
                                                SG {p.salaryGrade}
                                              </span>
                                              <span style={{
                                                fontSize: '0.625rem',
                                                fontWeight: 800,
                                                color: '#10B981',
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                              }}>
                                                VACANT
                                              </span>
                                            </div>
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                              <strong style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{p.itemNumber}</strong> • {p.department} ({p.division || 'SDO Koronadal'})
                                            </div>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          className={`btn btn-sm ${isItemChosen ? 'btn-success' : 'btn-primary'}`}
                                          style={{
                                            fontSize: '0.6875rem',
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
                                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
                                border: theme === 'dark' ? '1px dashed rgba(59, 130, 246, 0.3)' : '1px dashed #93C5FD',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                e.currentTarget.style.background = theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#93C5FD';
                                e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC';
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
                                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                                    Select Vacant Plantilla Item for Post #{idx + 1}
                                  </div>
                                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                                    Click to browse {availableItems.length} vacant plantilla item{availableItems.length !== 1 ? 's' : ''} available for allocation
                                  </div>
                                </div>
                              </div>

                              <span
                                className="btn btn-primary btn-sm"
                                style={{
                                  fontSize: '0.75rem',
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
              </div>

              {/* Auto-Synchronized Plantilla Badge & Preview Strip */}
              {linkedPlantilla ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: theme === 'dark' ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '18px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={18} color="#10B981" />
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#059669' }}>
                        Plantilla Position & Jurisdiction Auto-Synchronized
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        Position: <strong style={{ color: 'var(--color-text-primary)' }}>{linkedPlantilla.positionTitle}</strong> (SG {linkedPlantilla.salaryGrade}) • District: <strong style={{ color: 'var(--color-text-primary)' }}>{newCycleDistrict}</strong> • Station: <strong style={{ color: 'var(--color-text-primary)' }}>{linkedPlantilla.department || 'All Schools in District'}</strong> • Track: <strong style={{ color: '#059669' }}>{newCycleTrack === 'TEACHING' ? 'Teaching Track (100 pts)' : 'Non-Teaching Track (100 pts)'}</strong>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.15)', padding: '3px 8px', borderRadius: '6px' }}>
                    ● Plantilla Locked
                  </span>
                </div>
              ) : (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  marginBottom: '18px',
                  fontSize: '0.75rem',
                  color: theme === 'dark' ? '#FBBF24' : '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <AlertCircle size={15} />
                  <span>Please select a vacant plantilla item above. Position, district, and track will automatically synchronize.</span>
                </div>
              )}

              {/* Cycle Information & Schedule (Spacious 2-Column Grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Cycle Title <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input aria-label="Cycle Title"
                    type="text"
                    className="form-input"
                    placeholder={newCycleTrack === 'TEACHING' ? "e.g. 2026 Division Master Teacher Promotion" : "e.g. 2026 Administrative Officer Promotion"}
                    value={newCycleName}
                    onChange={(e) => setNewCycleName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Promotion Type
                  </label>
                  <select
                    aria-label="Promotion Type"
                    className="form-input"
                    value={newCycleType}
                    onChange={(e) => setNewCycleType(e.target.value)}
                  >
                    <option value="NATURAL_VACANCY">Natural Vacancy (DepEd DO 19)</option>
                    <option value="EXECUTIVE_CLASS">ECP Reclassification (DepEd DO 24)</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Application Start Date
                  </label>
                  <input
                    aria-label="Application Start Date"
                    type="date"
                    className="form-input"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Application Deadline / End Date
                  </label>
                  <input
                    aria-label="Application Deadline / End Date"
                    type="date"
                    className="form-input"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Initial Cycle Status
                  </label>
                  <select
                    aria-label="Initial Cycle Status"
                    className="form-input"
                    value={newCycleStatus}
                    onChange={(e) => setNewCycleStatus(e.target.value)}
                  >
                    <option value="ACTIVE">ACTIVE (Open for Personnel Applications)</option>
                    <option value="PLANNING">PLANNING (Upcoming / Opening Soon)</option>
                    <option value="COMPLETED">COMPLETED (Closed)</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowConfigModal(false)} style={{ borderRadius: '9999px', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={creatingCycle.pending} className="btn btn-primary" style={{ background: 'var(--color-primary)', color: '#ffffff', border: 'none', borderRadius: '9999px', padding: '9px 20px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                  <AppIcon name="new-transaction" size={14} color="#ffffff" /> Create Promotion Cycle
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 5: APPLICANT SCORE BREAKDOWN & CAR DOSSIER INFO */}
      {showApplicantInfoModal && selectedApplicantInfo && (() => {
        const isTeachingTrack = isCycleTeaching || selectedApplicantInfo.track === 'TEACHING' || selectedCycle?.rulesConfigurationJson?.track === 'TEACHING';
        const finalRating = selectedApplicantInfo.scoreDetailsJson?.finalRating || {};
        const initialRating = selectedApplicantInfo.scoreDetailsJson?.initialRating || {};
        const reqCheck = selectedApplicantInfo.scoreDetailsJson?.requirementsCheck;
        const isReqComplete = reqCheck?.status === 'COMPLETE' || selectedApplicantInfo.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_VERIFIED';
        const isReqDeficient = reqCheck?.status === 'INCOMPLETE' || selectedApplicantInfo.scoreDetailsJson?.stageStatus === 'REQUIREMENTS_DEFICIENT';
        
        // Qualification criteria deliberated by HR / HRMPSB
        const edu = Number(finalRating.educationScore ?? selectedApplicantInfo.educationScore ?? initialRating.educationScore ?? 0);
        const train = Number(finalRating.trainingScore ?? selectedApplicantInfo.trainingScore ?? initialRating.trainingScore ?? 0);
        const exp = Number(finalRating.experienceScore ?? selectedApplicantInfo.experienceScore ?? initialRating.experienceScore ?? 0);
        const perf = Number(finalRating.performanceScore ?? selectedApplicantInfo.performanceScore ?? initialRating.performanceScore ?? 0);
        
        // Non-Teaching HR Criteria
        const accomp = Number(finalRating.outstandingAccomplishmentsScore ?? selectedApplicantInfo.outstandingAccomplishmentsScore ?? initialRating.outstandingAccomplishmentsScore ?? 0);
        const appEdu = Number(finalRating.applicationOfEducationScore ?? selectedApplicantInfo.applicationOfEducationScore ?? initialRating.applicationOfEducationScore ?? 0);
        const appLd = Number(finalRating.applicationOfLdScore ?? selectedApplicantInfo.applicationOfLdScore ?? initialRating.applicationOfLdScore ?? 0);

        // Track Criteria scored by HRMO
        const coi = Number(finalRating.ppstCoiScore ?? selectedApplicantInfo.ppstCoiScore ?? 0);
        const ncoi = Number(finalRating.ppstNcoiScore ?? selectedApplicantInfo.ppstNcoiScore ?? 0);
        const written = Number(finalRating.potentialWrittenScore ?? selectedApplicantInfo.potentialWrittenScore ?? 0);
        const bei = Number(finalRating.potentialBeiScore ?? selectedApplicantInfo.potentialBeiScore ?? 0);
        const skills = Number(finalRating.potentialSkillsScore ?? selectedApplicantInfo.potentialSkillsScore ?? 0);

        const basicSubtotal = isTeachingTrack ? (edu + train + exp + perf) : (edu + train + exp + perf + accomp + appEdu + appLd);
        const basicMax = isTeachingTrack ? 60 : 80;

        const trackSubtotal = isTeachingTrack ? (coi + ncoi) : (written + bei + skills);
        const trackMax = isTeachingTrack ? 40 : 20;

        const hasBeenDeliberated = Boolean(
          selectedApplicantInfo.hasHrmoRating ||
          finalRating.overallTotalScore !== undefined ||
          finalRating.finalTotalScore !== undefined ||
          (selectedApplicantInfo.overallTotalScore && Number(selectedApplicantInfo.overallTotalScore) > 0)
        );

        const totalScore = Number(finalRating.overallTotalScore ?? selectedApplicantInfo.overallTotalScore ?? (basicSubtotal + trackSubtotal));
        const rank = selectedApplicantInfo.rank || 1;

        const biStatus = selectedApplicantInfo.forBackgroundInvestigation || selectedApplicantInfo.scoreDetailsJson?.forBackgroundInvestigation || 'YES';
        const appointmentStatus = selectedApplicantInfo.forAppointment || selectedApplicantInfo.scoreDetailsJson?.forAppointment || 'Recommended for Appointment';
        const probationPeriod = selectedApplicantInfo.forProbation || selectedApplicantInfo.scoreDetailsJson?.forProbation || '6 months';
        const aoRemarksText = reqCheck?.remarks || selectedApplicantInfo.initialDetails?.aoRemarks || initialRating.aoRemarks || 'Documentary requirements verified against Annex C standards.';
        const hrmoRemarksText = selectedApplicantInfo.remarks || selectedApplicantInfo.finalDetails?.hrmoRemarks || finalRating.hrmoRemarks || 'Deliberated and qualified by Merit Promotion Selection Board.';
        const isDark = theme === 'dark';
        const primaryActionBg = 'var(--color-primary)';
        const primaryActionColor = '#FFFFFF';

        return (
          <ModalOverlay onDismiss={() => setShowApplicantInfoModal(false)}
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 1060,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setShowApplicantInfoModal(false)}
          >
            <div
              className="animate-scale-in"
              style={{
                maxWidth: '740px',
                width: '100%',
                borderRadius: '20px',
                backgroundColor: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
                        color: isDark ? '#60A5FA' : '#2563EB',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #BFDBFE',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AppIcon name="checklist" size={12} color={isDark ? '#60A5FA' : '#2563EB'} />
                      Comparative Assessment Result (CAR) Score Breakdown
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      DepEd SDO Koronadal City
                    </span>
                  </div>
                  <h3
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                      lineHeight: 1.25,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Candidate Total Score Breakdown & Evaluator Dossier
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowApplicantInfoModal(false)}
                  aria-label="Close modal"
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
                    lineHeight: 1,
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div
                style={{
                  padding: '22px 24px',
                  overflowY: 'auto',
                  flex: '1 1 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  backgroundColor: 'var(--color-bg-card)',
                }}
              >
                {/* Candidate Info Profile Card */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: rank === 1
                          ? 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)'
                          : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '1.125rem',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        flexShrink: 0,
                      }}
                    >
                      {selectedApplicantInfo.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'AP'}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '1.0625rem',
                          fontWeight: 800,
                          color: 'var(--color-text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {selectedApplicantInfo.name}
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            backgroundColor: rank === 1
                              ? (isDark ? 'rgba(217, 119, 6, 0.25)' : '#FEF3C7')
                              : (isDark ? 'rgba(37, 99, 235, 0.25)' : '#EFF6FF'),
                            color: rank === 1
                              ? (isDark ? '#FBBF24' : '#B45309')
                              : (isDark ? '#60A5FA' : '#1E40AF'),
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: rank === 1
                              ? (isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #FCD34D')
                              : (isDark ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid #BFDBFE'),
                            fontWeight: 800,
                          }}
                        >
                          Rank #{rank}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
                        {selectedApplicantInfo.designation || 'Plantilla Candidate'} • <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{selectedApplicantInfo.station || 'Division of Koronadal City'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
                        color: isDark ? '#60A5FA' : '#2563EB',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #BFDBFE',
                        fontWeight: 700,
                      }}
                    >
                      {selectedApplicantInfo.applicantNumber || `APP-${String(selectedApplicantInfo.id).padStart(4, '0')}`}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: isTeachingTrack
                          ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5')
                          : (isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB'),
                        color: isTeachingTrack
                          ? (isDark ? '#34D399' : '#059669')
                          : (isDark ? '#FBBF24' : '#D97706'),
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: isTeachingTrack
                          ? (isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #A7F3D0')
                          : (isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #FDE68A'),
                        fontWeight: 700,
                      }}
                    >
                      {isTeachingTrack ? 'Teaching Track' : 'Non-Teaching Track'}
                    </span>
                  </div>
                </div>

                {/* Master Total Score Hero Banner */}
                <div
                  style={{
                    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.14)' : '#FFFBEB',
                    border: isDark ? '1.5px solid rgba(245, 158, 11, 0.35)' : '1.5px solid #FCD34D',
                    borderRadius: '14px',
                    padding: '18px 22px',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          color: isDark ? '#FBBF24' : '#B45309',
                          textTransform: 'uppercase',
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                        }}
                      >
                        Comparative Assessment Result (CAR) • Official HRMPSB Rating
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        Deliberated Rating (Basic: {basicSubtotal.toFixed(2)} / {basicMax} pts + Track: {trackSubtotal.toFixed(2)} / {trackMax} pts)
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '2rem',
                          fontWeight: 900,
                          color: isDark ? '#FBBF24' : '#B45309',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {totalScore.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                        / 100.00 pts
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, totalScore))}%`,
                        height: '100%',
                        background: totalScore >= 90
                          ? 'linear-gradient(90deg, #059669 0%, #d97706 100%)'
                          : 'linear-gradient(90deg, #2563eb 0%, #059669 100%)',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <span>
                      Qualitative Grade:{' '}
                      <strong
                        style={{
                          color: totalScore >= 90 ? (isDark ? '#34D399' : '#059669') : (isDark ? '#60A5FA' : '#2563EB'),
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {totalScore >= 90 ? (
                          <>
                            <AppIcon name="award" size={13} color={isDark ? '#34D399' : '#059669'} /> Highly Qualified / Superior Merit
                          </>
                        ) : (
                          <>
                            <AppIcon name="check" size={13} color={isDark ? '#60A5FA' : '#2563EB'} /> Qualified for Deliberation
                          </>
                        )}
                      </strong>
                    </span>
                    <span style={{ fontWeight: 600 }}>CAR Passing Threshold: 50.00 pts</span>
                  </div>
                </div>

                {/* Stage 1: AO II Documentary Requirements Check (Annex C) */}
                <div
                  style={{
                    backgroundColor: isReqComplete
                      ? (isDark ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4')
                      : isReqDeficient
                      ? (isDark ? 'rgba(220, 38, 38, 0.08)' : '#FEF2F2')
                      : (isDark ? 'rgba(217, 119, 6, 0.08)' : '#FFFBEB'),
                    border: isReqComplete
                      ? (isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #BBF7D0')
                      : isReqDeficient
                      ? (isDark ? '1px solid rgba(220, 38, 38, 0.25)' : '1px solid #FECACA')
                      : (isDark ? '1px solid rgba(217, 119, 6, 0.25)' : '1px solid #FDE68A'),
                    borderRadius: '14px',
                    padding: '18px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 800,
                        color: isReqComplete
                          ? (isDark ? '#34D399' : '#166534')
                          : isReqDeficient
                          ? (isDark ? '#F87171' : '#B91C1C')
                          : (isDark ? '#FBBF24' : '#B45309'),
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Stage 1 • AO II Documentary Check (Annex C Checklist)
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: isReqComplete ? (isDark ? '#34D399' : '#059669') : isReqDeficient ? '#DC2626' : '#D97706',
                        backgroundColor: isReqComplete
                          ? (isDark ? 'rgba(5, 150, 105, 0.2)' : '#DCFCE7')
                          : isReqDeficient
                          ? (isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2')
                          : (isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7'),
                        padding: '3px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      {isReqComplete ? 'Complete / Verified' : isReqDeficient ? 'Deficient' : 'Pending Verification'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                      gap: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Verified By</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{reqCheck?.verifiedByName || 'Administrative Officer II'}</div>
                    </div>
                    <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Annex C Items</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>11 Items (a to k)</div>
                    </div>
                    <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Omnibus Sworn Statement</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: selectedApplicantInfo.scoreDetailsJson?.annexCChecklist?.applicantInfo?.omnibusSwornStatement ? '#059669' : '#D97706' }}>
                        {selectedApplicantInfo.scoreDetailsJson?.annexCChecklist?.applicantInfo?.omnibusSwornStatement ? 'Certified / Notarized' : 'Pending Certification'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      fontStyle: 'italic',
                      padding: '10px 14px',
                      backgroundColor: 'var(--color-bg-card)',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      borderLeft: isReqComplete ? '3.5px solid #10B981' : isReqDeficient ? '3.5px solid #DC2626' : '3.5px solid #D97706',
                    }}
                  >
                    AO II Verification Remarks: "{aoRemarksText}"
                  </div>
                </div>

                {/* Stage 2: HRMPSB / HR Score Deliberation (100.00 pts Max) */}
                <div
                  style={{
                    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.08)' : '#EFF6FF',
                    border: isDark ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid #BFDBFE',
                    borderRadius: '14px',
                    padding: '18px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 800,
                        color: isDark ? '#60A5FA' : '#1D4ED8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Stage 2 • HRMPSB Qualification Score Deliberation (100.00 pts Max)
                    </div>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 800,
                        color: isDark ? '#60A5FA' : '#2563EB',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Total Deliberated: {totalScore.toFixed(2)} / 100.00 pts
                    </span>
                  </div>

                  {/* Section A: Basic Qualification Criteria deliberated by HR */}
                  <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    A. Basic Qualifications ({basicMax}.00 pts Max) • Subtotal: {basicSubtotal.toFixed(2)} / {basicMax}.00
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    {[
                      { label: 'Education (10)', score: edu, max: 10 },
                      { label: 'Training (10)', score: train, max: 10 },
                      { label: 'Experience (10)', score: exp, max: 10 },
                      { label: `Performance (${isTeachingTrack ? '30' : '20'})`, score: perf, max: isTeachingTrack ? 30 : 20 },
                      ...(!isTeachingTrack
                        ? [
                            { label: 'Accomplish. (5)', score: accomp, max: 5 },
                            { label: 'App Edu (15)', score: appEdu, max: 15 },
                            { label: 'App L&D (10)', score: appLd, max: 10 },
                          ]
                        : []),
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border)',
                          padding: '10px 12px',
                          borderRadius: '8px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            marginBottom: '4px',
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {item.score.toFixed(2)}{' '}
                          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                            / {item.max}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Section B: Track Criteria deliberated by HR */}
                  <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    B. {isTeachingTrack ? 'PPST Classroom Observations & Portfolio' : 'Potential & Examinations'} ({trackMax}.00 pts Max) • Subtotal: {trackSubtotal.toFixed(2)} / {trackMax}.00
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                      gap: '10px',
                      marginBottom: '14px',
                    }}
                  >
                    {isTeachingTrack ? (
                      <>
                        <div
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: isDark ? '#34D399' : '#059669',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            PPST COIs Demo Teaching (25)
                          </div>
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {coi.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                              / 25.00
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: isDark ? '#34D399' : '#059669',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            PPST NCOIs Portfolio & BEI (15)
                          </div>
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {ncoi.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                              / 15.00
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 12px',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: isDark ? '#FBBF24' : '#D97706',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            Written Exam (5)
                          </div>
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {written.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                              / 5.00
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 12px',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: isDark ? '#FBBF24' : '#D97706',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            BEI Interview (5)
                          </div>
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {bei.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                              / 5.00
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            backgroundColor: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            padding: '10px 12px',
                            borderRadius: '8px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: isDark ? '#FBBF24' : '#D97706',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            Skills Test (10)
                          </div>
                          <div
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {skills.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                              / 10.00
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-secondary)',
                      fontStyle: 'italic',
                      padding: '10px 14px',
                      backgroundColor: 'var(--color-bg-card)',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      borderLeft: '3.5px solid #2563EB',
                    }}
                  >
                    HRMPSB Deliberation Remarks: "{hrmoRemarksText}"
                  </div>
                </div>

                {/* DepEd CAR Official Governance & Appointment Badges */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '14px',
                    padding: '16px 20px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: '12px',
                    }}
                  >
                    Official DepEd Governance & Appointment Status
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '10px' }}>
                    <div
                      style={{
                        backgroundColor: 'var(--color-bg-card)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Background Investigation
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 800,
                          color: biStatus === 'YES' ? (isDark ? '#34D399' : '#059669') : '#DC2626',
                          marginTop: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {biStatus === 'YES' ? (
                          <>
                            <AppIcon name="check" size={14} color={isDark ? '#34D399' : '#059669'} /> Passed (YES)
                          </>
                        ) : (
                          <>
                            <AppIcon name="close" size={14} color="#DC2626" /> Failed (NO)
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: 'var(--color-bg-card)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Probation Period
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 800,
                          color: isDark ? '#FBBF24' : '#D97706',
                          marginTop: '3px',
                        }}
                      >
                        {probationPeriod}
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: 'var(--color-bg-card)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                        For Appointment Status
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 800,
                          color: isDark ? '#60A5FA' : '#2563EB',
                          marginTop: '3px',
                        }}
                      >
                        {appointmentStatus}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  padding: '16px 24px',
                  borderTop: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  flexShrink: 0,
                }}
              >
                {isHR && (
                  <button
                    type="button"
                    onClick={() => {
                      const app = selectedApplicantInfo;
                      setShowApplicantInfoModal(false);
                      handleOpenHrmoRating(app);
                    }}
                    className="btn btn-primary"
                    style={{
                      fontSize: '0.8125rem',
                      background: '#2563EB',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '9999px',
                      padding: '9px 22px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    }}
                  >
                    <AppIcon name="check" size={14} color="#ffffff" />
                    {hasBeenDeliberated ? 'Revise Deliberation (HR)' : 'Deliberate & Score (HR)'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowApplicantInfoModal(false)}
                  style={{
                    fontSize: '0.8125rem',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '9px 20px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </ModalOverlay>
        );
      })()}

      {/* MODAL 6: PROMOTION SELECTION CONFIRMATION */}
      {showConfirmPromotionModal && selectedCandidateForConfirm && isHR && (
        <ModalOverlay onDismiss={() => setShowConfirmPromotionModal(false)} className="modal-overlay" style={{ backdropFilter: 'blur(8px)', zIndex: 1060 }}>
          <div className="modal animate-scale-in" style={{
            maxWidth: '520px',
            width: '95%',
            borderRadius: '16px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            padding: 0,
            overflow: 'hidden'
          }}>
            <div style={{
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
                <h3 style={{ color: 'var(--color-text-primary)', margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
                  Confirm Candidate Selection for Promotion
                </h3>
              </div>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: theme === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4', padding: '16px', borderRadius: '10px', border: theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #BBF7D0' }}>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  {selectedCandidateForConfirm.name}
                </div>
                <div style={{ fontSize: '0.8125rem', color: theme === 'dark' ? '#34D399' : '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{selectedCandidateForConfirm.employeeId}</span> · 
                  <span>Rank #{selectedCandidateForConfirm.rank} ({selectedCandidateForConfirm.overallTotalScore} pts)</span>
                </div>
              </div>

              <div style={{ background: 'var(--color-bg-tertiary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Current Designation:</span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{selectedCandidateForConfirm.designation}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
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
                    background: theme === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: theme === 'dark' ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid #BFDBFE',
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8125rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                      marginBottom: '8px',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="employment" size={15} color="var(--color-primary)" />
                        Assignation to Plantilla Item Post <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                        {cyclePlantillas.length > 0 ? `${cyclePlantillas.length} Post${cyclePlantillas.length > 1 ? 's' : ''} in Cycle` : 'Open Registry'}
                      </span>
                    </label>

                    {cyclePlantillas.length > 0 ? (
                      <div>
                        <select aria-label="Designated plantilla item for this candidate"
                          className="form-input"
                          value={selectedPlantillaForCandidate}
                          onChange={(e) => setSelectedPlantillaForCandidate(e.target.value)}
                          style={{
                            background: 'var(--color-bg-card)',
                            fontSize: '0.8125rem',
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
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
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
                            fontSize: '0.8125rem',
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
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                          Assign one of the available vacant plantilla posts from the Division Registry.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ background: theme === 'dark' ? 'rgba(217, 119, 6, 0.12)' : '#FFFBEB', padding: '14px 16px', borderRadius: '8px', border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #FDE68A' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: theme === 'dark' ? '#FBBF24' : '#B45309', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AppIcon name="checklist" size={14} color={theme === 'dark' ? '#FBBF24' : '#B45309'} /> Next Steps & Requirements Trigger
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                  Selecting this candidate will send an immediate real-time web & mobile notification requiring <strong>{selectedCandidateForConfirm.name}</strong> to submit official <strong>Promotion Appointment Documents</strong> (CS Form 33, Oath of Office, PDF, IPCRF). The official position update will take effect after verification by AO II and final approval by HRMO.
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
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
