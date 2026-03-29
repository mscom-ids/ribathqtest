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
});

// Request interceptor to automatically add the custom JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Support Mentor Delegation Mode (Client-side only)
    if (typeof window !== 'undefined') {
        const actingAs = localStorage.getItem('actingAsMentorId');
        if (actingAs) {
            config.headers['x-acting-as-staff-id'] = actingAs;
        }
        const actingAsStudent = localStorage.getItem('actingAsStudentId');
        if (actingAsStudent) {
            config.headers['x-acting-as-student-id'] = actingAsStudent;
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
      
      // Only redirect if we are in the browser environment
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
