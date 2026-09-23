import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import { personnelDisplayName } from '../../utils/personnel-display';
import { TEACHING_POSITIONS, NON_TEACHING_POSITIONS, DEPED_REGION_12_SCHOOLS, DEPED_KORONADAL_DISTRICTS, NAME_SUFFIX_OPTIONS } from '../../constants/depedData';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import apiClient from '../../api/client';
import { accessDeniedMessage, isAccessDenied } from '../../api/access';
import { getAllPages } from '../../api/pagination';
import { Copy, Check, ExternalLink, ShieldCheck, Award, Building2, MapPin, Phone, Mail, User, Calendar, Briefcase, FileText, CheckCircle2, AlertCircle, X, Edit } from 'lucide-react';
import { usePending } from '../../hooks/usePending';
import { generateInitialPassword } from '../../utils/password-issue';

type PersonnelItem = {
  isCredentialFallback?: boolean;
  id: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  birthDate?: string;
  gender?: string;
  civilStatus?: string;
  contactNumber?: string;
  address?: string;
  designation: string;
  status: string;
  dateHired: string;
  profileComplete: boolean;
  user?: { email: string; lastLogin?: string; role?: { name: string } };
  plantillaItem?: { itemNumber: string; positionTitle: string; salaryGrade: number; department: string };
  transactions?: Array<{ uploadedDocuments?: Array<{ id: number; fileName: string; status: string; requirementTemplate?: { name: string } }> }>;
};

