/**
 * Image work for the web document scanner, matching what the Android app's ML Kit scanner does:
 * find the page in a camera frame, flatten it (perspective correction), and apply the same
 * filters (Auto, Grayscale, Black & white). Plain canvas code; no external vision library.
 */

export type Pt = { x: number; y: number };
/** Corners in normalised 0..1 coordinates of the source image: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];
export type ScanFilter = 'auto' | 'gray' | 'bw' | 'none';

export const FULL_QUAD: Quad = [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Polygon area (shoelace) of a quad in the same units as its points. */
export const quadArea = (q: Quad) => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p.x * n.y - n.x * p.y; }, 0)) / 2;

/** A usable page outline: convex, a sensible size, and no corner squeezed flat. */
export function plausibleQuad(q: Quad): boolean {
  const area = quadArea(q);
  if (area < 0.12 || area > 0.985) return false;
  const signs = q.map((p, i) => Math.sign(cross(p, q[(i + 1) % 4], q[(i + 2) % 4])));
  if (!signs.every(s => s === signs[0]) || signs[0] === 0) return false;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (deg < 50 || deg > 130) return false;
  }
  return true;
}

/** How far two outlines are apart (largest corner move, normalised). Used to decide the page is held still. */
export const quadDrift = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => dist(p, b[i])));

const otsu = (hist: Uint32Array, total: number) => {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
};

/**
 * Finds the page in a frame (expects a small image, about 320px wide): the largest bright region
 * that stands apart from its background, reduced to its four extreme corners. Returns null when no
 * believable page is in view, so the camera keeps looking instead of guessing.
 */
export function detectQuad(data: ImageData): Quad | null {
  const { width: w, height: h, data: px } = data;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) gray[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
  // Two box-blur passes soften text so the page reads as one bright shape.
  const tmp = new Uint8ClampedArray(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += gray[y * w + xx]; c++; } }
      tmp[y * w + x] = s / c;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; c++; } }
      gray[y * w + x] = s / c;
    }
  }
  const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[gray[i]]++;
  const t = otsu(hist, n);
  const mask = new Uint8Array(n); let on = 0;
  for (let i = 0; i < n; i++) if (gray[i] > t) { mask[i] = 1; on++; }
  if (on < n * 0.08 || on > n * 0.97) return null;

  // Largest connected bright region (4-neighbour flood fill).
  const label = new Int32Array(n); let best = 0, bestId = 0, id = 0;
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    id++; let sp = 0, size = 0; stack[sp++] = s; label[s] = id;
    while (sp) {
      const p = stack[--sp]; size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[sp++] = p + w; }
    }
    if (size > best) { best = size; bestId = id; }
  }
  if (best < n * 0.1) return null;

  // Extreme points of the region give its corners.
  let tl = { x: 0, y: 0, v: Infinity }, br = { x: 0, y: 0, v: -Infinity }, tr = { x: 0, y: 0, v: -Infinity }, bl = { x: 0, y: 0, v: Infinity };
  for (let p = 0; p < n; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w, y = (p / w) | 0, s = x + y, d = x - y;
    if (s < tl.v) tl = { x, y, v: s };
    if (s > br.v) br = { x, y, v: s };
    if (d > tr.v) tr = { x, y, v: d };
    if (d < bl.v) bl = { x, y, v: d };
  }
  const q: Quad = [tl, tr, br, bl].map(p => ({ x: p.x / (w - 1), y: p.y / (h - 1) })) as Quad;
  return plausibleQuad(q) ? q : null;
}

/** Runs detection on any image/canvas/video frame by sampling it down to ~320px wide. */
export function detectIn(source: CanvasImageSource, sw: number, sh: number): Quad | null {
  if (!sw || !sh) return null;
  const w = 320, h = Math.max(1, Math.round((sh / sw) * w));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return detectQuad(ctx.getImageData(0, 0, w, h));
}

/** Square-to-quad projective map (Heckbert): (u,v) in the unit square to a point in the quad. */
function squareToQuad(q: Pt[]) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let a, b, c, d, e, f, g, hh;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = p1.x - p0.x; b = p3.x - p0.x; c = p0.x; d = p1.y - p0.y; e = p3.y - p0.y; f = p0.y; g = 0; hh = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den;
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + hh * p3.x; c = p0.x;
    d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + hh * p3.y; f = p0.y;
  }
  return (u: number, v: number) => { const z = g * u + hh * v + 1; return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z }; };
}

