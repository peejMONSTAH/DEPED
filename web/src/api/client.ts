import axios from 'axios';
import { singleFlight } from './session-refresh';
import { resetClientCaches } from './queryClient';

export const API_BASE_URL = ((import.meta as any).env?.VITE_API_URL || '/api/v1').replace(/\/$/, '');
export const apiUrl = (path: string) => `${API_BASE_URL}/${path.replace(/^\//, '')}`;

// Also reached when the server ends a session, e.g. after the officer's station
// is reassigned: nothing cached under the old assignment survives it.
function clearSession() {
  for (const key of ['accessToken', 'refreshToken', 'user']) localStorage.removeItem(key);
  resetClientCaches();
  if (window.location.pathname !== '/login') window.location.href = '/login';
}

export const refreshAccessToken = singleFlight(async (): Promise<string> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');
  const response = await axios.post(apiUrl('/auth/refresh-token'), { refreshToken }, { timeout: 15000 });
  const { accessToken, refreshToken: rotatedToken } = response.data.data;
  if (!accessToken || typeof accessToken !== 'string') throw new Error('Invalid session response');
  // A refresh completing after logout or an account switch cannot restore the old session.
  if (localStorage.getItem('refreshToken') !== refreshToken) throw new Error('Session changed');
  localStorage.setItem('accessToken', accessToken);
  if (rotatedToken) localStorage.setItem('refreshToken', rotatedToken);
  return accessToken;
});

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor — attach access token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // When sending FormData (file uploads), remove default Content-Type so Axios/browser
    // sets multipart/form-data with the correct boundary parameter.
    if (config.data instanceof FormData && config.headers) {
      if (typeof (config.headers as any).delete === 'function') {
        (config.headers as any).delete('Content-Type');
      } else {
        delete (config.headers as any)['Content-Type'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/reset-password') ||
      requestUrl.includes('/auth/refresh-token') ||
      // Link-based sign-ins: a 401 means the link is expired or used, not that a session needs refreshing.
      requestUrl.includes('/auth/magic-login') ||
      requestUrl.includes('/auth/complete-setup');

    // If 401 occurred on an authentication endpoint (e.g. invalid credentials),
    // do NOT attempt token refresh and do NOT reload the page. Let the caller handle the error.
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (originalRequest && error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const latestToken = localStorage.getItem('accessToken');
      if (latestToken && originalRequest.headers?.Authorization !== `Bearer ${latestToken}`) {
        originalRequest.headers.Authorization = `Bearer ${latestToken}`;
        return apiClient(originalRequest);
      }

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        // No refresh token, clear credentials and redirect to login only if not already on /login
        clearSession();
        return Promise.reject(error);
      }

      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        if ([401, 403].includes(refreshError.response?.status) && localStorage.getItem('refreshToken') === refreshToken) clearSession();
        return Promise.reject(refreshError);
      }
    }

    // Server-side failures carry a request id. Fold it into the message so the many
    // `err.response?.data?.message` call sites surface something support can trace.
    const status = error.response?.status;
    if (status >= 500 && error.response?.data) {
      const requestId = error.response.data.requestId || error.response.headers?.['x-request-id'];
      const message = error.response.data.message;
      if (requestId && typeof message === 'string' && !message.includes(requestId)) {
        error.response.data.message = `${message} (Reference: ${requestId})`;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
