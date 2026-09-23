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
): Promise<{ blob: Blob; type: string }> => {
  const response = await client.get<Blob>(previewRequestPath(fileUrl, baseUrl), { responseType: 'blob' });
  const blob = response.data;
  return {
    blob,
    type: blob.type || mimeType || (fileUrl.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg'),
  };
};
