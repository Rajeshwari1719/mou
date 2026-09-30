import api from './api';

export const reportService = {
  getReports: async () => (await api.get('/reports')).data,
  exportReport: async (type) => (await api.get(`/reports/export/${type}`, { responseType: 'blob' })).data,
};

export default reportService;
