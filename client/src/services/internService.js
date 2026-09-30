import api from './api';

export const internService = {
  getInterns: async () => (await api.get('/interns')).data,
  createIntern: async (payload) => (await api.post('/interns', payload)).data,
  updateIntern: async (id, payload) => (await api.put(`/interns/${id}`, payload)).data,
  deleteIntern: async (id) => (await api.delete(`/interns/${id}`)).data,
};

export default internService;
