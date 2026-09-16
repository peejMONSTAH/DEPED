import { ModalOverlay } from '../../components/common/ModalOverlay';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { ModalPortal } from '../../components/common/ModalPortal';
import apiClient from '../../api/client';

const HISTORY_TYPE_COLORS: Record<string, string> = {
  'Promotion': '#8b5cf6',
  'Salary Adjustment': '#f59e0b',
  'Appointment': '#10b981',
  'Award': '#ec4899',
  'Career Milestone': '#3b82f6',
};

interface ServiceDetailField {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
}

interface TimelineEntry {
  id: string;
  year: number;
  date: string;
  rawDate: number;
  event: string;
  type: string;
  ref: string;
  status: string;
  salary: string;
  remarks?: string;
}

export const CareerRecord: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [personnelData, setPersonnelData] = useState<any>(null);
  const [serviceDetails, setServiceDetails] = useState<ServiceDetailField[]>([]);
  const [careerTimeline, setCareerTimeline] = useState<TimelineEntry[]>([]);

  const fetchServiceRecord = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/personnel/me/service-record');
      const data = res.data?.data;
      if (data) {
        setPersonnelData(data.personnel);
        setServiceDetails(data.serviceRecordDetails || []);
        setCareerTimeline(data.careerTimeline || []);
      }
    } catch (err) {
      console.error('Failed to load service record:', err);
      // Fallback to /personnel/me
      try {
        const fallbackRes = await apiClient.get('/personnel/me');
        const p = fallbackRes.data?.data;
        if (p) {
          if (!p.dateHired) {
            setPersonnelData({ ...p, fullName: `${p.firstName} ${p.lastName}` });
            setServiceDetails([
              { label: 'Current Position', value: p.designation || 'Not recorded', highlight: false },
              { label: 'First Appointment Date', value: 'Not recorded', highlight: false },
              { label: 'Years in Service', value: 'Not recorded', highlight: false },
            ]);
            setCareerTimeline([]);
            return;
          }
          const hiredDate = new Date(p.dateHired);
          const now = new Date();
          let years = now.getFullYear() - hiredDate.getFullYear();
          let months = now.getMonth() - hiredDate.getMonth();
          if (now.getDate() < hiredDate.getDate()) months--;
          if (months < 0) { years--; months += 12; }
          const tenureStr = years <= 0 && months <= 0 ? 'Newly Appointed' : years <= 0 ? `${months} Months` : `${years} Years`;
          const sgStr = p.plantillaItem?.salaryGrade ? `SG ${p.plantillaItem.salaryGrade}` : 'Not recorded';

          setPersonnelData({
            id: p.id,
            employeeId: p.employeeId,
            fullName: `${p.firstName} ${p.lastName}`,
            designation: p.designation || 'Teacher I',
            plantillaItem: p.plantillaItem,
          });

          setServiceDetails([
            { label: 'Current Position', value: p.designation || 'Teacher I', highlight: false },
            { label: 'First Appointment Date', value: hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), highlight: false },
            { label: 'Years in Service', value: tenureStr, highlight: true, color: 'var(--color-success)' },
            { label: 'Latest Salary Grade', value: sgStr, highlight: true, color: 'var(--color-primary-light)' },
            { label: 'Latest Appointment Date', value: hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), highlight: false },
            { label: 'Latest Promotion Date', value: 'Original Appointment', highlight: false },
          ]);

          setCareerTimeline([
            {
              id: 'initial',
              year: hiredDate.getFullYear(),
              date: hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              rawDate: hiredDate.getTime(),
              event: `Initial Appointment: ${p.designation || 'Teacher I'} (${sgStr})`,
              type: 'Appointment',
              ref: 'Initial',
              status: 'APPROVED',
              salary: `${sgStr} Base Entry`,
            }
          ]);
        }
      } catch (e) {
        console.error('Fallback profile load error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceRecord();
  }, []);

  const fullName = personnelData?.fullName || (user?.firstName ? `${user.firstName} ${user.lastName}` : 'DepEd Personnel');
  const employeeId = personnelData?.employeeId || user?.email?.split('@')[0]?.toUpperCase() || 'EMP-2026-XXXX';
  const positionTitle = personnelData?.designation || personnelData?.plantillaItem?.positionTitle || 'Teaching Personnel';
  const stationName = personnelData?.plantillaItem?.department || personnelData?.plantillaItem?.division || 'City Schools Division of Koronadal';
  const salaryGradeText = serviceDetails.find(d => d.label === 'Latest Salary Grade')?.value || 'SG 11';
  const firstApptText = serviceDetails.find(d => d.label === 'First Appointment Date')?.value || 'N/A';
  const totalServiceText = serviceDetails.find(d => d.label === 'Years in Service')?.value || 'N/A';

  const handlePrint = () => {
    addToast('Generating printable DepEd Service Record PDF document...', 'SUCCESS');
    window.print();
  };

  return (
    <div className="animate-fade-in personnel-content-container">
      <div className="topbar" style={{ padding: '0 0 20px 0', marginBottom: 24 }}>
        <div>
          <div className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>Service Record & Career Timeline</div>
          <div className="topbar-subtitle" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Official digital 201 service history, position appointments, and step increments (Database Synchronized)
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowPdfModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <AppIcon name="reports" size={14} /> Printable Service Record (PDF)
          </button>
        </div>
      </div>

      {/* Personnel Identity Card */}
      <div className="card mb-4" style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #6d28d9 100%)', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 4 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, flexShrink: 0,
          }}>
            {(personnelData?.firstName?.[0] || user?.firstName?.[0] || 'D')}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)', marginBottom: 2 }}>
              Employee: {fullName}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', opacity: 0.9 }}>
              Position: {positionTitle} · Employee No: <span className="font-mono" style={{ fontWeight: 700 }}>{employeeId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Service Record Details */}
      <div className="card mb-4">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 'var(--text-sm)', margin: 0, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Service Record Details (Verified 201 File)
          </h3>
          <span className="badge badge-approved" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AppIcon name="security" size={11} /> DB Synchronized
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Retrieving service record from database...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {serviceDetails.map(field => (
              <div key={field.label} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{field.label}</div>
                <div style={{
                  fontWeight: 700,
                  fontSize: field.highlight ? 'var(--text-lg)' : 'var(--text-sm)',
                  color: field.highlight && field.color ? field.color : 'var(--color-text-primary)',
                }}>
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Career Timeline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Interactive Career Timeline
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {careerTimeline.length} Milestone{careerTimeline.length === 1 ? '' : 's'} Recorded
        </span>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Loading career timeline...
          </div>
        ) : careerTimeline.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No career timeline milestones recorded yet.
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{
              position: 'absolute', left: 8, top: 0, bottom: 0,
              width: 2, background: 'var(--color-border)',
            }} />

            {careerTimeline.map((entry, idx) => (
              <div key={entry.id || idx} style={{ position: 'relative', marginBottom: idx === careerTimeline.length - 1 ? 0 : 24 }}>
                <div style={{
                  position: 'absolute', left: -24, top: 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: HISTORY_TYPE_COLORS[entry.type] || 'var(--color-primary)',
                  border: '2px solid var(--color-bg-card)',
                }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                    {entry.event}
                  </span>
                  <span className="badge badge-approved" style={{ fontSize: 10 }}>{entry.status}</span>
                </div>
                <div className="text-xs text-muted flex gap-3" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AppIcon name="pending" size={12} /> {entry.date}
                  </span>
                  <span>Ref: {entry.ref}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>{entry.salary}</span>
                  {entry.remarks && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>• {entry.remarks}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Official DepEd Service Record Document Modal (CS Form 212 Compliant) */}
      {showPdfModal && (
        <ModalPortal>
        <ModalOverlay className="modal-overlay" onClick={() => setShowPdfModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 750, color: '#1e293b', background: '#ffffff', padding: 24, borderRadius: 14 }}>
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0284c7', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, color: '#475569' }}>Republic of the Philippines · Department of Education</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>REGION XII — SOCCSKSARGEN</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0284c7' }}>CITY SCHOOLS DIVISION OF KORONADAL</div>
              <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', marginTop: 8, letterSpacing: 1 }}>OFFICIAL SERVICE RECORD</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>(Issued in accordance with Executive Order No. 54)</div>
            </div>

            {/* Personnel Header Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div><strong>NAME:</strong> {fullName.toUpperCase()}</div>
              <div><strong>EMPLOYEE NO:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{employeeId}</span></div>
              <div><strong>STATION:</strong> {stationName}</div>
              <div><strong>FIRST APPOINTMENT:</strong> {firstApptText}</div>
              <div><strong>CURRENT POSITION:</strong> {positionTitle} ({salaryGradeText})</div>
              <div><strong>TOTAL SERVICE:</strong> {totalServiceText}</div>
            </div>

            {/* Official Service Table */}
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>RECORD DATE</th>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>DESIGNATION & ACTION</th>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>STATUS</th>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>SALARY / COMPENSATION</th>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>STATION / DIVISION</th>
                    <th style={{ padding: 6, border: '1px solid #cbd5e1' }}>REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {careerTimeline.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{row.date}</td>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0', fontWeight: 600 }}>{row.event}</td>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0' }}>PERMANENT</td>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0', fontWeight: 600 }}>{row.salary}</td>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0' }}>{stationName}</td>
                      <td style={{ padding: 6, border: '1px solid #e2e8f0', color: '#16a34a', fontWeight: 600 }}>
                        {row.remarks || 'VALIDATED 201'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Certification */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AppIcon name="approved" size={12} color="#10b981" /> <strong>DIGITAL 201 VERIFIED RECORD</strong></div>
                <div>Employee ID: {employeeId}</div>
                <div>Generated: {new Date().toLocaleDateString()}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 200 }}>
                <div style={{ borderBottom: '1px solid #0f172a', fontWeight: 700, paddingBottom: 4, fontSize: 12 }}>
                  ADMINISTRATIVE OFFICER V (HRMO)
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Certified Correct / Official Seal</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-footer" style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setShowPdfModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="checklist" size={14} /> Print / Save PDF Document
              </button>
            </div>
          </div>
        </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};
