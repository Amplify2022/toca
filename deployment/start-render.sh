#!/bin/sh
set -eu

: "${RENDER_EXTERNAL_URL:?Set the public HTTPS URL}"
: "${JDBC_URL:?Set the runtime JDBC URL}"
: "${DB_USERNAME:?Set the restricted database username}"
: "${DB_PASSWORD:?Set the restricted database password}"
: "${TOCA_MIGRATION_JDBC_URL:?Set the migration JDBC URL}"
: "${TOCA_MIGRATION_DB_USERNAME:?Set the migration database username}"
: "${TOCA_MIGRATION_DB_PASSWORD:?Set the migration database password}"

export FRONTEND_ORIGIN="$RENDER_EXTERNAL_URL"
export SPOTIFY_REDIRECT_URI="$RENDER_EXTERNAL_URL/api/integrations/spotify/callback"

JDBC_URL="$TOCA_MIGRATION_JDBC_URL" DB_USERNAME="$TOCA_MIGRATION_DB_USERNAME" \
 DB_PASSWORD="$TOCA_MIGRATION_DB_PASSWORD" TOCA_DB_SCHEMA=toca \
 java -cp '/app/lib/*' com.amplify.api.MigrateKt

unset TOCA_MIGRATION_JDBC_URL TOCA_MIGRATION_DB_USERNAME TOCA_MIGRATION_DB_PASSWORD
exec /app/bin/amplify-api
