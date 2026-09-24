import type { AxiosInstance } from 'axios';

/** API responses may contain a route rooted at the same path as the client's base URL. */
export const previewRequestPath = (fileUrl: string, baseUrl: string): string => {
  const basePath = new URL(baseUrl, 'http://localhost').pathname.replace(/\/$/, '');
  if (basePath && basePath !== '/' && fileUrl.startsWith(`${basePath}/`)) {
    return fileUrl.slice(basePath.length);
  }
  return fileUrl;
};

export const loadDocumentPreview = async (
  client: Pick<AxiosInstance, 'get'>,
  fileUrl: string,
  baseUrl: string,
  mimeType?: string,
  request?: { signal?: AbortSignal; timeout?: number },
): Promise<{ blob: Blob; type: string }> => {
  let response;
  try {
    response = await client.get<Blob>(previewRequestPath(fileUrl, baseUrl), { responseType: 'blob', ...request });
  } catch (err: any) {
    // With responseType 'blob' the API's JSON error arrives as a Blob; read its message.
    const data = err?.response?.data;
    if (data && typeof data.text === 'function') {
      try { err.serverMessage = JSON.parse(await data.text())?.message; } catch { /* not JSON */ }
    }
    throw err;
  }
  const blob = response.data;
  if (PREVIEWABLE_TYPES.includes(blob.type)) return { blob, type: blob.type };
  // Missing or generic Content-Type (e.g. application/octet-stream): trust the
  // file signature over a guess from the URL, which ends in /file anyway.
  const sniffed = await sniffDocumentType(blob);
  return { blob, type: sniffed || blob.type || mimeType || 'application/octet-stream' };
};

export const PREVIEWABLE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** Identifies PDF, PNG and JPEG from their magic bytes; undefined for anything else. */
export const sniffDocumentType = async (blob: Blob): Promise<string | undefined> => {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'application/pdf';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  return undefined;
};

const PREVIEW_TIMEOUT_MS = 30_000;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
export const zoomIn = (zoom: number) => Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100);
export const zoomOut = (zoom: number) => Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100);
export const zoomPercent = (zoom: number) => `${Math.round(zoom * 100)}%`;

/** Request options for one preview fetch: cancellable, and never left pending forever. */
export const previewRequestOptions = (signal: AbortSignal) => ({ signal, timeout: PREVIEW_TIMEOUT_MS });

/** A viewer-facing reason; never echoes a storage path or raw URL. */
export const describePreviewError = (err: any): string => {
  const status = err?.response?.status;
  if (status === 404 && /file for this document is missing/i.test(String(err?.serverMessage))) return err.serverMessage;
  if (status === 404) return 'This document is unavailable, or you do not have permission to view it.';
  if (status === 403) return 'You do not have authorization to view this document.';
  if (status === 401) return 'Session expired. Please sign in again.';
  if (err?.code === 'ECONNABORTED') return 'The document took too long to load.';
  return 'Failed to load document preview. Please check your connection.';
};

export interface PreviewState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Blob URL of the last successful preview; kept while the next one loads. */
  url: string | null;
  type: string;
  error: string | null;
}

export const IDLE_PREVIEW: PreviewState = { status: 'idle', url: null, type: '', error: null };

type PreviewFetcher = (signal: AbortSignal) => Promise<{ blob: Blob; type: string }>;

/**
 * Owns one viewer's preview request and blob URL. Only the latest request may
 * publish state; superseded requests are aborted and their results dropped.
 * Each blob URL is revoked exactly once, when replaced, cleared or disposed.
 * After dispose() nothing is published, so an unmounted viewer is never updated.
 */
export class PreviewController {
  private seq = 0;
  private inFlight: AbortController | null = null;
  private url: string | null = null;
  private disposed = false;
  private state: PreviewState = IDLE_PREVIEW;

  constructor(
    private readonly onChange: (state: PreviewState) => void,
    private readonly urls = {
      create: (blob: Blob) => URL.createObjectURL(blob),
      revoke: (url: string) => URL.revokeObjectURL(url),
    },
  ) {}

  async load(fetcher: PreviewFetcher): Promise<void> {
    if (this.disposed) return;
    const id = ++this.seq;
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;
    this.publish({ status: 'loading', error: null });
    try {
      const result = await fetcher(controller.signal);
      if (id !== this.seq || this.disposed) return;
      const previous = this.url;
      this.url = this.urls.create(result.blob);
      this.publish({ status: 'ready', url: this.url, type: result.type, error: null });
      if (previous) this.urls.revoke(previous);
    } catch (err) {
      if (id !== this.seq || this.disposed) return;
      // Never leave an earlier document on screen beside this one's error.
      this.releaseUrl();
      this.publish({ status: 'error', url: null, type: '', error: describePreviewError(err) });
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  clear(): void {
    this.seq++;
    this.inFlight?.abort();
    this.inFlight = null;
    this.releaseUrl();
    this.publish(IDLE_PREVIEW);
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  private releaseUrl(): void {
    if (this.url) this.urls.revoke(this.url);
    this.url = null;
  }

  private publish(patch: Partial<PreviewState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}
