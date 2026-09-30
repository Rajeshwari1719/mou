const assert = require('node:assert/strict');

const assertSafeTestDatabase = ({ nodeEnv, dbName, dbHost = '', dbUser = '' }) => {
  assert.equal(nodeEnv, 'test', 'Tests require NODE_ENV=test.');
  assert.match(dbName || '', /test/i, 'Tests require a dedicated test database name.');
  assert.doesNotMatch(dbName || '', /prod|production/i, 'Tests refuse production database names.');
  assert.doesNotMatch(`${dbHost} ${dbUser}`, /prod|production/i, 'Tests refuse production database configuration.');
};

module.exports = { assertSafeTestDatabase };
