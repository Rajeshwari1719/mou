# Operations runbook (pre-deployment)

This is an operator checklist, not a cloud deployment recipe. Malware scanning must be configured before production uploads are enabled.

## Database backup and restore

1. Before a release or migration, take a consistent MySQL backup with `mysqldump --single-transaction --routines --triggers` using a least-privilege backup identity. Protect the dump as sensitive production data and record its checksum and retention expiry.
2. Restore the dump to an isolated MySQL instance using a dedicated restore identity. Verify table counts, foreign keys, migration history, and representative MOU/document references before considering the backup usable.
3. Never validate restore procedures against the source production database. Retain encrypted backups according to the organization’s retention policy and securely expire them.

## Alerting and health

- Poll `GET /health/live` for process liveness and `GET /health/ready` for database/configuration/migration readiness.
- Alert on repeated readiness failures, elevated 5xx/429 rates, database connection saturation, failed scheduled jobs, disk/storage capacity, and malware scanner timeout/rejection rates.
- Correlate API log entries with `X-Request-ID`; logs intentionally omit request bodies, passwords, tokens, and secrets. Route logs to access-controlled storage with a defined retention policy.
- Confirm notification job completion and shared rate-limit table health during release checks.

## Release and rollback

1. Require a reviewed change set, clean dependency audit, passing backend/frontend/E2E/migration tests, and a successful isolated restore rehearsal.
2. Rotate credentials as needed (below), deploy the application artifact, and check liveness/readiness and representative Admin/Viewer flows.
3. Take a backup before schema changes. Migrations are forward-only; do not roll back by dropping/rewinding schema. If a migration fails, stop release, inspect its `applying` history row, restore or apply a reviewed forward repair, then rerun checks.
4. Application rollback is permitted only when the previous application version remains compatible with the migrated schema. Otherwise, issue a reviewed forward fix.
5. Keep production document uploads disabled until a trusted malware-scanner adapter is installed, verified, and monitored.

## Database migrations

Read [database/migrations/README.md](database/migrations/README.md). Never run `001_initial_schema.sql` against an existing installation as a reconciliation strategy. Compare its actual schema read-only, review differences with the database owner, prepare a new forward migration, take a backup, and rehearse on a restored isolated copy first. Production execution requires the explicit migration flag and a separately approved release procedure.

## Credential rotation and JWT invalidation

1. Provision a new database password and update the trusted server environment; do not place server secrets in `VITE_*` or commit environment files.
2. Generate a new high-entropy JWT signing secret and deploy it to all API instances. Since tokens are signed with the secret and no old-secret fallback is configured, changing it invalidates all existing JWTs; users must sign in again. Do not retain the old secret as a verification fallback.
3. Restart/redeploy all API processes together, verify database readiness and a fresh login, then revoke the old database credential after confirming all clients use the new one.
4. If a credential was exposed, rotate immediately, invalidate affected sessions/tokens, inspect access logs, and document the incident without recording secret values.
