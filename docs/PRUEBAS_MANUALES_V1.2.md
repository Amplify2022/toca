# TOCÁ v1.2 — guía de pruebas manuales

## Antes de empezar

- Estás en modo **API real**, no Demo, apuntando a `http://localhost:8080`.
- `SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true` continúa vigente en el `.env` local.
- Tu bar ya está vinculado a la playlist Spotify de tu cuenta (probado en la v1.1).
- Spotify Desktop tiene iniciada sesión con **la misma cuenta** y reproduce esa playlist de prueba sin Shuffle/aleatorio (para observar el orden).
- Abrí la sesión musical del bar desde TOCÁ Admin. Para solicitar canciones, ingresá desde el enlace QR que genera el administrador, en otra pestaña.
- No hagas pruebas con música en un bar público o establecimiento comercial: el uso debe ser un prototipo privado autorizado.

## Instalación sin perder configuración

1. Dentro del directorio actual `toca`, respaldo de base antes del reemplazo:

   ```bash
   docker compose exec -T postgres pg_dump -U toca -d toca > ../toca-v11-respaldo.sql
   ```

2. Cerrá la pestaña de la web. Respaldá tu carpeta `toca` completa (incluye el `.env` oculto):

   ```bash
   cd ..
   cp -R toca toca-backup-v11
   ```

3. Descargá `TOCA-v1.2-spotify-en-vivo.zip` a `~/Downloads`. **Desde el directorio que contiene a `toca/`**, descomprimilo encima:

   ```bash
   unzip -o ~/Downloads/TOCA-v1.2-spotify-en-vivo.zip
   cd toca
   ```

   El ZIP no incluye `.env` ni archivos de PostgreSQL, de modo que no debe borrar tus credenciales ni la DB. Si estabas trabajando sobre archivos modificados localmente, conservarás una copia completa en `toca-backup-v11`.

4. Reconstruí la API y recreá la web:

   ```bash
   docker compose up --build -d api
   docker compose up -d --force-recreate web
   docker compose ps
   curl -i http://localhost:8080/api/health
   ```

   La API debe devolver `200` y Flyway aplicará `V4__guest_request_events.sql`. No uses `docker compose down -v`.

5. Abrí Chrome en `http://localhost:5173/#/admin`. Si ves pantallas viejas, abrí DevTools → Application → Service Workers → Unregister; recargá con `Cmd + Shift + R`.

## Prueba A: reproducción actual y siguiente prevista

1. Abrí Spotify Desktop y reproducí una playlist propia de al menos 5 canciones; **desactivá Shuffle**.
2. En `http://localhost:5173/#/admin`, seleccioná el bar, verificá que la sesión está activa.
3. Verificá el panel **Reproducción Spotify**: debería mostrar título y artista de la canción actual, y próxima **prevista en playlist** si Spotify informa ese contexto.
4. Entrá a la ficha del bar desde el mapa en otra pestaña. Debe mostrar reproducción actual, siguiente prevista y orden de la playlist. **No requiere QR para consultar esto.**
5. Poné pausa en Spotify y luego reproducí otro tema de la misma lista. En aproximadamente **20–40 segundos** debería reflejarse el cambio (según caché y actualización), o indicar que no hay estado fiable.

**Resultado esperado:** la UI indica por separado la canción actual y la siguiente prevista. Si Spotify no informa contexto, dice que no puede determinarla; nunca inventa la próxima.

## Prueba B: sincronización de playlist tras pedido

1. En el panel Admin → QR, copiá el enlace y abrilo en otra pestaña del mismo equipo.
2. Solicitá una canción que no esté en la playlist. Debe quedar registrada automáticamente (sin aprobar nada).
3. Comprobá que aparece en la playlist real de Spotify.
4. Dejando abierta la ficha pública o el panel, confirmá que en hasta ~20 segundos se refleja el orden actualizado.
5. Esperá 15 segundos, pedí otra canción que ya esté más adelante en la playlist. Debería adelantarse sin duplicarse. La interfaz debe actualizar el orden.

**Resultado esperado:** aparece el cambio de posición real en la playlist y la información en TOCÁ se actualiza. El orden precargado del reproductor Spotify puede ser diferente.

## Prueba C: antiabuso

1. Desde el QR pedí un tema: **aceptado**.
2. Inmediatamente intentá otro con menos de 15 segundos de diferencia: **HTTP 429**, error visible en TOCÁ: `Esperá 15 segundos entre solicitudes de canciones.`
3. Esperá al menos 15 segundos. El siguiente pedido debe aceptarse.
4. Repetí hasta llegar a seis solicitudes aceptadas en una ventana de 10 minutos (contando las anteriores). El séptimo intento debe dar **HTTP 429**, con límite de 6 canciones.
5. Esperá al vencimiento de la ventana para verificar que vuelve a permitir pedidos. Evitá resetear o inventar nuevos `guestId`: ese identificador simula una sesión de usuario, no autenticación segura.

**Resultado esperado:** Spotify no modifica la playlist ante un intento rechazado por rate limiting. Los pedidos aceptados quedan en `song_request_event`.

## Prueba D: inspección de PostgreSQL

```bash
docker compose exec postgres psql -U toca -d toca -c \
"SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"

docker compose exec postgres psql -U toca -d toca -c \
"SELECT guest_id, track_id, created_at FROM song_request_event ORDER BY created_at DESC LIMIT 12;"
```

El primer comando debe incluir la migración `4` con `success=t`. El segundo debe mostrar una fila por cada **solicitud aceptada**, incluso cuando se pidió una canción que ya existía.

## Diagnóstico de problemas

- `404` en `localhost:5173`: comprobá `docker compose ps`, `ls -lh web/index.html`, `docker compose logs --tail=60 web`.
- `403` en canciones: comprobá que usaste el QR para pedir, que Spotify está autorizado y que la cuenta tiene permisos de edición de playlist. Consultá `docker compose logs --since=5m api | grep SPOTIFY_ERROR`.
- `429`: es el límite intencional, no un problema de OAuth.
- `500` en `/music-status`: consultá `docker compose logs --tail=150 api`. Si Spotify limita la API (`429` externo), no fuerces refresh continuo.
- No aparece la siguiente: verificar sesión activa, Spotify Desktop reproduciendo la **playlist seleccionada** sin shuffle y que la canción actual esté en los primeros 50 elementos. El valor “siguiente” no es equivalente a la cola precargada de Spotify Connect.
- Vistas viejas: invalidá el Service Worker y recargá; versión de caché `toca-shell-3-live-v12`.

## Seguridad y limitaciones

Las credenciales y tokens nunca deben publicarse. El acceso QR no comprueba presencia física. El límite por `guestId` es best-effort: borrar datos locales o usar otro navegador reinicia el identificador. Spotify Premium no habilita por sí solo una rocola pública o comercial; mantener solo en pruebas privadas autorizadas.
