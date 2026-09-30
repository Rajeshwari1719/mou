import api from './api';

export const notificationService = {
  getNotifications: async () => (await api.get('/notifications')).data,
  markRead: async (id) => (await api.patch(`/notifications/${id}/read`)).data,
};

export default notificationService;
