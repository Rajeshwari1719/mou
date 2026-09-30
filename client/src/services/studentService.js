import api from './api';

export const studentService = {
  getStudents: async () => (await api.get('/students')).data,
  createStudent: async (payload) => (await api.post('/students', payload)).data,
  updateStudent: async (id, payload) => (await api.put(`/students/${id}`, payload)).data,
  deleteStudent: async (id) => (await api.delete(`/students/${id}`)).data,
};

export default studentService;
