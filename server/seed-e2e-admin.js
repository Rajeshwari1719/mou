require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { getDbConfig } = require('./dbConfig');
const { assertSafeTestDatabase } = require('./test-setup');

(async () => {
  const config = getDbConfig();
  assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: config.database, dbHost: config.host, dbUser: config.user });
  const { E2E_ADMIN_EMAIL: email, E2E_ADMIN_PASSWORD: password } = process.env;
  if (!email || !password || password.length < 16) throw new Error('Set E2E_ADMIN_EMAIL and a 16+ character E2E_ADMIN_PASSWORD.');
  const hash = await bcrypt.hash(password, 12);
  await pool.execute("INSERT INTO users (name,email,password_hash,role) VALUES ('E2E Admin',?,?, 'admin') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='admin'", [email.toLowerCase(), hash]);
  const [users] = await pool.execute('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
  await pool.execute(
    'INSERT IGNORE INTO notifications (mou_id,user_id,title,message,type,reminder_key) VALUES (NULL,?,?,?,?,?)',
    [users[0].id, 'E2E reminder fixture', 'A test reminder for browser notification coverage.', 'Test', `e2e:${users[0].id}:reminder`]
  );
})().catch((error) => { console.error(`E2E fixture refused or failed: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
