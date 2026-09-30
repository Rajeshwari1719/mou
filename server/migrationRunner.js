const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'database', 'migrations');

const assertMigrationEnvironment = ({ nodeEnv, dbName, dbHost = process.env.DB_HOST, dbUser = process.env.DB_USER, allowProduction = false, allowDevelopment = false }) => {
  const database = String(dbName || '');
  if (!database || /prod|production/i.test(database)) {
    if (!(nodeEnv === 'production' && allowProduction && database)) throw new Error('Refusing migration: production database configuration requires explicit production approval.');
  }
  if (nodeEnv === 'test') {
    require('./test-setup').assertSafeTestDatabase({ nodeEnv, dbName: database, dbHost, dbUser });
  } else if (nodeEnv === 'production' && !allowProduction) {
    throw new Error('Production migration requires ALLOW_PRODUCTION_MIGRATIONS=true.');
  } else if (nodeEnv !== 'production' && nodeEnv !== 'test' && !allowDevelopment) {
    throw new Error('Development migration requires ALLOW_DATABASE_MIGRATIONS=true.');
  } else if (nodeEnv !== 'production' && nodeEnv !== 'test' && !/(dev|development|local|sandbox)/i.test(database)) {
    throw new Error('Development migrations require a database name containing dev, local, or sandbox.');
  }
};

const assertNonDestructiveSql = (sql) => {
  const patterns = [
    /\bDROP\s+(?:TABLE|DATABASE|SCHEMA|COLUMN|INDEX|FOREIGN\s+KEY)\b/i,
    /\bTRUNCATE\b/i,
    /\bRENAME\s+TABLE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bUPDATE\s+[a-z_][a-z0-9_]*\s+SET\b/i,
    /\bALTER\s+TABLE\b[\s\S]*?\b(?:MODIFY|CHANGE)\s+(?:COLUMN\s+)?/i,
  ];
  if (patterns.some((pattern) => pattern.test(sql))) throw new Error('Destructive migration SQL is not permitted.');
};

const splitSqlStatements = (sql) => sql
  .replace(/^\s*--.*$/gm, '')
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const listMigrations = async () => (await fs.readdir(MIGRATIONS_DIR))
  .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();

const baselineDefinitions = async () => {
  const migrations = await listMigrations();
  const baseline = migrations.find((name) => name.startsWith('001_'));
  if (!baseline) throw new Error('Initial schema baseline migration is missing.');
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, baseline), 'utf8');
  const tables = new Map();
  const indexes = [];
  const foreignKeys = [];
  const tablePattern = /CREATE TABLE IF NOT EXISTS\s+\x60([^\x60]+)\x60\s*\(([\s\S]*?)\)\s*ENGINE=/gi;
  for (const match of sql.matchAll(tablePattern)) {
    const columns = new Set();
    for (const line of match[2].split(/\r?\n/)) {
      const column = line.match(/^\s*\x60([^\x60]+)\x60\s/);
      if (column) columns.add(column[1]);
      const index = line.match(/^\s*(PRIMARY KEY|(?:(UNIQUE)\s+)?KEY\s+\x60[^\x60]+\x60)\s*\(([^)]+)\)/i);
      if (index) indexes.push({
        table: match[1],
        unique: /^PRIMARY KEY/i.test(index[1]) || Boolean(index[2]),
        columns: [...index[3].matchAll(/\x60([^\x60]+)\x60/g)].map((part) => part[1]),
      });
      const foreignKey = line.match(/CONSTRAINT\s+\x60[^\x60]+\x60\s+FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+\x60([^\x60]+)\x60\s*\(([^)]+)\)(.*)$/i);
      if (foreignKey) {
        const rule = (name) => foreignKey[4].match(new RegExp(`ON ${name} ([A-Z ]+)`, 'i'))?.[1]?.toUpperCase() || 'NO ACTION';
        foreignKeys.push({
          table: match[1],
          columns: [...foreignKey[1].matchAll(/\x60([^\x60]+)\x60/g)].map((part) => part[1]),
          referencedTable: foreignKey[2],
          referencedColumns: [...foreignKey[3].matchAll(/\x60([^\x60]+)\x60/g)].map((part) => part[1]),
          updateRule: rule('UPDATE'),
          deleteRule: rule('DELETE'),
        });
      }
    }
    tables.set(match[1], columns);
  }
  return { filename: baseline, sql, tables, indexes, foreignKeys };
};

