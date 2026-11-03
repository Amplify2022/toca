#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/../.." && pwd)"
: "${TOCA_TEST_JDBC_URL:?Set a dedicated local PostgreSQL test URL}"
: "${TOCA_TEST_DB_USER:?Set the test database user}"
: "${TOCA_TEST_DB_PASSWORD:?Set the test database password securely}"
if [[ "${TOCA_TEST_ALLOW_SCHEMA_MIGRATION:-}" != true ]]; then
  echo 'Set TOCA_TEST_ALLOW_SCHEMA_MIGRATION=true only for a dedicated local test database.' >&2
  exit 1
fi
test_libs="$project_root/backend/build/install/amplify-api/lib"
if [[ ! -d "$test_libs" ]]; then
  echo 'Build backend/installDist before running the integration probe.' >&2
  exit 1
fi
if [[ "${TOCA_TEST_USE_DOCKER:-false}" == true ]]; then
  : "${TOCA_TEST_POSTGRES_CONTAINER:?Set the local test PostgreSQL container}"
  docker run --rm --network "container:$TOCA_TEST_POSTGRES_CONTAINER" \
    -e TOCA_TEST_JDBC_URL -e TOCA_TEST_DB_USER -e TOCA_TEST_DB_PASSWORD \
    -e TOCA_TEST_ALLOW_SCHEMA_MIGRATION \
    -v "$test_libs:/app/lib:ro" -v "$script_dir/P1ServiceProbe.java:/probe/P1ServiceProbe.java:ro" \
    gradle:8.14-jdk21 sh -c 'javac -cp "/app/lib/*" -d /tmp /probe/P1ServiceProbe.java && java -cp "/tmp:/app/lib/*" P1ServiceProbe'
else
  command -v javac >/dev/null
  probe_classes="$(mktemp -d)"
  trap 'rm -rf -- "$probe_classes"' EXIT
  javac -cp "$test_libs/*" -d "$probe_classes" "$script_dir/P1ServiceProbe.java"
  java -cp "$probe_classes:$test_libs/*" P1ServiceProbe
fi
