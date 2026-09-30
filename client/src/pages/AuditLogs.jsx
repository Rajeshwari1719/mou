import { useEffect, useState } from 'react';
import { auditLogService } from '../services/auditLogService';
import { formatDate } from '../utils/formatDate';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  useEffect(() => { auditLogService.getLogs().then((response) => setLogs(response.logs || [])).catch(() => setLogs([])); }, []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Security</p>
        <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <p className="font-medium text-gray-900">{log.action} {log.table_name}</p>
                <p className="text-sm text-gray-500">By {log.user_name || log.user_email || 'Unknown user'}</p>
              </div>
              <span className="text-sm text-gray-500">{formatDate(log.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
