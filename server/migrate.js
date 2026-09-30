require('dotenv').config();
const pool = require('./db');
const { runMigrations } = require('./migrationRunner');
const { getDbConfig } = require('./dbConfig');

runMigrations({ pool, ...getDbConfig() })
  .then((applied) => console.log(JSON.stringify({ success: true, applied })))
  .catch((error) => { console.error(JSON.stringify({ success: false, message: error.message })); process.exitCode = 1; })
  .finally(() => pool.end());
