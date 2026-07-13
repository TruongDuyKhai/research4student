import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
});

// Request interceptor to inject JWT token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('r4s_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle authorization expiration (401)
client.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Auth endpoints (login, register, /auth/me...) return 401 on bad credentials;
    // the pages handle those errors themselves, so never force-redirect for them.
    const requestUrl = error.config?.url || '';
    const isAuthRequest = requestUrl.includes('/auth/');

    if (error.response && error.response.status === 401 && !isAuthRequest) {
      console.warn('Session expired or unauthorized. Logging out...');
      localStorage.removeItem('r4s_token');
      localStorage.removeItem('r4s_user');

      // Inside the admin area, return to the admin console (it renders its own
      // login screen) instead of the student login page.
      const adminRoute = import.meta.env.VITE_ADMIN_ROUTE || '/portal-mgmt-7f3a';
      const target = window.location.pathname.startsWith(adminRoute) ? adminRoute : '/login';
      if (window.location.pathname !== target) {
        window.location.href = target;
      }
    }
    return Promise.reject(error);
  }
);

export default client;