const validateExistingBaseline = async (connection, dbName) => {
  const { tables, indexes, foreignKeys } = await baselineDefinitions();
  const [rows] = await connection.execute(
    'SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=?',
    [dbName]
  );
  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.TABLE_NAME)) actual.set(row.TABLE_NAME, new Set());
    actual.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  const missing = [];
  for (const [table, columns] of tables) {
    if (!actual.has(table)) missing.push(`${table} (table)`);
    else for (const column of columns) if (!actual.get(table).has(column)) missing.push(`${table}.${column}`);
  }
  if (missing.length) throw new Error(`Existing schema does not match the initial baseline; no baseline was applied. Missing: ${missing.join(', ')}. Create a reviewed forward-only migration.`);

  const [actualIndexRows] = await connection.execute(
    'SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX',
    [dbName]
  );
  const actualIndexes = new Map();
  for (const row of actualIndexRows) {
    const key = `${row.TABLE_NAME}:${row.INDEX_NAME}`;
    if (!actualIndexes.has(key)) actualIndexes.set(key, { table: row.TABLE_NAME, unique: Number(row.NON_UNIQUE) === 0, columns: [] });
    actualIndexes.get(key).columns.push(row.COLUMN_NAME);
  }
  const compatibleIndexes = [...actualIndexes.values()];
  const missingIndexes = indexes.filter((expected) => !compatibleIndexes.some((actualIndex) => (
    actualIndex.table === expected.table
    && actualIndex.unique === expected.unique
    && JSON.stringify(actualIndex.columns) === JSON.stringify(expected.columns)
  )));
  if (missingIndexes.length) throw new Error(`Existing schema is missing baseline indexes; no baseline was applied. Missing: ${missingIndexes.map((index) => `${index.table}(${index.columns.join(',')})`).join(', ')}. Create a reviewed forward-only migration.`);

  const [actualForeignRows] = await connection.execute(
    `SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
            r.UPDATE_RULE, r.DELETE_RULE, k.ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
       JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
      WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [dbName]
  );
  const actualForeignKeys = new Map();
  for (const row of actualForeignRows) {
    const key = `${row.TABLE_NAME}:${row.CONSTRAINT_NAME}`;
    if (!actualForeignKeys.has(key)) actualForeignKeys.set(key, {
      table: row.TABLE_NAME, columns: [], referencedTable: row.REFERENCED_TABLE_NAME,
      referencedColumns: [], updateRule: row.UPDATE_RULE, deleteRule: row.DELETE_RULE,
    });
    actualForeignKeys.get(key).columns.push(row.COLUMN_NAME);
    actualForeignKeys.get(key).referencedColumns.push(row.REFERENCED_COLUMN_NAME);
  }
  const compatibleForeignKeys = [...actualForeignKeys.values()];
  const missingForeignKeys = foreignKeys.filter((expected) => !compatibleForeignKeys.some((actualKey) => (
    actualKey.table === expected.table
    && JSON.stringify(actualKey.columns) === JSON.stringify(expected.columns)
    && actualKey.referencedTable === expected.referencedTable
    && JSON.stringify(actualKey.referencedColumns) === JSON.stringify(expected.referencedColumns)
    && actualKey.updateRule === expected.updateRule
    && actualKey.deleteRule === expected.deleteRule
  )));
  if (missingForeignKeys.length) throw new Error(`Existing schema is missing or differs from baseline foreign keys; no baseline was applied. Differences: ${missingForeignKeys.map((key) => `${key.table}(${key.columns.join(',')})->${key.referencedTable}(${key.referencedColumns.join(',')})`).join(', ')}. Create a reviewed forward-only migration.`);
  return tables;
};

const runMigrations = async ({ pool, nodeEnv = process.env.NODE_ENV, dbName = process.env.DB_NAME, dbHost = process.env.DB_HOST, dbUser = process.env.DB_USER, allowProduction = process.env.ALLOW_PRODUCTION_MIGRATIONS === 'true', allowDevelopment = process.env.ALLOW_DATABASE_MIGRATIONS === 'true', adoptExisting = process.env.ADOPT_EXISTING_SCHEMA === 'true' }) => {
  assertMigrationEnvironment({ nodeEnv, dbName, dbHost, dbUser, allowProduction, allowDevelopment });
  const connection = await pool.getConnection();
  let lockHeld = false;
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('college_mou_schema_migrations', 10) AS acquired");
    if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Could not acquire the migration lock.');
    lockHeld = true;
    const { filename: baselineFilename, sql: baselineSql, tables: baselineTables } = await baselineDefinitions();
    const [existingTableRows] = await connection.execute(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=?',
      [dbName]
    );
    const hasApplicationTables = existingTableRows.some(({ TABLE_NAME }) => baselineTables.has(TABLE_NAME));
    const hasHistoryTable = existingTableRows.some(({ TABLE_NAME }) => TABLE_NAME === 'schema_migrations');
    const [existingHistoryRows] = hasHistoryTable
      ? await connection.execute('SELECT version, state FROM schema_migrations')
      : [[]];
    const hasRecordedBaseline = existingHistoryRows.some((row) => row.version === baselineFilename);
    if (existingHistoryRows.length && !hasRecordedBaseline) {
      throw new Error('Migration history contains entries but no initial baseline record. Inspect and repair migration history manually; no baseline was applied.');
    }
    if (!hasRecordedBaseline && hasApplicationTables && !adoptExisting) {
      throw new Error('Refusing to run the initial baseline against an existing schema. Compare the schema and use ADOPT_EXISTING_SCHEMA=true only after review.');
    }
    let baselineChecksum;
    if (!hasRecordedBaseline && hasApplicationTables && adoptExisting) {
      await validateExistingBaseline(connection, dbName);
      baselineChecksum = crypto.createHash('sha256').update(baselineSql).digest('hex');
    }
    if (hasRecordedBaseline) await validateExistingBaseline(connection, dbName);

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(190) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      state VARCHAR(20) NOT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_at TIMESTAMP NULL
    ) ENGINE=InnoDB`);
    if (baselineChecksum) {
      await connection.execute(
        'INSERT INTO schema_migrations (version, checksum, state, applied_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [baselineFilename, baselineChecksum, 'applied']
      );
    }

    const applied = [];
    for (const filename of await listMigrations()) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      assertNonDestructiveSql(sql);
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const [rows] = await connection.execute('SELECT checksum, state FROM schema_migrations WHERE version=?', [filename]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`Migration ${filename} changed after being recorded.`);
        if (rows[0].state !== 'applied') throw new Error(`Migration ${filename} is marked incomplete. Inspect the database and recover it manually before retrying.`);
        continue;
      }

      await connection.execute('INSERT INTO schema_migrations (version, checksum, state) VALUES (?, ?, ?)', [filename, checksum, 'applying']);
      try {
        for (const statement of splitSqlStatements(sql)) await connection.query(statement);
        await connection.execute('UPDATE schema_migrations SET state=?, applied_at=CURRENT_TIMESTAMP WHERE version=?', ['applied', filename]);
        applied.push(filename);
      } catch (error) {
        error.message = `Migration ${filename} failed and is marked incomplete for manual inspection: ${error.message}`;
        throw error;
      }
    }
    return applied;
  } finally {
    if (lockHeld) await connection.query("SELECT RELEASE_LOCK('college_mou_schema_migrations')");
    connection.release();
  }
};

module.exports = { runMigrations, assertMigrationEnvironment, assertNonDestructiveSql, splitSqlStatements, listMigrations, baselineDefinitions, validateExistingBaseline };
