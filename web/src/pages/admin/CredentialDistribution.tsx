import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { TEACHING_POSITIONS, NON_TEACHING_POSITIONS, DEPED_REGION_12_SCHOOLS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import apiClient from '../../api/client';
import { getAllPages } from '../../api/pagination';
import { personnelDisplayName } from '../../utils/personnel-display';

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
  };
};

export const CredentialDistribution: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const [usersList, setUsersList] = useState<AccountRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecord | null>(null);
  const [resetModalUser, setResetModalUser] = useState<AccountRecord | null>(null);
  const [newResetPass, setNewResetPass] = useState('Reset@Pass2026!');
  const [loading, setLoading] = useState(true);

  const isAo = user?.role === 'AO_II';
  const isSysAdmin = user?.role === 'SYSTEM_ADMIN' || user?.role === 'HRMO';

  const defaultDistrict = DEPED_KORONADAL_DISTRICTS[0];
  const defaultSchool = defaultDistrict.schools[0];
  const defaultSchoolSlug = defaultSchool.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

  // Account creation form (Complete PDS CS Form 212 Fields + AO District/School Assignment)
  const [formData, setFormData] = useState({
    firstName: isSysAdmin ? 'AO II' : '',
    lastName: isSysAdmin ? defaultSchool : '',
    middleName: '',
    suffix: '',
    birthDate: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    civilStatus: 'SINGLE' as 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED',
    contactNumber: '',
    address: `${defaultSchool}, ${defaultDistrict.name}`,
    dateHired: '',
    email: isSysAdmin ? `ao.${defaultSchoolSlug}@deped.gov.ph` : '',
    password: 'Personnel@Pass123',
    position: isSysAdmin ? `Administrative Officer II - ${defaultSchool} (${defaultDistrict.name})` : 'Teacher I',
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

  useEffect(() => {
    if (showAddModal) {
      setLoadingPlantillas(true);
      apiClient.get('/plantilla/available')
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

  const relevantVacantPlantillas = React.useMemo(() => {
    const isTeaching = formData.personnelType === 'TEACHING_PERSONNEL';
    return vacantPlantillas.filter(p => {
      const title = (p.positionTitle || '').toLowerCase();
      const isTeacherTitle = title.includes('teacher') || title.includes('master') || title.includes('head teacher') || title.includes('principal');
      if (isTeaching && !isTeacherTitle) return false;
      if (!isTeaching && isTeacherTitle) return false;
      return true;
    });
  }, [vacantPlantillas, formData.personnelType]);

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
        const sSlug = sch.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
        setFormData(prev => ({
          ...prev,
          firstName: prev.firstName || 'AO II',
          lastName: prev.lastName || sch,
          position: `Administrative Officer II - ${sch} (${dist.name})`,
          email: prev.email || `ao.${sSlug}@deped.gov.ph`,
          address: `${sch}, ${dist.name}`,
        }));
      }
    }
  }, [isAo, aoStationInfo, showAddModal, isSysAdmin]);

  const handleDistrictChange = (districtId: number) => {
    const district = DEPED_KORONADAL_DISTRICTS.find(d => d.id === districtId) || DEPED_KORONADAL_DISTRICTS[0];
    const firstSchool = district.schools[0] || 'District Office';
    const schoolSlug = firstSchool.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    
    setFormData(prev => {
      if (prev.personnelType === 'AO_II') {
        return {
          ...prev,
          selectedDistrictId: districtId,
          selectedSchool: firstSchool,
          schoolAssignment: firstSchool,
          firstName: 'AO II',
          lastName: firstSchool,
          email: `ao.${schoolSlug}@deped.gov.ph`,
          position: `Administrative Officer II - ${firstSchool} (${district.name})`,
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
    const schoolSlug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    
    setFormData(prev => {
      if (prev.personnelType === 'AO_II') {
        return {
          ...prev,
          selectedSchool: schoolName,
          schoolAssignment: schoolName,
          firstName: 'AO II',
          lastName: schoolName,
          email: `ao.${schoolSlug}@deped.gov.ph`,
          position: `Administrative Officer II - ${schoolName} (${district.name})`,
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
    if (!isSysAdmin) {
      setFormData(prev => ({
        ...prev,
        personnelType: 'TEACHING_PERSONNEL',
        position: TEACHING_POSITIONS[0],
      }));
    }
    setShowAddModal(true);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSysAdmin && ['AO_II', 'HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType)) {
      addToast('Administrative Officers (AO II) can only request account creation for Teaching and Non-Teaching personnel.', 'ERROR');
      return;
    }

    const isCreatingAo = formData.personnelType === 'AO_II';
    const isDivisionLevel = formData.personnelType === 'HRMO' || formData.personnelType === 'SYSTEM_ADMIN';
    const isSchoolPersonnel = formData.personnelType === 'TEACHING_PERSONNEL' || formData.personnelType === 'NON_TEACHING_PERSONNEL';
    const effectiveFirstName = isCreatingAo ? 'AO II' : formData.firstName.trim();
    const effectiveLastName = isCreatingAo ? formData.selectedSchool : formData.lastName.trim();

    if (!isCreatingAo && !effectiveFirstName) {
      addToast('Please enter the First Name in Personal Details.', 'WARNING');
      return;
    }
    if (!isCreatingAo && !effectiveLastName) {
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
        middleName: isCreatingAo ? '' : formData.middleName.trim(),
        suffix: isCreatingAo ? '' : formData.suffix.trim(),
        birthDate: isCreatingAo ? undefined : formData.birthDate,
        gender: isCreatingAo ? undefined : formData.gender,
        civilStatus: isCreatingAo ? undefined : formData.civilStatus,
        contactNumber: isCreatingAo ? '' : formData.contactNumber.trim(),
        address: isCreatingAo ? `${formData.selectedSchool}, ${currentDistrict.name}` : (
          formData.address.trim() || (
            isDivisionLevel
              ? (formData.personnelType === 'HRMO' ? 'Schools Division Office, SDO Koronadal City' : 'ICT Unit, Schools Division Office, SDO Koronadal City')
              : ''
          )
        ),
        designation: isCreatingAo
          ? `Administrative Officer II - ${formData.selectedSchool} (${currentDistrict.name})`
          : isDivisionLevel
            ? (formData.personnelType === 'HRMO' ? 'HRMO Approver / Manager' : 'System Administrator')
            : formData.position,
        dateHired: isCreatingAo ? undefined : formData.dateHired,
        nonPlantilla: isSchoolPersonnel && isNonPlantilla,
        district: isDivisionLevel ? undefined : isCreatingAo ? currentDistrict.name : undefined,
        schoolAssignment: isDivisionLevel ? undefined : isCreatingAo ? formData.selectedSchool : formData.schoolAssignment,
        plantillaItemId: isSchoolPersonnel && !isNonPlantilla && selectedPlantillaId ? Number(selectedPlantillaId) : undefined,
      };

      if (isSysAdmin) {
        const res = await apiClient.post('/users', payload);
        const created = res.data?.data;
        const displayName = isCreatingAo ? `AO II ${formData.selectedSchool}` : `${effectiveFirstName} ${effectiveLastName}`;
        addToast(`Station Account created for ${displayName}! Employee ID: ${created?.employeeId || 'Generated'}.`, 'SUCCESS');
      } else {
        await apiClient.post('/users/requests', payload);
        const displayName = isCreatingAo ? `AO II ${formData.selectedSchool}` : `${effectiveFirstName} ${effectiveLastName}`;
        addToast(`Account creation request for ${displayName} submitted to System Administrator for approval!`, 'SUCCESS');
      }

      setShowAddModal(false);
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
        password: 'Personnel@Pass123',
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

  const handleApproveRequest = async (requestId: number, name: string) => {
    try {
      const res = await apiClient.post(`/users/requests/${requestId}/approve`);
      const data = res.data?.data;
      addToast(`Request Approved! User credentials & profile created for ${name} (Employee ID: ${data?.employeeId}). Notification sent to AO II.`, 'SUCCESS');
      fetchUsers();
      fetchRequests();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to approve request.', 'ERROR');
    }
  };

  const handleRejectRequest = async (requestId: number, name: string) => {
    const reason = window.prompt(`Enter rejection reason for ${name}:`, 'Incomplete or unverified details.');
    if (reason === null) return;
    try {
      await apiClient.post(`/users/requests/${requestId}/reject`, { reason });
      addToast(`Request for ${name} rejected. Notification sent to AO II.`, 'SUCCESS');
      fetchUsers();
      fetchRequests();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to reject request.', 'ERROR');
    }
  };

  const handleDistribute = async (userId: number, email: string) => {
    try {
      await apiClient.post(`/users/${userId}/distribute-credentials`);
      addToast(`Credentials distributed and account activated for ${email}!`, 'SUCCESS');
      fetchUsers();
      if (selectedAccount?.id === userId) {
        setSelectedAccount(prev => prev ? { ...prev, accountStatus: 'ACTIVE' } : null);
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to distribute credentials.', 'ERROR');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    try {
      const res = await apiClient.post(`/users/${resetModalUser.id}/reset-password`, { newPassword: newResetPass });
      const data = res.data?.data;
      addToast(`Password for ${resetModalUser.email} reset successfully! Temp Password: ${data?.tempPassword || newResetPass}`, 'SUCCESS');
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

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div>
          <div className="topbar-title">Account Creation & Credential Handoff</div>
          <div className="topbar-subtitle">
            {isSysAdmin
              ? 'System Administrator Module — Review AO II Account Requests, create accounts, and distribute access'
              : `AO II Module — Account management for ${aoStationInfo?.schoolName || 'your assigned school'} (${aoStationInfo?.districtName || 'District'})`
            }
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary btn-sm" onClick={handleOpenAddModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {isSysAdmin ? (
              <>+ Create Personnel Account</>
            ) : (
              <><AppIcon name="checklist" size={14} /> Request Account Creation</>
            )}
          </button>
        </div>
      </div>


      <div className="page-content">

        {/* Account Creation Requests Section (AO II -> SysAdmin Workflow) */}
        <div className="card mb-6" style={{ borderTop: '4px solid var(--color-warning)' }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AppIcon name="checklist" size={18} />
                Account Creation Requests {isSysAdmin ? '(System Admin Approval Queue)' : '(Submitted by AO II)'}
              </h3>
              <p className="text-xs text-muted">
                {isSysAdmin
                  ? 'Review, verify credentials, and approve account requests submitted by Administrative Officers (AO II).'
                  : 'Track status of your submitted account creation requests for teachers and staff assigned under your division.'
                }
              </p>
            </div>
            {pendingRequestsCount > 0 && isSysAdmin && (
              <span className="badge badge-warning" style={{ fontSize: 12, padding: '4px 10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AppIcon name="quick-action" size={12} /> {pendingRequestsCount} Pending Approval
              </span>
            )}
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Target Personnel Name</th>
                  <th>Requested Position / Role</th>
                  <th>Email Address</th>
                  <th>Requested By (AO II)</th>
                  <th>Status</th>
                  <th>Action / Details</th>
                </tr>
              </thead>
              <tbody>
                {accountRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                      {isSysAdmin
                        ? 'No account creation requests submitted by AO IIs yet.'
                        : 'You have not submitted any account creation requests yet. Click "Request Account Creation" above to submit one.'
                      }
                    </td>
                  </tr>
                ) : (
                  accountRequests.map((req: any) => (
                    <tr key={req.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.lastName}, {req.firstName} {req.middleName || ''} {req.suffix || ''}</div>
                        <div className="text-xs text-muted">Contact: {req.contactNumber || 'N/A'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.designation}</div>
                        <div className="text-xs text-muted">{req.role}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{req.email}</td>
                      <td>
                        <div className="text-xs font-semibold">{req.requestedByUser?.email}</div>
                      </td>
                      <td>
                        {req.status === 'APPROVED' ? (
                          <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="check" size={12} /> Approved & Created
                          </span>
                        ) : req.status === 'REJECTED' ? (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="close" size={12} /> Rejected
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="pending" size={12} /> Pending SysAdmin Approval
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', minWidth: 0 }}>
                        {isSysAdmin && req.status === 'PENDING' ? (
                          <div className="flex gap-2" style={{ flexWrap: 'nowrap' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleApproveRequest(req.id, `${req.firstName} ${req.lastName}`)}
                            >
                              <AppIcon name="check" size={13} /> Approve & Create Credentials
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--color-danger)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleRejectRequest(req.id, `${req.firstName} ${req.lastName}`)}
                            >
                              <AppIcon name="close" size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-muted">
                            {req.status === 'APPROVED' && req.createdUser?.personnel?.employeeId ? (
                              <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                                ID: {req.createdUser.personnel.employeeId}
                              </span>
                            ) : req.status === 'REJECTED' ? (
                              <span style={{ color: 'var(--color-danger)' }}>{req.rejectionReason || 'Rejected'}</span>
                            ) : (
                              <span>Awaiting System Admin approval</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Master Accounts Table */}
        <div className="card">
          <h3 className="card-title mb-4">
            Personnel Accounts & Credential Handoff Queue ({displayedUsers.length})
          </h3>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee ID</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Full Name & Position</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Email</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Personnel Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Account Status</th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: 280 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                      {isAo
                        ? `No personnel accounts found for ${aoStationInfo?.schoolName || 'your assigned school'}. Click "Request Account Creation" above to submit account creation requests for teachers and staff.`
                        : 'No personnel accounts created yet. Click "+ Create Personnel Account" above to initialize accounts for Teaching and Non-Teaching personnel.'}
                    </td>
                  </tr>
                ) : (
                  displayedUsers.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {u.personnel?.employeeId || <span className="text-muted text-xs">Generating...</span>}
                      </td>
                      <td>
                        {u.role === 'AO_II' ? (
                          <div>
                            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="school" size={13} /> {u.personnel?.lastName || 'District School AO'}
                              </span>
                              <span className="badge badge-primary" style={{ fontSize: 9, fontWeight: 700 }}>AO II</span>
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 2, fontWeight: 500 }}>
                              {u.personnel?.designation || 'Administrative Officer II'}
                            </div>
                            {u.personnel?.address && (
                              <div className="text-xs font-semibold" style={{ color: 'var(--color-primary-light)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AppIcon name="location" size={12} /> {u.personnel.address}
                              </div>
                            )}
                          </div>
                        ) : ['SYSTEM_ADMIN', 'HRMO'].includes(u.role) ? (
                          <div>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{u.personnel ? `${u.personnel.lastName}, ${u.personnel.firstName}` : u.email}</span>
                              <span className={`badge ${u.role === 'SYSTEM_ADMIN' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: 9, fontWeight: 700 }}>
                                {u.role === 'SYSTEM_ADMIN' ? 'SYS ADMIN' : 'HRMO'}
                              </span>
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                              {u.personnel?.designation || (u.role === 'SYSTEM_ADMIN' ? 'System Administrator' : 'HRMO Approver / Manager')}
                            </div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--color-primary-light)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AppIcon name="settings" size={12} /> Division-Wide Scope (SDO Koronadal City • No District)
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {u.personnel ? `${u.personnel.lastName}, ${u.personnel.firstName}` : u.email}
                            </div>
                            <div className="text-xs text-muted">{u.personnel?.designation || 'Personnel'}</div>
                            {u.personnel?.address && (
                              <div className="text-xs font-semibold" style={{ color: 'var(--color-primary-light)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <AppIcon name="school" size={12} /> {u.personnel.address.split(',')[0]}
                                </span>
                                {u.personnel.address.includes(',') && (
                                  <>
                                    <span style={{ opacity: 0.6 }}>•</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <AppIcon name="location" size={12} /> {u.personnel.address.split(',').slice(1).join(',').trim()}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{u.email}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {u.role === 'AO_II' ? (
                          <span className="badge badge-primary" style={{ fontWeight: 700 }}>
                            Administrative Officer
                          </span>
                        ) : u.role === 'HRMO' ? (
                          <span className="badge badge-warning">HRMO</span>
                        ) : u.role === 'SYSTEM_ADMIN' ? (
                          <span className="badge badge-danger">System Admin</span>
                        ) : (
                          <span className="badge badge-info">
                            {u.role === 'TEACHING_PERSONNEL' ? 'Teaching' : 'Non-Teaching'}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {u.accountStatus === 'ACTIVE' ? (
                          <span className="badge badge-approved">Active & Distributed</span>
                        ) : (
                          <span className="badge badge-pending">Pending Distribution</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', minWidth: 280 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
                          {u.accountStatus === 'PENDING' && (
                            <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => handleDistribute(u.id, u.email)}>
                              Distribute Credentials
                            </button>
                          )}
                          {isSysAdmin && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => { setResetModalUser(u); setNewResetPass('Reset@Pass2026!'); }}
                            >
                              <AppIcon name="credentials" size={14} /> Reset Password
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setSelectedAccount(u)}>
                            View Info
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Account Creation Modal */}
      {showAddModal && createPortal(
        <ModalOverlay className="modal-overlay" onClick={() => setShowAddModal(false)}>
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
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981 0%, #2563eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="employment" size={14} /> Role & Assignment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700 }}>Role / Category <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <select
                        className="form-input"
                        value={formData.personnelType}
                        onChange={e => {
                          const cat = e.target.value as any;
                          const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === formData.selectedDistrictId) || defaultDistrict;
                          const sch = formData.selectedSchool || defaultSchool;
                          const sSlug = sch.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
                          if (cat === 'AO_II') {
                            setFormData(prev => ({ ...prev, personnelType: 'AO_II', selectedDistrictId: dist.id, selectedSchool: sch, schoolAssignment: sch, firstName: 'AO II', lastName: sch, email: `ao.${sSlug}@deped.gov.ph`, position: `Administrative Officer II - ${sch} (${dist.name})`, address: `${sch}, ${dist.name}` }));
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
                            <option value="AO_II">Administrative Officer II (AO II / SO II)</option>
                            <option value="HRMO">HRMO Approver / Manager</option>
                            <option value="SYSTEM_ADMIN">System Administrator</option>
                          </optgroup>
                        )}
                      </select>
                    </div>
                    {['AO_II', 'HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType) ? (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Position / Designation <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(Auto)</span>
                        </label>
                        <input
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
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 8, fontWeight: 500 }}>
                                (Select to auto-assign Position, Salary Grade & Station)
                              </span>
                            )}
                          </label>
                          <label style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-muted)', userSelect: 'none' }}>
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
                                    <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '3px 8px', fontWeight: 700 }}>
                                      ● Plantilla Assigned
                                    </span>
                                    <div style={{ fontSize: '0.8rem' }}>
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
                                    style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'underline' }}
                                  >
                                    Clear
                                  </button>
                                </div>
                              );
                            })() : (
                              <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AppIcon name="info" size={14} />
                                <span>Personnel will be bound to this official DBM plantilla post upon account activation.</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {['HRMO', 'SYSTEM_ADMIN'].includes(formData.personnelType) ? (
                      <div style={{ gridColumn: '1 / -1', padding: '14px 18px', borderRadius: 10, background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ padding: 6, borderRadius: 8, background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex' }}>
                          <AppIcon name="settings" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: 2 }}>
                            Division-Wide Scope (SDO Koronadal City) — No District Assigned
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                            System Administrator and HRMO roles have division-wide operational authority across all clusters and schools. They are not assigned to individual schools or districts. Only Station Accounts (AO II) are assigned to specific schools and district clusters.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>
                            Assigned District <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {formData.personnelType === 'AO_II' && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select
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
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select
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
                        {/* Info alert for AO II */}
                        {formData.personnelType === 'AO_II' && (
                          <div style={{ gridColumn: '1 / -1', marginTop: 8, fontSize: '0.75rem', color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.08)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <AppIcon name="info" size={16} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <div>
                                <strong>Station Account Name:</strong> <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>AO II {formData.selectedSchool || 'School Station'}</span>
                              </div>
                              <div style={{ marginTop: 2, opacity: 0.85 }}>
                                Station Officer accounts do not require personal civilian details. Designation: <strong>{formData.position}</strong>
                              </div>
                            </div>
                          </div>
                        )}
                        {isAo && ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(formData.personnelType) && (
                          <div style={{ gridColumn: '1 / -1', marginTop: 8, fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AppIcon name="info" size={14} color="#10b981" />
                            <span>
                              Auto-assigned to <strong>{formData.selectedSchool}</strong> under <strong>{currentDistrict.name}</strong>
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2: Personal Info — Hidden for AO II */}
                {formData.personnelType !== 'AO_II' && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="profile" size={14} /> Personal Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, 1fr 1fr 1fr 1fr)', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          First Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input type="text" className="form-input" placeholder="e.g. Maria" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Middle Name</label>
                        <input type="text" className="form-input" placeholder="e.g. Bautista" value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          Last Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input type="text" className="form-input" placeholder="e.g. Santos" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, '') })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Suffix</label>
                        <select
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
                        <input type="date" className="form-input" value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Sex / Gender <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select className="form-input" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value as any })}>
                          <option value="FEMALE">Female</option>
                          <option value="MALE">Male</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Civil Status <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <select className="form-input" value={formData.civilStatus} onChange={e => setFormData({ ...formData, civilStatus: e.target.value as any })}>
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
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="credentials" size={14} /> {formData.personnelType === 'AO_II' ? 'Account Credentials' : 'Contact & Credentials'}
                  </div>
                  {formData.personnelType === 'AO_II' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, repeat(2, minmax(0, 1fr)))', gap: '14px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Station Email Address <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="ao.school@deped.gov.ph"
                          value={formData.email}
                          onChange={e => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Initial Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={formData.password}
                          onChange={e => setFormData({ ...formData, password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, 1fr 1fr 1fr 1fr)', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Email Address <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input type="email" className="form-input" placeholder="name@deped.gov.ph" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Mobile Number</label>
                        <input type="tel" inputMode="numeric" maxLength={13} className="form-input" placeholder="09171234567" value={formData.contactNumber} onChange={e => setFormData({ ...formData, contactNumber: e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '') })} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Date Hired <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input type="date" className="form-input" value={formData.dateHired} onChange={e => setFormData({ ...formData, dateHired: e.target.value })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Initial Password <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input type="text" className="form-input" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required />
                      </div>
                      <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                        <label className="form-label">Station Address</label>
                        <input type="text" className="form-input" placeholder="School Campus, City, Province" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 28px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)} style={{ borderRadius: '9999px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ borderRadius: '9999px', fontWeight: 700 }}>
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
        <ModalOverlay className="modal-overlay" onClick={() => setResetModalUser(null)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="credentials" size={18} /> Reset Credentials: {resetModalUser.email}
              </h3>
              <button className="modal-close" onClick={() => setResetModalUser(null)}>×</button>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
                <span>
                  This action will update the password hash for <strong>{resetModalUser.email}</strong>, revoke active sessions, and send a notification with the new temporary credentials.
                </span>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">New Temporary Password *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newResetPass} 
                  onChange={e => setNewResetPass(e.target.value)} 
                  required 
                  minLength={8}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setResetModalUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Reset & Save</button>
              </div>
            </form>
          </div>
        </ModalOverlay>,
        document.body
      )}

      {/* View Personnel Info Modal */}
      {selectedAccount && createPortal(
        <ModalOverlay className="modal-overlay" onClick={() => setSelectedAccount(null)}>
          <div
            className="animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 680,
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
            {/* Profile Hero Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)',
                borderBottom: '1px solid var(--color-border)',
                padding: '24px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: '18px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                }}
              >
                {(selectedAccount.personnel?.firstName?.[0] || selectedAccount.email?.[0] || 'U').toUpperCase()}
                {(selectedAccount.personnel?.lastName?.[0] || '').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                  {personnelDisplayName(selectedAccount.personnel, selectedAccount.role) || selectedAccount.email}
                </h3>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{selectedAccount.personnel?.designation || selectedAccount.role}</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                    {selectedAccount.personnel?.employeeId || 'Pending'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <span className={`badge ${selectedAccount.accountStatus === 'ACTIVE' ? 'badge-approved' : 'badge-pending'}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                  {selectedAccount.accountStatus}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAccount(null)}
                  aria-label="Close"
                  style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px', fontWeight: 700 }}
                >✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: '1 1 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 14, background: 'var(--color-bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Employee ID</div>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontSize: '0.9375rem' }}>
                    {selectedAccount.personnel?.employeeId || 'Pending Generation'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Full Name</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                    {personnelDisplayName(selectedAccount.personnel, selectedAccount.role) || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Designation / Role</div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{selectedAccount.personnel?.designation || selectedAccount.role}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Station / Scope</div>
                  <div style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {['SYSTEM_ADMIN', 'HRMO'].includes(selectedAccount.role) ? (
                      <>
                        <AppIcon name="settings" size={13} color="var(--color-primary-light)" />
                        <span style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>Division Office (SDO Koronadal City) — Division-Wide Scope (No District)</span>
                      </>
                    ) : (
                      selectedAccount.personnel?.address || 'City Schools Division of Koronadal'
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Email Address</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{selectedAccount.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Account Status</div>
                  <span className={`badge ${selectedAccount.accountStatus === 'ACTIVE' ? 'badge-approved' : 'badge-pending'}`}>
                    {selectedAccount.accountStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 28px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setSelectedAccount(null)} style={{ borderRadius: '9999px' }}>Close</button>
              {isSysAdmin && (
                <button 
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: '9999px' }}
                  onClick={() => {
                    const u = selectedAccount;
                    setSelectedAccount(null);
                    setResetModalUser(u);
                    setNewResetPass('Reset@Pass2026!');
                  }}
                >
                  <AppIcon name="credentials" size={14} /> Reset Password
                </button>
              )}
              {selectedAccount.accountStatus === 'PENDING' && (
                <button className="btn btn-primary" onClick={() => handleDistribute(selectedAccount.id, selectedAccount.email)} style={{ borderRadius: '9999px', fontWeight: 700 }}>
                  Distribute Credentials Now
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>,
        document.body
      )}
    </div>
  );
};