/** Flattens the outlined page into an upright rectangle (bilinear sampling), at most `maxDim` px on its long side. */
export function warpToCanvas(img: HTMLImageElement | HTMLCanvasElement, quad: Quad, maxDim = 2000): HTMLCanvasElement {
  const sw = (img as HTMLImageElement).naturalWidth || img.width, sh = (img as HTMLImageElement).naturalHeight || img.height;
  const q = quad.map(p => ({ x: p.x * sw, y: p.y * sh }));
  let ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, maxDim / Math.max(ow, oh)); ow = Math.max(1, Math.round(ow * k)); oh = Math.max(1, Math.round(oh * k));
  const src = document.createElement('canvas'); src.width = sw; src.height = sh;
  const sctx = src.getContext('2d', { willReadFrequently: true })!; sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  const octx = out.getContext('2d')!; const od = octx.createImageData(ow, oh);
  const map = squareToQuad(q);
  for (let y = 0; y < oh; y++) {
    const v = oh > 1 ? y / (oh - 1) : 0;
    for (let x = 0; x < ow; x++) {
      const { x: fx, y: fy } = map(ow > 1 ? x / (ow - 1) : 0, v);
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (y * ow + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = sd[i00 + ch] + (sd[i10 + ch] - sd[i00 + ch]) * ax, bot = sd[i01 + ch] + (sd[i11 + ch] - sd[i01 + ch]) * ax;
        od.data[o + ch] = top + (bot - top) * ay;
      }
      od.data[o + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/** The same choices as the app: Auto (clean, brighter page), Grayscale, Black & white, or the original colours. */
export function applyFilter(canvas: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  if (filter === 'none') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas; const img = ctx.getImageData(0, 0, w, h); const d = img.data; const n = w * h;
  const pct = (hist: Uint32Array, p: number) => { let acc = 0; const target = n * p; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i; } return 255; };
  if (filter === 'auto') {
    // Per-channel stretch (white balance + contrast), then lift the paper towards white.
    for (let ch = 0; ch < 3; ch++) {
      const hist = new Uint32Array(256); for (let i = ch; i < d.length; i += 4) hist[d[i]]++;
      const lo = pct(hist, 0.01), hi = Math.max(lo + 1, pct(hist, 0.97));
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = Math.pow(Math.max(0, Math.min(1, (v - lo) / (hi - lo))), 0.85) * 255;
      for (let i = ch; i < d.length; i += 4) d[i] = lut[d[i]];
    }
  } else {
    const lum = new Uint8ClampedArray(n); const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) { lum[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; hist[lum[i]]++; }
    const lo = pct(hist, 0.01), hi = Math.max(lo + 1, pct(hist, 0.98));
    if (filter === 'gray') {
      for (let i = 0, j = 0; i < n; i++, j += 4) { const v = Math.max(0, Math.min(255, ((lum[i] - lo) / (hi - lo)) * 255)); d[j] = d[j + 1] = d[j + 2] = v; }
    } else {
      // Black & white: adaptive threshold against the local mean, so shadows do not swallow text.
      const integral = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += lum[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row; } }
      const r = Math.max(8, Math.round(Math.max(w, h) / 40));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - r), y1 = Math.max(0, y - r), x2 = Math.min(w, x + r + 1), y2 = Math.min(h, y + r + 1);
        const area = (x2 - x1) * (y2 - y1);
        const sum = integral[y2 * (w + 1) + x2] - integral[y1 * (w + 1) + x2] - integral[y2 * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
        const v = lum[y * w + x] < (sum / area) * 0.9 ? 0 : 255; const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Quarter turns clockwise. */
export function rotateCanvas(c: HTMLCanvasElement, quarterTurns: number): HTMLCanvasElement {
  const t = ((quarterTurns % 4) + 4) % 4; if (!t) return c;
  const out = document.createElement('canvas');
  out.width = t % 2 ? c.height : c.width; out.height = t % 2 ? c.width : c.height;
  const ctx = out.getContext('2d')!; ctx.translate(out.width / 2, out.height / 2); ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

export const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('The image could not be read.')); im.src = src;
});

/** Original capture + outline + filter + rotation, rendered to the JPEG that goes into the PDF. */
export async function renderPage(original: string, quad: Quad, filter: ScanFilter, rotation: number): Promise<string> {
  const img = await loadImage(original);
  const flat = rotateCanvas(applyFilter(warpToCanvas(img, quad), filter), rotation);
  return flat.toDataURL('image/jpeg', 0.88);
}