export const PersonnelManagement: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const [personnel, setPersonnel] = useState<PersonnelItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PersonnelItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // ─── 201 File Edit State & Form Bindings ──────────────────────────
  const [isEditing201, setIsEditing201] = useState(false);
  const [saving201, setSaving201] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editSuffix, setEditSuffix] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [editCivilStatus, setEditCivilStatus] = useState<string>('SINGLE');
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editDateHired, setEditDateHired] = useState('');
  const [editStatus, setEditStatus] = useState<string>('ACTIVE');

  const handleSelectPersonnel = (p: PersonnelItem) => {
    setSelected(p);
    setIsEditing201(false);
    setEditFirstName(p.firstName || '');
    setEditLastName(p.lastName || '');
    setEditMiddleName(p.middleName || '');
    setEditSuffix(p.suffix || '');
    setEditBirthDate(p.birthDate ? p.birthDate.split('T')[0] : '');
    setEditGender((p.gender as any) || 'MALE');
    setEditCivilStatus(p.civilStatus || 'SINGLE');
    setEditContactNumber(p.contactNumber || '');
    setEditAddress(p.address || '');
    setEditDesignation(p.designation || '');
    setEditDateHired(p.dateHired ? p.dateHired.split('T')[0] : '');
    setEditStatus(p.status || 'ACTIVE');
    apiClient.get(`/personnel/${p.id}`).then(response => {
      const detail = response.data?.data;
      // Only if the officer has not moved on to another record meanwhile.
      if (detail) setSelected(current => (current?.id === p.id ? detail : current));
    }).catch(err => {
      if (!isAccessDenied(err)) return;
      // No longer this officer's record to see: nothing from the list row stays open.
      setSelected(current => (current?.id === p.id ? null : current));
      setIsEditing201(false);
      addToast(accessDeniedMessage('personnel record'), 'ERROR');
      void fetchPersonnel();
    });
  };

  const handleApply201Changes = async () => {
    if (!selected) return;
    setSaving201(true);
    try {
      const payload: any = {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        middleName: editMiddleName.trim() || null,
        suffix: editSuffix.trim() || null,
        birthDate: editBirthDate || undefined,
        gender: editGender,
        civilStatus: editCivilStatus,
        contactNumber: editContactNumber.trim() || null,
        address: editAddress.trim() || null,
        designation: editDesignation.trim(),
        dateHired: editDateHired || undefined,
        status: editStatus,
      };

      const res = await apiClient.put(`/personnel/${selected.id}`, payload);
      const updated = res.data?.data;
      if (updated) {
        setPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p));
        setSelected(updated);
        handleSelectPersonnel(updated);
      }
      setIsEditing201(false);
      addToast('201 File changes applied and stored in database successfully!', 'SUCCESS');
    } catch (err: any) {
      if (err.response?.status === 404) {
        setSelected(null);
        setIsEditing201(false);
        addToast(accessDeniedMessage('personnel record'), 'ERROR');
        void fetchPersonnel();
        return;
      }
      console.error('Failed to update 201 file in database:', err);
      addToast(err.response?.data?.message || 'Failed to save 201 file changes.', 'ERROR');
    } finally {
      setSaving201(false);
    }
  };

  // Add Personnel Form State (Complete PDS CS Form 212 Fields)
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newMiddleName, setNewMiddleName] = useState('');
  const [newSuffix, setNewSuffix] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  const [newGender, setNewGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [newCivilStatus, setNewCivilStatus] = useState<'SINGLE' | 'MARRIED' | 'WIDOWED' | 'SEPARATED'>('SINGLE');
  const [newContactNumber, setNewContactNumber] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDateHired, setNewDateHired] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState(generateInitialPassword());
  const [newCategory, setNewCategory] = useState<string>('AO_II');
  const [newDistrictId, setNewDistrictId] = useState(1);
  const [newSchool, setNewSchool] = useState(DEPED_KORONADAL_DISTRICTS[0].schools[0]);
  const [newDesignation, setNewDesignation] = useState(`Administrative Officer II - ${DEPED_KORONADAL_DISTRICTS[0].schools[0]} (${DEPED_KORONADAL_DISTRICTS[0].name})`);

  // Vacant Plantilla state for employee creation
  const [vacantPlantillas, setVacantPlantillas] = useState<any[]>([]);
  const [selectedPlantillaId, setSelectedPlantillaId] = useState<number | ''>('');
  const [isNonPlantilla, setIsNonPlantilla] = useState(false);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);

  useEffect(() => {
    if (showAddModal) {
      setLoadingPlantillas(true);
      apiClient.get('/plantilla/available?excludePromotions=true')
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
    const isTeaching = newCategory === 'TEACHING';
    return vacantPlantillas.filter(p => {
      // Plantilla must not be reserved or open for grab in an active promotion cycle!
      if (p.isOpenForRanking || p.promotionCycle) return false;
      const title = (p.positionTitle || '').toLowerCase();
      const isTeacherTitle = title.includes('teacher') || title.includes('master') || title.includes('head teacher') || title.includes('principal');
      if (isTeaching && !isTeacherTitle) return false;
      if (!isTeaching && isTeacherTitle) return false;
      return true;
    });
  }, [vacantPlantillas, newCategory]);

  const handleSelectPlantilla = (pIdStr: string) => {
    if (!pIdStr) {
      setSelectedPlantillaId('');
      return;
    }
    const pId = Number(pIdStr);
    setSelectedPlantillaId(pId);
    const item = vacantPlantillas.find(p => p.id === pId);
    if (item) {
      setNewDesignation(item.positionTitle);
      if (item.department) {
        setNewSchool(item.department);
      }
    }
  };

  const isAo = user?.role === 'AO_II';
  const canManage = user?.role === 'HRMO';

  // Enable Real-time sync across web and mobile
  useRealtimeNotifications(() => {
    fetchPersonnel();
  }, 3000);

  const fetchPersonnel = async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (isAo) {
        // Both endpoints are independently scoped by the server to this AO's
        // station. Reconcile credential-linked records here so a list endpoint
        // failure or response-shape drift cannot silently show an empty roster.
        const [personnelResult, accountResult] = await Promise.allSettled([
          getAllPages<PersonnelItem>('/personnel'),
          getAllPages<{ id: number; email: string; role: string; personnel?: Partial<PersonnelItem> & { id: number } }>('/users'),
        ]);
        const rows = personnelResult.status === 'fulfilled' ? personnelResult.value : [];
        const accounts = accountResult.status === 'fulfilled' ? accountResult.value : [];
        if (personnelResult.status === 'rejected' && accountResult.status === 'rejected') throw personnelResult.reason;
        const byId = new Map(rows.map(row => [row.id, row]));
        let recoveredFromCredentials = 0;
        for (const account of accounts) {
          if (!account.personnel || !['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(account.role)) continue;
          if (!byId.has(account.personnel.id)) {
            recoveredFromCredentials++;
            byId.set(account.personnel.id, {
              ...account.personnel,
              id: account.personnel.id,
              employeeId: account.personnel.employeeId || '',
              firstName: account.personnel.firstName || '',
              lastName: account.personnel.lastName || '',
              designation: account.personnel.designation || '',
              status: '',
              dateHired: '',
              profileComplete: false,
              isCredentialFallback: true,
              user: { email: account.email, role: { name: account.role } },
            });
          }
        }
        setPersonnel([...byId.values()]);
        if (personnelResult.status === 'rejected') setLoadError('Showing station accounts from Credentials; the detailed personnel roster could not be loaded. Retry for full records.');
        else if (recoveredFromCredentials > 0) setLoadError(`${recoveredFromCredentials} station account(s) appeared in Credentials but not the personnel list. They are shown here; ask an administrator to check the roster endpoint.`);
      } else {
        setPersonnel(await getAllPages<PersonnelItem>('/personnel'));
      }
    } catch (err: any) {
      console.error('Failed to load personnel:', err);
      setLoadError(err?.response?.data?.message || 'Personnel records could not be loaded. Retry or contact your administrator.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = personnel.filter(p => {
    return (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (p.employeeId && p.employeeId.toLowerCase().includes(search.toLowerCase())) ||
      (p.designation && p.designation.toLowerCase().includes(search.toLowerCase()))
    );
  });

    const addingPersonnel = usePending();
  // Double-clicking used to send this twice, creating duplicate records.
  const handleAddPersonnel = (e: React.FormEvent) => {
    e.preventDefault();
    void addingPersonnel.run(() => handleAddPersonnelUnguarded(e));
  };

  const handleAddPersonnelUnguarded = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      addToast('Access denied. HRMO or System Admin privileges required.', 'ERROR');
      return;
    }

    try {
      const isDivisionLevel = newCategory === 'HRMO' || newCategory === 'SYSTEM_ADMIN';
      const currentDist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === newDistrictId) || DEPED_KORONADAL_DISTRICTS[0];
      const roleName = newCategory === 'TEACHING'
        ? 'TEACHING_PERSONNEL'
        : newCategory === 'NON_TEACHING'
          ? 'NON_TEACHING_PERSONNEL'
          : newCategory;

      const effectiveSchool = isDivisionLevel ? undefined : newSchool;
      const effectiveDistrict = isDivisionLevel ? undefined : currentDist.name;

      const effectiveDesignation = newCategory === 'AO_II'
        ? `Administrative Officer II - ${newSchool} (${currentDist.name})`
        : newCategory === 'HRMO'
          ? 'HRMO Approver / Manager'
          : newCategory === 'SYSTEM_ADMIN'
            ? 'System Administrator'
            : newDesignation;

      const effectiveAddress = isDivisionLevel
        ? (newCategory === 'HRMO' ? 'Schools Division Office, SDO Koronadal City' : 'ICT Unit, Schools Division Office, SDO Koronadal City')
        : (newAddress || `${newSchool}, ${currentDist.name}`);

      if (newCategory !== 'AO_II' && (!newFirstName.trim() || !newLastName.trim())) {
        addToast('First Name and Last Name are required.', 'ERROR');
        return;
      }

      const isSchoolPersonnel = newCategory === 'TEACHING' || newCategory === 'NON_TEACHING';
      if (isSchoolPersonnel && !isNonPlantilla && !selectedPlantillaId) {
        addToast('Please select an authorized vacant Plantilla item to assign to this employee.', 'WARNING');
        return;
      }

      const payload: any = {
        email: newEmail.trim(),
        password: newPassword,
        role: roleName,
        nonPlantilla: isSchoolPersonnel && isNonPlantilla,
        firstName: newCategory === 'AO_II' ? 'AO II' : newFirstName.trim(),
        lastName: newCategory === 'AO_II' ? newSchool : newLastName.trim(),
        middleName: newCategory === 'AO_II' ? undefined : newMiddleName,
        suffix: newCategory === 'AO_II' ? undefined : newSuffix,
        birthDate: newCategory === 'AO_II' ? undefined : newBirthDate,
        gender: newCategory === 'AO_II' ? undefined : newGender,
        civilStatus: newCategory === 'AO_II' ? undefined : newCivilStatus,
        contactNumber: newContactNumber,
        address: effectiveAddress,
        designation: effectiveDesignation,
        dateHired: newDateHired,
        schoolAssignment: effectiveSchool,
        district: effectiveDistrict,
        plantillaItemId: isSchoolPersonnel && !isNonPlantilla && selectedPlantillaId ? Number(selectedPlantillaId) : undefined,
      };

      const res = await apiClient.post('/users', payload);
      const createdUser = res.data?.data;
      addToast(`Account created for ${payload.firstName} ${payload.lastName}! Role: ${roleName}. Employee ID: ${createdUser?.employeeId || 'Generated'}.`, 'SUCCESS');
      
      setShowAddModal(false);
      setSelectedPlantillaId('');
      setIsNonPlantilla(false);
      setNewFirstName('');
      setNewLastName('');
      setNewMiddleName('');
      setNewSuffix('');
      setNewContactNumber('');
      setNewAddress('');
      setNewEmail('');
      setNewPassword(generateInitialPassword());
      setNewCategory('AO_II');
      const defaultDist = DEPED_KORONADAL_DISTRICTS[0];
      const defaultSch = defaultDist.schools[0];
      setNewDistrictId(defaultDist.id);
      setNewSchool(defaultSch);
      setNewDesignation(`Administrative Officer II - ${defaultSch} (${defaultDist.name})`);

      fetchPersonnel();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create personnel account.';
      addToast(msg, 'ERROR');
    }
  };

  const complianceRows = selected ? [
    { label: 'PDS CS Form 212', pattern: /personal data sheet|\bpds\b/i },
    { label: 'Oath of Office', pattern: /oath of office/i },
    { label: 'PRC License / Eligibility', pattern: /prc|license|eligibility/i },
  ].map(row => {
    const documents = (selected.transactions || []).flatMap(t => t.uploadedDocuments || []);
    const document = documents.find(d => row.pattern.test(`${d.requirementTemplate?.name || ''} ${d.fileName || ''}`));
    return { ...row, document, status: document?.status || 'NOT_SUBMITTED' };
  }) : [];

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="topbar-title" style={{ margin: 0 }}>Personnel Records Management</h1>
          {user?.role === 'AO_II' ? (
            <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600 }}>
              <AppIcon name="school" size={13} /> {(user as any).designation || user.lastName || 'Assigned School'}
            </span>
          ) : user?.role === 'HRMO' ? (
            <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600 }}>
              <AppIcon name="settings" size={13} /> SDO Koronadal City (Division-Wide)
            </span>
          ) : null}
        </div>
        <div className="topbar-actions">
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              + Add Personnel
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {loadError && <div className="alert alert-danger" role="alert">{loadError} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchPersonnel()}>Retry</button></div>}
        <div className="filter-row">
          <div className="search-bar" style={{ flex: 1, maxWidth: 400 }}>
            <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <AppIcon name="search" size={14} color="var(--color-text-muted)" />
            </span>
            <input 
              aria-label="Search by name, employee ID, designation"
              type="text" 
              className="search-input"
              style={{ paddingLeft: '44px' }}
              placeholder="Search by name, employee ID, designation…" 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper personnel-records-table-wrapper">
          <table className="table personnel-records-table table-cards">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Full Name</th>
                <th>Assigned Station & District</th>
                <th>Designation</th>
                <th>Plantilla Item</th>
                <th>Status</th>
                <th>Profile Complete</th>
                <th className="personnel-records-action-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loadError ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    No personnel records found. Click "+ Add Personnel" above to create employee accounts for Teaching and Non-Teaching personnel.
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id}>
                    <td data-label="Employee ID" style={{ fontFamily: 'var(--font-mono)' }}>{p.employeeId}</td>
                    <td data-label="Full Name" style={{ fontWeight: 600 }}>{personnelDisplayName(p, p.user?.role?.name)}</td>
                    <td data-label="Station & District">
                      {['SYSTEM_ADMIN', 'HRMO'].includes(p.user?.role?.name || '') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-primary-light)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="settings" size={12} /> SDO Koronadal City
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            Division-Wide Scope (No District)
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-primary-light)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="school" size={12} /> {p.address?.split(',')[0] || 'Assigned School'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="location" size={12} /> {p.address?.includes('District') ? p.address.split(',').slice(1).join(',').trim() : (p.address?.includes(',') ? p.address.split(',').slice(1).join(',').trim() : 'District Station')}
                          </span>
                        </div>
                      )}
                    </td>
                    <td data-label="Designation">{p.designation}</td>
                    <td data-label="Plantilla Item" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {p.isCredentialFallback ? 'Details not loaded' : p.plantillaItem ? `${p.plantillaItem.itemNumber} (SG ${p.plantillaItem.salaryGrade})` : 'P-Unassigned'}
                    </td>
                    <td data-label="Status">{p.isCredentialFallback ? 'Not loaded' : <StatusBadge status={p.status} />}</td>
                    <td data-label="Profile">
                      {p.isCredentialFallback ? 'Not loaded' : <span className={`badge ${p.profileComplete ? 'badge-approved' : 'badge-deficiency'}`}>
                        {p.profileComplete ? 'Complete' : 'Incomplete'}
                      </span>}
                    </td>
                    <td data-label="Action" className="personnel-records-action-cell">
                      <button className="btn btn-ghost btn-sm personnel-view-details-btn" onClick={() => handleSelectPersonnel(p)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Side Panel Modal */}
      {selected && (() => {
        const fullName = personnelDisplayName(selected, selected.user?.role?.name);
        const initials = `${selected.firstName?.[0] || ''}${selected.lastName?.[0] || ''}`.toUpperCase();
        const isDivisionRole = ['SYSTEM_ADMIN', 'HRMO'].includes(selected.user?.role?.name || '');
        const addressParts = selected.address?.split(',') || [];
        const schoolName = isDivisionRole
          ? 'Schools Division Office (SDO Koronadal City)'
          : (addressParts[0]?.trim() || 'Koronadal Central Elementary School 1');
        const districtName = isDivisionRole
          ? 'Division-Wide Scope • SDO Koronadal City (No District Assigned)'
          : (selected.address?.includes('District') 
            ? addressParts.slice(1).join(',').trim() 
            : 'District 1 • SDO Koronadal City');

        return (
          <ModalPortal>
          <ModalOverlay onDismiss={() => setSelected(null)} className="modal-overlay responsive-viewport-overlay" style={{ zIndex: 1100 }} onClick={() => setSelected(null)}>
            <div
              className="animate-scale-in personnel-dossier-modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: 'min(1280px, 95vw)',
                width: '95vw',
                maxHeight: '92vh',
                borderRadius: '20px',
                backgroundColor: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 30px 90px rgba(0, 0, 0, 0.45)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Profile Hero Header */}
              <div
                className="personnel-dossier-header"
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '20px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '18px',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: '58px',
                      height: '58px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #2f7d52 0%, #a07a1f 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '1.35rem',
                      flexShrink: 0,
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                        {fullName}
                      </h3>
                      <StatusBadge status={selected.status} />
                      <span className={`badge ${selected.profileComplete ? 'badge-approved' : 'badge-deficiency'}`} style={{ fontSize: 11 }}>
                        {selected.profileComplete ? '✓ PDS Profile Complete' : '⚠ Incomplete Profile'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{selected.designation || 'DepEd Personnel'}</span>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--color-text-muted)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                        {selected.employeeId}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ padding: '1px 6px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => {
                          navigator.clipboard.writeText(selected.employeeId);
                          addToast(`Copied ${selected.employeeId} to clipboard!`, 'INFO');
                        }}
                        title="Copy Employee ID"
                      >
                        <Copy size={12} />
                        <span>Copy ID</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close details"
                    className="panel-close-button"
                    title="Close details"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Body: Spacious 2-Column Bento Dossier (Left 58% / Right 42%) */}
              <div className="personnel-dossier-body" style={{ padding: '24px 28px', overflowY: 'auto', flex: '1 1 auto', display: 'grid', gridTemplateColumns: 'var(--layout-master-detail, minmax(0, 1.25fr) minmax(0, 1fr))', gap: '22px' }}>
                {/* Left Column: Personal Data & Station Deployment */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Station Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 44, height: 44, borderRadius: '12px',
                      background: 'rgba(139, 92, 246, 0.15)', color: '#c79a2e', flexShrink: 0
                    }}>
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c79a2e' }}>
                        {isDivisionRole ? 'Division Governance & Operational Scope' : 'Assigned School Station & District'}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)', marginTop: 2 }}>
                        {schoolName}
                      </div>
                      <div style={{ fontSize: '0.78125rem', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {isDivisionRole ? (
                          <>
                            <AppIcon name="settings" size={13} color="var(--color-primary-light)" />
                            <span style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>{districtName}</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={13} color="var(--color-text-muted)" />
                            <span>{districtName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Personal Details (PDS CS Form 212) */}
                  <div className="card" style={{ padding: 18, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <FileText size={15} /> Personal Details (PDS CS Form 212)
                      </div>
                      {isEditing201 && (
                        <span className="badge badge-info" style={{ fontSize: 10 }}>Editing Mode Active</span>
                      )}
                    </div>
                    
                    {selected.user?.role?.name === 'AO_II' ? <p>{fullName}</p> : !isEditing201 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '14px 18px' }}>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Full Legal Name</div>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{fullName}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Date of Birth</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {selected.birthDate ? new Date(selected.birthDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Sex / Gender</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', textTransform: 'capitalize', color: 'var(--color-text-primary)' }}>
                            {selected.gender ? selected.gender.toLowerCase() : 'Not Specified'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Civil Status</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', textTransform: 'capitalize', color: 'var(--color-text-primary)' }}>
                            {selected.civilStatus || 'Single'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Citizenship</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Filipino (DepEd Permanent)</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>DepEd ID Number</div>
                          <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--color-primary)' }}>
                            {selected.employeeId}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 10 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>First Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                            <input aria-label="First Name" type="text" className="form-input" value={editFirstName} onChange={e => setEditFirstName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} required />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Middle Name</label>
                            <input type="text" className="form-input" value={editMiddleName} onChange={e => setEditMiddleName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} aria-label="Middle Name" />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 10 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Last Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                            <input aria-label="Last Name" type="text" className="form-input" value={editLastName} onChange={e => setEditLastName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} required />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Suffix</label>
                            <select
                              aria-label="Suffix"
                              className="form-input"
                              value={editSuffix}
                              onChange={e => setEditSuffix(e.target.value)}
                            >
                              {NAME_SUFFIX_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                              {editSuffix && !NAME_SUFFIX_OPTIONS.some(opt => opt.value === editSuffix) && (
                                <option value={editSuffix}>{editSuffix}</option>
                              )}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-3, 1fr 1fr 1fr)', gap: 10 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Date of Birth</label>
                            <input type="date" className="form-input" value={editBirthDate} onChange={e => setEditBirthDate(e.target.value)} aria-label="Date of Birth" />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Gender</label>
                            <select className="form-select" value={editGender} onChange={e => setEditGender(e.target.value as any)} aria-label="Gender">
                              <option value="MALE">Male</option>
                              <option value="FEMALE">Female</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Civil Status</label>
                            <select className="form-select" value={editCivilStatus} onChange={e => setEditCivilStatus(e.target.value)} aria-label="Civil Status">
                              <option value="SINGLE">Single</option>
                              <option value="MARRIED">Married</option>
                              <option value="WIDOWED">Widowed</option>
                              <option value="SEPARATED">Separated</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contact & Residential Location */}
                  <div className="card" style={{ padding: 18, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Phone size={15} /> Contact & Residential Location
                    </div>
                    {!isEditing201 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '14px 18px' }}>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>DepEd Workspace Email</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                            {selected.user?.email || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Mobile Contact</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {selected.contactNumber || 'Not Provided'}
                          </div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Permanent Residential Address</div>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                            {selected.address || 'SDO Koronadal City, South Cotabato, Region XII'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 11 }}>Mobile Contact Number</label>
                          <input type="tel" inputMode="numeric" maxLength={13} className="form-input" placeholder="e.g. 09123456789" value={editContactNumber} onChange={e => setEditContactNumber(e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''))} aria-label="Mobile Contact Number" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 11 }}>Permanent Residential Address</label>
                          <input type="text" className="form-input" placeholder="e.g. Brgy. Zone 3, Koronadal City" value={editAddress} onChange={e => setEditAddress(e.target.value)} aria-label="Permanent Residential Address" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Employment, Plantilla Item & 201 Digital Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Employment & System Assignment */}
                  <div className="card" style={{ padding: 18, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Briefcase size={15} /> Employment & System Assignment
                    </div>
                    {!isEditing201 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '14px 18px' }}>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Position / Designation</div>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{selected.designation}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Employment Status</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="badge badge-approved" style={{ fontSize: 11 }}>{selected.status || 'Active'}</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Original Date Hired</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {selected.dateHired ? new Date(selected.dateHired).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 3 }}>Tenure in Service</div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            Active Service
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 11 }}>Position / Designation Title <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input aria-label="Position / Designation Title" type="text" className="form-input" value={editDesignation} onChange={e => setEditDesignation(e.target.value)} required />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 10 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Original Date Hired</label>
                            <input type="date" className="form-input" value={editDateHired} onChange={e => setEditDateHired(e.target.value)} aria-label="Original Date Hired" />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Employment Status</label>
                            <select className="form-select" value={editStatus} onChange={e => setEditStatus(e.target.value)} aria-label="Employment Status">
                              <option value="ACTIVE">Permanent (Active)</option>
                              <option value="INACTIVE">Inactive</option>
                              <option value="ON_LEAVE">On Leave</option>
                              <option value="RETIRED">Retired</option>
                              <option value="ARCHIVED">Archived</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Plantilla Item & Compensation */}
                  <div className="card" style={{ padding: 18, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Award size={15} /> Plantilla Item Allocation
                      </div>
                      {selected.plantillaItem?.salaryGrade && (
                        <span className="badge badge-info" style={{ fontSize: 11, fontWeight: 700 }}>
                          Salary Grade {selected.plantillaItem.salaryGrade}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: 'var(--color-bg-tertiary)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Plantilla Item Number</div>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: selected.plantillaItem ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                          {selected.plantillaItem?.itemNumber || 'P-Unassigned (Pending DBM Item Creation)'}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: 10 }}>
                        <div style={{ background: 'var(--color-bg-tertiary)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Authorized Title</div>
                          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                            {selected.plantillaItem?.positionTitle || selected.designation}
                          </div>
                        </div>
                        <div style={{ background: 'var(--color-bg-tertiary)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Department / Scope</div>
                          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                            {selected.plantillaItem?.department || 'Curriculum & Implementation'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Digital 201 Credentials & Archival Compliance */}
                  <div className="card" style={{ padding: 18, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'none' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <ShieldCheck size={15} /> 201 Dossier & Archival Compliance
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8125rem' }}>
                      {complianceRows.map(row => {
                        const verified = row.status === 'VALIDATED' || row.status === 'APPROVED';
                        return <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', background: 'var(--color-bg-tertiary)', borderRadius: 8 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {verified ? <CheckCircle2 size={14} color="var(--color-success)" /> : <AlertCircle size={14} color="var(--color-text-muted)" />}
                            <span>{row.label}</span>
                          </span>
                          <span className={`badge ${verified ? 'badge-approved' : row.status === 'REJECTED' ? 'badge-danger' : 'badge-info'}`} style={{ fontSize: 10 }}>
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="personnel-dossier-footer" style={{
                padding: '14px 28px',
                borderTop: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}>
                {isEditing201 ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: '#10b981', fontWeight: 600 }}>
                      <CheckCircle2 size={16} /> All changes are saved directly to the database.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setIsEditing201(false);
                          handleSelectPersonnel(selected);
                        }}
                        style={{ borderRadius: '8px', fontWeight: 700, padding: '8px 18px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleApply201Changes}
                        disabled={saving201}
                        style={{
                          borderRadius: '8px',
                          fontWeight: 800,
                          padding: '8px 24px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <Check size={16} /> {saving201 ? 'Saving to Database...' : 'Apply Changes'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      DepEd SDO Koronadal • Personnel Records Management Subsystem
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsEditing201(true)}
                        style={{ borderRadius: '8px', fontWeight: 700, padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Edit size={14} /> Edit 201 Information
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </ModalOverlay>
          </ModalPortal>
        );
      })()}

      {/* Add Personnel Modal */}
      {showAddModal && (
        <ModalPortal>
        <ModalOverlay onDismiss={() => setShowAddModal(false)} className="modal-overlay responsive-viewport-overlay">
          <div
            className="animate-scale-in personnel-add-modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 'min(1100px, 95vw)',
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
            }}
          >
            {/* Header */}
            <div
              className="personnel-add-header"
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
                <AppIcon name="personnel" size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>Add New Employee Profile</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>PDS CS Form 212 — Personal, contact, and employment information</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="panel-close-button"
                title="Close"
              ><X aria-hidden="true" /></button>
            </div>

            {/* Form Body */}
            <form className="personnel-add-form" onSubmit={handleAddPersonnel} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflow: 'hidden' }}>
              <div className="personnel-add-body" style={{ padding: '20px 28px', overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                {/* Auto-generated Employee Number */}
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Employee Number</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.9375rem' }}>EMP-2026-XXXX</div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: 10, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AppIcon name="security" size={10} /> Auto-Generated
                  </span>
                </div>

                {/* Station accounts have no personal identity fields. */}
                {newCategory !== 'AO_II' && <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="personnel" size={14} /> 1. Personal Information
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-4, 1fr 1fr 1fr 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">First Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. Maria" value={newFirstName} onChange={e => setNewFirstName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} required aria-label="First Name" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Middle Name</label>
                      <input type="text" className="form-input" placeholder="e.g. Bautista" value={newMiddleName} onChange={e => setNewMiddleName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} aria-label="Middle Name" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Last Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. Santos" value={newLastName} onChange={e => setNewLastName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s\-'.]/g, ''))} required aria-label="Last Name" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Suffix</label>
                      <select
                        aria-label="Suffix"
                        className="form-input"
                        value={newSuffix}
                        onChange={e => setNewSuffix(e.target.value)}
                      >
                        {NAME_SUFFIX_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        {newSuffix && !NAME_SUFFIX_OPTIONS.some(opt => opt.value === newSuffix) && (
                          <option value={newSuffix}>{newSuffix}</option>
                        )}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Date of Birth <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input aria-label="Date of Birth" type="date" className="form-input" value={newBirthDate} onChange={e => setNewBirthDate(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Sex / Gender <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <select aria-label="Sex / Gender" className="form-input" value={newGender} onChange={e => setNewGender(e.target.value as any)}>
                        <option value="FEMALE">Female</option>
                        <option value="MALE">Male</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Civil Status <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <select aria-label="Civil Status" className="form-input" value={newCivilStatus} onChange={e => setNewCivilStatus(e.target.value as any)}>
                        <option value="SINGLE">Single</option>
                        <option value="MARRIED">Married</option>
                        <option value="WIDOWED">Widowed</option>
                        <option value="SEPARATED">Separated</option>
                      </select>
                    </div>
                  </div>
                </div>

                }
                {/* Section 2: Contact & Address — 3-column */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="phone" size={14} /> 2. Contact & Address
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-3, 1fr 1fr 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Email Address <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input type="email" className="form-input" placeholder="name@deped.gov.ph" value={newEmail} onChange={e => setNewEmail(e.target.value)} required aria-label="Email Address" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Mobile Number</label>
                      <input type="tel" inputMode="numeric" maxLength={13} className="form-input" placeholder="09171234567" value={newContactNumber} onChange={e => setNewContactNumber(e.target.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''))} aria-label="Mobile Number" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Residential Address</label>
                      <input type="text" className="form-input" placeholder="Brgy., City, Province" value={newAddress} onChange={e => setNewAddress(e.target.value)} aria-label="Residential Address" />
                    </div>
                  </div>
                </div>

                {/* Section 3: Employment & Credentials — 2×2 grid */}
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppIcon name="employment" size={14} /> 3. Employment & Credentials
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700 }}>
                        Role / Category <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <select aria-label="Role / Category"
                        className="form-input"
                        value={newCategory}
                        onChange={e => {
                          const cat = e.target.value as any;
                          const currentDist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === newDistrictId) || DEPED_KORONADAL_DISTRICTS[0];
                          setNewCategory(cat);
                          if (cat === 'AO_II') {
                            setNewDesignation(`Administrative Officer II - ${newSchool} (${currentDist.name})`);
                            if (!newLastName || newLastName === 'Schools Division Office (SDO)') setNewLastName(newSchool);
                            if (!newFirstName) setNewFirstName('AO II');
                          }
                          else if (cat === 'HRMO') {
                            setNewDesignation('HRMO Approver / Manager');
                            if (newLastName === newSchool) setNewLastName('');
                            if (newFirstName === 'AO II') setNewFirstName('');
                          }
                          else if (cat === 'SYSTEM_ADMIN') {
                            setNewDesignation('System Administrator');
                            if (newLastName === newSchool) setNewLastName('');
                            if (newFirstName === 'AO II') setNewFirstName('');
                          }
                          else if (cat === 'TEACHING') {
                            setNewDesignation(TEACHING_POSITIONS[0]);
                            if (newLastName === newSchool) setNewLastName('');
                            if (newFirstName === 'AO II') setNewFirstName('');
                          }
                          else {
                            setNewDesignation(NON_TEACHING_POSITIONS[0]);
                            if (newLastName === newSchool) setNewLastName('');
                            if (newFirstName === 'AO II') setNewFirstName('');
                          }
                        }}
                      >
                        <optgroup label="DepEd Personnel Roles">
                          <option value="TEACHING">Teaching Personnel</option>
                          <option value="NON_TEACHING">Non-Teaching Personnel</option>
                        </optgroup>
                        <optgroup label="Administrative System Roles">
                          <option value="AO_II">Administrative Officer II (AO II / SO II)</option>
                          <option value="HRMO">HRMO Approver / Manager</option>
                          <option value="SYSTEM_ADMIN">System Administrator</option>
                        </optgroup>
                      </select>
                    </div>
                    {['AO_II', 'HRMO', 'SYSTEM_ADMIN'].includes(newCategory) ? (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          Designation / Position <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(Auto)</span>
                        </label>
                        <input aria-label="Designation / Position (Auto)"
                          type="text"
                          className="form-input"
                          value={newDesignation}
                          disabled
                          style={{ opacity: 0.8, cursor: 'not-allowed', background: 'var(--color-bg-secondary)' }}
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
                            aria-label="Contractual Position Title"
                            type="text"
                            className="form-input"
                            value={newDesignation}
                            onChange={e => setNewDesignation(e.target.value)}
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
                            })() : null}
                          </>
                        )}
                      </div>
                    )}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Date Hired <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input aria-label="Date Hired" type="date" className="form-input" value={newDateHired} onChange={e => setNewDateHired(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Initial Password <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input aria-label="Initial Password" type="text" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                    </div>

                    {/* District & School Assignment: Only applies to AO II & school-based personnel */}
                    {!['HRMO', 'SYSTEM_ADMIN'].includes(newCategory) && (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>
                            Assigned District <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {newCategory === 'AO_II' && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select aria-label="Assigned District"
                            className="form-input"
                            value={newDistrictId}
                            onChange={e => {
                              const dId = Number(e.target.value);
                              const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === dId) || DEPED_KORONADAL_DISTRICTS[0];
                              const sch = dist.schools[0] || '';
                              setNewDistrictId(dId);
                              setNewSchool(sch);
                              if (newCategory === 'AO_II') {
                                setNewDesignation(`Administrative Officer II - ${sch} (${dist.name})`);
                                setNewLastName(sch);
                              }
                              if (!newAddress || newAddress.includes('District')) {
                                setNewAddress(`${sch}, ${dist.name}`);
                              }
                            }}
                            required
                          >
                            {DEPED_KORONADAL_DISTRICTS.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.schools.length} Schools)</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>
                            Assigned School <span style={{ color: 'var(--color-danger)' }}>*</span>
                            {newCategory === 'AO_II' && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginLeft: '0.4rem' }}>(AO Assignment)</span>
                            )}
                          </label>
                          <select aria-label="Assigned School"
                            className="form-input"
                            value={newSchool}
                            onChange={e => {
                              const sch = e.target.value;
                              const dist = DEPED_KORONADAL_DISTRICTS.find(d => d.id === newDistrictId) || DEPED_KORONADAL_DISTRICTS[0];
                              setNewSchool(sch);
                              if (newCategory === 'AO_II') {
                                setNewDesignation(`Administrative Officer II - ${sch} (${dist.name})`);
                                setNewLastName(sch);
                              }
                              setNewAddress(`${sch}, ${dist.name}`);
                            }}
                            required
                          >
                            {(DEPED_KORONADAL_DISTRICTS.find(d => d.id === newDistrictId)?.schools || DEPED_REGION_12_SCHOOLS).map(sch => (
                              <option key={sch} value={sch}>{sch}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="personnel-add-footer" style={{ padding: '14px 28px', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                <button type="submit" disabled={addingPersonnel.pending} className="btn btn-primary" style={{ borderRadius: '9999px', fontWeight: 700 }}>Create Employee Account</button>
              </div>
            </form>
          </div>
        </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};
