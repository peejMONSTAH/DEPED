import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import apiClient from '../src/api/client';
import '../src/index.css';
import { AnnexCVerificationModal, AnnexCItemState } from '../src/pages/admin/AnnexCVerificationModal';
import { AppIcon } from '../src/components/common/AppIcon';

// Mock apiClient to provide mock PDF for preview testing
const mockPdfBlob = new Blob([
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 55 >> stream
BT /F1 18 Tf 72 712 Td (DepEd Annex C - Personal Data Sheet) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000216 00000 n 
trailer << /Root 1 0 R /Size 5 >>
startxref
322
%%EOF`
], { type: 'application/pdf' });

apiClient.get = (async (url: string) => {
  if (url.includes('/file')) {
    return { data: mockPdfBlob };
  }
  if (url.includes('/view-token')) {
    return { data: { data: { fileUrl: URL.createObjectURL(mockPdfBlob) } } };
  }
  return { data: {} };
}) as typeof apiClient.get;

const MOCK_APPLICANT = {
  id: 42,
  name: 'Maria Santos Dela Cruz',
  employeeId: 'EMP-2024-0891',
  designation: 'Master Teacher I',
  station: 'Koronadal National Comprehensive High School',
  scoreDetailsJson: {
    applicantNumber: 'APP-2026-0042',
    annexCChecklist: {
      applicationCode: 'APP-2026-0042',
    },
  },
};

const MOCK_CYCLE = {
  id: 10,
  name: 'Master Teacher I (Secondary) - S.Y. 2026-2027',
  rulesConfigurationJson: {
    officeUnit: 'Division of Koronadal City',
  },
};

const INITIAL_ITEMS: AnnexCItemState[] = [
  { code: 'a', title: 'Letter of Intent', description: 'Addressed to Head of Office with information on vacancy', isMandatory: true, submitted: true, documentName: 'Letter_of_Intent_DelaCruz.pdf', personnelDocumentId: 101, status: 'VERIFIED' },
  { code: 'b', title: 'Duly Accomplished PDS & WES', description: 'Personal Data Sheet (CS Form 212 Revised 2017) and Work Experience Sheet', isMandatory: true, submitted: true, documentName: 'CS_Form_212_PDS_WES_2026.pdf', personnelDocumentId: 102, status: 'VERIFIED' },
  { code: 'c', title: 'PRC License / Identification Card', description: 'Photocopy of Valid and Updated PRC License/ID, if applicable', isMandatory: false, submitted: true, documentName: 'PRC_License_ValidUntil2028.pdf', personnelDocumentId: 103, status: 'VERIFIED' },
  { code: 'd', title: 'Certificate of Eligibility / Rating', description: 'Photocopy of Certificate of Eligibility / Rating, if applicable', isMandatory: false, submitted: false, status: 'NOT_APPLICABLE' },
  { code: 'e', title: 'Scholastic / Academic Records', description: 'Transcript of Records (TOR) & Diploma (including Masteral/Doctorate completion)', isMandatory: true, submitted: true, documentName: 'MA_Education_TOR_Diploma.pdf', personnelDocumentId: 105, status: 'VERIFIED' },
  { code: 'f', title: 'Certificates of Training', description: 'Certificates of Training within 5 years or since last promotion', isMandatory: false, submitted: true, documentName: 'INSET_Leadership_Training_Certificates.pdf', personnelDocumentId: 106, status: 'INCOMPLETE', remarks: 'Certificate for 2024 Division INSET lacks principal certification seal' },
  { code: 'g', title: 'Certificate of Employment / Service Record', description: 'Certificate of Employment, Contract of Service, or duly signed Service Record', isMandatory: true, submitted: true, documentName: 'Certified_Service_Record_DepEd.pdf', personnelDocumentId: 107, status: 'VERIFIED' },
  { code: 'h', title: 'Latest Appointment', description: 'Photocopy of Latest Appointment, if applicable', isMandatory: false, submitted: true, documentName: 'Appointment_Teacher_III_Permanent.pdf', personnelDocumentId: 108, status: 'VERIFIED' },
  { code: 'i', title: 'Performance Ratings (IPCR / OPCR)', description: 'Performance Rating in the last rating period covering 1 year in current/previous position', isMandatory: true, submitted: true, documentName: 'IPCRF_Rating_2024_2025_Outstanding.pdf', personnelDocumentId: 109, status: 'VERIFIED' },
  { code: 'j', title: 'Checklist & Omnibus Sworn Statement / Consent', description: 'Checklist of Requirements, Omnibus Sworn Statement on Authenticity & Data Privacy Consent', isMandatory: true, submitted: true, documentName: 'Signed_Omnibus_Sworn_Statement.pdf', personnelDocumentId: 110, status: 'VERIFIED' },
  { code: 'k', title: 'Other MOVs / Relevant Documents', description: 'Other Means of Verification relevant to the position applied for', isMandatory: false, submitted: false, status: 'NOT_APPLICABLE' },
];

// Old narrow modal fixture component for comparison screenshot
const OldModalFixture: React.FC = () => {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [completeness, setCompleteness] = useState<'COMPLETE' | 'INCOMPLETE'>('INCOMPLETE');
  const [remarks, setRemarks] = useState('Item f certification seal missing.');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ maxWidth: '840px', width: 'calc(100vw - 32px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#EFF6FF', color: '#1e293b', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                Stage 1 • Administrative Officer II (AO II)
              </span>
              <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                DepEd Order No. 007, s. 2023 Guidelines
              </span>
            </div>
            <h3 style={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, margin: 0, fontSize: '1.15rem' }}>
              <AppIcon name="checklist" size={18} color="#2563eb" />
              Requirements Completeness Verification (Annex C)
            </h3>
          </div>
          <button style={{ background: '#ffffff', border: '1px solid #e2e8f0', width: '32px', height: '32px', borderRadius: '8px', color: '#0f172a', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Old Applicant Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.8125rem' }}>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Name of Applicant</span>
              <strong style={{ color: '#0f172a', fontSize: '0.9375rem' }}>{MOCK_APPLICANT.name}</strong>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>ID: {MOCK_APPLICANT.employeeId}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Position Applied For</span>
              <strong style={{ color: '#2563eb' }}>{MOCK_CYCLE.name}</strong>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Track: Teaching</span>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Office / School Unit</span>
              <span style={{ color: '#0f172a', fontWeight: 600 }}>{MOCK_APPLICANT.station}</span>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Region XII</span>
            </div>
            <div>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Application Code</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)', display: 'inline-block' }}>
                APP-2026-0042
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Annex C Documentary Requirements Checklist (11 items)
            </span>
            <button style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px' }}>
              ✓ Mark Submitted as Verified
            </button>
          </div>

          {/* Eleven large bordered cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map((item, idx) => {
              const isVerified = item.status === 'VERIFIED';
              const isIncomplete = item.status === 'INCOMPLETE';
              const isNA = item.status === 'NOT_APPLICABLE';
              return (
                <div key={item.code} style={{ background: '#ffffff', border: isIncomplete ? '1.5px solid #F87171' : isVerified ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#f8fafc', color: '#2563eb', fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>{item.code}</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{item.title}</span>
                        {item.isMandatory ? <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>Mandatory</span> : <span style={{ fontSize: '0.625rem', color: '#64748b', background: '#f8fafc', padding: '1px 6px', borderRadius: '4px' }}>If Applicable</span>}
                      </div>
                      <p style={{ fontSize: '0.6875rem', color: '#64748b', margin: '0 0 6px 0' }}>{item.description}</p>
                      {item.submitted ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.6875rem', background: '#ECFDF5', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#059669', padding: '3px 8px', borderRadius: '6px' }}>
                          <span>Attached: {item.documentName}</span>
                          <span style={{ marginLeft: '4px', color: '#2563eb', textDecoration: 'underline', fontWeight: 700 }}>View</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', fontStyle: 'italic' }}>No document attached</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: isVerified ? '1.5px solid #10B981' : '1px solid #e2e8f0', background: isVerified ? '#D1FAE5' : '#f8fafc', color: isVerified ? '#059669' : '#64748b' }}>✓ Verified</button>
                      <button style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: isIncomplete ? '1.5px solid #EF4444' : '1px solid #e2e8f0', background: isIncomplete ? '#FEE2E2' : '#f8fafc', color: isIncomplete ? '#DC2626' : '#64748b' }}>✗ Deficient</button>
                      <button style={{ fontSize: '0.6875rem', padding: '4px 8px', borderRadius: '6px', border: isNA ? '1.5px solid #2563eb' : '1px solid #e2e8f0', background: isNA ? '#EFF6FF' : '#f8fafc', color: isNA ? '#2563eb' : '#64748b' }}>N/A</button>
                    </div>
                  </div>
                  {isIncomplete && (
                    <input type="text" style={{ fontSize: '0.75rem', padding: '4px 10px', border: '1px solid #FCA5A5', borderRadius: '6px' }} value={item.remarks} readOnly />
                  )}
                </div>
              );
            })}
          </div>

          {/* Finding */}
          <div style={{ background: '#FEF2F2', border: '1.5px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              AO II Overall Requirements Verification Finding
            </span>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', fontSize: '0.8125rem' }}>
              <label><input type="radio" checked={completeness === 'COMPLETE'} readOnly /> Complete</label>
              <label><input type="radio" checked={completeness === 'INCOMPLETE'} readOnly /> <span style={{ color: '#DC2626', fontWeight: 700 }}>Incomplete / Deficient</span></label>
            </div>
            <textarea style={{ width: '100%', fontSize: '0.75rem', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }} value={remarks} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Harness
const AnnexCQAHarness: React.FC = () => {
  const [items, setItems] = useState<AnnexCItemState[]>(INITIAL_ITEMS);
  const [completenessStatus, setCompletenessStatus] = useState<'COMPLETE' | 'INCOMPLETE'>('INCOMPLETE');
  const [remarks, setRemarks] = useState('Item f (Certificates of Training) lacks required certification seal from division office.');
  const [isOpen, setIsOpen] = useState(true);

  const searchParams = new URLSearchParams(window.location.search);
  const viewMode = searchParams.get('view') || 'new';
  const docParam = searchParams.get('doc') || 'b';

  if (viewMode === 'old') {
    return <OldModalFixture />;
  }

  return (
    <AnnexCVerificationModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      applicant={MOCK_APPLICANT}
      cycle={MOCK_CYCLE}
      modalTrack="TEACHING"
      theme="light"
      items={items}
      setItems={setItems}
      completenessStatus={completenessStatus}
      setCompletenessStatus={setCompletenessStatus}
      remarks={remarks}
      setRemarks={setRemarks}
      onSubmit={(e) => { e.preventDefault(); alert('Saved!'); }}
      isPending={false}
      initialActiveDocCode={docParam}
    />
  );
};

createRoot(document.getElementById('root')!).render(<AnnexCQAHarness />);
