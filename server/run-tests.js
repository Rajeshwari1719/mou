require('dotenv').config();
const { spawnSync } = require('node:child_process');
const { assertSafeTestDatabase } = require('./test-setup');
const { getDbConfig } = require('./dbConfig');

try {
  const config = getDbConfig();
  assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: config.database, dbHost: config.host, dbUser: config.user });
} catch (error) {
  console.error(`Test run refused: ${error.message}`);
  process.exit(1);
}

const pool = require('./db');
const { runMigrations } = require('./migrationRunner');
runMigrations({ pool, nodeEnv: process.env.NODE_ENV, ...getDbConfig() })
  .then(async () => {
    await pool.end();
    const result = spawnSync(process.execPath, ['--test', 'validation.test.js', 'migration.test.js', 'rateLimit.test.js', 'integration.test.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    process.exit(result.status ?? 1);
  })
  .catch(async (error) => {
    console.error(`Tests refused or migrations failed (${error.code || 'ERROR'}): ${error.message}`);
    await pool.end();
    process.exit(1);
  });
