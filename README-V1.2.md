# TOCÁ 1.2 — reproducción visible y límites de solicitudes

Esta versión actualiza **TOCÁ 1.1**. No reemplaza ni migra a otro proveedor musical: continúa editando la **playlist existente de Spotify del establecimiento** y usa Spotify Desktop/Connect para reproducir música en las **pruebas privadas autorizadas**.

## Funcionalidades nuevas

- `GET /api/venues/{id}/music-status`: devuelve `now`, `isPlaying`, `next` **prevista** (según el orden consultado de la playlist), `playlist` (hasta 50 canciones), `samePlaylist`, `note` y `updatedAt`.
- En la ficha del establecimiento y el panel general se consultan y refrescan automáticamente los datos de Spotify **cada 20 segundos**, solo mientras la pestaña está visible; backend cachea resultados **12 segundos** y los invalida tras una solicitud válida.
- Las pantallas separan **reproducción actual**, **próxima prevista por playlist** y **orden de la playlist**. No se presenta el historial de pedidos como si fuera la cola real de Spotify.
- Sin aprobación manual. Las canciones se insertan o adelantan en Spotify directamente, como en 1.1.
- Límite por `guestId` y bar: **15 segundos entre pedidos** y **6 solicitudes cada 10 minutos** (incluyendo promociones). HTTP 429 con mensaje claro.
- Flyway V4 crea `song_request_event` para contabilizar **cada solicitud aceptada**, inclusive si se vuelve a pedir la misma canción. No elimina registros existentes.
- Errores de API muestran el detalle que devuelve Micronaut, cuando existe, en vez de un genérico “Precondition Failed”.
- Se incrementó la versión del Service Worker para actualizar los archivos del frontend en el navegador.

## Lo que NO cambia / limitaciones

- Spotify Premium y los scopes de playlist ya autorizados en 1.1 siguen funcionando; **no vuelvas a conectar Spotify salvo que recibas un error OAuth**.
- La playlist de Spotify y el orden que Spotify Connect tenga precargado no son la misma cosa. `next` es **predicción**, jamás una confirmación de reproducción futura.
- El endpoint Spotify de reproducción puede informar `204`, carecer de contexto o reflejar otra playlist; la UI indica “no disponible” en esos casos, sin inventar una canción siguiente.
- El máximo de canciones visibles en el endpoint de resumen es 50; si la actual queda fuera de esas 50 o hay duplicados, no se puede determinar con certeza la siguiente.
- `guestId` es un identificador anónimo generado en el navegador, no una identidad fuerte: cambiar dispositivo/datos del navegador puede reiniciar el límite. Adecuado para prototipo, **insuficiente como protección de producción**. Para uso público harían falta controles adicionales y validación de presencia.
- Spotify **no autoriza reproducción comercial/pública en bares** con una cuenta Premium personal. TOCÁ sigue limitado a pruebas privadas autorizadas.

## Actualización conservadora

**Nunca ejecutes `docker compose down -v`: eso borra el volumen PostgreSQL.** Antes de sustituir archivos, guardá la versión anterior y creá un backup SQL de la DB.

El ZIP trae el directorio `toca/` y **no trae `.env`**. Si lo extraés encima de tu `toca` actual, conserva tus secretos locales. No copies las credenciales a capturas ni conversaciones.

Una vez descomprimido:

```bash
cd toca
# Ya tenías estas variables desde 1.1; no hace falta modificarlas.
docker compose up --build -d api
docker compose up -d --force-recreate web
docker compose ps
curl -i http://localhost:8080/api/health
```

Con la sesión Spotify del bar activa, probá:

```bash
curl -s http://localhost:8080/api/venues/ID_DEL_BAR/music-status
```

Debería incluir `now`, `next`, `playlist`, `isPlaying` y `note`; la canción siguiente puede ser `null` si Spotify no brinda contexto fiable.

Para comprobar Flyway V4:

```bash
docker compose exec postgres psql -U toca -d toca -c \
 "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

Para conteos del límite (sin mostrar tokens):

```bash
docker compose exec postgres psql -U toca -d toca -c \
 "SELECT venue_id, COUNT(*) AS pedidos_aceptados FROM song_request_event GROUP BY venue_id;"
```

## Pruebas incluidas

```bash
node --check web/app.js
node --check web/toca-ui.js
node --check web/live-music.js
node scripts/smoke-web.cjs
node scripts/test-live-music.cjs
```

El código de política y el planificador de playlist también tienen pruebas JUnit en `backend/src/test`. En un entorno con Gradle/Java 21 se ejecutan con `gradle test` (o durante el build Docker si se configura la imagen para correr tests).

**Ver el manual específico:** `docs/PRUEBAS_MANUALES_V1.2.md`.
