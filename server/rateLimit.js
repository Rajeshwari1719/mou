const crypto = require('node:crypto');
const localWindows = new Map();

const rateLimit = ({ windowMs, limit, code = 'RATE_LIMITED' }) => async (req, res, next) => {
  const key = `${req.baseUrl}${req.path}:${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`;
  const localKey = crypto.createHash('sha256').update(key).digest('hex');
  try {
    let count;
    if (process.env.NODE_ENV === 'production') {
      const pool = require('./db');
      const bucket = localKey;
      const now = Date.now();
      await pool.execute(`INSERT INTO api_rate_limits (bucket_key, window_started_at, request_count) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE
        request_count=IF(window_started_at <= ?, 1, request_count + 1),
        window_started_at=IF(window_started_at <= ?, VALUES(window_started_at), window_started_at)`,
      [bucket, now, now - windowMs, now - windowMs]);
      const [rows] = await pool.execute('SELECT request_count FROM api_rate_limits WHERE bucket_key=?', [bucket]);
      count = Number(rows[0]?.request_count || 0);
      if (Math.random() < 0.005) await pool.execute('DELETE FROM api_rate_limits WHERE window_started_at < ?', [now - 24 * 60 * 60 * 1000]);
    } else {
      const now = Date.now();
      let entry = localWindows.get(localKey);
      if (!entry || now - entry.startedAt >= windowMs) { entry = { startedAt: now, count: 0 }; localWindows.set(localKey, entry); }
      entry.count += 1;
      count = entry.count;
    }
    if (count > limit) return res.status(429).json({ success: false, error: { code, message: 'Too many requests. Please try again later.' } });
    next();
  } catch {
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Request protection is temporarily unavailable.' } });
    next();
  }
};

module.exports = { rateLimit };
