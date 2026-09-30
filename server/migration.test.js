require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('./db');
const { getDbConfig } = require('./dbConfig');
const { assertSafeTestDatabase } = require('./test-setup');
const { runMigrations, listMigrations, baselineDefinitions } = require('./migrationRunner');

test.after(() => pool.end());

test('isolated MySQL migration history is complete and idempotent', async () => {
  const config = getDbConfig();
  assertSafeTestDatabase({ nodeEnv: process.env.NODE_ENV, dbName: config.database, dbHost: config.host, dbUser: config.user });
  const applied = await runMigrations({ pool, nodeEnv: 'test', dbName: config.database, dbHost: config.host, dbUser: config.user });
  assert.deepEqual(applied, []);
  const [rows] = await pool.query('SELECT version, state FROM schema_migrations ORDER BY version');
  assert.deepEqual(rows.map(({ version, state }) => [version, state]), (await listMigrations()).map((version) => [version, 'applied']));
  const [dateRows] = await pool.query("SELECT DATE_FORMAT(CAST('2026-09-29' AS DATE), '%Y-%m-%d') AS date_only");
  assert.equal(dateRows[0].date_only, '2026-09-29');
});

test('migration runner refuses an untracked existing schema without executing the baseline', async () => {
  const statements = [];
  const connection = {
    query: async (sql) => { statements.push(sql); return [[{ acquired: 1 }]]; },
    execute: async (sql) => {
      statements.push(sql);
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'users' }]];
      throw new Error('Unexpected statement in refusal test.');
    },
    release: () => {},
  };
  const fakePool = { getConnection: async () => connection };
  await assert.rejects(
    runMigrations({ pool: fakePool, nodeEnv: 'test', dbName: 'college_mou_test', dbHost: '127.0.0.1', dbUser: 'test_user' }),
    /Refusing to run the initial baseline against an existing schema/
  );
  assert.equal(statements.some((sql) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)), false);
});

test('migration runner refuses an empty history table on an existing schema', async () => {
  const statements = [];
  const connection = {
    query: async (sql) => { statements.push(sql); return [[{ acquired: 1 }]]; },
    execute: async (sql) => {
      statements.push(sql);
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'users' }, { TABLE_NAME: 'schema_migrations' }]];
      if (sql === 'SELECT version, state FROM schema_migrations') return [[]];
      throw new Error('Unexpected statement in empty-history refusal test.');
    },
    release: () => {},
  };
  await assert.rejects(
    runMigrations({ pool: { getConnection: async () => connection }, nodeEnv: 'test', dbName: 'college_mou_test', dbHost: '127.0.0.1', dbUser: 'test_user' }),
    /Refusing to run the initial baseline against an existing schema/
  );
  assert.equal(statements.some((sql) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)), false);
});

test('baseline schema parser identifies expected legacy columns', async () => {
  const { tables, indexes, foreignKeys } = await baselineDefinitions();
  assert.ok(tables.get('users').has('role'));
  assert.ok(tables.get('mous').has('valid_upto'));
  assert.ok(tables.has('documents'));
  assert.ok(indexes.some((index) => index.table === 'mous' && index.columns.join(',') === 'college_id,mou_date' && index.unique));
  assert.ok(foreignKeys.some((key) => key.table === 'interns' && key.columns.includes('project_id') && key.deleteRule === 'SET NULL'));
});
