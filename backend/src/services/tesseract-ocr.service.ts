import { spawn } from 'child_process';
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

export type OcrResult = {
  templateId: string;
  fields: Record<string, string>;
  rawFields: Array<{ label: string; value: string; confidence: number }>;
  provider: 'TESSERACT';
  confidence: number;
};

const MAX_PAGES = 10;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const MAX_ACTIVE_JOBS = 2;
let activeJobs = 0;
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const FIELD_MATCHERS: Array<[string, RegExp[]]> = [
  ['surname', [/^surname$/, /last name/]],
  ['firstName', [/first name/, /given name/]],
  ['middleName', [/middle name/]],
  ['nameExtension', [/name extension/, /suffix/]],
  ['birthDate', [/date of birth/, /birth date/]],
  ['mobile', [/mobile number/, /mobile no/, /cellphone/, /contact number/]],
  ['residential.house', [/residential.*house/, /house block lot.*residential/]],
  ['residential.street', [/residential.*street/]],
  ['residential.subdivision', [/residential.*subdivision/]],
  ['residential.barangay', [/residential.*barangay/]],
  ['residential.city', [/residential.*city/]],
  ['residential.province', [/residential.*province/]],
  ['residentialZip', [/residential.*zip/]],
  ['designation', [/^position title$/, /^position$/, /^designation$/]],
  ['dateHired', [/date of appointment/, /date hired/, /appointment date/]],
  ['appointmentStatus', [/^appointment status$/, /^employment status$/]],
  ['school', [/^school$/, /^station$/, /^school assignment$/]],
  ['district', [/^district$/]],
];

const mappedKey = (label: string): string | null => {
  const candidate = normalized(label);
  for (const [key, patterns] of FIELD_MATCHERS) if (patterns.some(pattern => pattern.test(candidate))) return key;
  if (/\bmale\b/.test(candidate) && !/female/.test(candidate)) return 'sex.male';
  if (/female/.test(candidate)) return 'sex.female';
  for (const status of ['single', 'married', 'widowed', 'separated']) {
    if (new RegExp(`\\b${status}\\b`).test(candidate)) return `civilStatus.${status}`;
  }
  return null;
};

const splitDuration = (value: string): [string, string] => {
  const parts = value.split(/\s+(?:to|until|through|-)\s+/i);
  return [parts[0]?.trim() || '', parts[1]?.trim() || ''];
};

/** Turn OCR text lines into conservative label/value pairs. Unlabelled prose is
 * intentionally ignored rather than treated as identity or employment proof. */
export const parseOcrLabeledFields = (lines: string[], lineScores: number[] = []): Array<{ label: string; value: string; confidence: number }> => {
  const results: Array<{ label: string; value: string; confidence: number }> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const match = /^(.{2,70}?):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    let confidence = lineScores[index] ?? 0;
    if (!value && lines[index + 1] && !/^.{2,70}?:/.test(lines[index + 1].trim())) {
      value = lines[index + 1].trim();
      confidence = (confidence + (lineScores[index + 1] ?? 0)) / 2;
      index++;
    }
    if (value) results.push({ label: match[1].trim(), value, confidence });
  }
  return results;
};

/** The official WES repeats Duration/Position/Office blocks. Preserve each job
 * separately instead of letting a plain key/value map overwrite earlier jobs. */
export const mapOcrFormFields = (
  rawFields: Array<{ label: string; value: string; confidence: number }>,
  documentTypeId: string,
): Record<string, string> => {
  const fields: Record<string, string> = {};
  let workIndex = -1;
  for (const item of rawFields) {
    const label = normalized(item.label);
    if (documentTypeId === 'WES') {
      if (/^duration\b/.test(label)) {
        workIndex++;
        const [from, to] = splitDuration(item.value);
        fields[`work.${workIndex}.from`] = from;
        fields[`work.${workIndex}.to`] = to;
      } else if (workIndex >= 0 && /^position\b/.test(label)) {
        fields[`work.${workIndex}.position`] = item.value;
      } else if (workIndex >= 0 && /^(name of office|name of agency|office|agency)/.test(label)) {
        fields[`work.${workIndex}.${label.includes('agency') ? 'agency' : 'office'}`] = item.value;
      }
      continue;
    }
    if (documentTypeId === 'COE') {
      if (/^(position|designation|job title)/.test(label)) fields['employment.position'] = item.value;
      else if (/(employer|company|agency|office|organization)/.test(label)) fields['employment.agency'] = item.value;
      else if (/(period of employment|employment period|inclusive dates|duration)/.test(label)) {
        const [from, to] = splitDuration(item.value);
        fields['employment.from'] = from;
        fields['employment.to'] = to;
      } else if (/(employment status|appointment status)/.test(label)) fields['employment.status'] = item.value;
      continue;
    }
    const key = mappedKey(item.label);
    if (key && !fields[key]) fields[key] = item.value;
  }
  return fields;
};

