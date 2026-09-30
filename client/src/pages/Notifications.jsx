import { useCallback, useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { formatDate } from '../utils/formatDate';

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const response = await notificationService.getNotifications();
      setNotifications(response.notifications || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const markRead = async (notification) => {
    try {
      await notificationService.markRead(notification.id);
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: 1 } : item));
    } catch (requestError) {
      setError(requestError.message || 'Unable to mark notification as read.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Alerts</p>
        <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
      </div>
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-live="polite">
        {loading ? <p className="text-sm text-gray-500" role="status">Loading notifications...</p>
          : error ? <p className="text-sm text-red-700">{error}</p>
            : notifications.length === 0 ? <p className="text-sm text-gray-500">No notifications yet.</p>
              : notifications.map((notification) => (
                <article key={notification.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{notification.title || 'MOU reminder'}</p>
                      <p className="mt-1 text-sm text-gray-600">{notification.message || notification.body || (notification.college_name ? `${notification.college_name} is approaching its renewal date.` : 'Please review this reminder.')}</p>
                      {notification.created_at && <p className="mt-2 text-xs text-gray-500">{formatDate(notification.created_at)}</p>}
                    </div>
                    {Number(notification.is_read) === 1
                      ? <span className="text-xs text-gray-500">Read</span>
                      : <button type="button" onClick={() => markRead(notification)} className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Mark as read</button>}
                  </div>
                </article>
              ))}
      </div>
    </div>
  );
};

export default NotificationsPage;
