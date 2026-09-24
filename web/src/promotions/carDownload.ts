import type { AxiosInstance } from 'axios';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A .docx is a ZIP archive: it must start with "PK\x03\x04". */
export const isDocxSignature = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export const filenameFromDisposition = (header: unknown, fallback: string): string => {
  const match = typeof header === 'string' ? header.match(/filename="?([^";]+)"?/i) : null;
  return match?.[1] || fallback;
};

/**
 * With responseType 'blob', an error body arrives as a Blob too, so the
 * server's explanation (e.g. which candidates still lack a rating) was lost
 * behind "Request failed with status code 400". Read it back out.
 */
export const carErrorMessage = async (err: any): Promise<string> => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return String(parsed.message);
    } catch { /* not JSON */ }
  } else if (data?.message) {
    return String(data.message);
  }
  if (err?.code === 'ECONNABORTED') return 'Generating the CAR took too long. Please try again.';
  return 'The CAR could not be generated. Please try again.';
};

/** Fetches the CAR and verifies it is a real, non-empty Word file before it is offered for download. */
export async function fetchCarDocument(
  client: Pick<AxiosInstance, 'get'>,
  cycleId: number,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await client.get<Blob>(`/promotions/cycles/${cycleId}/car-document`, { responseType: 'blob', timeout: 60_000 });
  const blob: Blob = response.data;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (blob.size === 0 || !isDocxSignature(head)) {
    throw new Error('The server returned an invalid CAR file.');
  }
  return {
    blob: blob.type === DOCX_MIME ? blob : new Blob([blob], { type: DOCX_MIME }),
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName),
  };
}
