/**
 * Reads the identity block of the official CS Form 212 (Personal Data Sheet) from a
 * PDF's embedded text layer. Digital PDS files carry their entries as text, so they
 * can be copied exactly instead of OCR-guessed. The form prints each field name next
 * to (left column and contact rows) or just under (address cells) its entry, with no
 * colon, which is why the "Label: value" OCR parser finds nothing on it.
 *
 * Coordinates are normalised to the form's own 612 x 1008 pt page so a different paper
 * size scales instead of breaking. Anything not confidently located is left out; the
 * caller falls back to OCR and the reviewer still checks every field.
 */
export interface TextWord { x0: number; y0: number; x1: number; y1: number; text: string }
export interface PdftotextPage { width: number; height: number; words: TextWord[] }

const REF_W = 612;
const REF_H = 1008;
const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const cy = (w: TextWord) => (w.y0 + w.y1) / 2;
const decode = (value: string) => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

/** Parse `pdftotext -bbox` XHTML for the first page. */
export const parsePdftotextBbox = (xhtml: string): PdftotextPage | null => {
  const page = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"/.exec(xhtml);
  if (!page) return null;
  const words: TextWord[] = [];
  const pattern = /<word\s+xMin="([\d.]+)"\s+yMin="([\d.]+)"\s+xMax="([\d.]+)"\s+yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (let match = pattern.exec(xhtml); match; match = pattern.exec(xhtml)) {
    const text = decode(match[5]).trim();
    if (text) words.push({ x0: Number(match[1]), y0: Number(match[2]), x1: Number(match[3]), y1: Number(match[4]), text });
  }
  return { width: Number(page[1]), height: Number(page[2]), words };
};

/** Find a label made of consecutive words on one line. */
const findLabel = (words: TextWord[], tokens: string[], minY = -Infinity, maxY = Infinity): TextWord[] | null => {
  const ordered = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const first of ordered) {
    if (clean(first.text) !== tokens[0] || cy(first) <= minY || cy(first) >= maxY) continue;
    const chain = [first];
    for (const token of tokens.slice(1)) {
      const prev = chain[chain.length - 1];
      const next = words.find(w => clean(w.text) === token && Math.abs(cy(w) - cy(prev)) <= 3 && w.x0 - prev.x1 >= -1 && w.x0 - prev.x1 <= 14);
      if (!next) break;
      chain.push(next);
    }
    if (chain.length === tokens.length) return chain;
  }
  return null;
};
const box = (label: TextWord[]) => ({
  x0: Math.min(...label.map(w => w.x0)), x1: Math.max(...label.map(w => w.x1)),
  y0: Math.min(...label.map(w => w.y0)), y1: Math.max(...label.map(w => w.y1)),
  cy: label.reduce((sum, w) => sum + cy(w), 0) / label.length,
});
const join = (list: TextWord[]) => list.sort((a, b) => a.x0 - b.x0).map(w => w.text).join(' ').replace(/\s+/g, ' ').trim();

const isoDate = (raw: string): string | null => {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
};

/** Returns the same field keys the OCR path produces, or null if this is not a readable CS Form 212. */
export const parsePdsTextLayer = (page: PdftotextPage): Record<string, string> | null => {
  const sx = REF_W / page.width;
  const sy = REF_H / page.height;
  const words = page.words.map(w => ({ ...w, x0: w.x0 * sx, x1: w.x1 * sx, y0: w.y0 * sy, y1: w.y1 * sy }));
  if (!findLabel(words, ['PERSONAL', 'DATA', 'SHEET']) || !words.some(w => clean(w.text) === '212')) return null;

  // Left column (names, birth) and right column (contact) entries sit on the label's own line.
  const sameLine = (label: TextWord[], minX: number, maxX: number) => {
    const l = box(label);
    return join(words.filter(w => !label.includes(w) && Math.abs(cy(w) - l.cy) <= 6 && w.x0 >= Math.max(minX, l.x1 - 1) && w.x1 <= maxX));
  };
  const fields: Record<string, string> = {};
  const put = (key: string, tokens: string[], minX: number, maxX: number, transform?: (v: string) => string | null) => {
    const label = findLabel(words, tokens);
    if (!label) return;
    const raw = sameLine(label, minX, maxX);
    const value = transform ? transform(raw) : raw;
    if (value) fields[key] = value;
  };
  put('surname', ['SURNAME'], 95, 280);
  put('firstName', ['FIRST', 'NAME'], 95, 280);
  put('middleName', ['MIDDLE', 'NAME'], 95, 280, v => (/^N\/?A$/i.test(v) ? null : v));
  put('birthDate', ['DATE', 'OF', 'BIRTH'], 95, 280, isoDate);
  put('mobile', ['MOBILE', 'NO'], 330, 612, v => {
    const first = v.split('/')[0].replace(/\D/g, '');
    return first.length >= 10 && first.length <= 13 ? first : null;
  });
  if (!fields.surname || !fields.firstName) return null;

  // Residential address: each cell's entry sits just above its label, in the left or right half.
  const heading = findLabel(words, ['RESIDENTIAL', 'ADDRESS']);
  const permanent = findLabel(words, ['PERMANENT', 'ADDRESS']);
  if (heading) {
    const top = box(heading).cy;
    const bottom = permanent ? box(permanent).cy : Infinity;
    const cells: Array<[string, string]> = [['HOUSEBLOCKLOT', 'residential.house'], ['STREET', 'residential.street'], ['SUBDIVISIONVILLAGE', 'residential.subdivision'],
      ['BARANGAY', 'residential.barangay'], ['CITYMUNICIPALITY', 'residential.city'], ['PROVINCE', 'residential.province']];
    const found = cells.flatMap(([token, key]) => {
      const label = findLabel(words, [token], top, bottom);
      return label ? [{ key, label, b: box(label) }] : [];
    });
    const split = 465;
    for (const cell of found) {
      const left = cell.b.x0 < split;
      const above = found.filter(o => o !== cell && o.b.cy < cell.b.cy - 3 && (o.b.x0 < split) === left);
      const floor = Math.max(top + 3, ...above.map(o => o.b.cy + 3));
      const value = join(words.filter(w => w.x0 >= 330 && (w.x0 < split) === left && cy(w) > floor && w.y1 <= cell.b.y0 + 2
        && !found.some(o => o.label.includes(w)) && !/^(NO\.?|N\/A)$/i.test(w.text) && clean(w.text) !== 'ZIP'));
      if (value) fields[cell.key] = value;
    }
    const zip = findLabel(words, ['ZIP', 'CODE'], top, bottom);
    if (zip) {
      const z = box(zip);
      const code = words.find(w => /^\d{4}$/.test(w.text) && w.x0 >= 330 && Math.abs(cy(w) - z.cy) <= 8);
      if (code) fields.residentialZip = code.text;
    }
  }
  return fields;
};
