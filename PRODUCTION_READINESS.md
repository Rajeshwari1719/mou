# Part 1 production-readiness status — 2026-09-29

No cloud resources were created or changed. No schema migration or data mutation was run against the configured `college_mou` database. Malware scanning is excluded from the requested final-fix scope and remains a production upload blocker.

## Completed

- Public signup always provisions Viewer; UI and HTTP tests reject Admin role escalation attempts.
- Tests require `NODE_ENV=test` and an isolated test-named database. Backend HTTP/RBAC, validation, migration, import, audit, date, dashboard, document and notification cases pass on an isolated MySQL 8 instance.
- Added migration-history checksums, a named lock, destructive SQL guards and schema compatibility checks. The runner refuses an untracked existing schema by default. With explicit `ADOPT_EXISTING_SCHEMA=true`, it verifies baseline tables, columns, index uniqueness/order, and foreign-key relationships/delete behavior, then records the baseline as adopted without executing baseline SQL; later forward migrations then run normally.
- Read-only comparison of the configured MySQL schema against a fresh migrated baseline found matching baseline columns and data definitions. It lacks `audit_logs.request_id`, `notifications.reminder_key`, the reminder uniqueness index, `api_rate_limits`, and `schema_migrations`. Existing `interns` indexes/foreign-key names differ, but the compared columns and delete behavior are equivalent. Existing forward migrations `002_audit_and_reminder_keys.sql` and `003_shared_rate_limits.sql` provide the missing application changes. The configured schema has no migration history, so an operator must review and explicitly adopt it before those migrations can be applied.
- Tested baseline adoption and migrations on a separate empty `college_mou_legacy_test` database: the baseline was recorded as adopted, migrations 002 and 003 applied, and all expected columns/tables were present. This test did not use `college_mou`.
- Added Admin/Viewer browser workflows for MOU creation, Viewer restrictions, document upload/download/delete, CSV preview/commit, backend notification fetch/read state, and profile updates.
- Notifications UI now consumes the backend notification API and persists read state instead of independently calculating a separate frontend feed.
- Updated route-level lazy loading. The largest individual JavaScript chunk is now about 399 kB (jsPDF), down from the earlier ~783 kB combined chunk warning; the build has no over-500-kB warning.
- Fixed the ExcelJS `uuid` advisory with an ExcelJS-scoped compatible `uuid@11.1.1+` override and fixed the frontend `fast-uri` advisory through a compatible lockfile update. Both complete dependency audits report zero vulnerabilities.
- Inspected all files in `server/uploads`; read-only database path matching is recorded in [UPLOADS_RECONCILIATION.md](UPLOADS_RECONCILIATION.md). One file maps to document ID 3; eight files have no reference in the configured database. All were retained. Duplicate hashes are documented without treating duplicates as disposable.
- Added backup/restore, alerting, release, migration and credential-rotation procedures in [OPERATIONS.md](OPERATIONS.md).
- Secret-pattern scan found no embedded credentials in source/docs/configuration; only documented placeholders matched. Local `server/.env` remains ignored by Git rules. The workspace has no `.git` metadata, so tracked-file/history status could not be independently verified.

## Remaining before production

### Excluded from this request

- Implement/configure a real malware scanner and test its failure/rejection behavior before enabling production uploads. Current production behavior fails closed.

### Manual operator actions

- Back up and rehearse restore of the actual target database. Review the read-only comparison, then explicitly adopt its baseline and apply migrations 002/003 using the reviewed migration procedure. No live migration was run in this work.
- Rotate the database account password and JWT signing secret before shared deployment. Deploy the new signing secret to every API instance together; there is no previous-secret fallback, so all current JWTs will fail signature validation and users must sign in again. Revoke the old DB credential after confirming all clients use the replacement.
- Review the eight unreferenced upload files against any other database copy/backup and retention requirements before deciding whether to delete them. They remain in place.
- Configure production alert routing, backup retention, and scanner operations for the target environment.

## Exact verification results

All automated checks ran against isolated `college_mou_test` on temporary MySQL 8 at port 33407, except dependency audits (npm registry) and read-only schema/upload inspection (configured `college_mou`).

- `npm.cmd test` in `server/`: **21 passed, 0 failed** (unit, HTTP integration, RBAC, imports, audit, notifications, dates/dashboard, and migration checks, including refusal for an empty history table on an existing schema).
- `npm.cmd run migrate` on the isolated baseline-shaped `college_mou_legacy_test`: **passed**; baseline adoption skipped baseline SQL and applied migrations 002 and 003. History check showed 001/002/003 applied and expected new objects present.
- `npm.cmd run test:e2e -- --reporter=line` in `client/`: **2 passed, 0 failed**.
- `npm.cmd run lint` in `client/`: **passed**.
- `npm.cmd run build` in `client/`: **passed**; largest emitted JavaScript chunk 399.18 kB.
- `node --check` over 32 backend JavaScript files: **passed**.
- `npm.cmd audit` in `server/`: **0 vulnerabilities**.
- `npm.cmd audit` in `client/`: **0 vulnerabilities**.
- No cloud deployment, production data write, or migration against `college_mou` was performed.
