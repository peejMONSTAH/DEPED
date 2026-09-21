import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import apiClient from '../../api/client';
import { exportFilledPdf, type FormEntry } from '../../components/forms/pdfExport';
import { templateForRequirement } from '../../components/forms/templateMatch';
import { fieldEntryId, fieldsForTemplate } from '../../components/forms/formFields';
import { mapEntries } from '../../components/forms/fieldLayout';
import { FieldOverlay } from '../../components/forms/FieldOverlay';
import { structuredDataFromEntries } from '../../components/forms/formDataExtraction';
import { useConfirm } from '../../contexts/ConfirmContext';
import './fill-document.css';

GlobalWorkerOptions.workerSrc = workerUrl;
type Template = { id: string; title: string; edition: string; pages: number; source: string; notice: string };
type Draft = { pages: number[]; entries: FormEntry[]; version: string; updatedAt?: string };

export default function FillDocument() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const txId = params.get('txId') || '';
  const name = params.get('name') || '';
  const templateId = templateForRequirement(name);
  const detectedFields = useMemo(() => fieldsForTemplate(templateId), [templateId]);
  const [template, setTemplate] = useState<Template>();
  const [draft, setDraft] = useState<Draft>({ pages: [], entries: [], version: '0' });
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [source, setSource] = useState<ArrayBuffer>();
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<string>();
  const canvas = useRef<HTMLCanvasElement>(null);

  /** Leaves the editor, asking first when the draft has unsaved edits. */
  const leaveTo = async (destination: string) => {
    if (dirty) {
      const outcome = await confirm({
        title: 'Leave without saving?',
        message: 'This form has changes you have not saved. Leaving now discards them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
      });
      if (!outcome.confirmed) return;
    }
    navigate(destination);
  };

  const mappedIds = new Set(draft.pages.flatMap((sourcePage, page) => detectedFields.filter(field => field.page === sourcePage).map(field => fieldEntryId(field, page, draft.pages))));
  const previousAnswers = draft.entries.filter(entry => !mappedIds.has(entry.id));
  const pageFields = detectedFields.filter(field => field.page === draft.pages[pageIndex]);
  const draftUrl = `/forms/transactions/${txId}/${templateId}`;

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | undefined;
    async function load() {
      try {
        if (!templateId || !/^\d+$/.test(txId) || Number(txId) < 1) throw new Error('Open a supported document from your transaction checklist.');
        const [catalog, transaction, saved, file] = await Promise.all([
          apiClient.get('/forms/templates'), apiClient.get(`/transactions/${txId}`),
          apiClient.get(draftUrl), apiClient.get(`/forms/templates/${templateId}/file`, { responseType: 'arraybuffer' }),
        ]);
        const chosen = (catalog.data.data as Template[]).find(t => t.id === templateId);
        if (!chosen) throw new Error('This template is unavailable. Please upload your completed document.');
        const bytes = file.data as ArrayBuffer;
        loadedPdf = await getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
        if (cancelled) { await loadedPdf.destroy(); return; }
        const tx = transaction.data.data;
        const validated = (tx.uploadedDocuments || []).some((d: any) => d.status === 'VALIDATED' && templateForRequirement(d.requirementTemplate?.name || '') === templateId);
        setLocked(!['DRAFT', 'DEFICIENCY'].includes(tx.status) || validated);
        setTemplate(chosen); setSource(bytes); setPdf(loadedPdf);
        const stored: Draft = saved.data.data || { pages: Array.from({ length: chosen.pages }, (_, i) => i), entries: [], version: '0' };
        setDraft({ ...stored, entries: mapEntries(stored.pages, stored.entries, fieldsForTemplate(templateId)) });
      } catch (e: any) { if (!cancelled) setError(e.response?.data?.message || e.message || 'Could not load the form.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; void loadedPdf?.destroy(); };
  }, [txId, templateId]);

  useEffect(() => {
    if (!pdf || !canvas.current || draft.pages[pageIndex] === undefined) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    (async () => {
      const page = await pdf.getPage(draft.pages[pageIndex] + 1);
      if (cancelled || !canvas.current) return;
      const natural = page.getViewport({ scale: 1 });
      setPageSize({ width: natural.width, height: natural.height });
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      const element = canvas.current;
      element.width = viewport.width; element.height = viewport.height;
      task = page.render({ canvasContext: element.getContext('2d')!, viewport });
      await task.promise;
    })().catch(e => { if (!cancelled && e.name !== 'RenderingCancelledException') setError('Could not display this page. Reload the editor.'); });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageIndex, draft.pages, zoom]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function change(next: Draft) { setDraft(next); setDirty(true); setMessage('Unsaved changes'); setConfirmed(false); setPreview(undefined); }
  function selectField(id: string) {
    setSelected(id);
    document.getElementById(`input-${id}`)?.focus();
    document.getElementById(`input-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  async function save() {
    const response = await apiClient.put(draftUrl, { version: draft.version, pages: draft.pages, entries: draft.entries });
    setDraft(response.data.data); setDirty(false);
    setMessage('Draft saved to your account. Not submitted.');
  }
  async function perform(action: 'save' | 'preview' | 'download' | 'attach') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (action === 'save') { await save(); return; }
      if (!source || !template) throw new Error('The template has not loaded.');
      if (!draft.entries.some(e => e.text.trim())) throw new Error('Add your information before generating a PDF.');
      const blob = await exportFilledPdf(source, draft.pages, draft.entries, detectedFields);
      if (action === 'preview') { setPreview(URL.createObjectURL(blob)); setMessage('Preview created. Review every page before attaching.'); return; }
      if (action === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${template.id}-completed.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMessage('PDF downloaded. Complete any required signatures or officer sections.'); return;
      }
      if (locked || !confirmed || !preview) throw new Error('Preview the PDF and confirm the submission checklist first.');
      await save();
      const body = new FormData();
      body.append('file', blob, `${template.id}-completed.pdf`);
      body.append('requirementName', name);
      if (params.get('reqId')) body.append('requirementId', params.get('reqId')!);
      body.append('structuredDataJson', JSON.stringify(structuredDataFromEntries(template.id, draft.pages, draft.entries)));
      await apiClient.post(`/transactions/${txId}/documents`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage('PDF attached for manual review. Return to the checklist to submit the transaction.');
    } catch (e: any) { setError(e.response?.data?.message || e.message || 'The action failed. Your changes are still in this editor.'); }
    finally { setBusy(false); }
  }

  return <main className="form-workspace">
    <header className="form-heading">
      <div><p className="form-eyebrow">Personnel documents</p><h1>{template?.title || 'Fill out a document'}</h1><p>{template?.edition}</p></div>
      <button className="btn btn-secondary" onClick={() => leaveTo(`/personnel/checklist?txId=${txId}`)}>Back to checklist</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading your template and saved draft…</p> : template && <>
      <aside className="form-notice"><strong>Before you fill this form</strong><p>{template.notice}</p><a href={template.source} target="_blank" rel="noreferrer">Official template source ↗</a></aside>
      {locked && <p className="form-notice">This transaction or document is locked. You can view or download the saved draft, but cannot edit or attach it.</p>}
      <div className="form-toolbar">
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => perform('save')}>Save draft</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => perform('preview')}>Preview PDF</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => perform('download')}>Download PDF</button>
        <span role="status">{busy ? 'Working…' : message || (draft.updatedAt ? `Draft saved ${new Date(draft.updatedAt).toLocaleString()}` : 'No draft saved yet')}</span>
      </div>
      <div className="form-editor-grid">
        <section className="form-controls" aria-label="Detected form fields">
          <h2>Fields on page {pageIndex + 1}</h2>
          <p>The blanks in this official template are already mapped. Choose a named field and enter the answer—no positioning or text-size adjustment is needed.</p>
          {pageFields.length === 0 ? <p className="form-empty-fields">This page has no personnel fields to complete.</p> :
            <div className="form-field-list">{pageFields.map(field => {
              const entry = draft.entries.find(item => item.id === fieldEntryId(field, pageIndex, draft.pages));
              if (!entry) return null;
              return <label key={field.key} className={selected === entry.id ? 'active' : ''}>
                <span>{field.label}</span>
                {field.type === 'checkbox' ? <input id={`input-${entry.id}`} type="checkbox" disabled={locked || busy} checked={entry.text === 'X'} onFocus={() => setSelected(entry.id)} onChange={event => { setSelected(entry.id); change({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, text: event.target.checked ? 'X' : '' } : item) }); }} /> :
                  field.type === 'multiline' ? <textarea id={`input-${entry.id}`} rows={3} maxLength={3000} disabled={locked || busy} value={entry.text} onFocus={() => setSelected(entry.id)} onChange={event => { setSelected(entry.id); change({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, text: event.target.value } : item) }); }} /> :
                    <input id={`input-${entry.id}`} type="text" maxLength={3000} disabled={locked || busy} value={entry.text} onFocus={() => setSelected(entry.id)} onChange={event => { setSelected(entry.id); change({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, text: event.target.value } : item) }); }} />}
              </label>;
            })}</div>}
          {previousAnswers.length > 0 && <fieldset disabled={locked || busy} className="form-legacy-entry">
            <h2>Previous draft answers</h2><p>These older answers covered multiple blanks. Copy each answer into the matching fields, then clear it here before exporting.</p>
            {previousAnswers.map(entry => <div key={entry.id}><label>{entry.id.replace('field:', '')}<textarea readOnly value={entry.text} /></label><button type="button" className="btn btn-secondary" onClick={() => change({ ...draft, entries: draft.entries.filter(item => item.id !== entry.id) })}>Clear transferred answer</button></div>)}
          </fieldset>}
          <p className="form-caption">Drafts are stored with your transaction—not in browser storage. Save before leaving. Typed names do not replace required signatures.</p>
        </section>
        <section className="form-page-section" aria-label="Official template pages">
          <div className="form-toolbar">
            <button className="btn btn-secondary" disabled={pageIndex === 0} onClick={() => { setPageIndex(pageIndex-1); setSelected(undefined); }}>Previous</button>
            <span>Page {pageIndex+1} of {draft.pages.length}</span>
            <button className="btn btn-secondary" disabled={pageIndex === draft.pages.length-1} onClick={() => { setPageIndex(pageIndex+1); setSelected(undefined); }}>Next</button>
            <label>Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,2].map(z => <option key={z} value={z}>{z*100}%</option>)}</select></label>
            {(template.id === 'wes' || (template.id === 'saln-2025' && draft.pages[pageIndex] >= 2)) && <button className="btn btn-secondary" disabled={busy || locked || draft.pages.length >= 24 || draft.entries.length + pageFields.length > 1000} onClick={() => { const pages = [...draft.pages, draft.pages[pageIndex]]; change({...draft, pages, entries: mapEntries(pages, draft.entries, detectedFields)}); setPageIndex(draft.pages.length); setSelected(undefined); }}>Add blank continuation</button>}
          </div>
          <div className="form-page-scroll"><div className="form-paper" style={{width: pageSize.width*zoom, height: pageSize.height*zoom}}>
            <canvas ref={canvas} aria-label={`Template page ${pageIndex+1} with automatically detected fillable fields.`} style={{width:'100%',height:'100%'}}/>
            {pageFields.map(field => {
              const entry = draft.entries.find(item => item.id === fieldEntryId(field, pageIndex, draft.pages));
              return entry && <FieldOverlay key={entry.id} field={field} text={entry.text} pageWidth={pageSize.width} pageHeight={pageSize.height} selected={selected === entry.id} onClick={() => selectField(entry.id)} />;
            })}
          </div></div>
        </section>
      </div>
      {preview && <section className="form-preview"><h2>Generated PDF preview</h2><p>Check every page for missing answers, overlapping text and required signatures. Use Download PDF if your browser cannot display the preview.</p><iframe src={preview} title="Completed PDF preview" /></section>}
      <section className="form-submit"><h2>Attach to this requirement</h2><p>This attaches a PDF to “{name}”. It does not submit the entire transaction or approve the document. AO/HRMO review remains required.</p>
        <label className="form-confirm"><input type="checkbox" disabled={locked || busy || !preview} checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I reviewed the PDF, confirmed the accepted template edition, and completed all required signatures and officer certifications. If these are still missing, I will download the draft and upload the completed copy instead.</label>
        <button className="btn btn-primary" disabled={locked || busy || !confirmed || !preview} onClick={() => perform('attach')}>Attach PDF for review</button>
        <button className="btn btn-secondary" onClick={() => leaveTo(`/personnel/upload-document?${params.toString()}`)}>Upload a signed / completed file instead</button>
      </section>
    </>}
  </main>;
}
