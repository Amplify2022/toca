#!/usr/bin/env bash
set -euo pipefail
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE toca_app LOGIN PASSWORD %L', :'app_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='toca_app') \gexec
SELECT format('ALTER ROLE toca_app PASSWORD %L', :'app_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO toca_app',current_database()) \gexec
GRANT USAGE ON SCHEMA public TO toca_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO toca_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO toca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO toca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO toca_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT 'REVOKE ALL ON TABLE flyway_schema_history FROM toca_app' WHERE to_regclass('public.flyway_schema_history') IS NOT NULL \gexec
SQL
