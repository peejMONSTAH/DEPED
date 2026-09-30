import React, { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { AppIcon } from '../../components/common/AppIcon';
import { PortalBand } from './components/PortalBand';
import { AsyncState } from '../../components/common/AsyncState';
import apiClient from '../../api/client';
import './service-record.css';

const HISTORY_TYPE_COLORS: Record<string, string> = {
  Promotion: '#c79a2e',
  'Salary Adjustment': '#f59e0b',
  Appointment: '#10b981',
  Award: '#ec4899',
  'Career Milestone': '#3f9265',
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
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [personnelData, setPersonnelData] = useState<any>(null);
  const [serviceDetails, setServiceDetails] = useState<ServiceDetailField[]>([]);
  const [careerTimeline, setCareerTimeline] = useState<TimelineEntry[]>([]);

  const fetchServiceRecord = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/personnel/me/service-record');
      const data = res.data?.data;
      if (data) {
        setPersonnelData(data.personnel);
        setServiceDetails(data.serviceRecordDetails || []);
        setCareerTimeline(data.careerTimeline || []);
      }
    } catch (err: any) {
      console.error('Failed to load service record:', err);
      // Fallback to /personnel/me without fabricating data
      try {
        const fallbackRes = await apiClient.get('/personnel/me');
        const p = fallbackRes.data?.data;
        if (p) {
          const designation = p.designation || p.plantillaItem?.positionTitle || 'Not recorded';
          const hiredDate = p.dateHired ? new Date(p.dateHired) : null;
          let tenureStr = 'Not recorded';
          if (hiredDate && !Number.isNaN(hiredDate.getTime())) {
            const now = new Date();
            let years = now.getFullYear() - hiredDate.getFullYear();
            let months = now.getMonth() - hiredDate.getMonth();
            if (now.getDate() < hiredDate.getDate()) months--;
            if (months < 0) {
              years--;
              months += 12;
            }
            tenureStr = years <= 0 && months <= 0 ? 'Newly Appointed' : years <= 0 ? `${months} Months` : `${years} Years`;
          }

          const sgStr = p.plantillaItem?.salaryGrade ? `SG ${p.plantillaItem.salaryGrade}` : 'Not recorded';

          setPersonnelData({
            id: p.id,
            employeeId: p.employeeId,
            fullName: `${p.firstName} ${p.lastName}`.trim(),
            designation,
            station: p.school || p.station || 'Not recorded',
            plantillaItem: p.plantillaItem,
          });

          setServiceDetails([
            { label: 'Current Position', value: designation, highlight: false },
            {
              label: 'First Appointment Date',
              value: hiredDate ? hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded',
              highlight: false,
            },
            { label: 'Years in Service', value: tenureStr, highlight: tenureStr !== 'Not recorded', color: 'var(--color-success)' },
            { label: 'Latest Salary Grade', value: sgStr, highlight: sgStr !== 'Not recorded', color: 'var(--color-primary-light)' },
            {
              label: 'Latest Appointment Date',
              value: hiredDate ? hiredDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded',
              highlight: false,
            },
            { label: 'Appointment Status', value: p.appointmentStatus || 'Not recorded', highlight: false },
          ]);

          // Never invent synthetic appointment entries
          setCareerTimeline([]);
        } else {
          setError(err?.response?.data?.message || 'Unable to retrieve official service record.');
        }
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Unable to connect to service record repository.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServiceRecord();
  }, [fetchServiceRecord]);

  const fullName = personnelData?.fullName || (user?.firstName ? `${user.firstName} ${user.lastName}`.trim() : 'DepEd Personnel');
  const employeeId = personnelData?.employeeId || 'Not recorded';
  const positionTitle = personnelData?.designation || personnelData?.plantillaItem?.positionTitle || 'Not recorded';
  const stationName = personnelData?.school || personnelData?.station || (user as any)?.school || 'Not recorded';

  return (
    <div className="animate-fade-in personnel-content-container">
      <PortalBand title="Service Record" />

      <AsyncState
        loading={loading}
        error={error}
        onRetry={fetchServiceRecord}
        loadingText="Retrieving certified service record from Division 201 repository..."
      >
        {/* Personnel identity: who this record belongs to */}
        <section className="svc-id print-header" aria-label="Record holder">
          <div className="svc-id__who">
            <span className="svc-id__avatar" aria-hidden="true">{personnelData?.firstName?.[0] || user?.firstName?.[0] || 'D'}</span>
            <div className="svc-id__name">
              <strong>{fullName}</strong>
              <span className="svc-id__verified"><AppIcon name="security" size={13} /> Verified by HRMO</span>
            </div>
          </div>
          <dl className="svc-id__facts">
            <div><dt>Position</dt><dd>{positionTitle}</dd></div>
            <div><dt>Employee no.</dt><dd className="font-mono">{employeeId}</dd></div>
            <div><dt>Station</dt><dd>{stationName}</dd></div>
          </dl>
        </section>

        {/* Official Appointment & Service Summary Grid */}
        <div className="card mb-4" style={{ borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2
              style={{
                fontWeight: 700,
                fontSize: '0.8125rem',
                margin: 0,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Appointment & Credited Service Summary
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Source: Division HRMO Plantilla & Personnel Master File
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {serviceDetails.map(field => (
              <div
                key={field.label}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  background: 'var(--color-bg-secondary)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4, fontWeight: 600 }}>
                  {field.label}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: field.highlight ? '1.125rem' : '0.9375rem',
                    color: field.highlight && field.color ? field.color : 'var(--color-text-primary)',
                  }}
                >
                  {field.value || 'Not recorded'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chronological Service Record History & Timeline */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: 'var(--color-text-secondary)',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Chronological Service Record Ledger
            </h2>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              Official record of appointments, salary adjustments, promotions, and leaves of absence
            </div>
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
            {careerTimeline.length} Milestone{careerTimeline.length === 1 ? '' : 's'} on Record
          </span>
        </div>

        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          {careerTimeline.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <AppIcon name="inbox" size={32} color="var(--color-text-muted)" />
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginTop: 8, color: 'var(--color-text-primary)' }}>
                No Service Record Entries Found
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem' }}>
                Service records are issued and verified by the Division HRMO upon confirmation of appointment documents.
              </p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 8,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  background: 'var(--color-border)',
                }}
              />

              {careerTimeline.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  style={{
                    position: 'relative',
                    marginBottom: idx === careerTimeline.length - 1 ? 0 : 20,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -24,
                      top: 4,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: HISTORY_TYPE_COLORS[entry.type] || 'var(--color-primary)',
                      border: '2px solid var(--color-bg-card)',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                      {entry.event}
                    </span>
                    <span
                      className={`badge ${entry.status === 'PENDING' ? 'badge-pending' : 'badge-approved'}`}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {entry.status === 'PENDING' ? 'PENDING REQUIREMENTS' : entry.status}
                    </span>
                  </div>

                  <div className="text-xs text-muted" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AppIcon name="calendar" size={12} /> {entry.date}
                    </span>
                    {entry.ref && <span>Ref: <strong>{entry.ref}</strong></span>}
                    {entry.salary && (
                      <span style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>
                        {entry.salary}
                      </span>
                    )}
                    {entry.remarks && (
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        • {entry.remarks}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Official Legal Footer / Provenance Notice */}
        <div
          style={{
            marginTop: 24,
            padding: '14px 18px',
            borderRadius: 12,
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppIcon name="security" size={16} color="var(--color-primary)" />
            <span>
              Official Government Document. Issued pursuant to Executive Order No. 54 and CSC Memorandum Circulars.
            </span>
          </div>
          <div>Division Office of General Santos City · Personnel Section</div>
        </div>
      </AsyncState>
    </div>
  );
};
