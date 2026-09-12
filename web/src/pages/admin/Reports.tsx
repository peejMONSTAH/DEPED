import React from 'react';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_REPORTS_DATA = [
  { division: 'Elementary Teaching', active: 312, vacancy: 12 },
  { division: 'Secondary Teaching', active: 184, vacancy: 8 },
  { division: 'Non-Teaching / Admin', active: 46, vacancy: 3 },
  { division: 'Support Personnel', active: 20, vacancy: 1 }
];

export const Reports: React.FC = () => {
  const { addToast } = useToast();

  const handleExport = (reportType: string) => {
    addToast(`Exporting ${reportType} report to Excel/PDF format…`, 'SUCCESS');
  };

  return (
    <div className="animate-fade-in">
      <div className="topbar">
        <div>
          <div className="topbar-title">Reports & Data Analytics</div>
          <div className="topbar-subtitle">Generate plantilla statistics, promotion lists, and compliance summaries</div>
        </div>
      </div>

      <div className="page-content">
        <div className="grid grid-2 gap-6 mb-6">
          <div className="card">
            <h3 className="card-title mb-4">Plantilla Item Distribution</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_REPORTS_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="division" tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="active" name="Filled Items" fill="#007bff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vacancy" name="Vacancies" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 className="card-title mb-4">Available Report Downloads</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div 
                className="card" 
                style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Plantilla Item Audit Report</h4>
                  <p className="text-xs text-muted">Summary of filled items, vacancies, and division breakdown</p>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => handleExport('Plantilla Item Audit')}>
                  <AppIcon name="download" size={14} /> Export
                </button>
              </div>

              <div 
                className="card" 
                style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Document Verification & Compliance Log</h4>
                  <p className="text-xs text-muted">Analyze 201 filing validation timelines and civil service compliance</p>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => handleExport('Document Verification Log')}>
                  <AppIcon name="download" size={14} /> Export
                </button>
              </div>

              <div 
                className="card" 
                style={{ padding: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Compliance deficiency rates</h4>
                  <p className="text-xs text-muted">Transaction failure rates, timeline delays and submission reports</p>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => handleExport('Compliance Deficiency Rates')}>
                  <AppIcon name="download" size={14} /> Export
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
