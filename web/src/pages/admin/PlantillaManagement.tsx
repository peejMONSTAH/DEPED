import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppIcon } from '../../components/common/AppIcon';
import apiClient from '../../api/client';
import {
  TEACHING_POSITIONS,
  NON_TEACHING_POSITIONS,
  DEPED_KORONADAL_DISTRICTS,
  getAutoSalaryGrade,
} from '../../constants/depedData';
import { matchesLocation, schoolAfterDistrictChange, schoolOptionsFor } from '../../utils/plantillaFilters';
import { Building2, Users, Search, Plus, Trash2, Edit, UserCheck, UserMinus, Sparkles, TrendingUp, CheckCircle2, AlertCircle, HelpCircle, Award, ArrowRight, RefreshCw, X, Briefcase } from 'lucide-react';
import './sysadmin-pages.css';
import { clickable } from '../../a11y/clickable';

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
  school?: string;
  district?: string;
  plantillaItem?: { id: number; itemNumber: string; positionTitle: string; department?: string } | null;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const POSITION_CODES: Record<string, string> = {
  teacher: 'TCH', 'master teacher': 'MT', 'head teacher': 'HT', principal: 'PRIN', 'school principal': 'PRIN',
};

/** "Teacher VII" → "TCH7", "Master Teacher II" → "MT2", "Administrative Officer II" → "AO2". */
const positionCode = (title: string): string => {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const last = (words[words.length - 1] || '').toUpperCase();
  const rank = ROMAN[last] ?? (/^\d+$/.test(last) ? Number(last) : null);
  const base = rank ? words.slice(0, -1) : words;
  const code = POSITION_CODES[base.join(' ').toLowerCase()] ?? base.map(w => w[0]).join('').toUpperCase();
  return `${code || 'POS'}${rank ?? ''}`;
};

/** A draft item number from the position, unique among registered items. HR replaces it with the DBM-issued one if different. */
const suggestItemNumber = (title: string, taken: Set<string>): string => {
  const year = new Date().getFullYear();
  for (;;) {
    const candidate = `OSEC-DECSB-${positionCode(title)}-${Math.floor(100000 + Math.random() * 900000)}-${year}`;
    if (!taken.has(candidate.toUpperCase())) return candidate;
  }
};

