import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // FormData must be sent with the browser-generated multipart boundary.
  // Remove the JSON default header inherited from the Axios instance.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    delete config.headers['content-type'];
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data;
    if (payload?.error && typeof payload.error === 'object') {
      error.message = payload.error.message || error.message;
      error.fields = payload.error.fields || {};
      error.code = payload.error.code;
    } else if (payload?.message || payload?.error) {
      error.message = payload.message || payload.error;
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
