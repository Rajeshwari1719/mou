# Database migrations

`001_initial_schema.sql` is a non destructive baseline for a new database. It uses `CREATE TABLE IF NOT EXISTS`; it does not drop tables. Back up the database before applying any schema change.

For a new installation, create an empty database and use `server/migrate.js` to apply the baseline and subsequent migrations. The runner refuses to execute `001_initial_schema.sql` when it finds an existing application schema without migration history.

For an existing installation, compare its schema with the baseline and review every difference first. If the existing schema is compatible with the baseline, set `ADOPT_EXISTING_SCHEMA=true` for the reviewed migration operation. The runner verifies baseline tables, columns, index uniqueness/order, and foreign-key relationships/delete behavior; it records the baseline checksum as adopted without executing its SQL, then applies later forward migrations. If comparison finds a missing or incompatible baseline object, adoption fails and the difference needs a new reviewed forward-only migration. This switch does not bypass the environment guards or the additional production approval flag. Never set it based only on a database name or an assumption.

`server/migrate.js` applies ordered migrations and records checksums/states in `schema_migrations`. MySQL DDL auto-commits: a failed migration is marked `applying` and the runner refuses to replay it until an operator inspects and repairs the database. The runner rejects destructive SQL (`DROP`, `TRUNCATE`, table rename) for every environment. Development runs require `ALLOW_DATABASE_MIGRATIONS=true`; production additionally requires `ALLOW_PRODUCTION_MIGRATIONS=true`. Tests require a dedicated test database name. Backups and reviewed forward-only migrations are still required.

`database/migration_qa_hardening.sql` is a legacy one off script and is not read by the runner. Inspect the live schema before applying or converting its constraint operations.
