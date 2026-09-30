const mysql = require('mysql2/promise');
require('dotenv').config();
const { getDbConfig } = require('./dbConfig');
const config = getDbConfig();

if (process.env.NODE_ENV === 'test') require('./test-setup').assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: config.database, dbHost: config.host, dbUser: config.user });
if (process.env.NODE_ENV === 'production' && (!config.host || !config.user || !config.password || !config.database || !process.env.JWT_SECRET)) {
  throw new Error('Production database and authentication configuration is incomplete.');
}

const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: ['DATE'],
  timezone: 'Z'
});

module.exports = pool;
