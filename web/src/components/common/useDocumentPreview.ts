import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient, { API_BASE_URL } from '../../api/client';
import {
  IDLE_PREVIEW,
  PreviewController,
  PreviewState,
  loadDocumentPreview,
  previewRequestOptions,
} from './document-preview';

/**
 * Authenticated preview of one document. The fetch is keyed on `fileUrl`
 * alone (plus explicit retries), so re-renders, zooming and the blob URL it
 * publishes can never start another request. Pass null to clear.
 */
export function useDocumentPreview(fileUrl: string | null, fallbackType?: string) {
  const [preview, setPreview] = useState<PreviewState>(IDLE_PREVIEW);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<PreviewController | null>(null);
  const fallbackTypeRef = useRef(fallbackType);
  fallbackTypeRef.current = fallbackType;

  // Created inside the effect so Strict Mode's mount/unmount/mount gets a live controller.
  useEffect(() => {
    const controller = new PreviewController(setPreview);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!fileUrl) {
      controller.clear();
      return;
    }
    void controller.load(signal =>
      loadDocumentPreview(apiClient, fileUrl, API_BASE_URL, fallbackTypeRef.current, previewRequestOptions(signal)));
  }, [fileUrl, retryNonce]);

  const retry = useCallback(() => setRetryNonce(n => n + 1), []);
  return { preview, retry };
}

const saveUrl = (url: string, fileName: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * Saves the previewed file. Uses the loaded blob when there is one; otherwise
 * (e.g. the inline preview failed) fetches it once through the same
 * authenticated endpoint, so Download stays available beside Retry.
 */
export async function downloadDocument(fileUrl: string, blobUrl: string | null, fileName: string): Promise<void> {
  if (blobUrl) {
    saveUrl(blobUrl, fileName);
    return;
  }
  const { blob } = await loadDocumentPreview(apiClient, fileUrl, API_BASE_URL);
  const url = URL.createObjectURL(blob);
  try {
    saveUrl(url, fileName);
  } finally {
    // Revoke after the click has been dispatched; the download keeps its own reference.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
