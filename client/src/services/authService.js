import api from './api';

const authService = {
  signup: async (userData) => (await api.post('/auth/signup', userData)).data,
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const user = response.data.user || response.data;
    const token = response.data.token;

    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    return { user, token };
  },

  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    const user = response.data.user;
    if (user) localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  updateProfile: async (userData) => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const response = await api.put('/auth/profile', userData);
    const updatedUser = response.data.user || { ...currentUser, ...userData };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return { user: updatedUser };
  },

  changePassword: async (currentPassword, newPassword) => {
    return (await api.put('/auth/password', { currentPassword, newPassword })).data;
  },
};

export default authService;
