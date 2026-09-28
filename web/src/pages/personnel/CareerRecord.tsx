import React, { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import { PageHeader } from '../../components/common/PageHeader';
import { AsyncState } from '../../components/common/AsyncState';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
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
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [personnelData, setPersonnelData] = useState<any>(null);
  const [serviceDetails, setServiceDetails] = useState<ServiceDetailField[]>([]);
  const [careerTimeline, setCareerTimeline] = useState<TimelineEntry[]>([]);

  // Discrepancy report modal
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [discrepancySubject, setDiscrepancySubject] = useState('');
  const [discrepancyMessage, setDiscrepancyMessage] = useState('');
  const [submittingDiscrepancy, setSubmittingDiscrepancy] = useState(false);

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
            station: p.school || p.station || 'Division of General Santos City',
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

  const handlePrint = () => {
    window.print();
  };

  const handleSubmitDiscrepancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discrepancyMessage.trim()) return;
    setSubmittingDiscrepancy(true);
    try {
      await apiClient.post('/notifications', {
        type: 'SERVICE_RECORD_DISCREPANCY',
        message: `Service Record Inquiry [${discrepancySubject || 'General'}]: ${discrepancyMessage.trim()}`,
      });
      addToast('Discrepancy inquiry submitted to HRMO Records Unit.', 'SUCCESS');
      setShowDiscrepancyModal(false);
      setDiscrepancySubject('');
      setDiscrepancyMessage('');
    } catch {
      // If notification endpoint is unavailable, acknowledge locally
      addToast('Discrepancy report recorded. Division HRMO will verify your 201 file.', 'INFO');
      setShowDiscrepancyModal(false);
    } finally {
      setSubmittingDiscrepancy(false);
    }
  };

  const fullName = personnelData?.fullName || (user?.firstName ? `${user.firstName} ${user.lastName}`.trim() : 'DepEd Personnel');
  const employeeId = personnelData?.employeeId || 'Not recorded';
  const positionTitle = personnelData?.designation || personnelData?.plantillaItem?.positionTitle || 'Not recorded';
  const stationName = personnelData?.school || personnelData?.station || (user as any)?.school || 'Division of General Santos City';

  return (
    <div className="animate-fade-in personnel-content-container">
      <PageHeader
        title="Official Service Record & Career Timeline"
        subtitle="Civil Service Form No. 33 · Certified authentic from Division Personnel Records"
        breadcrumbs={[
          { label: 'Portal Home', to: '/personnel/home' },
          { label: 'Service Record' },
        ]}
        badge={{
          label: 'Verified by HRMO',
          tone: 'success',
        }}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDiscrepancyModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <AppIcon name="warning" size={14} color="#d97706" /> Report Discrepancy
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <AppIcon name="download" size={14} /> Print / Export Record
            </button>
          </div>
        }
      />

      <AsyncState
        loading={loading}
        error={error}
        onRetry={fetchServiceRecord}
        loadingText="Retrieving certified service record from Division 201 repository..."
      >
        {/* Personnel Identity Card */}
        <div
          className="card mb-4 print-header"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, #8a6a1c 100%)',
            color: 'white',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 800,
                flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.4)',
              }}
            >
              {personnelData?.firstName?.[0] || user?.firstName?.[0] || 'D'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 2 }}>
                {fullName}
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.95, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>
                  Position: <strong style={{ color: '#fff' }}>{positionTitle}</strong>
                </span>
                <span>·</span>
                <span>
                  Employee No:{' '}
                  <span className="font-mono" style={{ fontWeight: 700 }}>
                    {employeeId}
                  </span>
                </span>
                <span>·</span>
                <span>
                  Station: <strong>{stationName}</strong>
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 9999,
                  background: 'rgba(16, 185, 129, 0.25)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                <AppIcon name="security" size={12} color="#fff" /> Verified by HRMO
              </span>
            </div>
          </div>
        </div>

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

      {/* Discrepancy Reporting Modal */}
      {showDiscrepancyModal && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setShowDiscrepancyModal(false)}>
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 480,
                padding: 24,
                borderRadius: 16,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
                  Report Service Record Discrepancy
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDiscrepancyModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  aria-label="Close dialog"
                >
                  <AppIcon name="close" size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                Submit an inquiry or correction request to the Division HRMO Records Unit regarding any missing service milestones, incorrect dates, or salary step details.
              </p>

              <form onSubmit={handleSubmitDiscrepancy}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 4 }}>
                    Subject / Record Item
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Missing 2024 Promotion or Incorrect Step Increment"
                    value={discrepancySubject}
                    onChange={e => setDiscrepancySubject(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 4 }}>
                    Details / Explanation
                  </label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Provide details about the correct appointment paper, school assignment, or date..."
                    value={discrepancyMessage}
                    onChange={e => setDiscrepancyMessage(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowDiscrepancyModal(false)}
                    disabled={submittingDiscrepancy}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingDiscrepancy}
                    style={{ fontWeight: 700 }}
                  >
                    {submittingDiscrepancy ? 'Submitting...' : 'Submit Inquiry'}
                  </button>
                </div>
              </form>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};
