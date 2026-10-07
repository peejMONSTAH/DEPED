import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PortalBand } from './components/PortalBand';
import { DocumentViewerModal } from '../../components/common/DocumentViewerModal';
import { useAuthContext } from '../../contexts/AuthContext';
import apiClient from '../../api/client';
import { useRealtimeTransactions } from '../../hooks/useRealtimeTransactions';
import { PersonnelDocumentRecord } from '../../models/documentStatus';
import { loadAnnexCRequirements } from '../../promotions/annexCRequirements';
import { ApplicationChecklist } from './components/ApplicationChecklist';
import { PromotionCycleItem } from './components/promotionCycle';
import { sortVacancies, vacancyView, VacancyState } from './vacancyView';
import { humanizeEnum } from '../../constants/transactionStatus';
import { AppDialog, DialogFacts } from '../../components/common/AppDialog';
import './vacancies.css';

/** AO II notes on returned requirements of this person's application to one vacancy, by item code. */
const returnedItemsFor = (apps: any[], cycleId: number): Record<string, string | null> => Object.fromEntries(
  ((apps.find(a => a.cycle?.id === cycleId)?.items) || [])
    .filter((i: any) => (i.verificationStatus || '').toUpperCase() === 'INCOMPLETE')
    .map((i: any) => [String(i.code).toLowerCase(), i.verificationRemarks || null]));

type Filter = 'all' | 'apply' | 'applied' | 'no';
const FILTERS: Array<{ id: Filter; label: string; states: VacancyState[] | null }> = [
  { id: 'all', label: 'All', states: null },
  { id: 'apply', label: 'You can apply', states: ['can-apply', 'not-checked'] },
  { id: 'applied', label: 'Applied', states: ['applied'] },
  { id: 'no', label: 'Not eligible or closed', states: ['not-eligible', 'closed', 'not-open-yet'] },
];

