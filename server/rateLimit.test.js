require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const pool = require('./db');
const { getDbConfig } = require('./dbConfig');
const { assertSafeTestDatabase } = require('./test-setup');

test.after(() => pool.end());

test('production rate limiter uses the shared MySQL bucket table', async () => {
  const config = getDbConfig();
  assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: config.database, dbHost: config.host, dbUser: config.user });
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { rateLimit } = require('./rateLimit');
    const middleware = rateLimit({ windowMs: 60_000, limit: 1 });
    const request = { baseUrl: '/test', path: '/shared-limit', ip: '127.0.0.9', body: {} };
    const invoke = () => new Promise((resolve, reject) => middleware(request, { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } }, (error) => error ? reject(error) : resolve({ next: true })));
    assert.deepEqual(await invoke(), { next: true });
    const limited = await invoke();
    assert.equal(limited.code, 429);
    assert.equal(limited.body.error.code, 'RATE_LIMITED');
    const key = crypto.createHash('sha256').update('/test/shared-limit:127.0.0.9:').digest('hex');
    await pool.execute('DELETE FROM api_rate_limits WHERE bucket_key=?', [key]);
  } finally { process.env.NODE_ENV = prior; }
});
