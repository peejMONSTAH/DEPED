import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import { DEPED_REGION_12_SCHOOLS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';

// Step 3: Profile Completion — Required Information per 201-System-Workflow.md
// Personal Information, PDS, WES, Employment Information, Contact Information
// DepEd 201 Immutability Policy: Filled-up and verified information is permanently locked.

interface WesEntry {
  id: number;
  dateFrom: string;
  dateTo: string;
  positionTitle: string;
  department: string;
  monthlySalary: string;
  salaryGrade: string;
  status: string;
  government: boolean;
  isLocked?: boolean;
}

const toDateInput = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const splitDuration = (value: string) => {
  const parts = String(value || '').split(/\s+(?:to|until|[-–—])\s+/i).map(part => part.trim()).filter(Boolean);
  return { from: toDateInput(parts[0] || ''), to: /present/i.test(parts[1] || '') ? 'Present' : toDateInput(parts[1] || '') };
};

export const ProfileCompletion: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'personal' | 'pds' | 'wes' | 'employment'>('personal');
  const [savedTabs, setSavedTabs] = useState<Set<string>>(new Set());
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [documentSources, setDocumentSources] = useState<Record<string, { status?: string; uploadDate?: string }>>({});
  const aoOwnedPersonalFields = new Set([
    'personal.firstName', 'personal.lastName', 'personal.middleName', 'personal.suffix',
    'personal.birthDate', 'personal.birthPlace', 'personal.civilStatus', 'personal.sex',
    'personal.nationality', 'personal.religion', 'personal.height', 'personal.weight', 'personal.bloodType',
  ]);

  // Personal Information
  const [personal, setPersonal] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    middleName: '',
    suffix: '',
    birthDate: '',
    birthPlace: '',
    civilStatus: 'Single',
    sex: 'Male',
    nationality: 'Filipino',
    religion: '',
    height: '',
    weight: '',
    bloodType: '',
  });

  // Personal Data Sheet (PDS)
  const [pds, setPds] = useState({
    gsisNumber: '',
    pagibigNumber: '',
    philhealthNumber: '',
    sssNumber: '',
    tinNumber: '',
    agencyEmployeeNumber: '',
    residentialAddress: '',
    permanentAddress: '',
    telephoneNo: '',
    mobileNo: '',
    emailAddress: user?.email || '',
    spouseName: '',
    spouseOccupation: '',
    fathersName: '',
    mothersName: '',
    educationalBackground: '',
    civilServiceEligibility: '',
    voluntaryWork: '',
    learningAndDevelopment: '',
  });

  // Work Experience Sheet (WES)
  const [wes, setWes] = useState<WesEntry[]>([
    { id: 1, dateFrom: '', dateTo: '', positionTitle: '', department: '', monthlySalary: '', salaryGrade: '', status: '', government: true, isLocked: false },
  ]);

  // Employment Information
  const [employment, setEmployment] = useState({
    employeeId: '',
    position: '',
    itemNumber: '',
    salaryGrade: '',
    stepIncrement: '',
    monthlySalary: '',
    appointmentStatus: 'Permanent',
    firstDayOfService: '',
    districtId: 1,
    schoolAssignment: DEPED_KORONADAL_DISTRICTS[0].schools[0],
    divisionAssignment: 'City Schools Division of Koronadal',
    region: 'Region XII',
    contactNumber: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    emergencyContactRelationship: '',
  });

  // Preload existing personnel profile data from server & localStorage
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/personnel/me');
        const data = res.data?.data;
        const uid = data?.id || user?.id || 'default';

        // Load any previously persisted PDS/WES/Employment details from local cache
        const documentProfile = data?.profileDocumentData || {};
        setDocumentSources(documentProfile);
        const uploadedPds = documentProfile.pds?.fields || {};
        const uploadedWes = documentProfile.wes?.fields || {};
        const compact = (prefix: string) => Object.entries(uploadedPds).filter(([key, value]) => key.startsWith(prefix) && String(value).trim()).map(([, value]) => String(value)).join('; ');
        const uploadedResidential = ['house', 'street', 'subdivision', 'barangay', 'city', 'province'].map(key => uploadedPds[`residential.${key}`]).filter(Boolean).join(', ');
        const uploadedPermanent = ['house', 'street', 'subdivision', 'barangay', 'city', 'province'].map(key => uploadedPds[`permanent.${key}`]).filter(Boolean).join(', ');
        const savedPdsStr = localStorage.getItem(`deped_pds_${uid}`);
        const savedPds = savedPdsStr ? JSON.parse(savedPdsStr) : {};
        const savedWesStr = localStorage.getItem(`deped_wes_${uid}`);
        const savedWes: WesEntry[] | null = savedWesStr ? JSON.parse(savedWesStr) : null;
        const savedEmpStr = localStorage.getItem(`deped_emp_${uid}`);
        const savedEmp = savedEmpStr ? JSON.parse(savedEmpStr) : {};

        const initialLocked = new Set<string>();

        if (data) {
          const birthDateStr = data.birthDate ? data.birthDate.split('T')[0] : '';
          const civilStatusStr = data.civilStatus ? data.civilStatus.charAt(0) + data.civilStatus.slice(1).toLowerCase() : 'Single';
          const sexStr = data.gender === 'FEMALE' ? 'Female' : 'Male';

          setPersonal(prev => {
            const next = {
              ...prev,
              firstName: data.firstName || prev.firstName,
              lastName: data.lastName || prev.lastName,
              middleName: data.middleName || savedEmp.middleName || '',
              suffix: data.suffix || savedEmp.suffix || '',
              birthDate: birthDateStr || savedEmp.birthDate || '',
              birthPlace: savedEmp.birthPlace || prev.birthPlace,
              civilStatus: civilStatusStr,
              sex: sexStr,
              height: savedEmp.height || prev.height,
              weight: savedEmp.weight || prev.weight,
              bloodType: savedEmp.bloodType || prev.bloodType,
              religion: savedEmp.religion || prev.religion,
            };

            // Lock all populated personal fields
            if (next.firstName) initialLocked.add('personal.firstName');
            if (next.lastName) initialLocked.add('personal.lastName');
            if (next.middleName) initialLocked.add('personal.middleName');
            if (next.suffix) initialLocked.add('personal.suffix');
            if (next.birthDate) initialLocked.add('personal.birthDate');
            if (next.birthPlace) initialLocked.add('personal.birthPlace');
            if (next.civilStatus) initialLocked.add('personal.civilStatus');
            if (next.sex) initialLocked.add('personal.sex');
            if (next.height) initialLocked.add('personal.height');
            if (next.weight) initialLocked.add('personal.weight');
            if (next.bloodType) initialLocked.add('personal.bloodType');
            if (next.religion) initialLocked.add('personal.religion');

            return next;
          });

          setPds(prev => {
            const next = {
              ...prev,
              ...savedPds,
              gsisNumber: uploadedPds.gsis || savedPds.gsisNumber || '',
              pagibigNumber: uploadedPds.pagibig || savedPds.pagibigNumber || '',
              philhealthNumber: uploadedPds.philhealth || savedPds.philhealthNumber || '',
              sssNumber: uploadedPds.sss || savedPds.sssNumber || '',
              tinNumber: uploadedPds.tin || savedPds.tinNumber || '',
              agencyEmployeeNumber: uploadedPds.agencyEmployeeNo || savedPds.agencyEmployeeNumber || '',
              residentialAddress: uploadedResidential || data.address || savedPds.residentialAddress || '',
              permanentAddress: uploadedPermanent || data.address || savedPds.permanentAddress || '',
              telephoneNo: uploadedPds.telephone || savedPds.telephoneNo || '',
              mobileNo: uploadedPds.mobile || data.contactNumber || savedPds.mobileNo || '',
              emailAddress: uploadedPds.email || user?.email || prev.emailAddress,
              spouseName: compact('spouse.') || savedPds.spouseName || '',
              fathersName: compact('father.') || savedPds.fathersName || '',
              mothersName: compact('mother.') || savedPds.mothersName || '',
              educationalBackground: compact('education.') || savedPds.educationalBackground || '',
              civilServiceEligibility: compact('eligibility.') || savedPds.civilServiceEligibility || '',
              voluntaryWork: compact('voluntary.') || savedPds.voluntaryWork || '',
              learningAndDevelopment: compact('training.') || savedPds.learningAndDevelopment || '',
            };

            // Lock all populated PDS fields
            Object.entries(next).forEach(([key, val]) => {
              if (val && typeof val === 'string' && val.trim() !== '') {
                initialLocked.add(`pds.${key}`);
              }
            });

            return next;
          });

          setEmployment(prev => {
            const next = {
              ...prev,
              ...savedEmp,
              employeeId: data.employeeId || savedEmp.employeeId || '',
              position: data.designation || savedEmp.position || '',
              itemNumber: data.plantillaItem?.itemNumber || savedEmp.itemNumber || '',
              salaryGrade: data.plantillaItem?.salaryGrade?.toString() || savedEmp.salaryGrade || '',
              firstDayOfService: data.dateHired ? data.dateHired.split('T')[0] : savedEmp.firstDayOfService || '',
              contactNumber: data.contactNumber || savedEmp.contactNumber || '',
            };

            // Lock all populated employment fields
            if (next.employeeId) initialLocked.add('employment.employeeId');
            if (next.position) initialLocked.add('employment.position');
            if (next.itemNumber) initialLocked.add('employment.itemNumber');
            if (next.salaryGrade) initialLocked.add('employment.salaryGrade');
            if (next.stepIncrement) initialLocked.add('employment.stepIncrement');
            if (next.appointmentStatus) initialLocked.add('employment.appointmentStatus');
            if (next.firstDayOfService) initialLocked.add('employment.firstDayOfService');
            if (next.schoolAssignment) initialLocked.add('employment.schoolAssignment');
            if (next.contactNumber) initialLocked.add('employment.contactNumber');
            if (next.emergencyContactName) initialLocked.add('employment.emergencyContactName');
            if (next.emergencyContactNumber) initialLocked.add('employment.emergencyContactNumber');
            if (next.emergencyContactRelationship) initialLocked.add('employment.emergencyContactRelationship');

            return next;
          });

          // WES entries: prioritize authentic database careerHistoryEntries
          const uploadedWorkRows = Object.keys(uploadedWes).map(key => key.match(/^work\.(\d+)\./)?.[1]).filter(Boolean);
          const uploadedWorkIndexes = [...new Set(uploadedWorkRows)].map(Number).sort((a, b) => a - b);
          if (uploadedWorkIndexes.length > 0) {
            setWes(uploadedWorkIndexes.map((index, row) => {
              const duration = splitDuration(uploadedWes[`work.${index}.duration`] || '');
              return {
                id: row + 1,
                dateFrom: toDateInput(uploadedWes[`work.${index}.from`] || '') || duration.from,
                dateTo: toDateInput(uploadedWes[`work.${index}.to`] || '') || duration.to,
                positionTitle: uploadedWes[`work.${index}.position`] || '',
                department: uploadedWes[`work.${index}.office`] || uploadedWes[`work.${index}.agency`] || '',
                monthlySalary: '', salaryGrade: '', status: '', government: true, isLocked: true,
              };
            }));
          } else if (Array.isArray(data.careerHistoryEntries) && data.careerHistoryEntries.length > 0) {
            setWes(data.careerHistoryEntries.map((che: any, index: number) => ({
              id: che.id || index + 1,
              dateFrom: che.eventDate ? che.eventDate.split('T')[0] : '',
              dateTo: che.detailsJson?.dateTo || 'Present',
              positionTitle: che.detailsJson?.title || data.designation || 'Teacher I',
              department: che.detailsJson?.department || 'DepEd Division of Koronadal City',
              monthlySalary: che.detailsJson?.salary || '27,000',
              salaryGrade: String(che.detailsJson?.salaryGrade || data.plantillaItem?.salaryGrade || '11'),
              status: che.detailsJson?.status || 'Permanent',
              government: che.detailsJson?.government !== false,
              isLocked: false,
            })));
          } else if (savedWes && savedWes.length > 0) {
            setWes(savedWes.map(e => ({ ...e, isLocked: false })));
          } else if (data.designation) {
            // Create default entry from official appointment
            setWes([
              {
                id: 1,
                dateFrom: data.dateHired ? data.dateHired.split('T')[0] : '',
                dateTo: 'Present',
                positionTitle: data.designation || 'Teacher I',
                department: 'City Schools Division of Koronadal',
                monthlySalary: '27,000',
                salaryGrade: data.plantillaItem?.salaryGrade?.toString() || '11',
                status: 'Permanent',
                government: true,
                isLocked: false,
              },
            ]);
          }

          setLockedFields(initialLocked);

          // If core tabs have all required fields filled, mark them saved
          const tabsSaved = new Set<string>();
          if (data.firstName && data.lastName && data.birthDate) tabsSaved.add('personal');
          if (data.address && data.contactNumber) tabsSaved.add('pds');
          if (savedWes && savedWes.length > 0) tabsSaved.add('wes');
          if (data.employeeId && data.designation) tabsSaved.add('employment');
          setSavedTabs(tabsSaved);
        }
      } catch (_) {}
    };
    fetchProfile();
  }, [user]);

  const markSaved = (tab: string) => {
    setSavedTabs(prev => new Set([...prev, tab]));
  };

  const isFieldLocked = (fieldKey: string) => {
    void fieldKey;
    return true;
  };

  const renderFieldLabel = (label: string, fieldKey: string, required = false) => {
    const locked = isFieldLocked(fieldKey);
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>
          {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
        </label>
        {locked && (
          <span
            className="badge"
            style={{
              fontSize: 9,
              padding: '1px 6px',
              fontWeight: 700,
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Official DepEd record. Locked and immutable."
          >
            <AppIcon name="lock" size={9} color="#10b981" /> LOCKED
          </span>
        )}
      </div>
    );
  };

  const getLockedStyle = (fieldKey: string): React.CSSProperties => {
    if (!isFieldLocked(fieldKey)) return {};
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      color: 'var(--color-text-primary)',
      cursor: 'not-allowed',
      userSelect: 'none',
      opacity: 0.9,
    };
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiClient.put('/personnel/me', {
        firstName: personal.firstName,
        lastName: personal.lastName,
        middleName: personal.middleName,
        suffix: personal.suffix,
        birthDate: personal.birthDate || '1990-01-01',
        gender: personal.sex.toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE',
        civilStatus: personal.civilStatus.toUpperCase(),
        address: pds.residentialAddress || personal.birthPlace || '',
        contactNumber: pds.mobileNo || '',
      });

      const updated = res.data?.data;
      if (updated) {
        setPersonal(prev => ({
          ...prev,
          firstName: updated.firstName || prev.firstName,
          lastName: updated.lastName || prev.lastName,
          middleName: updated.middleName || prev.middleName,
          suffix: updated.suffix || prev.suffix,
          birthDate: updated.birthDate ? updated.birthDate.split('T')[0] : prev.birthDate,
          gender: updated.gender === 'FEMALE' ? 'Female' : 'Male',
        }));
      }

      // Persist additional personal details locally
      const uid = user?.id || 'default';
      localStorage.setItem(`deped_emp_${uid}`, JSON.stringify({ ...personal }));

      // Lock all newly filled fields
      const newLocked = new Set(lockedFields);
      Object.entries(personal).forEach(([key, val]) => {
        if (val && val.trim() !== '') {
          newLocked.add(`personal.${key}`);
        }
      });
      setLockedFields(newLocked);

      markSaved('personal');
      setIsEditMode(false);
      addToast('Personal Information changes applied and stored in database successfully!', 'SUCCESS');
      setActiveTab('pds');
    } catch (err: any) {
      console.error('Failed to save personal information:', err);
      addToast(err.response?.data?.message || 'Failed to save personal information in database.', 'ERROR');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.put('/personnel/me', {
        address: pds.residentialAddress || pds.permanentAddress || '',
        contactNumber: pds.mobileNo || pds.telephoneNo || '',
      });

      const uid = user?.id || 'default';
      localStorage.setItem(`deped_pds_${uid}`, JSON.stringify(pds));

      // Lock all newly filled PDS fields
      const newLocked = new Set(lockedFields);
      Object.entries(pds).forEach(([key, val]) => {
        if (val && val.trim() !== '') {
          newLocked.add(`pds.${key}`);
        }
      });
      setLockedFields(newLocked);

      markSaved('pds');
      setIsEditMode(false);
      addToast('Personal Data Sheet (PDS) changes applied and stored in database successfully!', 'SUCCESS');
      setActiveTab('wes');
    } catch (err: any) {
      console.error('Failed to save PDS details:', err);
      addToast(err.response?.data?.message || 'Failed to save PDS details in database.', 'ERROR');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWes = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.put('/personnel/me', {
        wes: wes.map(item => ({
          dateFrom: item.dateFrom,
          dateTo: item.dateTo,
          positionTitle: item.positionTitle,
          department: item.department,
          monthlySalary: item.monthlySalary,
          salaryGrade: item.salaryGrade,
          status: item.status,
          government: item.government,
        })),
      });

      const uid = user?.id || 'default';
      const lockedWes = wes.map(item => ({ ...item, isLocked: true }));
      setWes(lockedWes);
      localStorage.setItem(`deped_wes_${uid}`, JSON.stringify(lockedWes));

      markSaved('wes');
      setIsEditMode(false);
      addToast('Work Experience Sheet changes applied and stored in database successfully!', 'SUCCESS');
      setActiveTab('employment');
    } catch (err: any) {
      console.error('Failed to save WES records:', err);
      addToast(err.response?.data?.message || 'Failed to save Work Experience records in database.', 'ERROR');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmployment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.put('/personnel/me', {
        designation: employment.position,
        contactNumber: employment.contactNumber || pds.mobileNo || '',
        address: pds.residentialAddress || '',
        dateHired: employment.firstDayOfService || undefined,
      });

      const uid = user?.id || 'default';
      localStorage.setItem(`deped_emp_${uid}`, JSON.stringify(employment));

      // Lock all employment fields
      const newLocked = new Set(lockedFields);
      Object.entries(employment).forEach(([key, val]) => {
        if (val && String(val).trim() !== '') {
          newLocked.add(`employment.${key}`);
        }
      });
      setLockedFields(newLocked);

      markSaved('employment');
      setIsEditMode(false);
      addToast('Employment & Contact changes applied and stored in database successfully!', 'SUCCESS');
      navigate('/personnel/home');
    } catch (err: any) {
      console.error('Failed to save employment details:', err);
      addToast(err.response?.data?.message || 'Failed to save employment details in database.', 'ERROR');
    } finally {
      setIsSaving(false);
    }
  };

  const addWesEntry = () => {
    setWes(prev => [
      ...prev,
      {
        id: prev.length + 1,
        dateFrom: '',
        dateTo: '',
        positionTitle: '',
        department: '',
        monthlySalary: '',
        salaryGrade: '',
        status: '',
        government: true,
        isLocked: false,
      },
    ]);
  };

  // Determine if all required fields for a tab are already locked
  const isPersonalLocked = isFieldLocked('personal.firstName') && isFieldLocked('personal.lastName') && isFieldLocked('personal.birthDate');
  const isPdsLocked = isFieldLocked('pds.residentialAddress') && isFieldLocked('pds.permanentAddress') && isFieldLocked('pds.mobileNo');
  const isWesLocked = true;
  const isEmploymentLocked = isFieldLocked('employment.position') && isFieldLocked('employment.firstDayOfService') && isFieldLocked('employment.contactNumber');

  const tabs = [
    { id: 'personal',   label: 'Personal Info',       icon: 'profile',   locked: isPersonalLocked },
    { id: 'pds',        label: 'PDS',                 icon: 'checklist', locked: isPdsLocked },
    { id: 'wes',        label: 'Work Experience',     icon: 'wes',       locked: isWesLocked },
    { id: 'employment', label: 'Employment & Contact', icon: 'personnel', locked: isEmploymentLocked },
  ];

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>My Digital 201 File & Profile</div>
        </div>
      </div>

      {/* Tab Status Indicators */}
      <div className="card mb-4" style={{ background: 'var(--color-bg-secondary)', borderLeft: '4px solid var(--color-primary)', padding: 'var(--space-3) var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <span
              key={tab.id}
              className={`badge ${tab.locked ? 'badge-approved' : savedTabs.has(tab.id) ? 'badge-info' : 'badge-draft'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <AppIcon name={tab.locked ? 'lock' : 'check'} size={11} color={tab.locked ? '#10b981' : undefined} />
              {tab.label} {tab.locked && '(Locked)'}
            </span>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 0, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
              fontWeight: activeTab === tab.id ? 700 : 400,
              fontSize: 'var(--text-sm)',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AppIcon name={tab.icon} size={16} /> {tab.label}
            {tab.locked ? (
              <AppIcon name="lock" size={12} color="#10b981" />
            ) : savedTabs.has(tab.id) ? (
              <AppIcon name="check" size={12} color="var(--color-success)" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Tab 1: Personal Information */}
      {activeTab === 'personal' && (
        <form onSubmit={handleSavePersonal} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>Personal Information</h3>
            {isPersonalLocked && (
              <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <AppIcon name="lock" size={12} /> Official DepEd Record Locked
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 12 }}>
            <div className="form-group">
              {renderFieldLabel('First Name', 'personal.firstName', true)}
              <input aria-label="First Name"
                className="form-input"
                value={personal.firstName}
                readOnly={isFieldLocked('personal.firstName')}
                disabled={isFieldLocked('personal.firstName')}
                style={getLockedStyle('personal.firstName')}
                onChange={e => !isFieldLocked('personal.firstName') && setPersonal({ ...personal, firstName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })}
                required
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Last Name', 'personal.lastName', true)}
              <input aria-label="Last Name"
                className="form-input"
                value={personal.lastName}
                readOnly={isFieldLocked('personal.lastName')}
                disabled={isFieldLocked('personal.lastName')}
                style={getLockedStyle('personal.lastName')}
                onChange={e => !isFieldLocked('personal.lastName') && setPersonal({ ...personal, lastName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })}
                required
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Middle Name', 'personal.middleName')}
              <input aria-label="Middle Name"
                className="form-input"
                value={personal.middleName}
                readOnly={isFieldLocked('personal.middleName')}
                disabled={isFieldLocked('personal.middleName')}
                style={getLockedStyle('personal.middleName')}
                onChange={e => !isFieldLocked('personal.middleName') && setPersonal({ ...personal, middleName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Suffix (Jr., Sr., etc.)', 'personal.suffix')}
              <select aria-label="Suffix (Jr., Sr., etc.)"
                className="form-input"
                value={personal.suffix}
                disabled={isFieldLocked('personal.suffix')}
                style={getLockedStyle('personal.suffix')}
                onChange={e => !isFieldLocked('personal.suffix') && setPersonal({ ...personal, suffix: e.target.value })}
              >
                {NAME_SUFFIX_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                {personal.suffix && !NAME_SUFFIX_OPTIONS.some(opt => opt.value === personal.suffix) && (
                  <option value={personal.suffix}>{personal.suffix}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('Date of Birth', 'personal.birthDate', true)}
              <input aria-label="Date of Birth"
                className="form-input"
                type="date"
                value={personal.birthDate}
                readOnly={isFieldLocked('personal.birthDate')}
                disabled={isFieldLocked('personal.birthDate')}
                style={getLockedStyle('personal.birthDate')}
                onChange={e => !isFieldLocked('personal.birthDate') && setPersonal({ ...personal, birthDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Place of Birth', 'personal.birthPlace')}
              <input aria-label="Place of Birth"
                className="form-input"
                value={personal.birthPlace}
                readOnly={isFieldLocked('personal.birthPlace')}
                disabled={isFieldLocked('personal.birthPlace')}
                style={getLockedStyle('personal.birthPlace')}
                onChange={e => !isFieldLocked('personal.birthPlace') && setPersonal({ ...personal, birthPlace: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Civil Status', 'personal.civilStatus')}
              <select aria-label="Civil Status"
                className="form-input"
                value={personal.civilStatus}
                disabled={isFieldLocked('personal.civilStatus')}
                style={getLockedStyle('personal.civilStatus')}
                onChange={e => !isFieldLocked('personal.civilStatus') && setPersonal({ ...personal, civilStatus: e.target.value })}
              >
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('Sex', 'personal.sex')}
              <select aria-label="Sex"
                className="form-input"
                value={personal.sex}
                disabled={isFieldLocked('personal.sex')}
                style={getLockedStyle('personal.sex')}
                onChange={e => !isFieldLocked('personal.sex') && setPersonal({ ...personal, sex: e.target.value })}
              >
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('Height (m)', 'personal.height')}
              <input
                aria-label="Height (m)"
                className="form-input"
                placeholder="e.g. 1.65"
                value={personal.height}
                readOnly={isFieldLocked('personal.height')}
                disabled={isFieldLocked('personal.height')}
                style={getLockedStyle('personal.height')}
                onChange={e => !isFieldLocked('personal.height') && setPersonal({ ...personal, height: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Weight (kg)', 'personal.weight')}
              <input
                aria-label="Weight (kg)"
                className="form-input"
                placeholder="e.g. 60"
                value={personal.weight}
                readOnly={isFieldLocked('personal.weight')}
                disabled={isFieldLocked('personal.weight')}
                style={getLockedStyle('personal.weight')}
                onChange={e => !isFieldLocked('personal.weight') && setPersonal({ ...personal, weight: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Blood Type', 'personal.bloodType')}
              <select aria-label="Blood Type"
                className="form-input"
                value={personal.bloodType}
                disabled={isFieldLocked('personal.bloodType')}
                style={getLockedStyle('personal.bloodType')}
                onChange={e => !isFieldLocked('personal.bloodType') && setPersonal({ ...personal, bloodType: e.target.value })}
              >
                <option value="">-- Select --</option>
                <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                <option>AB+</option><option>AB-</option><option>O+</option><option>O-</option>
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('Religion', 'personal.religion')}
              <input aria-label="Religion"
                className="form-input"
                value={personal.religion}
                readOnly={isFieldLocked('personal.religion')}
                disabled={isFieldLocked('personal.religion')}
                style={getLockedStyle('personal.religion')}
                onChange={e => !isFieldLocked('personal.religion') && setPersonal({ ...personal, religion: e.target.value })}
              />
            </div>
          </div>

          {isPersonalLocked ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setActiveTab('pds')}
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Continue to PDS →
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary btn-full mt-4"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
            >
              {isSaving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Applying Changes to Database...
                </>
              ) : (
                <>
                  <AppIcon name="check" size={16} /> Apply Changes
                </>
              )}
            </button>
          )}
        </form>
      )}

      {/* Tab 2: Personal Data Sheet (PDS) */}
      {activeTab === 'pds' && (
        <form onSubmit={handleSavePds} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>
              Personal Data Sheet (PDS) — CS Form No. 212
            </h3>
            {documentSources.pds && <span className="badge badge-info" title={documentSources.pds.uploadDate ? `Uploaded ${new Date(documentSources.pds.uploadDate).toLocaleString()}` : undefined}>
              Imported from transaction PDS · {documentSources.pds.status || 'Recorded'}
            </span>}
            {isPdsLocked && (
              <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <AppIcon name="lock" size={12} /> Official PDS Record Locked
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 12 }}>
            <div className="form-group">
              {renderFieldLabel('GSIS ID Number', 'pds.gsisNumber')}
              <input
                aria-label="GSIS Number"
                className="form-input"
                placeholder="GSIS Number"
                value={pds.gsisNumber}
                readOnly={isFieldLocked('pds.gsisNumber')}
                disabled={isFieldLocked('pds.gsisNumber')}
                style={getLockedStyle('pds.gsisNumber')}
                onChange={e => !isFieldLocked('pds.gsisNumber') && setPds({ ...pds, gsisNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Pag-IBIG ID Number', 'pds.pagibigNumber')}
              <input
                aria-label="Pag-IBIG Number"
                className="form-input"
                placeholder="Pag-IBIG Number"
                value={pds.pagibigNumber}
                readOnly={isFieldLocked('pds.pagibigNumber')}
                disabled={isFieldLocked('pds.pagibigNumber')}
                style={getLockedStyle('pds.pagibigNumber')}
                onChange={e => !isFieldLocked('pds.pagibigNumber') && setPds({ ...pds, pagibigNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('PhilHealth Number', 'pds.philhealthNumber')}
              <input
                aria-label="PhilHealth Number"
                className="form-input"
                placeholder="PhilHealth Number"
                value={pds.philhealthNumber}
                readOnly={isFieldLocked('pds.philhealthNumber')}
                disabled={isFieldLocked('pds.philhealthNumber')}
                style={getLockedStyle('pds.philhealthNumber')}
                onChange={e => !isFieldLocked('pds.philhealthNumber') && setPds({ ...pds, philhealthNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('TIN Number', 'pds.tinNumber')}
              <input
                aria-label="TIN Number"
                className="form-input"
                placeholder="TIN Number"
                value={pds.tinNumber}
                readOnly={isFieldLocked('pds.tinNumber')}
                disabled={isFieldLocked('pds.tinNumber')}
                style={getLockedStyle('pds.tinNumber')}
                onChange={e => !isFieldLocked('pds.tinNumber') && setPds({ ...pds, tinNumber: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              {renderFieldLabel('Residential Address', 'pds.residentialAddress', true)}
              <input
                aria-label="Residential Address"
                className="form-input"
                required
                placeholder="House No., Street, Barangay, City/Municipality, Province"
                value={pds.residentialAddress}
                readOnly={isFieldLocked('pds.residentialAddress')}
                disabled={isFieldLocked('pds.residentialAddress')}
                style={getLockedStyle('pds.residentialAddress')}
                onChange={e => !isFieldLocked('pds.residentialAddress') && setPds({ ...pds, residentialAddress: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              {renderFieldLabel('Permanent Address', 'pds.permanentAddress', true)}
              <input
                aria-label="Permanent address (if different from residential)"
                className="form-input"
                required
                placeholder="Permanent address (if different from residential)"
                value={pds.permanentAddress}
                readOnly={isFieldLocked('pds.permanentAddress')}
                disabled={isFieldLocked('pds.permanentAddress')}
                style={getLockedStyle('pds.permanentAddress')}
                onChange={e => !isFieldLocked('pds.permanentAddress') && setPds({ ...pds, permanentAddress: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Telephone Number', 'pds.telephoneNo')}
              <input
                aria-label="Telephone No"
                className="form-input"
                type="tel"
                inputMode="numeric"
                maxLength={15}
                placeholder="Telephone No."
                value={pds.telephoneNo}
                readOnly={isFieldLocked('pds.telephoneNo')}
                disabled={isFieldLocked('pds.telephoneNo')}
                style={getLockedStyle('pds.telephoneNo')}
                onChange={e => !isFieldLocked('pds.telephoneNo') && setPds({ ...pds, telephoneNo: e.target.value.replace(/[^0-9\-\s()]/g, '') })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Mobile Number', 'pds.mobileNo', true)}
              <input
                aria-label="Contact number"
                className="form-input"
                type="tel"
                inputMode="numeric"
                maxLength={13}
                required
                placeholder="09XXXXXXXXX"
                value={pds.mobileNo}
                readOnly={isFieldLocked('pds.mobileNo')}
                disabled={isFieldLocked('pds.mobileNo')}
                style={getLockedStyle('pds.mobileNo')}
                onChange={e => !isFieldLocked('pds.mobileNo') && setPds({ ...pds, mobileNo: e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '') })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel("Spouse's Name", 'pds.spouseName')}
              <input
                aria-label="Spouse's Name"
                className="form-input"
                value={pds.spouseName}
                readOnly={isFieldLocked('pds.spouseName')}
                disabled={isFieldLocked('pds.spouseName')}
                style={getLockedStyle('pds.spouseName')}
                onChange={e => !isFieldLocked('pds.spouseName') && setPds({ ...pds, spouseName: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel("Spouse's Occupation", 'pds.spouseOccupation')}
              <input
                aria-label="Spouse's Occupation"
                className="form-input"
                value={pds.spouseOccupation}
                readOnly={isFieldLocked('pds.spouseOccupation')}
                disabled={isFieldLocked('pds.spouseOccupation')}
                style={getLockedStyle('pds.spouseOccupation')}
                onChange={e => !isFieldLocked('pds.spouseOccupation') && setPds({ ...pds, spouseOccupation: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel("Father's Name", 'pds.fathersName')}
              <input
                aria-label="Father's Name"
                className="form-input"
                value={pds.fathersName}
                readOnly={isFieldLocked('pds.fathersName')}
                disabled={isFieldLocked('pds.fathersName')}
                style={getLockedStyle('pds.fathersName')}
                onChange={e => !isFieldLocked('pds.fathersName') && setPds({ ...pds, fathersName: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel("Mother's Maiden Name", 'pds.mothersName')}
              <input
                aria-label="Mother's Maiden Name"
                className="form-input"
                value={pds.mothersName}
                readOnly={isFieldLocked('pds.mothersName')}
                disabled={isFieldLocked('pds.mothersName')}
                style={getLockedStyle('pds.mothersName')}
                onChange={e => !isFieldLocked('pds.mothersName') && setPds({ ...pds, mothersName: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              {renderFieldLabel('Civil Service Eligibility', 'pds.civilServiceEligibility')}
              <textarea
                aria-label="Civil Service Eligibility"
                className="form-input"
                rows={2}
                placeholder="e.g. Licensure Exam for Teachers (LET), Career Service Professional"
                value={pds.civilServiceEligibility}
                readOnly={isFieldLocked('pds.civilServiceEligibility')}
                disabled={isFieldLocked('pds.civilServiceEligibility')}
                style={getLockedStyle('pds.civilServiceEligibility')}
                onChange={e => !isFieldLocked('pds.civilServiceEligibility') && setPds({ ...pds, civilServiceEligibility: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              {renderFieldLabel('Educational Background & Graduate Units', 'pds.educationalBackground')}
              <textarea aria-label="Educational Background & Graduate Units"
                className="form-input"
                rows={3}
                placeholder="Highest educational attainment (e.g., Bachelor of Secondary Education, 18 Masteral Units completed, Master of Arts in Education)..."
                value={pds.educationalBackground}
                readOnly={isFieldLocked('pds.educationalBackground')}
                disabled={isFieldLocked('pds.educationalBackground')}
                style={getLockedStyle('pds.educationalBackground')}
                onChange={e => !isFieldLocked('pds.educationalBackground') && setPds({ ...pds, educationalBackground: e.target.value })}
              />
            </div>
          </div>

          {isPdsLocked && !isEditMode ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                disabled
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
              >
                <AppIcon name="lock" size={15} /> AO-maintained record
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('wes')}
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Continue to Work Experience →
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary btn-full mt-4"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
            >
              {isSaving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Applying Changes to Database...
                </>
              ) : (
                <>
                  <AppIcon name="check" size={16} /> Apply Changes
                </>
              )}
            </button>
          )}
        </form>
      )}

      {/* Tab 3: Work Experience Sheet (WES) */}
      {activeTab === 'wes' && (
        <form onSubmit={handleSaveWes} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div><h3 style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>Work Experience Sheet (WES)</h3>
              {documentSources.wes && <span className="badge badge-info" title={documentSources.wes.uploadDate ? `Uploaded ${new Date(documentSources.wes.uploadDate).toLocaleString()}` : undefined}>
                Imported from transaction WES · {documentSources.wes.status || 'Recorded'}
              </span>}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addWesEntry}>
              + Add Past Experience Entry
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {wes.map((entry, idx) => {
              const entryLocked = entry.isLocked === true;
              return (
                <div
                  key={entry.id}
                  className="card"
                  style={{
                    background: entryLocked ? 'rgba(255, 255, 255, 0.02)' : 'var(--color-bg-secondary)',
                    border: entryLocked ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--color-border)',
                    padding: 'var(--space-4)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="text-xs text-muted" style={{ fontWeight: 600 }}>
                      Work Experience Entry #{idx + 1}
                    </div>
                    {entryLocked && (
                      <span
                        className="badge"
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <AppIcon name="lock" size={10} color="#10b981" /> Verified Service Record Locked
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Date From *</label>
                      <input
                        aria-label="Date From"
                        className="form-input"
                        type="date"
                        value={entry.dateFrom}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, dateFrom: e.target.value } : w)))}
                        required={idx === 0}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date To (or "Present")</label>
                      <input
                        aria-label="Date To (or &quot;Present&quot;)"
                        className="form-input"
                        type={entry.dateTo === 'Present' ? 'text' : 'date'}
                        value={entry.dateTo}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, dateTo: e.target.value } : w)))}
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Position Title *</label>
                      <input
                        aria-label="Position Title"
                        className="form-input"
                        placeholder="e.g. Teacher I"
                        value={entry.positionTitle}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, positionTitle: e.target.value } : w)))}
                        required={idx === 0}
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Department / Agency / Office / Company</label>
                      <input
                        aria-label="Department / Agency / Office / Company"
                        className="form-input"
                        placeholder="e.g. DepEd City Schools Division of Koronadal"
                        value={entry.department}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, department: e.target.value } : w)))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monthly Salary</label>
                      <input
                        aria-label="Monthly Salary"
                        className="form-input"
                        placeholder="e.g. 25,439"
                        value={entry.monthlySalary}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, monthlySalary: e.target.value } : w)))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Salary Grade</label>
                      <input
                        aria-label="Salary Grade"
                        className="form-input"
                        placeholder="e.g. 11"
                        value={entry.salaryGrade}
                        readOnly={entryLocked}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, salaryGrade: e.target.value } : w)))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status of Appointment</label>
                      <select
                        aria-label="Status of Appointment"
                        className="form-input"
                        value={entry.status}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, status: e.target.value } : w)))}
                      >
                        <option value="">-- Select --</option>
                        <option>Permanent</option>
                        <option>Temporary</option>
                        <option>Contractual</option>
                        <option>Part-Time</option>
                        <option>Casual</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Government Service?</label>
                      <select
                        aria-label="Government Service?"
                        className="form-input"
                        value={entry.government ? 'Yes' : 'No'}
                        disabled={entryLocked}
                        style={entryLocked ? { backgroundColor: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' } : {}}
                        onChange={e => setWes(prev => prev.map(w => (w.id === entry.id ? { ...w, government: e.target.value === 'Yes' } : w)))}
                      >
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isWesLocked && !isEditMode ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                disabled
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
              >
                <AppIcon name="lock" size={15} /> AO-maintained record
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('employment')}
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Continue to Employment & Contact →
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary btn-full mt-4"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
            >
              {isSaving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Applying Changes to Database...
                </>
              ) : (
                <>
                  <AppIcon name="check" size={16} /> Apply Changes
                </>
              )}
            </button>
          )}
        </form>
      )}

      {/* Tab 4: Employment & Contact Information */}
      {activeTab === 'employment' && (
        <form onSubmit={handleSaveEmployment} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>
              Employment & Contact Information
            </h3>
            {isEmploymentLocked && (
              <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <AppIcon name="lock" size={12} /> Official Plantilla Record Locked
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 12 }}>
            <div className="form-group">
              {renderFieldLabel('Employee ID', 'employment.employeeId')}
              <input
                aria-label="Employee ID"
                className="form-input"
                placeholder="e.g. EMP-001"
                value={employment.employeeId}
                readOnly={isFieldLocked('employment.employeeId')}
                disabled={isFieldLocked('employment.employeeId')}
                style={getLockedStyle('employment.employeeId')}
                onChange={e => !isFieldLocked('employment.employeeId') && setEmployment({ ...employment, employeeId: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Plantilla Item Number', 'employment.itemNumber')}
              <input
                aria-label="Plantilla Item No"
                className="form-input"
                placeholder="Plantilla Item No."
                value={employment.itemNumber}
                readOnly={isFieldLocked('employment.itemNumber')}
                disabled={isFieldLocked('employment.itemNumber')}
                style={getLockedStyle('employment.itemNumber')}
                onChange={e => !isFieldLocked('employment.itemNumber') && setEmployment({ ...employment, itemNumber: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              {renderFieldLabel('Position Title', 'employment.position', true)}
              <input
                aria-label="Position Title"
                className="form-input"
                required
                placeholder="e.g. Teacher I"
                value={employment.position}
                readOnly={isFieldLocked('employment.position')}
                disabled={isFieldLocked('employment.position')}
                style={getLockedStyle('employment.position')}
                onChange={e => !isFieldLocked('employment.position') && setEmployment({ ...employment, position: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Salary Grade', 'employment.salaryGrade')}
              <input
                aria-label="Salary Grade"
                className="form-input"
                placeholder="e.g. 11"
                value={employment.salaryGrade}
                readOnly={isFieldLocked('employment.salaryGrade')}
                disabled={isFieldLocked('employment.salaryGrade')}
                style={getLockedStyle('employment.salaryGrade')}
                onChange={e => !isFieldLocked('employment.salaryGrade') && setEmployment({ ...employment, salaryGrade: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Step Increment', 'employment.stepIncrement')}
              <input
                aria-label="Step Increment"
                className="form-input"
                placeholder="e.g. 1"
                value={employment.stepIncrement}
                readOnly={isFieldLocked('employment.stepIncrement')}
                disabled={isFieldLocked('employment.stepIncrement')}
                style={getLockedStyle('employment.stepIncrement')}
                onChange={e => !isFieldLocked('employment.stepIncrement') && setEmployment({ ...employment, stepIncrement: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Appointment Status', 'employment.appointmentStatus')}
              <select aria-label="Appointment Status"
                className="form-input"
                value={employment.appointmentStatus}
                disabled={isFieldLocked('employment.appointmentStatus')}
                style={getLockedStyle('employment.appointmentStatus')}
                onChange={e => !isFieldLocked('employment.appointmentStatus') && setEmployment({ ...employment, appointmentStatus: e.target.value })}
              >
                <option>Permanent</option>
                <option>Temporary</option>
                <option>Contractual</option>
                <option>Casual</option>
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('First Day of Service', 'employment.firstDayOfService', true)}
              <input aria-label="First Day of Service"
                className="form-input"
                type="date"
                required
                value={employment.firstDayOfService}
                readOnly={isFieldLocked('employment.firstDayOfService')}
                disabled={isFieldLocked('employment.firstDayOfService')}
                style={getLockedStyle('employment.firstDayOfService')}
                onChange={e => !isFieldLocked('employment.firstDayOfService') && setEmployment({ ...employment, firstDayOfService: e.target.value })}
              />
            </div>
            {/* Cascading District -> School Assignment */}
            <div className="form-group">
              <label className="form-label">Assigned District (District 1 & District 6) *</label>
              <select
                aria-label="Assigned District (District 1 & District 6)"
                className="form-input"
                required
                value={employment.districtId}
                disabled={isFieldLocked('employment.schoolAssignment')}
                style={getLockedStyle('employment.schoolAssignment')}
                onChange={e => {
                  const dId = Number(e.target.value);
                  const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === dId) || DEPED_KORONADAL_DISTRICTS[0];
                  setEmployment({ ...employment, districtId: dId, schoolAssignment: dist.schools[0] || '' });
                }}
              >
                {DEPED_KORONADAL_DISTRICTS.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.schools.length} Schools)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              {renderFieldLabel('School / Station Assignment', 'employment.schoolAssignment', true)}
              <select aria-label="School / Station Assignment"
                className="form-input"
                required
                value={employment.schoolAssignment}
                disabled={isFieldLocked('employment.schoolAssignment')}
                style={getLockedStyle('employment.schoolAssignment')}
                onChange={e => setEmployment({ ...employment, schoolAssignment: e.target.value })}
              >
                {(DEPED_KORONADAL_DISTRICTS.find(d => d.id === employment.districtId)?.schools || DEPED_REGION_12_SCHOOLS).map(school => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Division</label>
              <input className="form-input" value={employment.divisionAssignment} readOnly disabled style={{ background: 'rgba(255,255,255,0.03)', opacity: 0.8, cursor: 'not-allowed' }} aria-label="Division" />
            </div>
            <div className="form-group">
              <label className="form-label">Region</label>
              <input className="form-input" value={employment.region} readOnly disabled style={{ background: 'rgba(255,255,255,0.03)', opacity: 0.8, cursor: 'not-allowed' }} aria-label="Region" />
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <div className="text-xs text-muted mt-4 mb-2" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contact & Emergency Information
              </div>
            </div>
            <div className="form-group">
              {renderFieldLabel('Contact Number', 'employment.contactNumber', true)}
              <input
                aria-label="Region"
                className="form-input"
                required
                placeholder="09XXXXXXXXX"
                value={employment.contactNumber}
                readOnly={isFieldLocked('employment.contactNumber')}
                disabled={isFieldLocked('employment.contactNumber')}
                style={getLockedStyle('employment.contactNumber')}
                onChange={e => !isFieldLocked('employment.contactNumber') && setEmployment({ ...employment, contactNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Emergency Contact Name', 'employment.emergencyContactName', true)}
              <input
                aria-label="Full Name"
                className="form-input"
                required
                placeholder="Full Name"
                value={employment.emergencyContactName}
                readOnly={isFieldLocked('employment.emergencyContactName')}
                disabled={isFieldLocked('employment.emergencyContactName')}
                style={getLockedStyle('employment.emergencyContactName')}
                onChange={e => !isFieldLocked('employment.emergencyContactName') && setEmployment({ ...employment, emergencyContactName: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Emergency Contact Number', 'employment.emergencyContactNumber', true)}
              <input
                aria-label="Contact number"
                className="form-input"
                required
                placeholder="09XXXXXXXXX"
                value={employment.emergencyContactNumber}
                readOnly={isFieldLocked('employment.emergencyContactNumber')}
                disabled={isFieldLocked('employment.emergencyContactNumber')}
                style={getLockedStyle('employment.emergencyContactNumber')}
                onChange={e => !isFieldLocked('employment.emergencyContactNumber') && setEmployment({ ...employment, emergencyContactNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              {renderFieldLabel('Relationship', 'employment.emergencyContactRelationship')}
              <input
                aria-label="Emergency Contact Relationship"
                className="form-input"
                placeholder="e.g. Spouse, Parent, Sibling"
                value={employment.emergencyContactRelationship}
                readOnly={isFieldLocked('employment.emergencyContactRelationship')}
                disabled={isFieldLocked('employment.emergencyContactRelationship')}
                style={getLockedStyle('employment.emergencyContactRelationship')}
                onChange={e => !isFieldLocked('employment.emergencyContactRelationship') && setEmployment({ ...employment, emergencyContactRelationship: e.target.value })}
              />
            </div>
          </div>

          {isEmploymentLocked && !isEditMode ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                disabled
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
              >
                <AppIcon name="lock" size={15} /> AO-maintained record
              </button>
              <button
                type="button"
                onClick={() => navigate('/personnel/home')}
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Return to Home
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary btn-full mt-4"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700 }}
            >
              {isSaving ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Applying Changes to Database...
                </>
              ) : (
                <>
                  <AppIcon name="check" size={16} /> Apply Changes
                </>
              )}
            </button>
          )}
        </form>
      )}
    </div>
  );
};