/** Open promotion vacancies: eligibility and its reason, the deadline, and whether you applied. */
export const Vacancies: React.FC = () => {
  const { user } = useAuthContext();
  const [cycles, setCycles] = useState<PromotionCycleItem[]>([]);
  const [personnel, setPersonnel] = useState<any>(null);
  const [documents, setDocuments] = useState<PersonnelDocumentRecord[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [openCycle, setOpenCycle] = useState<PromotionCycleItem | null>(null);
  const [detailCycle, setDetailCycle] = useState<PromotionCycleItem | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [linkGone, setLinkGone] = useState(false);
  const [whyOpen, setWhyOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await loadAnnexCRequirements(apiClient);
      const [c, p, d, a] = await Promise.all([apiClient.get('/promotions/cycles'), apiClient.get('/personnel/me'), apiClient.get('/personnel/documents'), apiClient.get('/promotions/my-applications')]);
      setCycles(c.data?.data || []);
      setPersonnel(p.data?.data || null);
      setDocuments(d.data?.data || []);
      setApplications(a.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Vacancies could not be loaded. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useRealtimeTransactions(load);
  useEffect(() => { void load(); }, [load]);

  // Notification links show details; application links keep their existing checklist destination.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = Number(params.get('cycle'));
    if (!id || loading || error) return;
    const c = cycles.find(x => x.id === id);
    if (c) {
      if (params.get('view') === 'details') setDetailCycle(c);
      else setOpenCycle(c);
    }
    // Say so instead of silently dropping a link to a vacancy this person can no longer see.
    setLinkGone(!c);
    const next = new URLSearchParams(params); next.delete('cycle'); next.delete('view'); setParams(next, { replace: true });
  }, [params, cycles, loading, error, setParams]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const states = FILTERS.find(f => f.id === filter)!.states;
    return sortVacancies(cycles).filter(({ cycle, view }) =>
      (!states || states.includes(view.state)) && (!q || `${view.position} ${cycle.name}`.toLowerCase().includes(q)));
  }, [cycles, filter, search]);
  const count = (f: Filter) => { const s = FILTERS.find(x => x.id === f)!.states; return s ? sortVacancies(cycles).filter(r => s.includes(r.view.state)).length : cycles.length; };

  return (
    <div className="animate-fade-in personnel-content-container">
      <PortalBand
        title="Open items"
        facts={loading || error ? undefined : [{ label: 'You can apply', value: count('apply') }, { label: 'Applied', value: count('applied') }, { label: 'All vacancies', value: cycles.length }]}
      />
      {linkGone && <div className="vac__box" role="status"><p>That vacancy is no longer open to you. It may have closed, been cancelled, or be outside your station.</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLinkGone(false)}>Dismiss</button></div>}
      {loading ? <p className="vac__muted" aria-busy="true">Loading vacancies…</p>
        : error ? <div className="vac__box" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>
        : <>
          <div className="vac__tools">
            <div className="vac__filters" role="group" aria-label="Show vacancies">
              {FILTERS.map(f => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f.id)}>
                  {f.label} ({count(f.id)})
                </button>
              ))}
            </div>
            <label className="vac__search">
              <span className="sr-only">Search vacancies</span>
              <input type="search" className="form-control" placeholder="Search by position" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
          </div>

          {rows.length === 0
            ? <div className="vac__box"><p>{cycles.length === 0 ? 'There are no promotion vacancies for your station right now. New ones appear here and in your notifications.' : 'No vacancies match this filter.'}</p></div>
            : <ul className="vac__list">
              {rows.map(({ cycle, view }) => (
                <li key={cycle.id} className={`vac__item s-${view.state}`}>
                  <div className="vac__main">
                    <span className="vac__pill">{view.status}</span>
                    <h2>{view.position}</h2>
                    <span className="vac__cycle">{cycle.name}</span>
                    {view.reason && (
                      <>
                        <button type="button" className="vac__why" aria-expanded={whyOpen === cycle.id} onClick={() => setWhyOpen(o => (o === cycle.id ? null : cycle.id))}>
                          {whyOpen === cycle.id ? 'Hide reason' : view.state === 'not-eligible' ? 'Why not eligible?' : 'See why'}
                        </button>
                        {whyOpen === cycle.id && <span className="vac__reason" role="note">{view.reason}</span>}
                      </>
                    )}
                    {view.note && <span className="vac__note">{view.note}</span>}
                  </div>
                  <div className="vac__side">
                    <span className="vac__deadline">{view.deadline}</span>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setDetailCycle(cycle)}>View open item</button>
                    {view.action && (
                    <button type="button" className={`btn btn-sm ${view.action.kind === 'view' ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setOpenCycle(cycle)}>
                      {view.action.label}
                    </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>}
        </>}

      {detailCycle && (() => {
        const view = vacancyView(detailCycle);
        const fmt = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
        const tone = view.state === 'can-apply' || view.state === 'applied' ? 'ok' : view.state === 'not-eligible' ? 'bad' : view.state === 'not-checked' ? 'warn' : 'muted';
        return <AppDialog
          kicker="Open item"
          badge={view.status}
          badgeTone={tone}
          title={view.position}
          onClose={() => setDetailCycle(null)}
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setDetailCycle(null)}>Close</button>
            {view.action && <button type="button" className="btn btn-primary" onClick={() => { setOpenCycle(detailCycle); setDetailCycle(null); }}>{view.action.label}</button>}
          </>}
        >
          <DialogFacts items={[
            ['Type', humanizeEnum(detailCycle.type)],
            ['Apply between', `${fmt(detailCycle.startDate)} – ${fmt(detailCycle.endDate)}`],
          ]} />
          <p className="app-dialog__muted">{detailCycle.name}</p>
          {view.reason && <p className={`app-dialog__note${view.state === 'not-eligible' || view.state === 'not-checked' ? ' is-warn' : ''}`}>{view.reason}</p>}
          {view.note && <p className="app-dialog__note">{view.note}</p>}
          {view.action?.kind === 'apply' && <p className="app-dialog__muted">Apply opens the checklist of required documents.</p>}
        </AppDialog>;
      })()}
      {openCycle && (
        <ApplicationChecklist
          cycle={openCycle}
          user={user}
          personnel={personnel}
          user201Documents={documents}
          onClose={() => setOpenCycle(null)}
          onApplicationSubmitted={load}
          onPreviewDocument={(url, name) => setPreview({ url, name })}
          returnedItems={returnedItemsFor(applications, openCycle.id)}
          checker={applications.find(a => a.cycle?.id === openCycle.id)?.checker}
        />
      )}
      {preview && <DocumentViewerModal isOpen fileUrl={preview.url} title={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default Vacancies;
