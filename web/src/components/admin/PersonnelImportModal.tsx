import React, { useRef, useState } from 'react';
import apiClient from '../../api/client';
import { ModalOverlay } from '../common/ModalOverlay';
import './personnel-import.css';

interface RowResult { line: number; status: 'OK' | 'ERROR'; errors: string[]; warnings: string[]; name: string; email: string; school: string; designation: string }
interface Summary { total: number; ok: number; errors: number; warnings: number }
interface Report { summary: Summary & { created: number; failed: number }; created: Array<{ line: number; employeeId: string; email: string }>; failed: Array<{ line: number; error: string }>; skipped: RowResult[] }

const SHOWN = 200;
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/**
 * Add many people from an HR file at once: download the template, upload the CSV, read what the
 * system found, then import. Nothing is written until the last step, accounts are created pending,
 * and no email is sent.
 */
export const PersonnelImportModal: React.FC<{ onClose: () => void; onImported?: () => void }> = ({ onClose, onImported }) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ summary: Summary; rows: RowResult[] } | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const body = (f: File | null = file) => { const form = new FormData(); form.append('file', f as File); return form; };

  const downloadTemplate = async () => {
    try {
      const r = await apiClient.get('/users/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'personnel-import-template.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(message(e, 'The template could not be downloaded.')); }
  };

  // Choosing a file checks it straight away, so the Import button is ready as soon as the file is.
  const choose = (f: File | null) => { setFile(f); setPreview(null); setReport(null); setError(''); if (f) void check(f); };

  const check = async (f: File | null = file) => {
    if (!f) return;
    setBusy('check'); setError('');
    try { setPreview((await apiClient.post('/users/import/preview', body(f))).data.data); }
    catch (e) { setPreview(null); setError(message(e, 'The file could not be checked.')); }
    finally { setBusy(null); }
  };

  const run = async () => {
    if (!file) return;
    setBusy('import'); setError('');
    try { setReport((await apiClient.post('/users/import', body())).data.data); onImported?.(); }
    catch (e) { setError(message(e, 'The import could not be completed.')); }
    finally { setBusy(null); }
  };

  const problems = preview ? preview.rows.filter(r => r.status === 'ERROR' || r.warnings.length) : [];

  return (
    <ModalOverlay onDismiss={busy ? undefined : onClose} className="modal-overlay">
      <section className="modal pi-card" role="dialog" aria-modal="true" aria-labelledby="pi-title">
        <header className="pi-head">
          <div>
            <h2 id="pi-title">Import personnel</h2>
            <p>Add many people at once from an HR spreadsheet saved as CSV.</p>
          </div>
          <button type="button" className="pi-close" aria-label="Close" onClick={onClose} disabled={Boolean(busy)}>×</button>
        </header>

        <div className="pi-body">
          {report ? (
            <>
              <p className="pi-done"><strong>{report.summary.created}</strong> {report.summary.created === 1 ? 'person was' : 'people were'} imported. Their accounts are pending and no emails were sent. Send each person’s credentials from Accounts when you are ready.</p>
              {(report.skipped.length > 0 || report.failed.length > 0) && (
                <>
                  <h3>Not imported ({report.skipped.length + report.failed.length})</h3>
                  <ul className="pi-list">
                    {report.skipped.slice(0, SHOWN).map(r => <li key={`s${r.line}`}><b>Line {r.line}</b> {r.name || r.email}: {r.errors.join(' ')}</li>)}
                    {report.failed.map(f => <li key={`f${f.line}`}><b>Line {f.line}</b>: {f.error}</li>)}
                  </ul>
                  <p className="pi-hint">Fix those lines in your file and import again. People already added are recognized and skipped.</p>
                </>
              )}
            </>
          ) : (
            <>
              <ol className="pi-steps">
                <li>
                  <b>Get the template.</b> Copy your HR data under its headings. Dates are day/month/year.
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTemplate}>Download template</button>
                </li>
                <li>
                  <b>Choose your file.</b> Save it from Excel as CSV first. It is checked as soon as you choose it.
                  <div className="pi-file">
                    <input ref={input} type="file" accept=".csv,text/csv" onChange={e => choose(e.target.files?.[0] ?? null)} aria-label="CSV file" />
                  </div>
                </li>
              </ol>

              {preview && (
                <div className="pi-result" aria-live="polite">
                  <div className="pi-chips">
                    <span className="pi-chip pi-chip--ok">{preview.summary.ok} ready</span>
                    <span className={`pi-chip ${preview.summary.errors ? 'pi-chip--bad' : ''}`}>{preview.summary.errors} with problems</span>
                    <span className="pi-chip">{preview.summary.warnings} with notes</span>
                  </div>
                  {problems.length > 0 && (
                    <ul className="pi-list">
                      {problems.slice(0, SHOWN).map(r => (
                        <li key={r.line} className={r.status === 'ERROR' ? 'is-error' : 'is-warn'}>
                          <b>Line {r.line}</b> {r.name || r.email}
                          {r.errors.map(t => <span key={t} className="pi-msg pi-msg--bad">{t}</span>)}
                          {r.warnings.map(t => <span key={t} className="pi-msg">{t}</span>)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {problems.length > SHOWN && <p className="pi-hint">and {problems.length - SHOWN} more.</p>}
                  <p className="pi-hint">Rows with problems are skipped. Everyone else is imported. Accounts start as pending and no emails are sent.</p>
                </div>
              )}
            </>
          )}
          {error && <p className="pi-error" role="alert">{error}</p>}
        </div>

        <footer className="pi-foot">
          {report
            ? <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            : <>
                <span className="pi-status" aria-live="polite">{busy === 'check' ? 'Checking the file…' : !file ? 'Choose a file to begin.' : !preview && !error ? '' : preview && preview.summary.ok === 0 ? 'Nothing can be imported yet. Fix the lines above.' : ''}</span>
                <button type="button" className="btn btn-secondary" onClick={() => check()} disabled={!file || Boolean(busy)}>Check again</button>
                <button type="button" className="btn btn-primary" onClick={run} disabled={!preview || preview.summary.ok === 0 || Boolean(busy)}>
                  {busy === 'import' ? 'Importing…' : `Import ${preview ? preview.summary.ok : ''} ${preview?.summary.ok === 1 ? 'person' : 'people'}`.replace('  ', ' ')}
                </button>
              </>}
        </footer>
      </section>
    </ModalOverlay>
  );
};
