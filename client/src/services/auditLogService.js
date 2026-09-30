import api from './api';

export const auditLogService = {
  // Get all audit logs
  getLogs: async (filters = {}) => {
    const response = await api.get('/audit-logs', { params: filters });
    return response.data;
  },

  // Get single audit log
  getLog: async (id) => {
    const response = await api.get(`/audit-logs/${id}`);
    return response.data;
  },

  // Get logs by entity
  getLogsByEntity: async (entityType, entityId, filters = {}) => {
    const response = await api.get(`/audit-logs/entity/${entityType}/${entityId}`, {
      params: filters,
    });
    return response.data;
  },

  // Get logs by user
  getLogsByUser: async (userId, filters = {}) => {
    const response = await api.get(`/audit-logs/user/${userId}`, {
      params: filters,
    });
    return response.data;
  },

  // Export audit logs
  exportLogs: async (filters = {}) => {
    const response = await api.get('/audit-logs/export', {
      params: filters,
      responseType: 'blob',
    });
    return response.data;
  },

  // Get audit log statistics
  getStats: async (filters = {}) => {
    const response = await api.get('/audit-logs/stats', { params: filters });
    return response.data;
  },

  // Clear old logs (admin)
  clearOldLogs: async (days) => {
    const response = await api.post('/audit-logs/clear-old', { days });
    return response.data;
  },
};

export default auditLogService;
