// Standalone development fixture; not imported by the production application.
// No real API reads/writes, credentials or personnel records are used.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../src/api/client';
import FillDocument from '../src/pages/personnel/FillDocument';
import '../src/index.css';
import pdsUrl from '../../backend/assets/forms/pds-2025.pdf?url';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const mode = new URLSearchParams(location.search).get('mode');
apiClient.get = (async (url: string) => {
  if (url === '/forms/templates') return { data: { data: [{id:'pds-2025', title:'Personal Data Sheet', edition:'CS Form 212, Revised 2025 — QA fixture',pages:4,source:'https://csc.gov.ph/downloads/2025-oraohra',notice:'Synthetic test only. Confirm the accepted edition and required signatures with HRMO.'}] } };
  if (url.endsWith('/file')) return { data: await (await fetch(pdsUrl)).arrayBuffer() };
  if (url === '/transactions/999') return { data: { data: { status: mode === 'locked' ? 'PENDING_VALIDATION' : 'DRAFT', uploadedDocuments: [] } } };
  return { data: { data: JSON.parse(sessionStorage.getItem('form-editor-qa') || 'null') } };
}) as typeof apiClient.get;
apiClient.put = (async (_url: string, data: any) => {
  if (mode === 'conflict') throw {response:{data:{message:'A newer draft exists. Reload before editing.'}}};
  const saved = {...data, version:crypto.randomUUID(), updatedAt:new Date().toISOString()};
  sessionStorage.setItem('form-editor-qa', JSON.stringify(saved));
  return {data:{data:saved}};
}) as typeof apiClient.put;
apiClient.post = (async () => { throw new Error('QA fixture: real attachment is intentionally disabled.'); }) as typeof apiClient.post;
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/personnel/fill-document?txId=999&name=Personal%20Data%20Sheet']}><FillDocument/></MemoryRouter>);
