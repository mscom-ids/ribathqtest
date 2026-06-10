import axios from 'axios';

const IS_DEV = process.env.NODE_ENV !== 'production';

// In production, always use the relative path /api so requests go through the Next.js proxy.
// In development, use localhost:5000 (or the local network IP).
const baseApiUrl = IS_DEV ? 'http://localhost:5000/api' : '/api';

const API_URL = typeof window === 'undefined' || !IS_DEV
  ? baseApiUrl
  : baseApiUrl.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):5000/, `http://${window.location.hostname}:5000`);

// Dev-only logger. Prod builds get no per-request console noise.
if (IS_DEV) console.log('>>> [api.ts] API_URL configured as:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // send httpOnly cookies with cross-origin requests
});

// Auth is cookie-only in the browser: the backend sets an httpOnly auth_token
// cookie and axios sends it through withCredentials. Avoiding localStorage keeps
// the JWT out of JavaScript reach if an XSS bug appears.
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // Attach server-issued delegation token if active
      const delegationToken = sessionStorage.getItem('delegationToken');
      if (delegationToken) {
        config.headers['x-delegation-token'] = delegationToken;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration globally
api.interceptors.response.use(
  (response) => {
    if (IS_DEV) console.log(`[API RESPONSE] [${response.config.method?.toUpperCase()} ${response.config.url}] Status:`, response.status);
    return response;
  },
  (error) => {
    if (IS_DEV) {
      const method = error.config?.method?.toUpperCase() || 'UNKNOWN';
      const url = error.config?.url || 'UNKNOWN_URL';
      const status = error.response?.status || 'NO_STATUS';
      const data = error.response?.data || 'NO_DATA';
      console.warn(`[API ERROR] [${method} ${url}] Status:`, status, 'Data:', data);
    }

    if (error.response && error.response.status === 401) {
      // Token is invalid or expired — clear all auth state
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('delegationToken');
        sessionStorage.removeItem('delegationMentorName');
        sessionStorage.removeItem('delegationStudentName');
        fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {});
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