const run = (binary: string, args: string[], timeoutMs: number): Promise<string> => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let size = 0;
  let settled = false;
  let forcedError: Error | null = null;
  const finish = (error?: Error, output?: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(output || '');
  };
  const timer = setTimeout(() => { forcedError = new Error(`${binary} timed out.`); child.kill(); }, timeoutMs);
  child.stdout.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_OUTPUT_BYTES) { forcedError = new Error(`${binary} output exceeded the safety limit.`); child.kill(); }
    else stdout.push(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (Buffer.concat(stderr).length < 8192) stderr.push(chunk);
  });
  child.once('error', error => finish(error));
  child.once('close', code => finish(forcedError || (code === 0 ? undefined : new Error(`${binary} failed (${code}): ${Buffer.concat(stderr).toString('utf8').slice(0, 300)}`)), Buffer.concat(stdout).toString('utf8')));
});

/** Parse TSV word rows back into ordered text lines and an OCR-only confidence. */
export const parseTesseractTsv = (tsv: string): { lines: string[]; lineScores: number[]; confidence: number } => {
  const grouped = new Map<string, { words: string[]; scores: number[] }>();
  const scores: number[] = [];
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;
    const value = columns.slice(11).join('\t').trim();
    const score = Number(columns[10]);
    if (!value || !Number.isFinite(score) || score < 0) continue;
    const key = columns.slice(1, 5).join(':');
    if (!grouped.has(key)) grouped.set(key, { words: [], scores: [] });
    grouped.get(key)!.words.push(value);
    grouped.get(key)!.scores.push(score / 100);
    scores.push(score);
  }
  const rows = [...grouped.values()];
  return {
    lines: rows.map(row => row.words.join(' ')),
    lineScores: rows.map(row => row.scores.reduce((sum, score) => sum + score, 0) / row.scores.length),
    confidence: scores.length ? scores.reduce((sum, score) => sum + score, 0) / (scores.length * 100) : 0,
  };
};

export const extractWithTesseract = async (buffer: Buffer, mimeType: string, documentTypeId = 'PDS'): Promise<OcrResult> => {
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType)) throw new Error('Unsupported OCR file type.');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('OCR file must be between 1 byte and 10 MB.');
  if (activeJobs >= MAX_ACTIVE_JOBS) throw new Error('OCR is busy. Please retry shortly; your uploaded file remains saved.');
  activeJobs++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hris-ocr-'));
    const workDir = directory;
    const images: string[] = [];
    if (mimeType === 'application/pdf') {
      const source = path.join(workDir, 'source.pdf');
      await writeFile(source, buffer);
      const info = await run(process.env.PDFINFO_BIN || 'pdfinfo', [source], 10_000);
      const pages = Number(/^Pages:\s+(\d+)$/im.exec(info)?.[1]);
      if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) throw new Error(`PDF OCR supports 1-${MAX_PAGES} pages.`);
      await run(process.env.PDFTOPPM_BIN || 'pdftoppm', ['-f', '1', '-l', String(pages), '-scale-to', '2400', '-png', source, path.join(workDir, 'page')], 90_000);
      images.push(...(await readdir(workDir)).filter(name => /^page-\d+\.png$/.test(name)).sort().map(name => path.join(workDir, name)));
      if (images.length !== pages) throw new Error('Not every PDF page could be rendered for OCR.');
    } else {
      const source = path.join(workDir, mimeType === 'image/png' ? 'source.png' : 'source.jpg');
      await writeFile(source, buffer);
      images.push(source);
    }
    const lines: string[] = [];
    const lineScores: number[] = [];
    const scores: number[] = [];
    for (const image of images) {
      const tsv = await run(process.env.TESSERACT_BIN || 'tesseract', [image, 'stdout', '-l', 'eng', '--psm', '6', 'tsv'], 60_000);
      const parsed = parseTesseractTsv(tsv);
      lines.push(...parsed.lines);
      lineScores.push(...parsed.lineScores);
      if (parsed.confidence > 0) scores.push(parsed.confidence);
    }
    const rawFields = parseOcrLabeledFields(lines, lineScores).slice(0, 500);
    const confidence = rawFields.length
      ? rawFields.reduce((sum, field) => sum + field.confidence, 0) / rawFields.length
      : scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    return {
      templateId: documentTypeId === 'PDS' ? 'pds-2025' : documentTypeId.toLowerCase(),
      fields: mapOcrFormFields(rawFields, documentTypeId), rawFields,
      provider: 'TESSERACT', confidence,
    };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    activeJobs--;
  }
};
