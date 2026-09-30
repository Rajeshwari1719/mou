# Server operations

Copy `.env.example` to `.env` for local development and configure a least-privilege `college_mou_dev` user. Never copy server credentials into the Vite client environment.

Install with `npm ci`. Apply migrations with `npm run migrate`; development requires `ALLOW_DATABASE_MIGRATIONS=true`. Production migrations additionally require `ALLOW_PRODUCTION_MIGRATIONS=true` and a reviewed backup/forward migration plan. The runner records checksums in `schema_migrations`, serializes concurrent runs, and refuses destructive SQL or interrupted migrations.

Create the initial Admin only through `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the trusted server environment, then run `node create-admin.js`. Public signup always provisions Viewer.

For API tests, use a separate database whose name contains `test`, set `NODE_ENV=test`, and configure `TEST_DB_*`. `npm test` refuses other configurations. Initialize an empty isolated test database with `npm run test:db:init` and run `npm run migrate` or `npm test` to apply test migrations.

For browser E2E, create `E2E_ADMIN_EMAIL` and a 16+ character `E2E_ADMIN_PASSWORD` only in the isolated test database with `npm run test:e2e:seed`. Run `npm run test:e2e` in `client/`; do not point it at development or production data.

Production document uploads fail closed until a trusted malware scanner module exporting `scanBuffer(buffer, metadata)` is configured with `MALWARE_SCANNER_MODULE`. Implement and validate the deployment scanner adapter before enabling uploads.
