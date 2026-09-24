import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../../components/common/AppIcon';
import { useToast } from '../../contexts/ToastContext';
import { getAllPages } from '../../api/pagination';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Plantilla = { itemNumber: string; positionTitle: string; department?: string; division?: string; salaryGrade?: number; isOccupied: boolean };
type Transaction = { id: number; referenceNo?: string; status: string; complianceScore?: number; transactionType?: { name?: string }; personnel?: { employeeId?: string; firstName?: string; lastName?: string } };

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const downloadCsv = (name: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  URL.revokeObjectURL(url);
};

export const Reports: React.FC = () => {
  const { addToast } = useToast();
  const [plantilla, setPlantilla] = useState<Plantilla[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllPages<Plantilla>('/plantilla'), getAllPages<Transaction>('/transactions')])
      .then(([p, t]) => { setPlantilla(p); setTransactions(t); })
      .catch((error) => addToast(error.response?.data?.message || 'Unable to load report data.', 'ERROR'))
      .finally(() => setLoading(false));
  }, [addToast]);

  const distribution = useMemo(() => {
    const groups = new Map<string, { division: string; active: number; vacancy: number }>();
    plantilla.forEach(item => {
      const title = item.positionTitle.toLowerCase();
      const division = title.includes('teacher') ? 'Teaching' : title.includes('administrative') || title.includes('officer') ? 'Administrative' : 'Other personnel';
      const row = groups.get(division) || { division, active: 0, vacancy: 0 };
      item.isOccupied ? row.active++ : row.vacancy++;
      groups.set(division, row);
    });
    return [...groups.values()];
  }, [plantilla]);

  const exportPlantilla = () => downloadCsv('plantilla-audit', ['Item number', 'Position', 'Salary grade', 'Station', 'Division', 'Status'], plantilla.map(i => [i.itemNumber, i.positionTitle, i.salaryGrade, i.department, i.division, i.isOccupied ? 'Occupied' : 'Vacant']));
  const exportTransactions = () => downloadCsv('document-compliance', ['Reference', 'Employee ID', 'Personnel', 'Transaction type', 'Status', 'Compliance percent'], transactions.map(t => [t.referenceNo || `TRX-${t.id}`, t.personnel?.employeeId, `${t.personnel?.firstName || ''} ${t.personnel?.lastName || ''}`.trim(), t.transactionType?.name, t.status, t.complianceScore ?? 0]));
  const exportDeficiencies = () => downloadCsv('compliance-deficiencies', ['Reference', 'Employee ID', 'Status', 'Compliance percent'], transactions.filter(t => ['DEFICIENCY', 'REJECTED'].includes(t.status)).map(t => [t.referenceNo || `TRX-${t.id}`, t.personnel?.employeeId, t.status, t.complianceScore ?? 0]));

  const reports = [
    ['Plantilla Item Audit Report', 'Current filled items and vacancies', exportPlantilla],
    ['Document Verification & Compliance Log', 'Current transaction status and measured requirement completion', exportTransactions],
    ['Compliance Deficiency Report', 'Returned, deficient, and rejected transactions', exportDeficiencies],
  ] as const;

  return <div className="animate-fade-in">
    <div className="topbar"><h1 className="topbar-title" style={{ margin: 0 }}>Reports & Data Analytics</h1></div>
    <div className="page-content"><div className="grid grid-2 gap-6 mb-6">
      <div className="card"><h3 className="card-title mb-4">Plantilla Item Distribution</h3><div className="chart-wrapper">
        {loading ? <div className="text-muted">Loading current data…</div> : distribution.length === 0 ? <div className="text-muted">No plantilla items found.</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={distribution}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="division" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} /><Tooltip /><Bar dataKey="active" name="Filled Items" fill="#2f7d52" radius={[4, 4, 0, 0]} /><Bar dataKey="vacancy" name="Vacancies" fill="#f97316" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
      </div></div>
      <div className="card"><h3 className="card-title mb-4">Available Report Downloads</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>{reports.map(([title, note, action]) => <div className="card" key={title} style={{ padding: 'var(--space-3)', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}><div><h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{title}</h4><p className="text-xs text-muted">{note}</p></div><button className="btn btn-secondary btn-sm" disabled={loading} onClick={action}><AppIcon name="download" size={14} /> Export CSV</button></div>)}</div></div>
    </div></div>
  </div>;
};
