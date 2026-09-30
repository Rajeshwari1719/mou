const getDbConfig = (env = process.env) => {
  const test = env.NODE_ENV === 'test';
  const testValue = (name, fallback) => {
    if (!test || !Object.prototype.hasOwnProperty.call(env, `TEST_${name}`)) return fallback;
    const value = env[`TEST_${name}`];
    return name === 'DB_PASSWORD' && value === '__EMPTY__' ? '' : value;
  };
  return {
    host: testValue('DB_HOST', env.DB_HOST || '127.0.0.1'),
    port: Number(testValue('DB_PORT', env.DB_PORT)) || 3306,
    user: testValue('DB_USER', env.DB_USER),
    password: testValue('DB_PASSWORD', env.DB_PASSWORD),
    database: testValue('DB_NAME', env.DB_NAME),
  };
};

module.exports = { getDbConfig };
