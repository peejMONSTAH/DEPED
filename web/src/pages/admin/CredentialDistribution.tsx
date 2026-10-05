import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { PersonnelImportModal } from '../../components/admin/PersonnelImportModal';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { AppIcon } from '../../components/common/AppIcon';
import { TEACHING_POSITIONS, NON_TEACHING_POSITIONS, DEPED_REGION_12_SCHOOLS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import apiClient from '../../api/client';
import { getAllPages } from '../../api/pagination';
import { personnelDisplayName } from '../../utils/personnel-display';
import { generateInitialPassword } from '../../utils/password-issue';
import { usePending } from '../../hooks/usePending';
import { assignableVacantPlantillas } from '../../utils/plantillaFilters';
import { Eye, Pencil, KeyRound, Ban, RotateCcw, X, LogOut, ShieldCheck, Search, Upload, UserPlus, Send, ChevronRight } from 'lucide-react';
import { RowActionMenu, RowAction } from '../../components/common/RowActionMenu';
import { accountActionsFor, ACCOUNT_STATUS_LABEL } from '../../api/accountActions';
import './review-list.css';
import './sysadmin-pages.css';
import { humanizeEnum } from '../../constants/transactionStatus';
import { AccountDetail } from './AccountDetail';
import { AccountRequestReview, PendingRequest } from './AccountRequestReview';

/** Today in the viewer's local time as YYYY-MM-DD, the upper bound for birth and hire dates. */
const todayDateInput = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

type AccountRecord = {
  id: number;
  email: string;
  role: string;
  accountStatus: 'PENDING' | 'ACTIVE' | 'LOCKED' | 'INACTIVE';
  createdAt: string;
  personnel?: {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    designation: string;
    address?: string;
    school?: string;
    district?: string;
  };
};

export const CredentialDistribution: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [usersList, setUsersList] = useState<AccountRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecord | null>(null);
  const [resetModalUser, setResetModalUser] = useState<AccountRecord | null>(null);
  const [editAccount, setEditAccount] = useState<AccountRecord | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [newResetPass, setNewResetPass] = useState(generateInitialPassword());
  const [loading, setLoading] = useState(true);

  const isAo = user?.role === 'AO_II';
  const isSysAdmin = user?.role === 'SYSTEM_ADMIN' || user?.role === 'HRMO';

  const defaultDistrict = DEPED_KORONADAL_DISTRICTS[0];
  const defaultSchool = defaultDistrict.schools[0];

  // Account creation form (Complete PDS CS Form 212 Fields + AO District/School Assignment)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    suffix: '',
    birthDate: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    civilStatus: 'SINGLE' as 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED',
    contactNumber: '',
    address: `${defaultSchool}, ${defaultDistrict.name}`,
    dateHired: '',
    email: '',
    password: generateInitialPassword(),
    position: isSysAdmin ? 'Administrative Officer II' : 'Teacher I',
    schoolAssignment: defaultSchool,
    selectedDistrictId: defaultDistrict.id,
    selectedSchool: defaultSchool,
    personnelType: (isSysAdmin ? 'AO_II' : 'TEACHING_PERSONNEL') as 'TEACHING_PERSONNEL' | 'NON_TEACHING_PERSONNEL' | 'AO_II' | 'HRMO' | 'SYSTEM_ADMIN',
  });

  const [accountRequests, setAccountRequests] = useState<any[]>([]);

  // Vacant Plantilla Items for Account Creation
  const [vacantPlantillas, setVacantPlantillas] = useState<any[]>([]);
  const [selectedPlantillaId, setSelectedPlantillaId] = useState<number | ''>('');
  const [isNonPlantilla, setIsNonPlantilla] = useState(false);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [pdsFile, setPdsFile] = useState<File | null>(null);
  const [privacyAttested, setPrivacyAttested] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [extractingPds, setExtractingPds] = useState(false);
  const [pdsExtractionNote, setPdsExtractionNote] = useState('');

  useEffect(() => {
    if (showAddModal) {
      setLoadingPlantillas(true);
      apiClient.get('/plantilla/available?forAssignment=true')
        .then(res => {
          setVacantPlantillas(res.data?.data || []);
        })
        .catch(err => {
          console.error('Failed to load vacant plantillas:', err);
          setVacantPlantillas([]);
        })
        .finally(() => setLoadingPlantillas(false));
    }
  }, [showAddModal]);

  const relevantVacantPlantillas = React.useMemo(
    () => assignableVacantPlantillas(vacantPlantillas, formData.personnelType === 'TEACHING_PERSONNEL' ? 'TEACHING' : 'NON_TEACHING'),
    [vacantPlantillas, formData.personnelType],
  );

  const handleSelectPlantilla = (pIdStr: string) => {
    if (!pIdStr) {
      setSelectedPlantillaId('');
      return;
    }
    const pId = Number(pIdStr);
    setSelectedPlantillaId(pId);
    const item = vacantPlantillas.find(p => p.id === pId);
    if (item) {
      setFormData(prev => ({
        ...prev,
        position: item.positionTitle,
        schoolAssignment: item.department || prev.schoolAssignment,
        address: `${item.department || prev.selectedSchool}, ${currentDistrict.name}`,
      }));
    }
  };

  // Automatically detect the AO's assigned district & school
  const aoStationInfo = React.useMemo(() => {
    if (!isAo || !user) return null;
    const text = `${(user as any).designation || ''} ${(user as any).address || ''} ${user.lastName || ''}`;
    for (const d of DEPED_KORONADAL_DISTRICTS) {
      for (const s of d.schools) {
        if (text.toLowerCase().includes(s.toLowerCase())) {
          return { districtId: d.id, districtName: d.name, schoolName: s };
        }
      }
    }
    return {
      districtId: DEPED_KORONADAL_DISTRICTS[0].id,
      districtName: DEPED_KORONADAL_DISTRICTS[0].name,
      schoolName: DEPED_KORONADAL_DISTRICTS[0].schools[0],
    };
  }, [isAo, user]);

  // Helpers for District & School selection
  const currentDistrict = DEPED_KORONADAL_DISTRICTS.find(d => d.id === formData.selectedDistrictId) || DEPED_KORONADAL_DISTRICTS[0];
  const currentDistrictSchools = currentDistrict.schools;

  // Set default station when modal opens or AO is detected
  useEffect(() => {
    if (isAo && aoStationInfo) {
      setFormData(prev => ({
        ...prev,
        selectedDistrictId: aoStationInfo.districtId,
        selectedSchool: aoStationInfo.schoolName,
        schoolAssignment: aoStationInfo.schoolName,
        address: `${aoStationInfo.schoolName}, ${aoStationInfo.districtName}`,
        personnelType: 'TEACHING_PERSONNEL',
        position: 'Teacher I',
        firstName: '',
        lastName: '',
        email: '',
      }));
    } else if (isSysAdmin && showAddModal) {
      if (formData.personnelType === 'AO_II' && (!formData.position || formData.position === 'Teacher I')) {
        const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === formData.selectedDistrictId) || defaultDistrict;
        const sch = formData.selectedSchool || defaultSchool;
        setFormData(prev => ({
          ...prev,
          position: 'Administrative Officer II',
          address: `${sch}, ${dist.name}`,
        }));
      }
    }
  }, [isAo, aoStationInfo, showAddModal, isSysAdmin]);

  const handleDistrictChange = (districtId: number) => {
    const district = DEPED_KORONADAL_DISTRICTS.find(d => d.id === districtId) || DEPED_KORONADAL_DISTRICTS[0];
    const firstSchool = district.schools[0] || 'District Office';
    
    setFormData(prev => {
      if (prev.personnelType === 'AO_II') {
        return {
          ...prev,
          selectedDistrictId: districtId,
          selectedSchool: firstSchool,
          schoolAssignment: firstSchool,
          position: 'Administrative Officer II',
          address: `${firstSchool}, ${district.name}`,
        };
      }
      return {
        ...prev,
        selectedDistrictId: districtId,
        selectedSchool: firstSchool,
        schoolAssignment: firstSchool,
        address: `${firstSchool}, ${district.name}`,
      };
    });
  };

  const handleSchoolChange = (schoolName: string) => {
    const district = DEPED_KORONADAL_DISTRICTS.find(d => d.id === formData.selectedDistrictId) || DEPED_KORONADAL_DISTRICTS[0];
    
    setFormData(prev => {
      if (prev.personnelType === 'AO_II') {
        return {
          ...prev,
          selectedSchool: schoolName,
          schoolAssignment: schoolName,
          position: 'Administrative Officer II',
          address: `${schoolName}, ${district.name}`,
        };
      }
      return {
        ...prev,
        selectedSchool: schoolName,
        schoolAssignment: schoolName,
        address: `${schoolName}, ${district.name}`,
      };
    });
  };

  // Real-time synchronization
  useRealtimeNotifications(() => {
    fetchUsers();
    fetchRequests();
  }, 3000);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllPages<AccountRecord>('/users');
      setUsersList(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsersList([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await apiClient.get('/users/requests');
      setAccountRequests(res.data?.data || []);
    } catch {
      setAccountRequests([]);
    }
  };

  const handleOpenAddModal = () => {
    setPdsFile(null);
    setPdsExtractionNote('');
    if (!isSysAdmin) {
      setFormData(prev => ({
        ...prev,
        personnelType: 'TEACHING_PERSONNEL',
        position: TEACHING_POSITIONS[0],
      }));
    }
    setPrivacyAttested(false);
    setShowAddModal(true);
  };

  const handlePdsSelected = async (file: File | null) => {
    setPdsExtractionNote('');
    if (!file) {
      setPdsFile(null);
      return;
    }
    const extension = file.name.toLowerCase().split('.').pop();
    if (!extension || !['pdf', 'png', 'jpg', 'jpeg'].includes(extension) || file.size > 10 * 1024 * 1024) {
      addToast('Choose a PDF, PNG, or JPEG PDS file up to 10 MB.', 'WARNING');
      setPdsFile(null);
      return;
    }
    setPdsFile(file);
    setExtractingPds(true);
    try {
      const extractionForm = new FormData();
      extractionForm.append('pdsFile', file);
      const response = await apiClient.post('/users/requests/extract-pds', extractionForm);
      const fields = response.data?.data?.fields || {};
      setFormData(previous => ({
        ...previous,
        firstName: fields.firstName || previous.firstName,
        lastName: fields.lastName || previous.lastName,
        middleName: fields.middleName || previous.middleName,
        suffix: fields.suffix || previous.suffix,
        birthDate: fields.birthDate || previous.birthDate,
        gender: ['MALE', 'FEMALE', 'OTHER'].includes(fields.gender) ? fields.gender : previous.gender,
        civilStatus: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'].includes(fields.civilStatus) ? fields.civilStatus : previous.civilStatus,
        contactNumber: fields.contactNumber || previous.contactNumber,
        email: fields.email || previous.email,
      }));
      setPdsExtractionNote('Recognized PDS details were filled in below. Review them before submitting.');
      addToast('PDS read successfully. Please review the extracted details.', 'SUCCESS');
    } catch (error: any) {
      setPdsExtractionNote('The file is attached, but automatic reading was incomplete. Enter or verify the details manually.');
      addToast(error?.response?.data?.message || 'The PDS is attached, but its fields could not be read automatically.', 'WARNING');
    } finally {
      setExtractingPds(false);
    }
  };

    const creatingAccount = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    void creatingAccount.run(() => handleCreateAccountUnguarded(e));
  };

  const handleCreateAccountUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSysAdmin && ['AO_II', 'HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType)) {
      addToast('Administrative Officers (AO II) can only request account creation for Teaching and Non-Teaching personnel.', 'ERROR');
      return;
    }

    const isCreatingAo = formData.personnelType === 'AO_II';
    const isDivisionLevel = formData.personnelType === 'HRMO' || formData.personnelType === 'SYSTEM_ADMIN';
    const isSchoolPersonnel = formData.personnelType === 'TEACHING_PERSONNEL' || formData.personnelType === 'NON_TEACHING_PERSONNEL';
    const effectiveFirstName = formData.firstName.trim();
    const effectiveLastName = formData.lastName.trim();

    if (!effectiveFirstName) {
      addToast('Please enter the First Name in Personal Details.', 'WARNING');
      return;
    }
    if (!effectiveLastName) {
      addToast('Please enter the Last Name in Personal Details.', 'WARNING');
      return;
    }
    if (!formData.email.trim()) {
      addToast('Please enter an Official Email Address.', 'WARNING');
      return;
    }
    if (!formData.password) {
      addToast('Please enter an Initial Password.', 'WARNING');
      return;
    }

    if (isSchoolPersonnel && !isNonPlantilla && !selectedPlantillaId) {
      addToast('Please select an authorized vacant Plantilla item to assign to this personnel.', 'WARNING');
      return;
    }

    try {
      const payload: any = {
        email: formData.email.trim(),
        password: formData.password,
        initialPassword: formData.password,
        role: formData.personnelType,
        firstName: effectiveFirstName,
        lastName: effectiveLastName,
        middleName: formData.middleName.trim(),
        suffix: formData.suffix.trim(),
        birthDate: formData.birthDate,
        gender: formData.gender,
        civilStatus: formData.civilStatus,
        contactNumber: formData.contactNumber.trim(),
        address: (
          formData.address.trim() || (
            isDivisionLevel
              ? (formData.personnelType === 'HRMO' ? 'Schools Division Office, SDO Koronadal City' : 'ICT Unit, Schools Division Office, SDO Koronadal City')
              : ''
          )
        ),
        designation: isCreatingAo
          ? 'Administrative Officer II'
          : isDivisionLevel
            ? (formData.personnelType === 'HRMO' ? 'HRMO Approver / Manager' : 'System Administrator')
            : formData.position,
        dateHired: formData.dateHired,
        nonPlantilla: isSchoolPersonnel && isNonPlantilla,
        district: isDivisionLevel ? undefined : isCreatingAo ? currentDistrict.name : undefined,
        schoolAssignment: isDivisionLevel ? undefined : isCreatingAo ? formData.selectedSchool : formData.schoolAssignment,
        plantillaItemId: isSchoolPersonnel && !isNonPlantilla && selectedPlantillaId ? Number(selectedPlantillaId) : undefined,
      };

      if (isSysAdmin) {
        const res = await apiClient.post('/users', payload);
        const created = res.data?.data;
        const displayName = `${effectiveFirstName} ${effectiveLastName}`;
        addToast(`Account created for ${displayName}! Employee ID: ${created?.employeeId || 'Generated'}.`, 'SUCCESS');
      } else {
        const requestForm = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== undefined && value !== null) requestForm.append(key, String(value));
        });
        requestForm.append('privacyAttested', 'true');
        if (pdsFile) requestForm.append('pdsFile', pdsFile);
        await apiClient.post('/users/requests', requestForm);
        const displayName = `${effectiveFirstName} ${effectiveLastName}`;
        addToast(`Account creation request for ${displayName} submitted to System Administrator for approval!`, 'SUCCESS');
      }

      setShowAddModal(false);
      setPdsFile(null);
      setPdsExtractionNote('');
      setFormData({
        firstName: '',
        lastName: '',
        middleName: '',
        suffix: '',
        birthDate: '',
        gender: 'MALE',
        civilStatus: 'SINGLE',
        contactNumber: '',
        address: '',
        dateHired: '',
        email: '',
        password: generateInitialPassword(),
        position: 'Teacher I',
        schoolAssignment: DEPED_REGION_12_SCHOOLS[0],
        selectedDistrictId: 1,
        selectedSchool: DEPED_KORONADAL_DISTRICTS[0].schools[0],
        personnelType: 'TEACHING_PERSONNEL',
      });
      fetchUsers();
      fetchRequests();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to process account request.';
      addToast(msg, 'ERROR');
    }
  };

  // --- Review dialog: the dialog itself is the confirmation, so no second prompt.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStartId, setReviewStartId] = useState<number | null>(null);
  const seenRequestIds = React.useRef<Set<number> | null>(null);
  const pendingRequests = accountRequests.filter(r => r.status === 'PENDING') as PendingRequest[];

  // Opens on arrival, from a notification (?request=ID), and whenever a request
  // the administrator has not seen yet comes in. Closing it ("Later") keeps the
  // strip on the page; it reopens only for a new request.
  useEffect(() => {
    if (!isSysAdmin) return;
    const ids = pendingRequests.map(r => r.id);
    const fromLink = Number(new URLSearchParams(window.location.search).get('request')) || null;
    if (seenRequestIds.current === null) {
      if (!ids.length && !fromLink) return;
      seenRequestIds.current = new Set(ids);
      if (ids.length) { setReviewStartId(fromLink); setReviewOpen(true); }
      return;
    }
    const fresh = ids.filter(id => !seenRequestIds.current!.has(id));
    fresh.forEach(id => seenRequestIds.current!.add(id));
    if (fresh.length) { setReviewStartId(fresh[0]); setReviewOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountRequests, isSysAdmin]);

  const duplicateOf = (r: PendingRequest): string | null => {
    const email = r.email.trim().toLowerCase();
    const hit = usersList.find(u => u.email.toLowerCase() === email
      || (!!r.employeeId && u.personnel?.employeeId === r.employeeId));
    if (!hit) return null;
    return hit.email.toLowerCase() === email
      ? `An account with ${r.email} already exists (${accountName(hit)}). Approving will fail; decline this one.`
      : `Employee ID ${r.employeeId} already belongs to ${accountName(hit)}.`;
  };

  const closeReview = React.useCallback(() => {
    setReviewOpen(false);
    // Drop ?request= so a refresh does not reopen the same request.
    if (window.location.search.includes('request=')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const approveFromReview =async (r: PendingRequest) => {
    try {
      const res = await apiClient.post(`/users/requests/${r.id}/approve`);
      addToast(`${r.firstName} ${r.lastName} approved (${res.data?.data?.employeeId}). The setup email is on its way.`, 'SUCCESS');
      setAccountRequests(list => list.map(x => (x.id === r.id ? { ...x, status: 'APPROVED' } : x)));
      fetchUsers(); fetchRequests();
      return true;
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to approve request.', 'ERROR');
      return false;
    }
  };

  const declineFromReview = async (r: PendingRequest, reason: string) => {
    try {
      await apiClient.post(`/users/requests/${r.id}/reject`, { reason });
      addToast(`Request for ${r.firstName} ${r.lastName} declined. The AO II has been told why.`, 'SUCCESS');
      setAccountRequests(list => list.map(x => (x.id === r.id ? { ...x, status: 'REJECTED', rejectionReason: reason } : x)));
      fetchRequests();
      return true;
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to decline request.', 'ERROR');
      return false;
    }
  };

  const approveAllFromReview = async () => {
    let ok = 0;
    const failed: string[] = [];
    for (const r of pendingRequests) {
      try { await apiClient.post(`/users/requests/${r.id}/approve`); ok++; setAccountRequests(list => list.map(x => (x.id === r.id ? { ...x, status: 'APPROVED' } : x))); }
      catch (err: any) { failed.push(err.response?.data?.message || `${r.firstName} ${r.lastName} failed`); }
    }
    addToast(failed.length ? `${ok} approved. ${failed.length} not approved: ${failed[0]}` : `${ok} approved. Setup emails are on their way.`, failed.length ? 'WARNING' : 'SUCCESS');
    fetchUsers(); fetchRequests();
  };

  // Mutations patch the one affected row; the list is not refetched.
  const patchAccount = (id: number, patch: Partial<AccountRecord>) =>
    setUsersList(list => list.map(account => (account.id === id ? { ...account, ...patch } : account)));

  const accountName = (u: AccountRecord) => (u.personnel ? `${u.personnel.firstName} ${u.personnel.lastName}` : u.email);

  // Session and device actions live on the account too, so everything about
  // one person is in one menu (System Administrator only; the API enforces it).
  const handleAccessAction = async (u: AccountRecord, kind: 'signout' | 'codes') => {
    const name = u.personnel ? `${u.personnel.firstName} ${u.personnel.lastName}` : u.email;
    const { confirmed, reason } = await confirm({
      title: kind === 'signout' ? 'Sign out everywhere' : 'Require sign-in codes',
      message: kind === 'signout'
        ? `End every session for ${name}? They will need to sign in again on each device.`
        : `Forget all trusted devices for ${name}? Each new sign-in will need an emailed code.`,
      confirmLabel: kind === 'signout' ? 'Sign out everywhere' : 'Require codes',
      tone: 'danger',
      reason: { label: 'Reason (recorded in the audit trail)', required: true },
    } as any);
    if (!confirmed) return;
    try {
      if (kind === 'signout') await apiClient.delete(`/admin/accounts/${u.id}/sessions`, { data: { reason, confirmOwn: u.id === user?.id } });
      else await apiClient.post(`/admin/accounts/${u.id}/require-device-verification`, { reason });
      addToast(kind === 'signout' ? `${name} was signed out everywhere.` : `${name} will need a code on every new device.`, 'SUCCESS');
    } catch (err: any) {
      addToast(err.response?.data?.message || 'The action failed.', 'ERROR');
    }
  };

  const handleSetAccountStatus = async (u: AccountRecord, next: 'ACTIVE' | 'INACTIVE') => {
    const deactivating = next === 'INACTIVE';
    const { confirmed } = await confirm({
      title: deactivating ? 'Deactivate account' : 'Reactivate account',
      message: deactivating
        ? `Deactivate the account of ${accountName(u)}? They are signed out and cannot sign in until the account is reactivated. Their records are kept.`
        : `Reactivate the account of ${accountName(u)}? They can sign in again with their existing credentials.`,
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      tone: deactivating ? 'danger' : 'primary',
    });
    if (!confirmed) return;
    try {
      const res = await apiClient.put(`/users/${u.id}`, { accountStatus: next });
      patchAccount(u.id, { accountStatus: res.data?.data?.accountStatus || next });
      addToast(deactivating ? `${accountName(u)}'s account was deactivated.` : `${accountName(u)}'s account was reactivated.`, 'SUCCESS');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'The account status could not be changed.', 'ERROR');
    }
  };

  const handleSaveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editAccount || savingAccount) return;
    const email = editEmail.trim().toLowerCase();
    if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) {
      addToast('Enter a valid email address.', 'WARNING');
      return;
    }
    setSavingAccount(true);
    try {
      const res = await apiClient.put(`/users/${editAccount.id}`, { email });
      patchAccount(editAccount.id, { email: res.data?.data?.email || email });
      addToast('Account updated.', 'SUCCESS');
      setEditAccount(null);
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'The account could not be updated.', 'ERROR');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDistribute = async (userId: number, email: string) => {
    const { confirmed } = await confirm({
      title: 'Send setup email',
      message: `Activate this account and email a setup link to ${email}? They set their own password from the link. If the email is delayed, it is still valid; use Resend only if it never arrives.`,
      confirmLabel: 'Send setup email',
      tone: 'primary',
      icon: 'credentials',
    });
    if (!confirmed) return;

    try {
      await apiClient.post(`/users/${userId}/distribute-credentials`);
      addToast(`Setup email queued for ${email}. The account is active.`, 'SUCCESS');
      fetchUsers();
      if (selectedAccount?.id === userId) {
        setSelectedAccount(prev => prev ? { ...prev, accountStatus: 'ACTIVE' } : null);
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to distribute credentials.', 'ERROR');
    }
  };

    const resettingPassword = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void resettingPassword.run(() => handleResetPasswordSubmitUnguarded(e));
  };

  const handleResetPasswordSubmitUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;

    const { confirmed } = await confirm({
      title: 'Reset password',
      message: `Reset the password for ${resetModalUser.email}? Their current password stops working immediately and any active session is invalidated.`,
      confirmLabel: 'Reset password',
    });
    if (!confirmed) return;

    try {
      const res = await apiClient.post(`/users/${resetModalUser.id}/reset-password`, { newPassword: newResetPass });
      const data = res.data?.data;
      addToast(`New password emailed to ${resetModalUser.email}.${data?.tempPassword ? ` Temporary password: ${data.tempPassword}` : ''}`, 'SUCCESS');
      setResetModalUser(null);
      fetchUsers();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to reset password.', 'ERROR');
    }
  };

  const pendingRequestsCount = accountRequests.filter(r => r.status === 'PENDING').length;

  // Strict defense-in-depth: AO II only sees Teaching & Non-Teaching personnel from their assigned station/district
  const displayedUsers = React.useMemo(() => {
    if (!isAo) return usersList;
    return usersList.filter(u => {
      // Exclude administrative accounts (SYSTEM_ADMIN, HRMO, AO_II)
      if (u.role !== 'TEACHING_PERSONNEL' && u.role !== 'NON_TEACHING_PERSONNEL') return false;
      // Do not show the AO's own user account in the credential handoff queue
      if (u.id === user?.id) return false;
      // Filter by station/school if available
      if (aoStationInfo?.schoolName) {
        const text = `${u.personnel?.address || ''} ${u.personnel?.designation || ''}`.toLowerCase();
        return text.includes(aoStationInfo.schoolName.toLowerCase());
      }
      return true;
    });
  }, [usersList, isAo, user?.id, aoStationInfo?.schoolName]);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountStatus, setAccountStatus] = useState('ALL');
  const [accountRole, setAccountRole] = useState<'ALL' | 'TEACHING' | 'NON_TEACHING' | 'OFFICE'>('ALL');

  const q = accountQuery.trim().toLowerCase();
  const statusCounts = displayedUsers.reduce<Record<string, number>>((m, u) => { m[u.accountStatus] = (m[u.accountStatus] || 0) + 1; return m; }, {});
  const roleKey = (r: string) => (r === 'TEACHING_PERSONNEL' ? 'TEACHING' : r === 'NON_TEACHING_PERSONNEL' ? 'NON_TEACHING' : 'OFFICE');
  const filteredUsers = displayedUsers.filter(u => {
    if (accountStatus !== 'ALL' && u.accountStatus !== accountStatus) return false;
    if (accountRole !== 'ALL' && roleKey(u.role) !== accountRole) return false;
    if (!q) return true;
    const p = u.personnel;
    return [u.email, p?.firstName, p?.lastName, p?.employeeId, p?.designation, p?.school].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const STATUS_FILTERS: [string, string][] = [['ALL', 'All'], ['PENDING', 'Pending distribution'], ['ACTIVE', 'Active'], ['LOCKED', 'Locked'], ['INACTIVE', 'Deactivated']];
  const STATUS_TONE: Record<string, string> = { PENDING: 'is-warn', ACTIVE: 'is-ok', LOCKED: 'is-bad', INACTIVE: 'is-muted' };
  const ini = (a?: string, b?: string) => `${a?.[0] || ''}${b?.[0] || ''}`.toUpperCase() || '?';

  return (
    <div className="sap animate-fade-in">
      <header className="sap-head">
        <div className="sap-head__title">
          <h1>Accounts</h1>
          {!isSysAdmin && <span className="sap-tag"><AppIcon name="school" size={14} /> {aoStationInfo?.schoolName || 'Assigned school'}</span>}
        </div>
        <div className="sap-head__actions">
          {isSysAdmin && (
            <button type="button" className="sap-btn sap-btn--ghost" onClick={() => setShowImport(true)}>
              <Upload size={18} aria-hidden="true" /> Import
            </button>
          )}
          <button type="button" className="sap-btn sap-btn--primary" onClick={handleOpenAddModal}>
            <UserPlus size={18} aria-hidden="true" /> {isSysAdmin ? 'New account' : 'Request account'}
          </button>
        </div>
      </header>
      {showImport && <PersonnelImportModal onClose={() => setShowImport(false)} onImported={() => { void fetchUsers(); }} />}

      {/* Administrators approve through the review dialog; the strip keeps waiting requests visible after "Later". */}
      {isSysAdmin && pendingRequests.length > 0 && (
        <div className="sap-strip" role="status">
          <span>{pendingRequests.length} account request{pendingRequests.length === 1 ? '' : 's'} waiting</span>
          <button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={() => { setReviewStartId(null); setReviewOpen(true); }}>Review</button>
        </div>
      )}
      {isSysAdmin && reviewOpen && pendingRequests.length > 0 && (
        <AccountRequestReview
          requests={pendingRequests}
          startId={reviewStartId}
          duplicateOf={duplicateOf}
          onApprove={approveFromReview}
          onDecline={declineFromReview}
          onApproveAll={approveAllFromReview}
          onClose={closeReview}
        />
      )}

      <section className="sap-stats" aria-label="Accounts by status">
        <div className="sap-stat"><span className="sap-stat__label">All accounts</span><span className="sap-stat__num">{displayedUsers.length}</span></div>
        <div className="sap-stat"><span className="sap-stat__label">Active</span><span className="sap-stat__num">{statusCounts.ACTIVE || 0}</span></div>
        <div className={`sap-stat${statusCounts.PENDING ? ' is-warn' : ''}`}><span className="sap-stat__label">Pending distribution</span><span className="sap-stat__num">{statusCounts.PENDING || 0}</span></div>
        <div className={`sap-stat${statusCounts.LOCKED ? ' is-bad' : ''}`}><span className="sap-stat__label">Locked</span><span className="sap-stat__num">{statusCounts.LOCKED || 0}</span></div>
      </section>

      {/* AO II: their own requests (AO II -> System Administrator) */}
      {!isSysAdmin && (
        <section className="sap-card" aria-labelledby="acr-title">
          <div className="sap-card__head">
            <h2 id="acr-title">My requests <small>{accountRequests.length}</small></h2>
            {pendingRequestsCount > 0 && <span className="sap-pill is-warn">{pendingRequestsCount} waiting</span>}
          </div>
          {accountRequests.length === 0 ? <div className="sap-empty">No requests yet.</div> : (
            <ul className="sap-rows">
              {accountRequests.map((req: any) => {
                const name = `${req.lastName}, ${req.firstName}${req.middleName ? ` ${req.middleName}` : ''}${req.suffix ? ` ${req.suffix}` : ''}`;
                return (
                  <li key={req.id} className="sap-row">
                    <span className="sap-avatar">{ini(req.firstName, req.lastName)}</span>
                    <div className="sap-who">
                      <span className="sap-who__name">{name}</span>
                      <span className="sap-who__line">{req.designation} · {humanizeEnum(req.role)}</span>
                      <span className="sap-who__mono">{req.email}</span>
                      {req.status === 'REJECTED' && req.rejectionReason && <span className="sap-who__line" style={{ color: 'var(--sap-bad)' }}>{req.rejectionReason}</span>}
                    </div>
                    <span className={`sap-pill ${req.status === 'APPROVED' ? 'is-ok' : req.status === 'REJECTED' ? 'is-bad' : 'is-warn'}`}>
                      {req.status === 'APPROVED' ? (req.createdUser?.personnel?.employeeId ? `Created · ${req.createdUser.personnel.employeeId}` : 'Created') : req.status === 'REJECTED' ? 'Rejected' : 'Waiting'}
                    </span>
                    <span />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="sap-card" aria-labelledby="acc-title">
        <div className="sap-card__head sap-card__head--stack">
          <h2 id="acc-title">Accounts <small>{filteredUsers.length === displayedUsers.length ? displayedUsers.length : `${filteredUsers.length} of ${displayedUsers.length}`}</small></h2>
          <div className="sap-toolbar">
            <label className="sap-search">
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Search accounts</span>
              <input type="search" value={accountQuery} onChange={e => setAccountQuery(e.target.value)} placeholder="Search name, email or employee ID" />
            </label>
            {!isAo && (
              <div className="sap-seg" role="group" aria-label="Role">
                {([['ALL', 'All roles'], ['TEACHING', 'Teaching'], ['NON_TEACHING', 'Non-teaching'], ['OFFICE', 'Office']] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={accountRole === k} onClick={() => setAccountRole(k)}>{l}</button>
                ))}
              </div>
            )}
          </div>
          <div className="sap-seg" role="group" aria-label="Status" style={{ justifySelf: 'start' }}>
            {STATUS_FILTERS.filter(([k]) => k === 'ALL' || statusCounts[k]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={accountStatus === k} onClick={() => setAccountStatus(k)}>
                {l} <b className={k === 'PENDING' || k === 'LOCKED' ? 'is-warn' : ''}>{k === 'ALL' ? displayedUsers.length : statusCounts[k]}</b>
              </button>
            ))}
          </div>
        </div>
        {displayedUsers.length === 0 ? (
          <div className="sap-empty">{isAo ? `No accounts yet for ${aoStationInfo?.schoolName || 'your school'}.` : 'No accounts yet.'}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="sap-empty">No accounts match.</div>
        ) : (
          <ul className="sap-rows">
            {filteredUsers.map(u => {
              const p = u.personnel;
              const name = p ? `${p.lastName}, ${p.firstName}` : u.email;
              const roleLabel = u.role === 'AO_II' ? 'AO II' : u.role === 'HRMO' ? 'HRMO' : u.role === 'SYSTEM_ADMIN' ? 'System Administrator' : u.role === 'TEACHING_PERSONNEL' ? 'Teaching' : 'Non-teaching';
              const station = ['SYSTEM_ADMIN', 'HRMO'].includes(u.role) ? 'Division office'
                : [p?.school || p?.address?.split(',')[0], p?.district].filter(Boolean).join(' · ');
              const allowed = accountActionsFor({ role: user?.role, userId: user?.id }, u);
              const menu: RowAction[] = [];
              if (allowed.includes('view')) menu.push({ id: 'view', label: 'View details', icon: <Eye size={16} aria-hidden="true" />, onSelect: () => setSelectedAccount(u) });
              if (allowed.includes('edit')) menu.push({ id: 'edit', label: 'Edit account', icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => { setEditAccount(u); setEditEmail(u.email); } });
              if (allowed.includes('resetPassword')) menu.push({ id: 'reset', label: 'Reset password', icon: <KeyRound size={16} aria-hidden="true" />, onSelect: () => { setResetModalUser(u); setNewResetPass(generateInitialPassword()); } });
              if (allowed.includes('reactivate')) menu.push({ id: 'reactivate', label: 'Reactivate account', icon: <RotateCcw size={16} aria-hidden="true" />, onSelect: () => void handleSetAccountStatus(u, 'ACTIVE') });
              if (isSysAdmin && u.accountStatus === 'ACTIVE') {
                menu.push({ id: 'signout', label: 'Sign out everywhere', icon: <LogOut size={16} aria-hidden="true" />, onSelect: () => void handleAccessAction(u, 'signout') });
                menu.push({ id: 'codes', label: 'Require sign-in codes', icon: <ShieldCheck size={16} aria-hidden="true" />, onSelect: () => void handleAccessAction(u, 'codes') });
              }
              if (allowed.includes('deactivate')) menu.push({ id: 'deactivate', label: 'Deactivate account', tone: 'danger', icon: <Ban size={16} aria-hidden="true" />, onSelect: () => void handleSetAccountStatus(u, 'INACTIVE') });
              return (
                <li key={u.id} className="sap-row">
                  <span className="sap-avatar">{p ? ini(p.firstName, p.lastName) : ini(u.email, u.email?.[1])}</span>
                  <div className="sap-who">
                    <span className="sap-who__name">{name} <span className="sap-tag">{roleLabel}</span></span>
                    <span className="sap-who__line">{p?.designation || roleLabel}{station ? ` · ${station}` : ''}</span>
                    <span className="sap-who__mono">{p?.employeeId ? `${p.employeeId} · ` : ''}{u.email}</span>
                  </div>
                  <span className={`sap-pill ${STATUS_TONE[u.accountStatus] || 'is-muted'}`}>{(ACCOUNT_STATUS_LABEL as Record<string, string>)[u.accountStatus] || 'Unknown'}</span>
                  <div className="sap-row__actions">
                    {allowed.includes('distribute') && (
                      <button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={() => handleDistribute(u.id, u.email)}>
                        <Send size={17} aria-hidden="true" /> Send setup email
                      </button>
                    )}
                    <RowActionMenu label={`Actions for ${name}`} actions={menu} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Past requests (System Administrator) */}
      {isSysAdmin && accountRequests.some(r => r.status !== 'PENDING') && (
        <details className="sap-card sap-disclosure">
          <summary><ChevronRight size={22} aria-hidden="true" /> Past requests <span className="sap-tag">{accountRequests.filter(r => r.status !== 'PENDING').length}</span></summary>
          <ul className="sap-rows">
            {accountRequests.filter(r => r.status !== 'PENDING').map((req: any) => (
              <li key={req.id} className="sap-row">
                <span className="sap-avatar">{ini(req.firstName, req.lastName)}</span>
                <div className="sap-who">
                  <span className="sap-who__name">{req.lastName}, {req.firstName}</span>
                  <span className="sap-who__line">{req.designation} · {humanizeEnum(req.role)}</span>
                  <span className="sap-who__mono">{req.email}</span>
                  {req.status === 'REJECTED' && req.rejectionReason && <span className="sap-who__line" style={{ color: 'var(--sap-bad)' }}>{req.rejectionReason}</span>}
                </div>
                <span className={`sap-pill ${req.status === 'APPROVED' ? 'is-ok' : 'is-bad'}`}>
                  {req.status === 'APPROVED' ? (req.createdUser?.personnel?.employeeId ? `Created · ${req.createdUser.personnel.employeeId}` : 'Created') : 'Declined'}
                </span>
                <span />
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Account Creation Modal */}
      {showAddModal && createPortal(
        <ModalOverlay onDismiss={() => setShowAddModal(false)} className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 900,
              width: '95%',
              maxHeight: '90vh',
              borderRadius: '20px',
              backgroundColor: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
                borderBottom: '1px solid var(--color-border)',
                padding: '20px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexShrink: 0,
              }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981 0%, #2f7d52 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AppIcon name="credentials" size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>
                  {isSysAdmin ? 'Create Account' : 'Request Account Creation'}
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  {isSysAdmin
                    ? 'Initialize credentials and profile for AO II, HRMO, System Admin, or personnel.'
                    : 'Submit PDS details for teachers or staff to request credentials from System Admin.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px', fontWeight: 700, flexShrink: 0 }}
              >✕</button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflow: 'hidden' }}>
              <div style={{ padding: '20px 28px', overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Row 1: Role + Position + District + School — 4-col */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="employment" size={14} /> Role & Assignment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700 }}>Role / Category <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <select aria-label="Role / Category"
                        className="form-input"
                        value={formData.personnelType}
                        onChange={e => {
                          const cat = e.target.value as any;
                          const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === formData.selectedDistrictId) || defaultDistrict;
                          const sch = formData.selectedSchool || defaultSchool;
                          if (cat === 'AO_II') {
                            setFormData(prev => ({ ...prev, personnelType: 'AO_II', selectedDistrictId: dist.id, selectedSchool: sch, schoolAssignment: sch, firstName: prev.firstName === 'AO II' ? '' : prev.firstName, lastName: prev.lastName === sch ? '' : prev.lastName, email: prev.email.startsWith('ao.') ? '' : prev.email, position: 'Administrative Officer II', address: `${sch}, ${dist.name}` }));
                          } else if (cat === 'HRMO') {
                            setFormData(prev => ({ ...prev, personnelType: 'HRMO', firstName: prev.firstName === 'AO II' ? '' : prev.firstName, lastName: prev.lastName === sch ? '' : prev.lastName, email: prev.email.startsWith('ao.') ? '' : prev.email, position: 'HRMO Approver / Manager', schoolAssignment: '', selectedSchool: '', address: 'Schools Division Office, SDO Koronadal City' }));
                          } else if (cat === 'SYSTEM_ADMIN') {
                            setFormData(prev => ({ ...prev, personnelType: 'SYSTEM_ADMIN', firstName: prev.firstName === 'AO II' ? '' : prev.firstName, lastName: prev.lastName === sch ? '' : prev.lastName, email: prev.email.startsWith('ao.') ? '' : prev.email, position: 'System Administrator', schoolAssignment: '', selectedSchool: '', address: 'Schools Division Office, SDO Koronadal City' }));
                          } else {
                            const defaultPos = cat === 'TEACHING_PERSONNEL' ? TEACHING_POSITIONS[0] : NON_TEACHING_POSITIONS[0];
                            setFormData(prev => ({ ...prev, personnelType: cat, firstName: prev.firstName === 'AO II' ? '' : prev.firstName, lastName: prev.lastName === sch ? '' : prev.lastName, email: prev.email.startsWith('ao.') ? '' : prev.email, position: defaultPos, schoolAssignment: sch, address: `${sch}, ${dist.name}` }));
                          }
                        }}
                      >
                        <optgroup label="DepEd Personnel Roles">
                          <option value="TEACHING_PERSONNEL">Teaching Personnel</option>
                          <option value="NON_TEACHING_PERSONNEL">Non-Teaching Personnel</option>
                        </optgroup>
                        {isSysAdmin && (
                          <optgroup label="Administrative System Roles">
                            <option value="AO_II">Administrative Officer II</option>
                            {/* Division-level roles are granted by a System Administrator only (server-enforced). */}
                            {user?.role === 'SYSTEM_ADMIN' && (
                              <>
                                <option value="HRMO">HRMO Approver / Manager</option>
                                <option value="SYSTEM_ADMIN">System Administrator</option>
                              </>
                            )}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    {['AO_II', 'HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType) ? (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Position / Designation <span style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(Auto)</span>
                        </label>
                        <input aria-label="Position / Designation (Auto)"
                          type="text"
                          className="form-input"
                          value={formData.position}
                          disabled
                          style={{ opacity: 0.7, cursor: 'not-allowed', background: 'var(--color-bg-secondary)' }}
                        />
                      </div>
                    ) : (
                      <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
                            {isNonPlantilla ? 'Contractual Position Title' : 'Authorized Vacant Plantilla Item'} <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {!isNonPlantilla && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginLeft: 8, fontWeight: 500 }}>
                                (Select to auto-assign Position, Salary Grade & Station)
                              </span>
                            )}
                          </label>
                          <label style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-muted)', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={isNonPlantilla}
                              onChange={e => {
                                const checked = e.target.checked;
                                setIsNonPlantilla(checked);
                                if (checked) {
                                  setSelectedPlantillaId('');
                                }
                              }}
                            />
                            Non-Plantilla / COS / Job Order
                          </label>
                        </div>

                        {isNonPlantilla ? (
                          <input
                            aria-label="Contractual Position Title"
                            type="text"
                            className="form-input"
                            value={formData.position}
                            onChange={e => setFormData({ ...formData, position: e.target.value })}
                            placeholder="e.g. Project Development Officer I / Contractual Staff"
                            required
                          />
                        ) : (
                          <>
                            <select
                              aria-label="Authorized Vacant Plantilla Item"
                              className="form-input"
                              value={selectedPlantillaId}
                              onChange={e => handleSelectPlantilla(e.target.value)}
                              required
                            >
                              <option value="">
                                {loadingPlantillas
                                  ? 'Loading vacant plantilla posts...'
                                  : relevantVacantPlantillas.length === 0
                                    ? '-- No Vacant Plantilla Items Available --'
                                    : `-- Select Authorized Vacant Plantilla (${relevantVacantPlantillas.length} Available) --`}
                              </option>
                              {relevantVacantPlantillas.map(p => (
                                <option key={p.id} value={p.id}>
                                  [Item #{p.itemNumber}] {p.positionTitle} (SG {p.salaryGrade}) — {p.department}
                                </option>
                              ))}
                            </select>

                            {selectedPlantillaId ? (() => {
                              const p = vacantPlantillas.find(item => item.id === Number(selectedPlantillaId));
                              if (!p) return null;
                              return (
                                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span className="badge badge-success" style={{ fontSize: '0.8125rem', padding: '3px 8px', fontWeight: 700 }}>
                                      ● Plantilla Assigned
                                    </span>
                                    <div style={{ fontSize: '0.8125rem' }}>
                                      <strong>Item:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{p.itemNumber}</span>
                                      <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
                                      <strong>Position:</strong> {p.positionTitle} (Salary Grade {p.salaryGrade})
                                      <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
                                      <strong>Station:</strong> {p.department}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setSelectedPlantillaId(''); }}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'underline' }}
                                  >
                                    Clear
                                  </button>
                                </div>
                              );
                            })() : null}
                          </>
                        )}
                      </div>
                    )}
                    {!['HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType) && (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>
                            Assigned District <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {formData.personnelType === 'AO_II' && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select aria-label="Assigned District"
                            className="form-input"
                            value={formData.selectedDistrictId}
                            onChange={e => {
                              if (isAo) return;
                              if (formData.personnelType === 'AO_II') {
                                handleDistrictChange(Number(e.target.value));
                              } else {
                                const dId = Number(e.target.value);
                                const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === dId) || DEPED_KORONADAL_DISTRICTS[0];
                                const sch = dist.schools[0] || '';
                                setFormData(prev => ({ ...prev, selectedDistrictId: dId, selectedSchool: sch, schoolAssignment: sch, address: `${sch}, ${dist.name}` }));
                              }
                            }}
                            disabled={isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType)}
                            style={isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType) ? { opacity: 0.7, cursor: 'not-allowed', background: 'var(--color-bg-secondary)' } : {}}
                            required
                          >
                            {DEPED_KORONADAL_DISTRICTS.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.schools.length} Schools)</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>
                            School Station <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {formData.personnelType === 'AO_II' && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select aria-label="School Station"
                            className="form-input"
                            value={formData.selectedSchool}
                            onChange={e => {
                              if (isAo) return;
                              if (formData.personnelType === 'AO_II') {
                                handleSchoolChange(e.target.value);
                              } else {
                                const sch = e.target.value;
                                setFormData(prev => ({ ...prev, selectedSchool: sch, schoolAssignment: sch, address: `${sch}, ${currentDistrict.name}` }));
                              }
                            }}
                            disabled={isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType)}
                            style={isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType) ? { opacity: 0.7, cursor: 'not-allowed', background: 'var(--color-bg-secondary)' } : {}}
                            required
                          >
                            {currentDistrictSchools.map(school => (
                              <option key={school} value={school}>{school}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType) && (
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="document" size={14} /> Personnel PDS
                    </div>
                    <div style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-bg-secondary)' }}>
                      <label className="form-label" htmlFor="account-request-pds" style={{ fontWeight: 700 }}>
                        Upload signed Personal Data Sheet (PDS) <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span>
                      </label>
                      <input
                        id="account-request-pds"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                        onChange={event => void handlePdsSelected(event.target.files?.[0] || null)}
                        disabled={extractingPds || creatingAccount.pending}
                        style={{ display: 'block', width: '100%', marginTop: 6 }}
                      />
                      <div style={{ marginTop: 7, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                        PDF, PNG, or JPEG up to 10 MB. Recognized identity fields will be filled automatically; the PDS will become part of the personnel's Digital 201 file after approval.
                      </div>
                      {extractingPds && (
                        <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                          Reading PDS fields…
                        </div>
                      )}
                      {pdsExtractionNote && !extractingPds && (
                        <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                          {pdsExtractionNote}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Row 2: Personal Information. An AO II is a person, so it applies to them as well. */}
                {(
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="profile" size={14} /> Personal Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, 1fr 1fr 1fr 1fr)', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          First Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input type="text" className="form-input" placeholder="e.g. Maria" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '').toUpperCase() })} required aria-label="First Name" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Middle Name</label>
                        <input type="text" className="form-input" placeholder="e.g. Bautista" value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '').toUpperCase() })} aria-label="Middle Name" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          Last Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input type="text" className="form-input" placeholder="e.g. Santos" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '').toUpperCase() })} required aria-label="Last Name" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Suffix</label>
                        <select
                          aria-label="Suffix"
                          className="form-input"
                          value={formData.suffix}
                          onChange={e => setFormData({ ...formData, suffix: e.target.value })}
                        >
                          {NAME_SUFFIX_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                          {formData.suffix && !NAME_SUFFIX_OPTIONS.some(opt => opt.value === formData.suffix) && (
                            <option value={formData.suffix}>{formData.suffix}</option>
                          )}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Date of Birth <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input aria-label="Date of Birth" type="date" className="form-input" max={todayDateInput()} value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Sex / Gender <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select aria-label="Sex / Gender" className="form-input" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value as any })}>
                          <option value="FEMALE">Female</option>
                          <option value="MALE">Male</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Civil Status <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select aria-label="Civil Status" className="form-input" value={formData.civilStatus} onChange={e => setFormData({ ...formData, civilStatus: e.target.value as any })}>
                          <option value="SINGLE">Single</option>
                          <option value="MARRIED">Married</option>
                          <option value="WIDOWED">Widowed</option>
                          <option value="SEPARATED">Separated</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Row 3: Credentials */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="credentials" size={14} /> Contact & Credentials
                  </div>
                  {(
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, 1fr 1fr 1fr 1fr)', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Email Address <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input type="email" className="form-input" placeholder="name@deped.gov.ph" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required aria-label="Email Address" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Mobile Number</label>
                        <input type="tel" inputMode="numeric" maxLength={13} className="form-input" placeholder="09171234567" value={formData.contactNumber} onChange={e => setFormData({ ...formData, contactNumber: e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '') })} aria-label="Mobile Number" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Date Hired <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input aria-label="Date Hired" type="date" className="form-input" max={todayDateInput()} value={formData.dateHired} onChange={e => setFormData({ ...formData, dateHired: e.target.value })} required />
                      </div>
                      {/* The initial password is generated for the person and emailed to them; nobody types it. */}
                      <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                        <label className="form-label">Station Address</label>
                        <input type="text" className="form-input" placeholder="School Campus, City, Province" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} aria-label="Station Address" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!isSysAdmin && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 28px', borderTop: '1px solid var(--color-border)', fontSize: '.9rem', lineHeight: 1.45, cursor: 'pointer' }}>
                  <input type="checkbox" checked={privacyAttested} onChange={e => setPrivacyAttested(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, flex: 'none', accentColor: '#2f7d52' }} />
                  <span>I confirm this person has been informed of the Digital 201 <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Notice</a> and that I am authorized to submit their personal data.</span>
                </label>
              )}

              {/* Footer */}
              <div style={{ padding: '14px 28px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                <button type="submit" disabled={creatingAccount.pending || extractingPds || (!isSysAdmin && !privacyAttested)} className="btn btn-primary" style={{ borderRadius: '9999px', fontWeight: 700 }}>
                  {formData.personnelType === 'AO_II'
                    ? (isSysAdmin ? 'Create AO II Account' : 'Submit AO II Request')
                    : (isSysAdmin ? 'Create Personnel Account' : 'Submit Request to System Admin')}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>,
        document.body
      )}

      {/* Reset Password Modal (Sys Admin) */}
      {resetModalUser && createPortal(
        <ModalOverlay onDismiss={() => setResetModalUser(null)} className="modal-overlay" onClick={() => setResetModalUser(null)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="credentials" size={18} /> Reset Credentials: {resetModalUser.email}
              </h3>
              <button className="modal-close" onClick={() => setResetModalUser(null)}>×</button>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="alert alert-info mb-4" style={{ fontSize: 13 }}>
                <span>
                  This resets the password for <strong>{resetModalUser.email}</strong>, signs out their sessions and forgets their trusted devices. The new temporary password and a one-time setup link are <strong>emailed to them</strong>. Hand the password over yourself only if their email cannot be reached.
                </span>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">New Temporary Password *</label>
                <input 
                  aria-label="New Temporary Password"
                  type="text" 
                  className="form-input" 
                  value={newResetPass} 
                  onChange={e => setNewResetPass(e.target.value)} 
                  required 
                  minLength={8}
                />
              </div>

              <div className="modal-footer">
                <button type="submit" disabled={resettingPassword.pending} className="btn btn-primary">Reset & Save</button>
              </div>
            </form>
          </div>
        </ModalOverlay>,
        document.body
      )}

      {/* Edit Account Modal */}
      {editAccount && createPortal(
        <ModalOverlay onDismiss={() => setEditAccount(null)} className="modal-overlay">
          <form
            className="animate-scale-in"
            onSubmit={handleSaveAccount}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-account-title"
            style={{ width: 'min(480px, 94vw)', borderRadius: 16, background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="edit-account-title" style={{ margin: 0, fontSize: '1.125rem' }}>Edit account</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>{accountName(editAccount)}</p>
              </div>
              <button type="button" className="panel-close-button" onClick={() => setEditAccount(null)} aria-label="Close edit account">
                <X aria-hidden="true" />
              </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" htmlFor="edit-account-email">Official email address</label>
              <input
                id="edit-account-email"
                type="email"
                className="form-input"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                required
                autoFocus
              />
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Personnel details are edited from Personnel Management.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--color-border)' }}>
              <button type="submit" className="btn btn-primary" disabled={savingAccount || editEmail.trim().toLowerCase() === editAccount.email}>
                {savingAccount ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </ModalOverlay>,
        document.body,
      )}

      {/* View Personnel Info Modal */}
      {selectedAccount && (() => {
        const u = selectedAccount;
        const allowed = accountActionsFor({ role: user?.role, userId: user?.id }, u);
        const close = () => setSelectedAccount(null);
        return (
          <AccountDetail
            account={u as any}
            canSeeAccess={isSysAdmin}
            onClose={close}
            actions={{
              edit: allowed.includes('edit') ? () => { close(); setEditAccount(u); setEditEmail(u.email); } : undefined,
              resetPassword: allowed.includes('resetPassword') ? () => { close(); setResetModalUser(u); setNewResetPass(generateInitialPassword()); } : undefined,
              sendSetup: allowed.includes('distribute') ? () => { close(); void handleDistribute(u.id, u.email); } : undefined,
              activate: allowed.includes('reactivate') ? () => { close(); void handleSetAccountStatus(u, 'ACTIVE'); } : undefined,
              deactivate: allowed.includes('deactivate') ? () => { close(); void handleSetAccountStatus(u, 'INACTIVE'); } : undefined,
              signOutEverywhere: isSysAdmin ? () => handleAccessAction(u, 'signout') : undefined,
              requireCodes: isSysAdmin ? () => handleAccessAction(u, 'codes') : undefined,
            }}
          />
        );
      })()}
    </div>
  );
};
