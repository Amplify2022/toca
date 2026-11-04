# Actualización: cuentas, medios, frontend y despliegue

Este lote aborda 11, 13, 14, 18–22, 24, 26–31 y 33–38 del informe. `28.29` se interpreta como dos puntos y el 38 repetido una sola vez.

## Antes de actualizar una instalación existente

Conservá un backup probado. No borres el volumen PostgreSQL.

1. Agregá `APP_DB_PASSWORD` con una contraseña aleatoria distinta de `DB_PASSWORD` en tu `.env` local, sin versionarlo. `DB_USERNAME`/`DB_PASSWORD` siguen siendo la identidad propietaria que ejecuta migraciones; la API usa `toca_app` sin permisos de creación de esquema ni superusuario.
2. En un volumen existente el init de PostgreSQL no se ejecuta de nuevo. Aplicá el script explícitamente contra el contenedor existente:

```bash
docker compose up -d postgres
docker compose exec postgres bash /docker-entrypoint-initdb.d/20-app-role.sh
docker compose up --build -d api web
```

El contenedor PostgreSQL recibe `APP_DB_PASSWORD` desde Compose. El script crea/actualiza el rol y sus permisos; no elimina cuentas ni bares. El servicio `migrate` aplica Flyway como propietario antes de arrancar la API restringida. Para crear el montaje del script en un contenedor existente puede ser necesario recrear el contenedor postgres mediante `docker compose up -d postgres`; conserva el volumen.

No uses `down -v`. Nunca compartas las contraseñas por chat.

## Publicación HTTPS

Configurá DNS, puertos 80/443 y `.env`:

```dotenv
TOCA_DOMAIN=toca.tudominio.com
FRONTEND_ORIGIN=https://toca.tudominio.com
TRUSTED_PROXY_TOKEN=GENERAR_UN_VALOR_ALEATORIO_DE_AL_MENOS_32_CARACTERES
```

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f compose.public.yml up --build -d
```

Caddy sirve web y `/api` en el mismo origen, gestiona TLS y persiste certificados. La web usa modo real de forma predeterminada en dominios públicos (demo local por defecto); `TOCA_CONFIG.mode` permite elegirlo explícitamente. Usa el origen actual fuera de localhost; `web/config.js` permite configurar `apiUrl` explícitamente en otros despliegues. No incluye valores secretos.

El dominio real y sus certificados no se consideran verificados hasta probarlos con DNS/configuración reales. Caddy reemplaza los encabezados de identidad y adjunta una clave compartida aleatoria. La API acepta la IP del cliente solo con esa clave válida (mínimo 32 caracteres); sin ella ignora los encabezados. Mantené la API enlazada únicamente a loopback como indica Compose, no publiques directamente el puerto 8080, y no registres la clave ni la versionés.

## Cuentas y correo

La pantalla `#/account?kind=customer` o `#/account?kind=admin` ofrece recuperación, verificación del correo, cambio de contraseña, cierre de sesiones y eliminación. El perfil y los logins enlazan a esa pantalla.

Configurá `ACCOUNT_SMTP_HOST`, `ACCOUNT_SMTP_PORT` (587), `ACCOUNT_SMTP_USERNAME`, `ACCOUNT_SMTP_PASSWORD`, `ACCOUNT_SMTP_FROM` y un `FRONTEND_ORIGIN` HTTPS. SMTP exige STARTTLS y verificación del servidor; no se desactiva TLS. Sin SMTP la recuperación informa que el servicio está sin configurar, no imprime tokens ni inventa envíos. La entrega real no fue probada sin credenciales.

Los enlaces tienen un token aleatorio de un solo uso, hash en DB y vencimiento de 30 minutos. Restablecer o cambiar contraseña revoca sesiones. El cambio también invalida enlaces de recuperación pendientes. Para mantener compatibilidad con los logins históricos que recortan espacios, las contraseñas nuevas de recuperación/cambio no admiten espacios al comienzo o al final. El login de administrador rechaza entradas mayores a 72 bytes para impedir las equivalencias de BCrypt. Las cuentas históricas que las usaban requieren recuperación con SMTP configurado antes de poder seguir usando una contraseña larga; no se modifican sus hashes a ciegas. La verificación es explícita y voluntaria en este lote: no bloquea las cuentas existentes ni obliga automáticamente a verificar las altas tradicionales. Google conserva su verificación criptográfica propia.

Eliminar una cuenta requiere confirmación y contraseña actual; una cuenta solo Google debe establecer primero una contraseña por recuperación. Un administrador debe eliminar/transferir sus bares; un cliente debe resolver pedidos pendientes. No se borran silenciosamente operaciones remotas en Spotify.

Los favoritos autenticados se guardan en PostgreSQL y se sincronizan al cargar la cuenta en otro navegador. Se migran de forma idempotente los favoritos locales cuya clave ya está asociada a la cuenta verificada. No se migra la antigua clave compartida entre usuarios. Si falla la sincronización, se conserva la copia local para reintentar. La demo mantiene favoritos locales.

## Fotos, paginación y arquitectura

Las fotos se decodifican y vuelven a codificar, eliminando metadatos. JPEG/PNG admitidos; el upload de WebP directo se rechaza si no hay un decoder soportado. El frontend convierte las fotos a JPEG. Máximo 20 megapíxeles y límites de bytes existentes. Las mutaciones de galería comparten un bloqueo por bar para conservar máximo ocho y mínimo una imagen. La galería vive en `VenueMediaService`; la gestión de cuentas en `AccountManagement`.

Exploración: `GET /api/venues?limit=50&offset=0`, con máximo 150 por página; la web recorre las páginas. Solicitudes públicas e historial admiten `limit`/`offset`. Las playlists recorren las páginas del proveedor. El dashboard obtiene agregados y actividad de siete días del endpoint de estadísticas, sin derivarlos de las últimas 50 filas.

`runtime.js` centraliza el ciclo de navegación, descarta commits de pantallas anteriores, gestiona foco/títulos/semántica y carga mapas bajo demanda. Es una consolidación incremental: los módulos históricos siguen presentes, no se afirma haber reescrito todo el frontend. Los servicios extraídos tampoco convierten automáticamente todos los Maps a DTOs.

La demo permite pedidos sin backend y tiene identificación visible. El mapa fallido conserva la ilustración. La PWA precarga las URLs versionadas exactas y excluye `/api`; no almacena respuestas privadas. Regenerá el manifiesto después de modificar recursos:

```bash
python3 scripts/build-precache.py
```

Sesiones expiradas, estados OAuth, check-ins y tokens de cuenta se purgan periódicamente. Las cachés tienen límites y el geocodificador caduca su caché. Las mutaciones de playlist invalidan snapshots.

## Build y pruebas

Gradle Wrapper 8.14.6 con checksum oficial, lock de dependencias, exclusión de generados del contexto Docker y caché de Gradle. El builder usa un digest verificado; las imágenes runtime siguen requiriendo su política de actualización. No se afirma un análisis CVE.

```bash
cd backend
./gradlew test installDist
cd ..
python3 scripts/test-runtime.py
python3 scripts/test-request-flow.py
python3 scripts/test-google-login.py
```

Las pruebas de navegador requieren web local en 5173, Playwright y Chromium. Para PostgreSQL aislado, usá las variables de prueba documentadas en `scripts/integration/README.md` y ejecutá `bash scripts/integration/run-batch-services.sh`. Nunca apuntes los probes a datos reales.
