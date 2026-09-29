import React, { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { AsyncState } from '../../components/common/AsyncState';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { DocumentScannerModal } from '../../components/common/DocumentScannerModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ModalOverlay } from '../../components/common/ModalOverlay';
import { AppIcon } from '../../components/common/AppIcon';

// Modular Components
import { PersonnelOverview } from './components/PersonnelOverview';
import { WhatToDo } from './components/WhatToDo';
import { homeTasks } from './components/homeTasks';
import { applicationStage } from '../../constants/workflowStages';
import { useSearchParams } from 'react-router-dom';
import { FileReadiness } from './components/FileReadiness';
import { CurrentTransaction } from './components/CurrentTransaction';
import { CareerOpportunities, PromotionCycleItem } from './components/CareerOpportunities';
import { VacancyList } from './components/VacancyList';
import { VacancyEligibilityDialog } from './components/VacancyEligibilityDialog';
import { ApplicationChecklist, ChecklistFormItem } from './components/ApplicationChecklist';

// Shared Models
import { TransactionRecord } from '../../models/transactionState';
import {
  PersonnelDocumentRecord,
  computeReadiness,
} from '../../models/documentStatus';
import { ANNEX_C_FALLBACK, loadAnnexCRequirements } from '../../promotions/annexCRequirements';

export type { ChecklistFormItem };
export const DEFAULT_ANNEX_C_FORM_ITEMS: ChecklistFormItem[] = ANNEX_C_FALLBACK.map(item => ({
  ...item,
  submitted: false,
}));

export const PersonnelHome: React.FC = () => {
  const { user } = useAuthContext();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myApplications, setMyApplications] = useState<any[]>([]);

  const [personnel, setPersonnel] = useState<any>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [openCycles, setOpenCycles] = useState<PromotionCycleItem[]>([]);
  const [documents, setDocuments] = useState<PersonnelDocumentRecord[]>([]);
  const [availablePlantillaItems, setAvailablePlantillaItems] = useState<any[]>([]);

  // Modals & workflows
  const [scannerOpen, setScannerOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);
  const [selectedCycleForChecklist, setSelectedCycleForChecklist] = useState<PromotionCycleItem | null>(null);
  const [ineligibleModalCycle, setIneligibleModalCycle] = useState<PromotionCycleItem | null>(null);
  const [showPlantillaDirectory, setShowPlantillaDirectory] = useState(false);
  const [plantillaSearch, setPlantillaSearch] = useState('');
  const checklistApplicationCode = selectedCycleForChecklist?.myApplication?.applicantNumber || '';

  // Primary data fetcher
  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await loadAnnexCRequirements(apiClient);
      // Every list the task panel relies on must load; an empty fallback would
      // read as 'nothing to do' when the truth is 'could not check'.
      const [pRes, txRes, promoRes, docRes, appRes] = await Promise.all([
        apiClient.get('/personnel/me'),
        apiClient.get('/transactions/my-transactions'),
        apiClient.get('/promotions/cycles'),
        apiClient.get('/personnel/documents'),
        apiClient.get('/promotions/my-applications'),
      ]);
      setMyApplications(appRes.data?.data || []);

      setPersonnel(pRes.data?.data || null);
      setTransactions(txRes.data?.data || []);
      setOpenCycles(promoRes.data?.data || []);
      setDocuments(docRes.data?.data || []);

      // Load available plantilla items
      try {
        const plantillaRes = await apiClient.get('/plantilla/available');
        setAvailablePlantillaItems(plantillaRes.data?.data || []);
      } catch {
        // Optional
      }
    } catch (err: any) {
      console.error('Failed to load personnel dashboard:', err);
      setLoadError(err?.response?.data?.message || 'Your records could not be loaded, so your to-do list cannot be shown. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeTransactions(loadPortalData);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = Number(searchParams.get('cycle'));
    if (!id || !openCycles.length) return;
    const c = openCycles.find(x => x.id === id);
    if (c) setSelectedCycleForChecklist(c);
    const next = new URLSearchParams(searchParams); next.delete('cycle'); setSearchParams(next, { replace: true });
  }, [searchParams, openCycles, setSearchParams]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  // Compute readiness using single source of truth
  const readiness = computeReadiness(documents);

  const handleScanFinished = async (file: File) => {
    setScannerOpen(false);
    // If scanner was triggered from home, upload as a general document
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('documentTypeId', 'OTHER');
      form.append('customDocumentName', `Scanned Document ${new Date().toLocaleDateString()}`);
      await apiClient.post('/personnel/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast('Scanned document saved to your 201 records.', 'SUCCESS');
      await loadPortalData();
    } catch {
      addToast('Failed to save scanned document.', 'ERROR');
    }
  };

  const scrollToVacancies = () => {
    const el = document.getElementById('vacancies');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const filteredPlantilla = availablePlantillaItems.filter(item => {
    if (!plantillaSearch.trim()) return true;
    const q = plantillaSearch.toLowerCase();
    return (
      (item.positionTitle && item.positionTitle.toLowerCase().includes(q)) ||
      (item.itemNumber && item.itemNumber.toLowerCase().includes(q)) ||
      (item.office && item.office.toLowerCase().includes(q))
    );
  });

  return (
    <div className="animate-fade-in personnel-content-container">
      <AsyncState
        loading={loading}
        error={loadError}
        onRetry={loadPortalData}
        loadingText="Loading Personnel Portal dashboard..."
      >
        {/* 1. Identity Overview Card */}
        <PersonnelOverview
          user={user}
          personnel={personnel}
          onOpenScanner={() => setScannerOpen(true)}
        />

        {/* 2. What needs this person, then what is waiting for a reviewer */}
        {(() => {
          const { tasks, waiting } = homeTasks({
            transactions: transactions as any, applications: myApplications,
            missingRequiredFiles: readiness.missing, profileComplete: typeof personnel?.profileComplete === 'boolean' ? personnel.profileComplete : null,
            cycles: openCycles as any,
          });
          return <WhatToDo tasks={tasks} waiting={waiting} onOpenCycle={(id: number) => { const c = openCycles.find(x => x.id === id); if (c) setSelectedCycleForChecklist(c); }} />;
        })()}

        {/* 3. Task-Oriented Overview Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24, alignItems: 'start' }}>
          {/* Column 1: Active Transactions & Career Opportunities */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <CurrentTransaction
              transactions={transactions}
              pendingApplications={myApplications.filter(a => !a.transactionId).map(a => applicationStage(a)).filter(st => !st.done && !st.needsYou).map(st => ({ label: st.label, who: st.who }))}
            />

            <CareerOpportunities
              openCycles={openCycles}
              onScrollToVacancies={scrollToVacancies}
            />
          </div>

          {/* Column 2: 201 File Readiness (Single Source of Truth) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FileReadiness
              readiness={readiness}
            />
          </div>
        </div>

        {/* 4. Open Promotion Vacancies Directory */}
        <VacancyList
          openCycles={openCycles}
          availablePlantillaItems={availablePlantillaItems}
          onApplyCycle={cycle => setSelectedCycleForChecklist(cycle)}
          onViewIneligible={cycle => setIneligibleModalCycle(cycle)}
          onOpenPlantillaDirectory={() => setShowPlantillaDirectory(true)}
        />
      </AsyncState>

      {/* Annex C Application Checklist Modal */}
      {selectedCycleForChecklist && (
        <>
          <input type="hidden" aria-label="Application Code" value={checklistApplicationCode || 'Assigned when you submit'} readOnly />
          <ApplicationChecklist
            cycle={selectedCycleForChecklist}
            user={user}
            personnel={personnel}
            user201Documents={documents}
            onClose={() => setSelectedCycleForChecklist(null)}
            onApplicationSubmitted={loadPortalData}
            onPreviewDocument={(url, name) => setPreviewDoc({ url, name })}
          />
        </>
      )}

      {/* Ineligibility Reason Modal */}
      {ineligibleModalCycle && (
        <VacancyEligibilityDialog
          cycle={ineligibleModalCycle}
          onClose={() => setIneligibleModalCycle(null)}
        />
      )}

      {/* Mobile Scanner Modal */}
      {scannerOpen && (
        <DocumentScannerModal
          isOpen={scannerOpen}
          documentTypeName="Personnel 201 Record"
          onClose={() => setScannerOpen(false)}
          onScanComplete={handleScanFinished}
        />
      )}

      {/* Document Viewer Modal */}
      {previewDoc && (
        <DocumentViewerModal
          isOpen={Boolean(previewDoc)}
          fileUrl={previewDoc.url}
          title={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Available Plantilla Directory Modal */}
      {showPlantillaDirectory && (
        <ModalPortal>
          <ModalOverlay onDismiss={() => setShowPlantillaDirectory(false)}>
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 760,
                maxHeight: '85vh',
                padding: 24,
                borderRadius: 16,
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>
                    Plantilla Item Availability Directory
                  </h3>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    Division authorized vacant plantilla items open for ranking and recruitment
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlantillaDirectory(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  aria-label="Close dialog"
                >
                  <AppIcon name="close" size={18} />
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <input
                  type="search"
                  className="form-control"
                  placeholder="Search plantilla by position title or item number…"
                  value={plantillaSearch}
                  onChange={e => setPlantillaSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.875rem', borderRadius: 8 }}
                />
              </div>

              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredPlantilla.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--color-text-muted)' }}>
                    No plantilla items match your search.
                  </div>
                ) : (
                  filteredPlantilla.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                          {item.positionTitle}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span>Item No: <strong className="font-mono">{item.itemNumber}</strong></span>
                          <span>·</span>
                          <span>Salary Grade: <strong>SG {item.salaryGrade}</strong></span>
                          {item.office && <span>· Station: {item.office}</span>}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        Vacant (Open)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
};
