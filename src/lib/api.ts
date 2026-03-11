import axios from 'axios';
import Cookies from 'js-cookie';

// In production, NEXT_PUBLIC_API_URL should point to the deployed Express server
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to automatically add the custom JWT token to every request
api.interceptors.request.use(
  (config) => {
    // We store the custom JWT in a cookie named 'auth_token'
    const token = Cookies.get('auth_token');
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
