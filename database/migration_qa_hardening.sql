
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age INT NULL,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL;

UPDATE users SET role = 'viewer' WHERE role IN ('coordinator', 'faculty');
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'viewer') NOT NULL DEFAULT 'viewer';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS document_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS version VARCHAR(50) NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS document_date DATE NULL,
  ADD COLUMN IF NOT EXISTS expiry_date DATE NULL,
  ADD COLUMN IF NOT EXISTS required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks TEXT NULL;

ALTER TABLE interns
  ADD COLUMN IF NOT EXISTS project_id BIGINT NULL,
  ADD INDEX IF NOT EXISTS idx_interns_project (project_id),
  ADD CONSTRAINT fk_interns_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE interns
  DROP FOREIGN KEY interns_ibfk_1,
  MODIFY COLUMN mou_id BIGINT NULL;

ALTER TABLE interns
  ADD CONSTRAINT fk_interns_mou_set_null FOREIGN KEY (mou_id) REFERENCES mous(id) ON DELETE SET NULL;

ALTER TABLE audit_logs
  MODIFY COLUMN action ENUM('INSERT', 'UPDATE', 'DELETE', 'BULK_IMPORT', 'LOGIN') NOT NULL;

CREATE INDEX idx_mous_date ON mous (mou_date);
CREATE INDEX idx_mous_valid_upto ON mous (valid_upto);
CREATE INDEX idx_projects_mou_dates ON projects (mou_id, start_date, end_date);
CREATE INDEX idx_interns_mou_dates ON interns (mou_id, start_date, end_date);
CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read, created_at);
