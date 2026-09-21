import axios from 'axios';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';

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
      requestUrl.includes('/auth/refresh-token');

    // If 401 occurred on an authentication endpoint (e.g. invalid credentials),
    // do NOT attempt token refresh and do NOT reload the page. Let the caller handle the error.
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        // No refresh token, clear credentials and redirect to login only if not already on /login
        localStorage.clear();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken });
        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch {
        localStorage.clear();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
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
