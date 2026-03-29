import axios from 'axios';
import Cookies from 'js-cookie';

// In production, NEXT_PUBLIC_API_URL should point to the deployed Express server
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

console.log('>>> [api.ts] API_URL configured as:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // send httpOnly cookies with cross-origin requests
});

// Request interceptor to automatically add the JWT token and delegation token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Attach server-issued delegation token if active
    if (typeof window !== 'undefined') {
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
    console.log(`[API RESPONSE] [${response.config.method?.toUpperCase()} ${response.config.url}] Status:`, response.status);
    return response;
  },
  (error) => {
    const method = error.config?.method?.toUpperCase() || 'UNKNOWN';
    const url = error.config?.url || 'UNKNOWN_URL';
    const status = error.response?.status || 'NO_STATUS';
    const data = error.response?.data || 'NO_DATA';
    console.warn(`[API ERROR] [${method} ${url}] Status:`, status, 'Data:', data);

    if (error.response && error.response.status === 401) {
      // Token is invalid or expired
      Cookies.remove('auth_token');
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('delegationToken');
        sessionStorage.removeItem('delegationMentorName');
        sessionStorage.removeItem('delegationStudentName');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
