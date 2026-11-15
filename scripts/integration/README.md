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

- Owner dashboard analytics: successful commands only, distinct/recurrent users,
  repeated songs, comparable periods, local calendar boundaries, venue isolation,
  explicit zero/empty JSON and income left unconfigured. The HTTP probe checks
  owner authorization and private caching. With `TOCA_TEST_WEB_URL`, Chromium
  opens the actual dashboard against PostgreSQL and verifies zero activity,
  period switching and the absence of legacy player/request panels.
- Nested Db connection reuse with eight concurrent lock waiters.
- Distance-only access without QR, 99/101 meter boundary checks, expiry and explicit ANYWHERE access.
- Presence HTTP responses are private and uncached, grants remain scoped to the
  customer/bar, and expiry and precision remain enforced. With
  `TOCA_TEST_WEB_URL`, Chromium verifies temporary GPS failure recovery,
  consecutive requests without extra GPS, expiry, and retries without reload
  against the real API/PostgreSQL (GPS itself is simulated).
- Separate playback cycles after automatic restarts: historical requests do not
  occupy waiting positions, current location grants survive, retries preserve
  the cycle, and explicit repeat requests get a current queue timestamp. V22
  also backfills previously confirmed restarts without resetting the session.
- Atomic auth limits, denial rollback, mailbox isolation across actual clients,
  ignored spoofed forwarding headers, registration and rotating-email limits.
- Authenticated customer quotas despite changing guest IDs; cheap rejection.
- Idempotent admissions and conflicting-key rejection.
- Session/whitelist changes during metadata lookup prevent a provider mutation.
- Durable remote plans, automatic timeout-after-effect confirmation, resumed
  known plans without bar approval, single local event, concurrent recovery,
  worker crash/lease recovery, and ownership fencing before mutations.

These are integration regressions, not live-provider OAuth/playback validation.

La sonda también comprueba el saldo inicial cero, las recargas simuladas sin doble acreditación, el gasto concurrente del último token, las reservas, las devoluciones y la recuperación de pedidos sin un segundo descuento. La prueba HTTP valida que la identidad del bar no autorice una billetera de cliente. Con `TOCA_TEST_WEB_URL=http://localhost:5174`, también abre el perfil en Chromium y verifica una recarga persistida contra la API y PostgreSQL reales.

Para comprobar también el POST real de un pedido sin saldo, iniciar la API de prueba con `SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true` y ejecutar la sonda HTTP con `TOCA_TEST_REQUEST_FLOW=true`. El bar es sintético y el saldo es cero: la petición debe devolver `INSUFFICIENT_TOKENS` antes de consultar Spotify y no debe crear un pedido en el panel del bar. Si se pasa `TOCA_TEST_WEB_URL`, Chromium comprueba que esa respuesta abre el panel de recarga del usuario sin un aviso genérico de error. El servidor estático de estas pruebas puede elegirse con `TOCA_WEB_URL`.

La sonda también verifica las ediciones del administrador (V17): exclusión con pedidos, snapshots desactualizados, respuestas perdidas, recuperación de creación y reintentos sin escrituras duplicadas.
