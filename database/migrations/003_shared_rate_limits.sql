CREATE TABLE api_rate_limits (
  bucket_key CHAR(64) NOT NULL,
  window_started_at BIGINT NOT NULL,
  request_count INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket_key),
  KEY idx_rate_limits_window (window_started_at)
) ENGINE=InnoDB;
