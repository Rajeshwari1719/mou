ALTER TABLE audit_logs
  ADD COLUMN request_id VARCHAR(36) NULL AFTER user_agent;

ALTER TABLE notifications
  ADD COLUMN reminder_key VARCHAR(190) NULL AFTER type;

CREATE UNIQUE INDEX uq_notifications_user_reminder
  ON notifications (user_id, reminder_key);
