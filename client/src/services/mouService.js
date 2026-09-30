import api from './api';

export const mouService = {
  importExcel: async (file, previewToken = null) => {
    const formData = new FormData();
    formData.append('file', file);
    // Let the browser/Axios set the multipart boundary automatically.
    // Manually setting Content-Type can omit the boundary and make multer fail.
    const response = await api.post(`/mous/import-excel${previewToken ? `?preview_token=${encodeURIComponent(previewToken)}` : ''}`, formData);
    return response.data;
  },
  previewImport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return (await api.post('/mous/import-excel?dry_run=true', formData)).data;
  },
  getMous: async (params = {}) => (await api.get('/mous', { params: { page: 1, limit: 100, ...params } })).data,
  getMou: async (id) => (await api.get(`/mous/${id}`)).data,
  createMou: async (payload) => (await api.post('/mous', payload)).data,
  updateMou: async (id, payload) => (await api.put(`/mous/${id}`, payload)).data,
  deleteMou: async (id) => (await api.delete(`/mous/${id}`)).data,
};

export default mouService;
