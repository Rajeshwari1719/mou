const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const allowedOrigins = new Set((process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean));

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], objectSrc: ["'none'"] } },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const startedAt = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 || body?.success === false) {
      const status = res.statusCode === 422 ? 400 : (res.statusCode >= 400 ? res.statusCode : 500);
      const codeByStatus = { 400: 'VALIDATION_ERROR', 401: 'AUTHENTICATION_ERROR', 403: 'AUTHORIZATION_ERROR', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' };
      const nested = body?.error && typeof body.error === 'object' ? body.error : null;
      const message = status >= 500 ? 'An unexpected server error occurred.' : (nested?.message || body?.message || (typeof body?.error === 'string' ? body.error : 'The request could not be processed.'));
      const fields = nested?.fields || body?.fields;
      res.status(status);
      return originalJson({ success: false, error: { code: nested?.code || codeByStatus[status] || 'REQUEST_ERROR', message, ...(fields ? { fields } : {}) } });
    }
    return originalJson(body);
  };
  res.on('finish', () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', requestId: req.requestId, userId: req.userId || null, method: req.method, route: req.route?.path || req.path, statusCode: res.statusCode, responseTimeMs: Date.now() - startedAt })));
  next();
});
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.has(origin)); }, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'], maxAge: 600 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const authRoutes = require('./routes/auth');
const collegesRoutes = require('./routes/colleges');
const departmentsRoutes = require('./routes/departments');
const mousRoutes = require('./routes/mous');
const mouImportRoutes = require('./routes/mou-import');
const resourcesRoutes = require('./routes/resources');
const projectsRoutes = require('./routes/projects');
const adminResourcesRoutes = require('./routes/admin-resources');

app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegesRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/mous', mousRoutes);
app.use('/api/mous', mouImportRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api', resourcesRoutes);
app.use('/api', adminResourcesRoutes);

app.get('/health/live', (_req, res) => res.json({ success: true, status: 'live' }));
app.get('/health/ready', async (_req, res, next) => {
  try {
    if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.JWT_SECRET) return res.status(503).json({ success: false, status: 'not_ready' });
    const pool = require('./db');
    await pool.query('SELECT 1');
    const [migrations] = await pool.execute("SELECT version FROM schema_migrations WHERE state='applied' ORDER BY version");
    const expectedMigrations = await require('./migrationRunner').listMigrations();
    if (JSON.stringify(migrations.map((row) => row.version)) !== JSON.stringify(expectedMigrations)) return res.status(503).json({ success: false, status: 'not_ready' });
    res.json({ success: true, status: 'ready' });
  } catch (error) { next(error); }
});
app.get('/health', (_req, res) => res.json({ success: true, status: 'live' }));

app.use((req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
app.use((err, req, res, _next) => {
  const oversized = err.code === 'LIMIT_FILE_SIZE' || err.type === 'entity.too.large';
  const malformedJson = err instanceof SyntaxError && err.status === 400 && Object.hasOwn(err, 'body');
  const status = Number(err.status || err.statusCode) || (oversized ? 413 : malformedJson ? 400 : 500);
  const code = ({ 400: 'VALIDATION_ERROR', 401: 'AUTHENTICATION_ERROR', 403: 'AUTHORIZATION_ERROR', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' })[status] || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', requestId: req.requestId, code, statusCode: status }));
  res.status(status).json({ success: false, error: { code, message: status >= 500 ? 'An unexpected server error occurred.' : status === 413 ? 'The uploaded payload exceeds the allowed size.' : (err.publicMessage || 'The request could not be processed.') } });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  const server = app.listen(port, () => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'MOU API started', port }));
    if (process.env.NODE_ENV !== 'test') require('./jobs-expiryReminderJob').startExpiryReminderJob();
  });
  server.on('error', (error) => { console.error(JSON.stringify({ level: 'error', code: error.code || 'STARTUP_ERROR' })); process.exit(1); });
}

module.exports = app;
