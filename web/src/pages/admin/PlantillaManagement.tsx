import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import {
  TEACHING_POSITIONS,
  NON_TEACHING_POSITIONS,
  DEPED_KORONADAL_DISTRICTS,
  getAutoSalaryGrade,
} from '../../constants/depedData';
import {
  Building2,
  Users,
  Search,
  Plus,
  Trash2,
  Edit,
  UserCheck,
  UserMinus,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Award,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';

interface OccupantPersonnel {
  id: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string;
  dateHired: string;
}

interface PlantillaItem {
  id: number;
  itemNumber: string;
  positionTitle: string;
  salaryGrade: number;
  department: string;
  division: string;
  isOccupied: boolean;
  isOpenForRanking: boolean;
  occupiedByPersonnel?: OccupantPersonnel | null;
  activePromotionCycle?: {
    id: number;
    name: string;
    type: string;
    status: string;
    applicantCount: number;
    endDate: string;
  } | null;
}

interface CandidatePersonnel {
  id: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string;
  address?: string;
  plantillaItem?: { id: number; itemNumber: string; positionTitle: string } | null;
}

export const PlantillaManagement: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const { theme } = useTheme();
  const navigate = useNavigate();

  if (user?.role !== 'HRMO') {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/50 rounded-2xl flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Restricted: Plantilla Registry</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            The Plantilla Items & Occupant Registry is exclusive to HR (HRMO) only. Neither Administrative Officer II (AO II) nor System Administrator accounts have access to manage or view the division plantilla inventory.
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

  const isHR = true;
  const isAdmin = true;

  // State
  const [plantillas, setPlantillas] = useState<PlantillaItem[]>([]);
  const [personnelList, setPersonnelList] = useState<CandidatePersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItems: 0,
    vacantItems: 0,
    occupiedItems: 0,
    openForRanking: 0,
    availabilityRate: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VACANT' | 'OCCUPIED' | 'OPEN_RANKING'>('ALL');
  const [trackFilter, setTrackFilter] = useState<'ALL' | 'TEACHING' | 'NON_TEACHING'>('ALL');
  const [schoolFilter, setSchoolFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PlantillaItem | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPlantillaForAssign, setSelectedPlantillaForAssign] = useState<PlantillaItem | null>(null);
  const [showLaunchCycleModal, setShowLaunchCycleModal] = useState(false);
  const [selectedPlantillaForCycle, setSelectedPlantillaForCycle] = useState<PlantillaItem | null>(null);

  // Add/Edit Form State
  const [formItemNumber, setFormItemNumber] = useState('');
  const [formPositionTitle, setFormPositionTitle] = useState('Teacher I');
  const [formSalaryGrade, setFormSalaryGrade] = useState<number>(11);
  const [formDepartment, setFormDepartment] = useState('Koronadal Central Elementary School 1');
  const [formDivision, setFormDivision] = useState('SDO Koronadal City - District 1');
  const [formIsOccupied, setFormIsOccupied] = useState(false);
  const [formPersonnelId, setFormPersonnelId] = useState<number | ''>('');
  const [formPersonnelSearch, setFormPersonnelSearch] = useState('');

  // Selected Occupant in Add/Edit Modal
  const selectedOccupantCandidate = useMemo(() => {
    if (!formPersonnelId) return null;
    return personnelList.find((p) => p.id === Number(formPersonnelId)) || null;
  }, [formPersonnelId, personnelList]);

  // Search-filtered candidate personnel for Add/Edit Modal
  const candidatePersonnelList = useMemo(() => {
    let list = [...personnelList];
    if (formPersonnelSearch.trim()) {
      const q = formPersonnelSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.firstName?.toLowerCase().includes(q) ||
          p.lastName?.toLowerCase().includes(q) ||
          p.employeeId?.toLowerCase().includes(q) ||
          p.designation?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 15);
  }, [personnelList, formPersonnelSearch]);

  // Assign Form State
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | ''>('');

  // Launch Cycle Form State
  const [cycleName, setCycleName] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [cycleEndDate, setCycleEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [cycleMaxApplicants, setCycleMaxApplicants] = useState(10);

  // Fetch Plantillas
  const fetchPlantillas = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/plantilla');
      const data = res.data?.data || [];
      const meta = res.data?.meta || {};
      setPlantillas(data);
      const isItemOccupied = (i: PlantillaItem) => Boolean(i.occupiedByPersonnel ?? i.isOccupied);
      setStats({
        totalItems: meta.totalItems ?? data.length,
        vacantItems: meta.vacantItems ?? data.filter((i: PlantillaItem) => !isItemOccupied(i)).length,
        occupiedItems: meta.occupiedItems ?? data.filter((i: PlantillaItem) => isItemOccupied(i)).length,
        openForRanking: meta.openForRanking ?? data.filter((i: PlantillaItem) => i.isOpenForRanking).length,
        availabilityRate: meta.availabilityRate ?? (data.length > 0 ? Math.round((data.filter((i: PlantillaItem) => !isItemOccupied(i)).length / data.length) * 100) : 0),
      });
    } catch (err: any) {
      console.error('Failed to load plantilla items:', err);
      addToast(err.response?.data?.message || 'Failed to load plantilla items.', 'ERROR');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Fetch Personnel for Assignment
  const fetchPersonnel = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel?limit=500');
      setPersonnelList(res.data?.data || []);
    } catch (err) {
      console.warn('Failed to load candidate personnel list:', err);
    }
  }, []);

  useEffect(() => {
    fetchPlantillas();
    fetchPersonnel();
  }, [fetchPlantillas, fetchPersonnel]);

  // Filtered List
  const filteredPlantillas = useMemo(() => {
    return plantillas.filter((item) => {
      const isItemOccupied = Boolean(item.occupiedByPersonnel ?? item.isOccupied);
      if (statusFilter === 'VACANT' && isItemOccupied) return false;
      if (statusFilter === 'OCCUPIED' && !isItemOccupied) return false;
      if (statusFilter === 'OPEN_RANKING' && !item.isOpenForRanking) return false;

      const isTeacher = item.positionTitle.toLowerCase().includes('teacher');
      if (trackFilter === 'TEACHING' && !isTeacher) return false;
      if (trackFilter === 'NON_TEACHING' && isTeacher) return false;

      if (schoolFilter !== 'ALL' && !item.department.toLowerCase().includes(schoolFilter.toLowerCase())) return false;
      if (districtFilter !== 'ALL' && !item.division.toLowerCase().includes(districtFilter.toLowerCase())) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = item.itemNumber?.toLowerCase().includes(q);
        const titleMatch = item.positionTitle?.toLowerCase().includes(q);
        const deptMatch = item.department?.toLowerCase().includes(q);
        const divMatch = item.division?.toLowerCase().includes(q);
        const occMatch = item.occupiedByPersonnel
          ? `${item.occupiedByPersonnel.firstName} ${item.occupiedByPersonnel.lastName} ${item.occupiedByPersonnel.employeeId} ${item.occupiedByPersonnel.designation}`
              .toLowerCase()
              .includes(q)
          : false;
        return numMatch || titleMatch || deptMatch || divMatch || occMatch;
      }

      return true;
    });
  }, [plantillas, statusFilter, trackFilter, schoolFilter, districtFilter, searchQuery]);

  // Open Add Modal
  const handleOpenAdd = () => {
    if (!isAdmin) {
      addToast('Access denied: Only HR (HRMO) or System Administrator can create plantilla items.', 'ERROR');
      return;
    }
    setEditingItem(null);
    setFormItemNumber(`OSEC-DECSB-TCH3-${Math.floor(100000 + Math.random() * 900000)}-2026`);
    setFormPositionTitle('Teacher I');
    setFormSalaryGrade(getAutoSalaryGrade('Teacher I'));
    setFormDepartment('Koronadal Central Elementary School 1');
    setFormDivision('SDO Koronadal City - District 1');
    setFormIsOccupied(false);
    setFormPersonnelId('');
    setFormPersonnelSearch('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: PlantillaItem) => {
    if (!isAdmin) {
      addToast('Access denied: Only HR (HRMO) or System Administrator can edit plantilla items.', 'ERROR');
      return;
    }
    setEditingItem(item);
    setFormItemNumber(item.itemNumber);
    setFormPositionTitle(item.positionTitle);
    setFormSalaryGrade(item.salaryGrade || getAutoSalaryGrade(item.positionTitle));
    setFormDepartment(item.department);
    setFormDivision(item.division);
    setFormIsOccupied(item.isOccupied);
    setFormPersonnelId(item.occupiedByPersonnel ? item.occupiedByPersonnel.id : '');
    setFormPersonnelSearch('');
    setShowAddModal(true);
  };

  // Submit Add or Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (formIsOccupied && !formPersonnelId) {
      addToast('Please choose a personnel to assign to this occupied plantilla item.', 'WARNING');
      return;
    }

    try {
      const payload = {
        itemNumber: formItemNumber.trim(),
        positionTitle: formPositionTitle.trim(),
        salaryGrade: Number(formSalaryGrade),
        department: formDepartment.trim(),
        division: formDivision.trim(),
        isOccupied: formIsOccupied,
        personnelId: formIsOccupied && formPersonnelId ? Number(formPersonnelId) : null,
      };

      if (editingItem) {
        await apiClient.put(`/plantilla/${editingItem.id}`, payload);
        addToast(`Plantilla Item '${payload.itemNumber}' updated successfully.`, 'SUCCESS');
      } else {
        await apiClient.post('/plantilla', payload);
        addToast(`New Plantilla Item '${payload.itemNumber}' registered successfully.`, 'SUCCESS');
      }

      setShowAddModal(false);
      fetchPlantillas();
      fetchPersonnel();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save plantilla item.', 'ERROR');
    }
  };

  // Delete Plantilla Item
  const handleDeleteItem = async (item: PlantillaItem) => {
    if (!isAdmin) {
      addToast('Access denied: Only HR (HRMO) or System Administrator can delete plantilla items.', 'ERROR');
      return;
    }
    if (item.occupiedByPersonnel) {
      addToast(
        `Cannot delete Plantilla Item '${item.itemNumber}'. It is currently assigned to ${item.occupiedByPersonnel.firstName} ${item.occupiedByPersonnel.lastName}. Please vacate the item first.`,
        'WARNING'
      );
      return;
    }

    if (window.confirm(`Are you sure you want to permanently delete Plantilla Item '${item.itemNumber}'?`)) {
      try {
        await apiClient.delete(`/plantilla/${item.id}`);
        addToast(`Plantilla Item '${item.itemNumber}' deleted from inventory.`, 'INFO');
        fetchPlantillas();
      } catch (err: any) {
        addToast(err.response?.data?.message || 'Failed to delete plantilla item.', 'ERROR');
      }
    }
  };

  // Open Assign Modal
  const handleOpenAssign = (item: PlantillaItem) => {
    if (!isHR) {
      addToast('Access denied: Only HR (HRMO) can assign personnel to official Plantilla items.', 'ERROR');
      return;
    }
    setSelectedPlantillaForAssign(item);
    setSelectedPersonnelId(item.occupiedByPersonnel ? item.occupiedByPersonnel.id : '');
    setAssignSearchQuery('');
    setShowAssignModal(true);
  };

  // Submit Assignment
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantillaForAssign || !isHR) return;

    try {
      const pId = selectedPersonnelId === '' ? null : Number(selectedPersonnelId);
      await apiClient.post(`/plantilla/${selectedPlantillaForAssign.id}/assign`, {
        personnelId: pId,
      });

      addToast(
        pId
          ? `Personnel assigned to Plantilla Item '${selectedPlantillaForAssign.itemNumber}'.`
          : `Plantilla Item '${selectedPlantillaForAssign.itemNumber}' has been vacated and is now Available.`,
        'SUCCESS'
      );

      setShowAssignModal(false);
      setSelectedPlantillaForAssign(null);
      fetchPlantillas();
      fetchPersonnel();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to update occupant assignment.', 'ERROR');
    }
  };

  // Vacate Quick Action
  const handleVacateItem = async (item: PlantillaItem) => {
    if (!isHR) {
      addToast('Access denied: Only HR (HRMO) can modify plantilla occupancy.', 'ERROR');
      return;
    }
    const occupantName = item.occupiedByPersonnel
      ? `${item.occupiedByPersonnel.firstName} ${item.occupiedByPersonnel.lastName}`
      : 'current occupant';

    if (window.confirm(`Are you sure you want to vacate Plantilla Item '${item.itemNumber}' and unbind ${occupantName}? The item will become Vacant and Ready for Ranking.`)) {
      try {
        await apiClient.post(`/plantilla/${item.id}/assign`, { personnelId: null });
        addToast(`Plantilla Item '${item.itemNumber}' has been vacated.`, 'INFO');
        fetchPlantillas();
        fetchPersonnel();
      } catch (err: any) {
        addToast(err.response?.data?.message || 'Failed to vacate plantilla item.', 'ERROR');
      }
    }
  };

  // Open for Ranking Quick Action
  const handleOpenForRanking = (item: PlantillaItem) => {
    if (!isHR) {
      addToast('Access denied: Only HR (HRMO) can launch merit promotion cycles.', 'ERROR');
      return;
    }
    if (item.isOpenForRanking && item.activePromotionCycle) {
      addToast(
        `Plantilla Item '${item.itemNumber}' is already open in active ranking cycle: ${item.activePromotionCycle.name}`,
        'INFO'
      );
      navigate('/admin/promotions');
      return;
    }
    setSelectedPlantillaForCycle(item);
    setCycleName(`Ranking for Natural Vacancy: ${item.positionTitle} (${item.itemNumber})`);
    setCycleStartDate(new Date().toISOString().split('T')[0]);
    setCycleEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setCycleMaxApplicants(10);
    setShowLaunchCycleModal(true);
  };

  // Launch Promotion Cycle
  const handleLaunchCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantillaForCycle || !isHR) return;

    try {
      const isTeacher = selectedPlantillaForCycle.positionTitle.toLowerCase().includes('teacher');
      const districtMatch = selectedPlantillaForCycle.division.includes('District 6') ? 'District 6' : 'District 1';

      const payload = {
        name: cycleName.trim() || `Ranking for Natural Vacancy: ${selectedPlantillaForCycle.positionTitle}`,
        type: 'NATURAL_VACANCY',
        status: 'ACTIVE',
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        rulesConfigurationJson: {
          track: isTeacher ? 'TEACHING' : 'NON_TEACHING',
          targetPosition: selectedPlantillaForCycle.positionTitle,
          plantillaItemNumber: selectedPlantillaForCycle.itemNumber,
          district: districtMatch,
          school: selectedPlantillaForCycle.department,
          maxApplicants: Number(cycleMaxApplicants) || 10,
          vacantPositions: 1,
          plantillaItemNumbers: [selectedPlantillaForCycle.itemNumber],
        },
      };

      await apiClient.post('/promotions/cycles', payload);
      addToast(
        `Active merit promotion cycle launched for Plantilla Item '${selectedPlantillaForCycle.itemNumber}'! Applicants can now apply.`,
        'SUCCESS'
      );
      setShowLaunchCycleModal(false);
      setSelectedPlantillaForCycle(null);
      fetchPlantillas();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to launch promotion cycle.', 'ERROR');
    }
  };

  // Filtered candidate personnel in modal
  const filteredCandidates = useMemo(() => {
    if (!assignSearchQuery.trim()) return personnelList;
    const q = assignSearchQuery.toLowerCase().trim();
    return personnelList.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.employeeId} ${p.designation} ${p.address || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [personnelList, assignSearchQuery]);

  return (
    <div className="page-container" style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-info" style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.5px' }}>
              DEPED DBM AUTHORIZED INVENTORY
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '0.6875rem', fontWeight: 700 }}>
              SDO Koronadal City
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.5px' }}>
            Plantilla Items & Occupant Registry
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            Complete division inventory of authorized plantilla items, active occupant assignments, and open vacancies for merit promotion.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchPlantillas}
            title="Refresh inventory"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenAdd}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 800,
                background: theme === 'dark' ? '#D7F84A' : '#141416',
                color: theme === 'dark' ? '#141416' : '#FFFFFF',
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              <Plus size={16} />
              + Add Plantilla Item
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Total Authorized Items
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-text-primary)', lineHeight: 1 }}>
            {stats.totalItems}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            Official DBM Division Plantilla
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)', background: theme === 'dark' ? 'rgba(16, 185, 129, 0.05)' : '#F0FDF4' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Filled (Occupied) Positions
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10B981', lineHeight: 1 }}>
            {stats.occupiedItems}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '6px' }}>
            {stats.totalItems > 0 ? Math.round((stats.occupiedItems / stats.totalItems) * 100) : 0}% Active Personnel Occupancy
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(245, 158, 11, 0.3)', background: theme === 'dark' ? 'rgba(245, 158, 11, 0.05)' : '#FFFBEB' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Vacant Positions (Availability)
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#F59E0B', lineHeight: 1 }}>
            {stats.vacantItems}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '6px' }}>
            {stats.availabilityRate}% Ready for Ranking / Hiring
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px', borderRadius: '14px', border: '1px solid rgba(59, 130, 246, 0.3)', background: theme === 'dark' ? 'rgba(59, 130, 246, 0.05)' : '#EFF6FF' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Open for Merit Ranking
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#3B82F6', lineHeight: 1 }}>
            {stats.openForRanking}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#2563EB', marginTop: '6px' }}>
            Active Promotion Cycle Linked
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="card" style={{ padding: '16px 20px', borderRadius: '14px', marginBottom: '20px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Keyword Search */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search item number, position title, school, occupant name, or employee ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '38px', borderRadius: '10px', fontSize: '0.875rem' }}
            />
          </div>

          {/* Status Filter */}
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{ width: 'auto', minWidth: '160px', borderRadius: '10px', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Statuses ({plantillas.length})</option>
            <option value="VACANT">Vacant Only ({plantillas.filter(p => !p.occupiedByPersonnel && !p.isOccupied).length})</option>
            <option value="OCCUPIED">Occupied Only ({plantillas.filter(p => Boolean(p.occupiedByPersonnel ?? p.isOccupied)).length})</option>
            <option value="OPEN_RANKING">Open for Ranking ({plantillas.filter(p => p.isOpenForRanking).length})</option>
          </select>

          {/* Track Filter */}
          <select
            className="form-control"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value as any)}
            style={{ width: 'auto', minWidth: '150px', borderRadius: '10px', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Tracks</option>
            <option value="TEACHING">Teaching Track</option>
            <option value="NON_TEACHING">Non-Teaching Track</option>
          </select>

          {/* District Filter */}
          <select
            className="form-control"
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '160px', borderRadius: '10px', fontSize: '0.8125rem' }}
          >
            <option value="ALL">All Districts</option>
            <option value="District 1">District 1</option>
            <option value="District 6">District 6</option>
          </select>

          {(searchQuery || statusFilter !== 'ALL' || trackFilter !== 'ALL' || districtFilter !== 'ALL') && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setTrackFilter('ALL');
                setDistrictFilter('ALL');
              }}
              style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Plantilla Items Table with Detailed Occupant View */}
      <div className="card" style={{ borderRadius: '16px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-tertiary)' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Plantilla Items List ({filteredPlantillas.length} position{filteredPlantillas.length === 1 ? '' : 's'})
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Showing {filteredPlantillas.length} of {plantillas.length} records
          </div>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-card)', borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ width: '18%', padding: '12px 16px', fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Item Code / Plantilla No.
                </th>
                <th style={{ width: '20%', padding: '12px 16px', fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Authorized Title & Grade
                </th>
                <th style={{ width: '20%', padding: '12px 16px', fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  School Station / Assignment
                </th>
                <th style={{ width: '26%', padding: '12px 16px', fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Assigned Personnel (Occupant)
                </th>
                <th style={{ width: '16%', padding: '12px 16px', fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    <div>Loading Plantilla Inventory…</div>
                  </td>
                </tr>
              ) : filteredPlantillas.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px 24px', textAlign: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-bg-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                      <Building2 size={26} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      No Plantilla Items Found
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                      {plantillas.length === 0
                        ? 'No plantilla items have been registered yet. HR (HRMO) can register official items using the button below.'
                        : 'No items match your active filters. Try adjusting your search term or status filter.'}
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleOpenAdd}
                        style={{
                          fontWeight: 800,
                          background: theme === 'dark' ? '#D7F84A' : '#141416',
                          color: theme === 'dark' ? '#141416' : '#FFFFFF',
                          border: 'none',
                        }}
                      >
                        + Add Plantilla Item (HRMO)
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPlantillas.map((item) => {
                  const isTeacher = item.positionTitle.toLowerCase().includes('teacher');
                  const occupant = item.occupiedByPersonnel;
                  const isOccupied = Boolean(occupant);

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background-color 0.15s' }}>
                      {/* Item Code */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {item.itemNumber}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          {isOccupied ? (
                            <span className="badge badge-neutral" style={{ fontSize: '0.625rem', fontWeight: 700, color: '#059669', background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }}>
                              ● OCCUPIED
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.625rem', fontWeight: 800, color: '#D97706', background: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }}>
                              ● VACANT (AVAILABLE)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Position Title & SG */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                          {item.positionTitle}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                          <span className="badge badge-outline" style={{ fontSize: '0.6875rem', fontWeight: 800 }}>
                            SG {item.salaryGrade}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {isTeacher ? 'Teaching Track' : 'Non-Teaching Track'}
                          </span>
                        </div>
                      </td>

                      {/* Station / School */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {item.department}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {item.division}
                        </div>
                      </td>

                      {/* Occupant Details (WHOM IS ASSIGNED) */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {occupant ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
                              color: '#2563EB',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.8125rem',
                              flexShrink: 0,
                            }}>
                              {occupant.firstName?.[0]}{occupant.lastName?.[0]}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {occupant.firstName} {occupant.lastName}
                              </div>
                              <div style={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                                {occupant.employeeId} • {occupant.designation || 'Active Staff'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                              <span>— Unassigned (Vacant) —</span>
                            </div>
                            <div style={{ marginTop: '3px' }}>
                              {item.isOpenForRanking && item.activePromotionCycle ? (
                                <span
                                  className="badge badge-info"
                                  style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', cursor: 'pointer' }}
                                  onClick={() => navigate('/admin/promotions')}
                                  title="Active cycle — click to view promotion ranking"
                                >
                                  🎯 Open in: {item.activePromotionCycle.name?.slice(0, 24)}…
                                </span>
                              ) : (
                                <span className="badge badge-neutral" style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px' }}>
                                  Ready for Ranking
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {/* Vacant Actions */}
                          {!isOccupied ? (
                            <>
                              {item.isOpenForRanking && item.activePromotionCycle ? (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-xs"
                                  onClick={() => navigate('/admin/promotions')}
                                  title={`Active in ranking cycle: ${item.activePromotionCycle.name}. Click to view ranking.`}
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    borderColor: '#3B82F6',
                                    color: '#2563EB',
                                    background: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <TrendingUp size={12} />
                                  View Ranking
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  onClick={() => handleOpenForRanking(item)}
                                  title="Open this vacant plantilla for active merit promotion"
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    background: theme === 'dark' ? '#D7F84A' : '#141416',
                                    color: theme === 'dark' ? '#141416' : '#FFFFFF',
                                    border: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <Sparkles size={12} />
                                  Open for Ranking
                                </button>
                              )}

                              {isHR && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleOpenAssign(item)}
                                  title="Directly assign an active personnel occupant"
                                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                >
                                  <UserCheck size={12} />
                                  Assign
                                </button>
                              )}
                            </>
                          ) : (
                            /* Occupied Actions */
                            isHR && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleOpenAssign(item)}
                                  title="Change assigned personnel occupant"
                                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                >
                                  <UserCheck size={12} />
                                  Change Occupant
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleVacateItem(item)}
                                  title="Vacate this plantilla item and unbind current occupant"
                                  style={{ color: '#EF4444', fontSize: '0.75rem', padding: '4px 8px' }}
                                >
                                  <UserMinus size={12} />
                                  Vacate
                                </button>
                              </>
                            )
                          )}

                          {/* Edit / Delete */}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => handleOpenEdit(item)}
                                title="Edit Plantilla Item Details"
                                style={{ padding: '4px 6px' }}
                              >
                                <Edit size={13} />
                              </button>
                              {!isOccupied && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleDeleteItem(item)}
                                  title="Delete Plantilla Item"
                                  style={{ color: '#EF4444', padding: '4px 6px' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT PLANTILLA ITEM */}
      {showAddModal && (
        <ModalOverlay className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '560px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                  DBM Authorized Item Record
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--color-text-primary)' }}>
                  {editingItem ? `Edit Plantilla Item ${editingItem.itemNumber}` : 'Register New Plantilla Item'}
                </h3>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Plantilla Item Number (CSC / DBM Code) *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. OSEC-DECSB-TCH3-420015-2026"
                    value={formItemNumber}
                    onChange={(e) => setFormItemNumber(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Must follow standard DepEd Plantilla format matching DBM National Inventory.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, minmax(0, 2fr) minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      Authorized Position Title *
                    </label>
                    <select
                      className="form-control"
                      value={formPositionTitle}
                      onChange={(e) => {
                        const title = e.target.value;
                        setFormPositionTitle(title);
                        setFormSalaryGrade(getAutoSalaryGrade(title));
                      }}
                      style={{ fontSize: '0.8125rem' }}
                    >
                      <optgroup label="1. Teaching Personnel — Current ECP Positions">
                        {TEACHING_POSITIONS.filter(p => !p.includes('(') && !p.includes('Special') && !p.includes('Principal') && !p.includes('Head Teacher')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Special Science / Special Needs Education Titles">
                        {TEACHING_POSITIONS.filter(p => p.includes('Special') || p.includes('SPED')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                      <optgroup label="2. School Administration / School Heads — Current ECP Titles">
                        {TEACHING_POSITIONS.filter(p => p.startsWith('School Principal')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Existing / Legacy Positions">
                        {TEACHING_POSITIONS.filter(p => p.includes('Head Teacher') || p.includes('Assistant')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Newer DepEd Staffing Framework — Counselor Series">
                        {NON_TEACHING_POSITIONS.filter(p => p.includes('Counselor')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Administrative & Office Staff Roles">
                        {NON_TEACHING_POSITIONS.filter(p => !p.includes('Counselor')).map((p) => (
                          <option key={p} value={p}>{p} (SG {getAutoSalaryGrade(p)})</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Salary Grade *</span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>(Fixed by DBM)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        readOnly
                        disabled
                        className="form-control"
                        value={formSalaryGrade ? `SG ${formSalaryGrade}` : '—'}
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          background: 'var(--color-bg-secondary)',
                          cursor: 'not-allowed',
                          color: 'var(--color-primary)',
                          opacity: 0.9,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Station / School Assignment *
                  </label>
                  <select
                    className="form-control"
                    value={formDepartment}
                    onChange={(e) => {
                      setFormDepartment(e.target.value);
                      const isD6 = DEPED_KORONADAL_DISTRICTS[1]?.schools.includes(e.target.value);
                      setFormDivision(isD6 ? 'SDO Koronadal City - District 6' : 'SDO Koronadal City - District 1');
                    }}
                    style={{ fontSize: '0.8125rem' }}
                  >
                    {DEPED_KORONADAL_DISTRICTS.flatMap((d) =>
                      d.schools.map((s) => (
                        <option key={s} value={s}>{s} ({d.name})</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Division & District
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formDivision}
                    onChange={(e) => setFormDivision(e.target.value)}
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Initial Availability Status
                  </label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="occupancyRadio"
                        checked={!formIsOccupied}
                        onChange={() => {
                          setFormIsOccupied(false);
                          setFormPersonnelId('');
                        }}
                      />
                      <span>Vacant (Available for Ranking & Appointment)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="occupancyRadio"
                        checked={formIsOccupied}
                        onChange={() => setFormIsOccupied(true)}
                      />
                      <span style={{ fontWeight: formIsOccupied ? 700 : 400 }}>Occupied</span>
                    </label>
                  </div>
                </div>

                {/* Personnel Occupant Picker when Occupied */}
                {formIsOccupied && (
                  <div
                    style={{
                      background: theme === 'dark' ? 'rgba(215, 248, 74, 0.05)' : 'rgba(20, 20, 22, 0.03)',
                      border: `1px solid ${theme === 'dark' ? 'rgba(215, 248, 74, 0.25)' : 'rgba(20, 20, 22, 0.15)'}`,
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <UserCheck size={16} color={theme === 'dark' ? '#D7F84A' : '#141416'} />
                        <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                          Choose Assigned Personnel (Occupant) *
                        </label>
                      </div>
                      {formPersonnelId && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setFormPersonnelId('')}
                          style={{ fontSize: '0.6875rem', color: '#EF4444', padding: '2px 6px' }}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>

                    {/* Selected Personnel Card */}
                    {selectedOccupantCandidate ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--color-bg-card)',
                          borderRadius: '10px',
                          border: `1.5px solid ${theme === 'dark' ? '#D7F84A' : '#141416'}`,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: theme === 'dark' ? '#D7F84A' : '#141416',
                              color: theme === 'dark' ? '#141416' : '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.8125rem',
                            }}
                          >
                            {selectedOccupantCandidate.firstName?.[0]}
                            {selectedOccupantCandidate.lastName?.[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                              {selectedOccupantCandidate.firstName} {selectedOccupantCandidate.lastName}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'flex', gap: '6px' }}>
                              <span>ID: <strong>{selectedOccupantCandidate.employeeId}</strong></span>
                              <span>•</span>
                              <span>{selectedOccupantCandidate.designation}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setFormPersonnelId('')}
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Search Input */}
                        <div style={{ position: 'relative' }}>
                          <Search
                            size={14}
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: 'var(--color-text-muted)',
                            }}
                          />
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Search by name, employee ID, or designation..."
                            value={formPersonnelSearch}
                            onChange={(e) => setFormPersonnelSearch(e.target.value)}
                            style={{ paddingLeft: '32px', fontSize: '0.8125rem' }}
                          />
                        </div>

                        {/* Candidate list to choose from */}
                        <div
                          style={{
                            maxHeight: '180px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            paddingRight: '4px',
                          }}
                        >
                          {candidatePersonnelList.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              No matching personnel found in database.
                            </div>
                          ) : (
                            candidatePersonnelList.map((p) => {
                              const isCurrentOccupant = formPersonnelId === p.id;
                              const isAlreadyInAnother = p.plantillaItem && (!editingItem || p.plantillaItem.id !== editingItem.id);

                              return (
                                <div
                                  key={p.id}
                                  onClick={() => setFormPersonnelId(p.id)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: isCurrentOccupant
                                      ? (theme === 'dark' ? 'rgba(215, 248, 74, 0.15)' : 'rgba(20, 20, 22, 0.08)')
                                      : 'var(--color-bg-card)',
                                    border: `1px solid ${isCurrentOccupant ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: 'var(--color-bg-tertiary)',
                                        color: 'var(--color-text-primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        fontSize: '0.6875rem',
                                      }}
                                    >
                                      {p.firstName?.[0]}{p.lastName?.[0]}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                        {p.firstName} {p.lastName}
                                      </div>
                                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                        {p.employeeId} • {p.designation}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {isAlreadyInAnother ? (
                                      <span
                                        style={{
                                          fontSize: '0.625rem',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(245, 158, 11, 0.1)',
                                          color: '#F59E0B',
                                          fontWeight: 600,
                                        }}
                                        title={`Currently in ${p.plantillaItem?.itemNumber}. Selecting will reassign.`}
                                      >
                                        Reassign
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: '0.625rem',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(16, 185, 129, 0.1)',
                                          color: '#10B981',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Available
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      className="btn btn-primary btn-xs"
                                      style={{
                                        fontSize: '0.6875rem',
                                        padding: '2px 8px',
                                        background: theme === 'dark' ? '#D7F84A' : '#141416',
                                        color: theme === 'dark' ? '#141416' : '#FFFFFF',
                                        border: 'none',
                                      }}
                                    >
                                      Choose
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#D7F84A' : '#141416',
                    color: theme === 'dark' ? '#141416' : '#FFFFFF',
                    border: 'none',
                  }}
                >
                  {editingItem ? 'Save Changes' : 'Save Plantilla Item'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 2: ASSIGN PERSONNEL OCCUPANT */}
      {showAssignModal && selectedPlantillaForAssign && (
        <ModalOverlay className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '580px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                  Occupant Assignment Workspace
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--color-text-primary)' }}>
                  Assign Occupant to {selectedPlantillaForAssign.itemNumber}
                </h3>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} style={{ padding: '20px' }}>
              <div style={{ background: 'var(--color-bg-tertiary)', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Target Plantilla Position:</div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {selectedPlantillaForAssign.positionTitle} (SG {selectedPlantillaForAssign.salaryGrade})
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {selectedPlantillaForAssign.department} • {selectedPlantillaForAssign.division}
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Search & Select Personnel to Assign:
                </label>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search by name, employee ID, designation…"
                    value={assignSearchQuery}
                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                    style={{ paddingLeft: '32px', fontSize: '0.8125rem' }}
                  />
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '6px' }}>
                  {/* Option to Vacate */}
                  <div
                    onClick={() => setSelectedPersonnelId('')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: selectedPersonnelId === '' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                      border: selectedPersonnelId === '' ? '1.5px solid #EF4444' : '1px solid transparent',
                      marginBottom: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#EF4444' }}>
                        — Vacate Item (No Assigned Occupant) —
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                        Makes this plantilla item available for merit ranking and external applications.
                      </div>
                    </div>
                    {selectedPersonnelId === '' && <CheckCircle2 size={16} color="#EF4444" />}
                  </div>

                  {filteredCandidates.map((p) => {
                    const isSelected = selectedPersonnelId === p.id;
                    const hasPlantilla = p.plantillaItem && p.plantillaItem.id !== selectedPlantillaForAssign.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPersonnelId(p.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                          border: isSelected ? '1.5px solid #2563EB' : '1px solid transparent',
                          marginBottom: '2px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {p.firstName} {p.lastName}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            {p.employeeId} • {p.designation} {hasPlantilla ? `(Currently on ${p.plantillaItem?.itemNumber})` : ''}
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 size={16} color="#2563EB" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#D7F84A' : '#141416',
                    color: theme === 'dark' ? '#141416' : '#FFFFFF',
                    border: 'none',
                  }}
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 3: LAUNCH MERIT PROMOTION CYCLE FOR VACANT PLANTILLA */}
      {showLaunchCycleModal && selectedPlantillaForCycle && (
        <ModalOverlay className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '580px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                  Merit Selection & Promotion Launch
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--color-text-primary)' }}>
                  Open Plantilla for Ranking
                </h3>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLaunchCycleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLaunchCycleSubmit} style={{ padding: '20px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '14px 16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Target Plantilla Position
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                  {selectedPlantillaForCycle.positionTitle} (SG {selectedPlantillaForCycle.salaryGrade})
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Item Code: {selectedPlantillaForCycle.itemNumber} • Station: {selectedPlantillaForCycle.department}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Promotion Cycle Title *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={cycleName}
                    onChange={(e) => setCycleName(e.target.value)}
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, 1fr 1fr)', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      Application Start Date *
                    </label>
                    <input
                      type="date"
                      required
                      className="form-control"
                      value={cycleStartDate}
                      onChange={(e) => setCycleStartDate(e.target.value)}
                      style={{ fontSize: '0.8125rem' }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      Submission Deadline *
                    </label>
                    <input
                      type="date"
                      required
                      className="form-control"
                      value={cycleEndDate}
                      onChange={(e) => setCycleEndDate(e.target.value)}
                      style={{ fontSize: '0.8125rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Max Applicants Capacity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="form-control"
                    value={cycleMaxApplicants}
                    onChange={(e) => setCycleMaxApplicants(Number(e.target.value))}
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowLaunchCycleModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#D7F84A' : '#141416',
                    color: theme === 'dark' ? '#141416' : '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} />
                  Launch Promotion Cycle
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
};
