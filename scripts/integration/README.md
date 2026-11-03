# P1 regression integration checks

These probes use real PostgreSQL/application services with a deterministic fake
Spotify gateway. They never contact a real Google or Spotify account. The HTTP
probe uses the real Micronaut filter and controllers on a separate local API.

Use a **dedicated local database whose name contains `test`**. The service probe
applies all Flyway migrations to it. It creates synthetic accounts/bars and
removes them in `finally`; never point it at a database with user data. The
explicit acknowledgement is mandatory:

```bash
export TOCA_TEST_ALLOW_SCHEMA_MIGRATION=true
export TOCA_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:5433/toca_p1_test
export TOCA_TEST_DB_USER=toca_test
# Set TOCA_TEST_DB_PASSWORD securely in your local test environment.
```

Prepare that empty database and its user separately. Build from `backend/` with
Java 21 / Gradle 8.14 (`gradle --no-daemon test installDist`). Then, from the
repository root, run:

```bash
bash scripts/integration/run-p1-services.sh
```

If the host has no JDK, the runner can use the repository's Gradle/JDK image and
the PostgreSQL container's network namespace:

```bash
export TOCA_TEST_USE_DOCKER=true
export TOCA_TEST_POSTGRES_CONTAINER=your-local-test-postgres
export TOCA_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:5432/toca_p1_test
bash scripts/integration/run-p1-services.sh
```

Docker must be available. Preserve the managed environment's proxy/CA trust when
pulling/building images. The runner passes password environment bindings by name;
it does not print credential values.

For the HTTP checks, start a **separate test API**, with `JDBC_URL` pointing to
this same dedicated test database, its credentials, and the following JVM
properties. Keep the ordinary development API on its original port:

```bash
JAVA_OPTS='-Dmicronaut.server.port=8081 -Damplify.requests.worker-enabled=false' \
  backend/build/install/amplify-api/bin/amplify-api
```

With the test API ready:

```bash
export TOCA_TEST_HOST=127.0.0.1
export TOCA_TEST_PORT=8081
export TOCA_TEST_DATABASE=toca_p1_test
export TOCA_TEST_POSTGRES_CONTAINER=your-local-test-postgres
python3 scripts/integration/http_auth_probe.py
```

The HTTP probe is restricted to a loopback address. Fixture cleanup uses `psql`
inside `TOCA_TEST_POSTGRES_CONTAINER` and the specified test database/user. The
test user must be able to delete its synthetic account rows. It binds several
127/8 source addresses, which requires local socket permissions on Linux.
Before creating accounts through HTTP it seeds an authenticated synthetic
session in the selected database and verifies the API can resolve that exact
identity. An API accidentally pointing at a different database fails this guard.

Coverage:

- Nested Db connection reuse with eight concurrent lock waiters.
- QR requirement, old QR revocation and explicit ANYWHERE access.
- Atomic auth limits, denial rollback, mailbox isolation across actual clients,
  ignored spoofed forwarding headers, registration and rotating-email limits.
- Authenticated customer quotas despite changing guest IDs; cheap rejection.
- Idempotent admissions and conflicting-key rejection.
- Session/whitelist changes during metadata lookup prevent a provider mutation.
- Durable remote plans, timeout-after-effect, read-only recovery, single local
  event, worker crash/lease recovery, and ownership fencing before mutations.

These are integration regressions, not live-provider OAuth/playback validation.
