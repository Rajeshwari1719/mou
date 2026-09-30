require('dotenv').config();
const mysql = require('mysql2/promise');
const { assertSafeTestDatabase } = require('./test-setup');
const { getDbConfig } = require('./dbConfig');

const dbConfig = getDbConfig();
const dbName = dbConfig.database || '';
assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName, dbHost: dbConfig.host, dbUser: dbConfig.user });
if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error('Test database name contains unsupported characters.');

(async () => {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Dedicated test database is available: ${dbName}`);
  } finally { await connection.end(); }
})().catch((error) => { console.error(`Test database bootstrap failed (${error.code || 'ERROR'}).`); process.exitCode = 1; });