export const PlantillaManagement: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const confirm = useConfirm();
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
  // False while the number is the position-based suggestion; typing takes it over.
  const [itemNumberEdited, setItemNumberEdited] = useState(false);
  const takenItemNumbers = () => new Set(plantillas.map(p => p.itemNumber.toUpperCase()));
  const [formPositionTitle, setFormPositionTitle] = useState('Teacher I');
  const [formSalaryGrade, setFormSalaryGrade] = useState<number>(11);
  const [formDepartment, setFormDepartment] = useState('');
  const [formDivision, setFormDivision] = useState('');
  const selectedFormDistrict = DEPED_KORONADAL_DISTRICTS.find(d => formDivision === `SDO Koronadal City - ${d.name}`);
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

      if (!matchesLocation(item, { district: districtFilter, school: schoolFilter }, DEPED_KORONADAL_DISTRICTS)) return false;

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

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setTrackFilter('ALL');
    setDistrictFilter('ALL');
    setSchoolFilter('ALL');
  };

  const STATUS_FILTER_LABEL = { VACANT: 'Vacant only', OCCUPIED: 'Occupied only', OPEN_RANKING: 'Open for ranking' } as const;
  const activeFilterChips = [
    searchQuery.trim() && { key: 'search', label: `Search: "${searchQuery.trim()}"`, clear: () => setSearchQuery('') },
    statusFilter !== 'ALL' && { key: 'status', label: STATUS_FILTER_LABEL[statusFilter], clear: () => setStatusFilter('ALL') },
    trackFilter !== 'ALL' && { key: 'track', label: trackFilter === 'TEACHING' ? 'Teaching track' : 'Non-teaching track', clear: () => setTrackFilter('ALL') },
    districtFilter !== 'ALL' && { key: 'district', label: districtFilter, clear: () => { setDistrictFilter('ALL'); } },
    schoolFilter !== 'ALL' && { key: 'school', label: schoolFilter, clear: () => setSchoolFilter('ALL') },
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  // Open Add Modal
  const handleOpenAdd = () => {
    if (!isAdmin) {
      addToast('Access denied: Only HR (HRMO) or System Administrator can create plantilla items.', 'ERROR');
      return;
    }
    setEditingItem(null);
    setFormItemNumber(suggestItemNumber('Teacher I', takenItemNumbers()));
    setItemNumberEdited(false);
    setFormPositionTitle('Teacher I');
    setFormSalaryGrade(getAutoSalaryGrade('Teacher I'));
    setFormDepartment('');
    setFormDivision('');
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
    setItemNumberEdited(true);
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
    if (!(formDivision === 'SDO Koronadal City' && formDepartment === 'Schools Division Office') &&
        (!selectedFormDistrict || ![...selectedFormDistrict.schools, 'All Schools in District'].includes(formDepartment))) {
      addToast('Select a district and a school in that district.', 'WARNING');
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

    const { confirmed } = await confirm({
      title: 'Delete plantilla item',
      message: `Permanently delete Plantilla Item '${item.itemNumber}' (${item.positionTitle})? This cannot be undone.`,
      confirmLabel: 'Delete item',
      icon: 'delete',
    });
    if (!confirmed) return;

    try {
      await apiClient.delete(`/plantilla/${item.id}`);
      addToast(`Plantilla Item '${item.itemNumber}' deleted from inventory.`, 'INFO');
      fetchPlantillas();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to delete plantilla item.', 'ERROR');
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
      if (selectedPlantillaForAssign.isOpenForRanking && pId !== null) {
        addToast(
          `Cannot manually assign occupant: Plantilla Item '${selectedPlantillaForAssign.itemNumber}' is currently open for grab in active promotion cycle "${selectedPlantillaForAssign.activePromotionCycle?.name || 'Ongoing Cycle'}".`,
          'ERROR'
        );
        return;
      }
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

    const { confirmed } = await confirm({
      title: 'Vacate plantilla item',
      message: `Vacate Plantilla Item '${item.itemNumber}' and unbind ${occupantName}? The item becomes Vacant and Ready for Ranking.`,
      confirmLabel: 'Vacate item',
    });
    if (!confirmed) return;

    try {
      await apiClient.post(`/plantilla/${item.id}/assign`, { personnelId: null });
      addToast(`Plantilla Item '${item.itemNumber}' has been vacated.`, 'INFO');
      fetchPlantillas();
      fetchPersonnel();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to vacate plantilla item.', 'ERROR');
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
      `${p.firstName} ${p.lastName} ${p.employeeId} ${p.designation} ${p.school || ''} ${p.address || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [personnelList, assignSearchQuery]);

  const STAT_TILES = [
    ['ALL', 'Plantilla items', stats.totalItems, ''],
    ['OCCUPIED', 'Filled', stats.occupiedItems, ''],
    ['VACANT', 'Vacant', stats.vacantItems, stats.vacantItems ? ' is-warn' : ''],
    ['OPEN_RANKING', 'In a promotion cycle', stats.openForRanking, ''],
  ] as const;

  return (
    <div className="sap animate-fade-in">
      <header className="sap-head">
        <h1>Plantilla</h1>
        <div className="sap-head__actions">
          <button type="button" className="sap-btn sap-btn--ghost" onClick={fetchPlantillas} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'sap-spin' : ''} aria-hidden="true" /> Refresh
          </button>
          {isAdmin && (
            <button type="button" className="sap-btn sap-btn--primary" onClick={handleOpenAdd}><Plus size={18} aria-hidden="true" /> Add item</button>
          )}
        </div>
      </header>

      <section className="sap-stats" aria-label="Plantilla summary">
        {STAT_TILES.map(([key, label, count, tone]) => (
          <button key={key} type="button" aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key as any)}
            className={`sap-stat sap-stat--btn${statusFilter === key ? ' is-on' : ''}${tone}`}>
            <span className="sap-stat__label">{label}</span>
            <span className="sap-stat__num">{count}{key === 'OCCUPIED' && stats.totalItems > 0 && <small> {Math.round((stats.occupiedItems / stats.totalItems) * 100)}%</small>}</span>
          </button>
        ))}
      </section>

      <section className="sap-card">
        <div className="sap-card__head sap-card__head--stack">
          <h2>Items <small>{filteredPlantillas.length === plantillas.length ? plantillas.length : `${filteredPlantillas.length} of ${plantillas.length}`}</small></h2>
          <div className="sap-toolbar">
            <label className="sap-search">
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Search plantilla</span>
              <input type="search" placeholder="Search item number, position, school or name" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </label>
            <div className="sap-seg" role="group" aria-label="Track">
              {([['ALL', 'All'], ['TEACHING', 'Teaching'], ['NON_TEACHING', 'Non-teaching']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={trackFilter === v} onClick={() => setTrackFilter(v as any)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="sap-filters" role="group" aria-label="Location filters">
            <select aria-label="District" className="sap-select" value={districtFilter}
              onChange={e => { const next = e.target.value; setDistrictFilter(next); setSchoolFilter(current => schoolAfterDistrictChange(current, next, DEPED_KORONADAL_DISTRICTS)); }}>
              <option value="ALL">All districts</option>
              {DEPED_KORONADAL_DISTRICTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <select aria-label="School" className="sap-select" value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}>
              <option value="ALL">All schools</option>
              {schoolOptionsFor(districtFilter, DEPED_KORONADAL_DISTRICTS).map(school => <option key={school} value={school}>{school}</option>)}
            </select>
            {activeFilterChips.length > 0 && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={resetFilters}><X size={17} aria-hidden="true" /> Clear filters</button>}
          </div>
        </div>

        {loading ? (
          <div className="sap-card__body" aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} className="sap-skel" />)}</div>
        ) : filteredPlantillas.length === 0 ? (
          <div className="sap-empty">
            <Building2 size={40} aria-hidden="true" style={{ display: 'block', margin: '0 auto 10px', color: 'var(--sap-muted)' }} />
            {plantillas.length === 0 ? 'No plantilla items yet.' : 'No items match.'}
            <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {activeFilterChips.length > 0 && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={resetFilters}>Clear filters</button>}
              {isAdmin && plantillas.length === 0 && <button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={handleOpenAdd}><Plus size={17} aria-hidden="true" /> Add item</button>}
            </div>
          </div>
        ) : (
          <ul className="sap-rows">
            {filteredPlantillas.map(item => {
              const isTeacher = item.positionTitle.toLowerCase().includes('teacher');
              const occupant = item.occupiedByPersonnel;
              const isOccupied = Boolean(occupant);
              const inCycle = item.isOpenForRanking && item.activePromotionCycle;
              return (
                <li key={item.id} className="sap-row sap-row--plantilla">
                  <span className={`sap-avatar${occupant ? '' : ' is-icon'}`}>{occupant ? `${occupant.firstName?.[0] || ''}${occupant.lastName?.[0] || ''}` : <Briefcase size={24} aria-hidden="true" />}</span>
                  <div className="sap-who">
                    <span className="sap-who__name">{item.positionTitle}<span className="sap-tag">SG {item.salaryGrade}</span><span className="sap-tag">{isTeacher ? 'Teaching' : 'Non-teaching'}</span></span>
                    <span className="sap-who__line">{[item.department, item.division].filter(Boolean).join(' · ')}</span>
                    <span className="sap-who__mono">{item.itemNumber}</span>
                    <span className="sap-who__line">
                      {occupant
                        ? <><UserCheck size={17} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> <b>{occupant.firstName} {occupant.lastName}</b> · {occupant.employeeId}</>
                        : inCycle ? <button type="button" className="sap-inline-link" onClick={() => navigate('/admin/promotions')}>In cycle: {item.activePromotionCycle!.name}</button>
                        : 'No one assigned'}
                    </span>
                  </div>
                  <span className={`sap-pill ${isOccupied ? 'is-ok' : inCycle ? 'is-muted' : 'is-warn'}`}>{isOccupied ? 'Filled' : inCycle ? 'In cycle' : 'Vacant'}</span>
                  <div className="sap-row__actions">
                    {!isOccupied && (inCycle
                      ? <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => navigate('/admin/promotions')}><TrendingUp size={17} aria-hidden="true" /> View cycle</button>
                      : <button type="button" className="sap-btn sap-btn--primary sap-btn--sm" onClick={() => handleOpenForRanking(item)}><Sparkles size={17} aria-hidden="true" /> Start promotion</button>)}
                    {isHR && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm" onClick={() => handleOpenAssign(item)}><UserCheck size={17} aria-hidden="true" /> {isOccupied ? 'Change' : 'Assign'}</button>}
                    {isHR && isOccupied && <button type="button" className="sap-btn sap-btn--danger sap-btn--sm" onClick={() => handleVacateItem(item)}><UserMinus size={17} aria-hidden="true" /> Vacate</button>}
                    {isAdmin && <button type="button" className="sap-btn sap-btn--ghost sap-btn--sm sap-btn--icon" onClick={() => handleOpenEdit(item)} aria-label={`Edit ${item.itemNumber}`} title="Edit"><Edit size={18} aria-hidden="true" /></button>}
                    {isAdmin && !isOccupied && <button type="button" className="sap-btn sap-btn--danger sap-btn--sm sap-btn--icon" onClick={() => handleDeleteItem(item)} aria-label={`Delete ${item.itemNumber}`} title="Delete"><Trash2 size={18} aria-hidden="true" /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* MODAL 1: ADD / EDIT PLANTILLA ITEM */}
      {showAddModal && (
        <ModalOverlay onDismiss={() => setShowAddModal(false)} className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '560px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
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
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    Plantilla Item Number (CSC / DBM Code) *
                  </label>
                  <input
                    aria-label="Plantilla Item Number (CSC / DBM Code)"
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. OSEC-DECSB-TCH3-420015-2026"
                    value={formItemNumber}
                    onChange={(e) => { setFormItemNumber(e.target.value); setItemNumberEdited(true); }}
                    style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'var(--layout-columns-2, minmax(0, 2fr) minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                      Authorized Position Title *
                    </label>
                    <select
                      aria-label="Authorized Position Title"
                      className="form-control"
                      value={formPositionTitle}
                      onChange={(e) => {
                        const title = e.target.value;
                        setFormPositionTitle(title);
                        setFormSalaryGrade(getAutoSalaryGrade(title));
                        if (!itemNumberEdited) setFormItemNumber(suggestItemNumber(title, takenItemNumbers()));
                      }}
                      style={{ fontSize: '0.8125rem' }}
                    >
                      <optgroup label="1. Teaching Personnel — Current ECP Positions">
                        {TEACHING_POSITIONS.filter(p => !p.includes('(') && !p.includes('Special') && !p.includes('Principal') && !p.includes('Head Teacher')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Special Science / Special Needs Education Titles">
                        {TEACHING_POSITIONS.filter(p => p.includes('Special') || p.includes('SPED')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="2. School Administration / School Heads — Current ECP Titles">
                        {TEACHING_POSITIONS.filter(p => p.startsWith('School Principal')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Existing / Legacy Positions">
                        {TEACHING_POSITIONS.filter(p => p.includes('Head Teacher') || p.includes('Assistant')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Newer DepEd Staffing Framework — Counselor Series">
                        {NON_TEACHING_POSITIONS.filter(p => p.includes('Counselor')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Administrative & Office Staff Roles">
                        {NON_TEACHING_POSITIONS.filter(p => !p.includes('Counselor')).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Salary Grade *</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input aria-label="Salary Grade (fixed by DBM)"
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
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    District *
                  </label>
                  <select
                    aria-label="District"
                    className="form-control"
                    value={formDivision}
                    onChange={(e) => {
                      setFormDivision(e.target.value);
                      setFormDepartment(e.target.value === 'SDO Koronadal City' ? 'Schools Division Office' : '');
                    }}
                    style={{ fontSize: '0.8125rem' }}
                  >
                    <option value="">Select district</option>
                    <option value="SDO Koronadal City">Division Office</option>
                    {DEPED_KORONADAL_DISTRICTS.map(d => (
                      <option key={d.id} value={`SDO Koronadal City - ${d.name}`}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {selectedFormDistrict && (
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>School *</label>
                    <select aria-label="School" className="form-control" value={formDepartment}
                      onChange={e => setFormDepartment(e.target.value)} style={{ fontSize: '0.8125rem' }}>
                      <option value="">Select school</option>
                      <option value="All Schools in District">District-wide (all schools)</option>
                      {selectedFormDistrict.schools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
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
                        <UserCheck size={16} color={theme === 'dark' ? '#E3C36A' : '#1f3a2c'} />
                        <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
                          Choose Assigned Personnel (Occupant) *
                        </label>
                      </div>
                      {formPersonnelId && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setFormPersonnelId('')}
                          style={{ fontSize: '0.8125rem', color: '#EF4444', padding: '2px 6px' }}
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
                          border: `1.5px solid ${theme === 'dark' ? '#E3C36A' : '#1f3a2c'}`,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                              color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
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
                            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', gap: '6px' }}>
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
                          style={{ fontSize: '0.8125rem', padding: '4px 10px' }}
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
                              pointerEvents: 'none',
                            }}
                          />
                          <input
                            aria-label="Search by name, employee ID, or designation"
                            type="text"
                            className="form-control has-icon-left"
                            placeholder="Search by name, employee ID, or designation..."
                            value={formPersonnelSearch}
                            onChange={(e) => setFormPersonnelSearch(e.target.value)}
                            style={{
                              width: '100%',
                              height: '38px',
                              paddingLeft: '34px',
                              fontSize: '0.875rem',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-text-primary)',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
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
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                              No matching personnel found in database.
                            </div>
                          ) : (
                            candidatePersonnelList.map((p) => {
                              const isCurrentOccupant = formPersonnelId === p.id;
                              const isAlreadyInAnother = p.plantillaItem && (!editingItem || p.plantillaItem.id !== editingItem.id);

                              return (
                                <div
                                  key={p.id}
                                  aria-pressed={isCurrentOccupant}
                                  {...clickable<HTMLDivElement>(() => setFormPersonnelId(p.id))}
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
                                        fontSize: '0.8125rem',
                                      }}
                                    >
                                      {p.firstName?.[0]}{p.lastName?.[0]}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                        {p.firstName} {p.lastName}
                                      </div>
                                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                                        {p.employeeId} • {p.designation} • <span style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{p.school || p.plantillaItem?.department || p.address?.split(',')[0] || 'Unassigned Station'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {selectedPlantillaForAssign?.department && p.school && selectedPlantillaForAssign.department.trim().toLowerCase() !== p.school.trim().toLowerCase() && (
                                      <span
                                        style={{
                                          fontSize: '0.8125rem',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(59, 130, 246, 0.1)',
                                          color: '#3B82F6',
                                          fontWeight: 600,
                                        }}
                                        title={`Assigning will transfer personnel from ${p.school} to ${selectedPlantillaForAssign.department}`}
                                      >
                                        Station Transfer
                                      </span>
                                    )}
                                    {isAlreadyInAnother ? (
                                      <span
                                        style={{
                                          fontSize: '0.8125rem',
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
                                          fontSize: '0.8125rem',
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
                                        fontSize: '0.8125rem',
                                        padding: '2px 8px',
                                        background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                                        color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                    color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
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
        <ModalOverlay onDismiss={() => setShowAssignModal(false)} className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '580px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
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
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Target Plantilla Position:</div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {selectedPlantillaForAssign.positionTitle} (SG {selectedPlantillaForAssign.salaryGrade})
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {selectedPlantillaForAssign.department} • {selectedPlantillaForAssign.division}
                </div>
              </div>

              {selectedPlantillaForAssign.isOpenForRanking && (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    <strong style={{ color: '#D97706' }}>Plantilla Open for Grab in Promotion Cycle:</strong> This item is currently tied to active promotion cycle <em>"{selectedPlantillaForAssign.activePromotionCycle?.name}"</em>. Direct manual assignment is locked to protect the official ranking and deliberation process.
                  </div>
                </div>
              )}

              <div>
                <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                  Search & Select Personnel to Assign:
                </label>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                  <input
                    aria-label="Search & Select Personnel to Assign"
                    type="text"
                    className="form-control has-icon-left"
                    placeholder="Search by name, employee ID, designation…"
                    value={assignSearchQuery}
                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      paddingLeft: '34px',
                      fontSize: '0.875rem',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '6px' }}>
                  {/* Option to Vacate */}
                  <div
                    {...clickable<HTMLDivElement>(() => setSelectedPersonnelId(''), 'Vacate this plantilla item')}
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
                    </div>
                    {selectedPersonnelId === '' && <CheckCircle2 size={16} color="#EF4444" />}
                  </div>

                  {filteredCandidates.map((p) => {
                    const isSelected = selectedPersonnelId === p.id;
                    const hasPlantilla = p.plantillaItem && p.plantillaItem.id !== selectedPlantillaForAssign.id;

                    return (
                      <div
                        key={p.id}
                        aria-pressed={isSelected}
                        {...clickable<HTMLDivElement>(() => setSelectedPersonnelId(p.id))}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                          border: isSelected ? '1.5px solid #2F7D52' : '1px solid transparent',
                          marginBottom: '2px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {p.firstName} {p.lastName}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                            {p.employeeId} • {p.designation} {hasPlantilla ? `(Currently on ${p.plantillaItem?.itemNumber})` : ''}
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 size={16} color="#2F7D52" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="submit"
                  disabled={Boolean(selectedPlantillaForAssign.isOpenForRanking && selectedPersonnelId !== '')}
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                    color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
                    border: 'none',
                    opacity: (selectedPlantillaForAssign.isOpenForRanking && selectedPersonnelId !== '') ? 0.45 : 1,
                    cursor: (selectedPlantillaForAssign.isOpenForRanking && selectedPersonnelId !== '') ? 'not-allowed' : 'pointer',
                  }}
                >
                  {selectedPlantillaForAssign.isOpenForRanking && selectedPersonnelId !== ''
                    ? 'Assignment Locked (Open for Promotion)'
                    : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL 3: LAUNCH MERIT PROMOTION CYCLE FOR VACANT PLANTILLA */}
      {showLaunchCycleModal && selectedPlantillaForCycle && (
        <ModalOverlay onDismiss={() => setShowLaunchCycleModal(false)} className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal animate-scale-in" style={{ maxWidth: '580px', borderRadius: '16px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
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
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2F7D52', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Target Plantilla Position
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                  {selectedPlantillaForCycle.positionTitle} (SG {selectedPlantillaForCycle.salaryGrade})
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Item Code: {selectedPlantillaForCycle.itemNumber} • Station: {selectedPlantillaForCycle.department}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    Promotion Cycle Title *
                  </label>
                  <input
                    aria-label="Promotion Cycle Title"
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
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                      Application Start Date *
                    </label>
                    <input
                      aria-label="Application Start Date"
                      type="date"
                      required
                      className="form-control"
                      value={cycleStartDate}
                      onChange={(e) => setCycleStartDate(e.target.value)}
                      style={{ fontSize: '0.8125rem' }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                      Submission Deadline *
                    </label>
                    <input
                      aria-label="Submission Deadline"
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
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    Max Applicants Capacity
                  </label>
                  <input
                    aria-label="Max Applicants Capacity"
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontWeight: 800,
                    background: theme === 'dark' ? '#E3C36A' : '#1f3a2c',
                    color: theme === 'dark' ? '#1f3a2c' : '#FFFFFF',
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
