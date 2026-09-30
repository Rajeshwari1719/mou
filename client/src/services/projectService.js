import api from './api';

export const projectService = {
  getProjects: async () => (await api.get('/projects')).data,
  getProject: async (id) => (await api.get(`/projects/${id}`)).data,
  createProject: async (payload) => (await api.post('/projects', payload)).data,
  updateProject: async (id, payload) => (await api.put(`/projects/${id}`, payload)).data,
  deleteProject: async (id) => (await api.delete(`/projects/${id}`)).data,
  importProjects: async (formData) => (await api.post('/projects/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
};

export default projectService;
