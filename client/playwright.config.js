import { defineConfig } from 'playwright/test';
import process from 'node:process';

const required = ['NODE_ENV', 'DB_NAME', 'TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USER', 'TEST_DB_PASSWORD', 'JWT_SECRET', 'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required isolated E2E setting ${key}.`);
if (process.env.NODE_ENV !== 'test' || !/test/i.test(process.env.DB_NAME) || /prod/i.test(process.env.DB_NAME)) throw new Error('E2E requires an isolated test database and NODE_ENV=test.');

const backendEnv = { ...process.env, PORT: '4187', CLIENT_ORIGIN: 'http://127.0.0.1:5178' };
const config = {
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium', headless: true },
};
if (process.env.E2E_EXTERNAL_SERVERS !== 'true') config.webServer = [
    { command: 'node ../server/app.js', port: 4187, reuseExistingServer: false, env: backendEnv },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178', port: 5178, reuseExistingServer: false, env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:4187/api' } },
  ];
export default defineConfig(config);
