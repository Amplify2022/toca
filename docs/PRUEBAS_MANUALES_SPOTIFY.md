# TOCÁ v1.1 — Prueba manual de playlist Spotify (Rancher Desktop)

> **Uso permitido:** esta versión es un prototipo técnico de desarrollo privado. **Spotify Premium no autoriza reproducir Spotify en bares ni crear una rocola comercial sin autorización expresa.** No usar con clientes reales, pagos ni reproducción pública.

## Qué cambió

- Al pedir un tema, **sin aprobación manual**, TOCÁ intenta insertarlo o moverlo en la playlist vinculada de Spotify.
- Si Spotify está reproduciendo **esa misma playlist** como contexto y TOCÁ identifica la canción actual, apunta a la posición siguiente. **Esto NO garantiza que la cola interna que ya cargó Spotify se refresque.**
- Si el tema ya existe (y no es la única ocurrencia actualmente sonando), TOCÁ lo mueve; si ya está inmediatamente después de la canción actual, no hace cambios en Spotify.
- Si Spotify no está reproduciendo esa playlist, o no se puede ubicar la canción actual, se coloca en la posición 0. No se pausa ni se fuerza a Spotify a reproducir inmediatamente.
- El QR funciona para varias solicitudes consecutivas; el acceso queda en `sessionStorage` del navegador para ese bar. Se mantiene la expiración/revocación de la sesión del local mediante `join_token`.
- Los registros SQL de `song_request` son historial de solicitudes, **no** la cola nativa de Spotify. `DISPATCHED` significa **playlist actualizada**, NO canción reproducida.

## 0. Resguardar la instalación actual

Esta actualización parte del ZIP de TOCÁ original e incorpora los arreglos anteriores (SnakeYAML, Flyway PostgreSQL, Kotlin Reflect y las comillas SQL).

En una terminal:

```bash
cd ~/Downloads
cp -R toca toca-backup-antes-playlist
cd toca
docker compose exec -T postgres pg_dump -U toca -d toca > ~/Downloads/toca-db-antes-playlist.sql
```

Conservá esa copia SQL en privado. Contiene los datos de tu entorno de desarrollo. **No uses `docker compose down -v`.**

## 1. Copiar el código actualizado

Descargá `TOCA-v1.1-playlist-spotify.zip` a `~/Downloads/`. El ZIP contiene una carpeta `toca/`. Desde `~/Downloads`:

```bash
cd ~/Downloads
unzip -o TOCA-v1.1-playlist-spotify.zip
cd toca
```

Tu `.env` existente **no se incluye** en el ZIP y se conserva. No pegues Client ID, contraseñas ni tokens en chats.

## 2. Habilitar exclusivamente la escritura de playlist

Abrí `.env` en VS Code:

```bash
code .env
```

Agregá o actualizá:

```dotenv
SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true
SPOTIFY_PRIVATE_TEST_CONTROL=false
```

Mantener `SPOTIFY_PRIVATE_TEST_CONTROL=false` evita comandos que manipulen la cola o la reproducción activa del dispositivo. **La playlist de Spotify sí se modificará** en el modo de prueba. Usá una playlist descartable con canciones de prueba; no hagas este experimento sobre una playlist valiosa.

## 3. Construir en Rancher Desktop

Rancher Desktop abierto, motor `dockerd (moby)`. Desde `~/Downloads/toca`:

```bash
docker compose up --build -d api
docker compose up -d web
docker compose ps
curl -i http://localhost:8080/api/health
```

Esperamos HTTP 200. El `docker-compose.yml` de esta entrega mantiene **5433 en tu Mac / 5432 dentro del contenedor**. No edites `JDBC_URL` para que apunte a 5433: dentro de Docker debe continuar como `postgres:5432`.

Comprobá V3:

```bash
docker compose exec postgres psql -U toca -d toca -c "SELECT version,success FROM flyway_schema_history ORDER BY installed_rank;"
docker compose exec postgres psql -U toca -d toca -c "SELECT id,name,require_approval,playlist_id FROM venue;"
```

V3 debe estar aplicada; `require_approval` debe ser `f`. Las solicitudes anteriores en estado pendiente/aprobada/enviada pasan a historial `FAILED` con explicación, ya que no había evidencia de modificación real de playlist. Se conservan los registros de auditoría.

En Chrome hacé una recarga completa `Cmd + Shift + R`; el Service Worker de la PWA se actualizó.

## 4. VOLVER A AUTORIZAR Spotify (obligatorio)

TOCÁ ahora pide los scopes `playlist-modify-public` y `playlist-modify-private`, además de los anteriores. **El token OAuth obtenido antes de esta actualización no tiene automáticamente esos permisos.**

1. Abrí `http://localhost:5173/#/admin/spotify` en modo API real.
2. **Anotá el nombre de la playlist que elegiste**, y tené abierta Spotify Desktop con la misma cuenta.
3. Elegí **Desconectar Spotify** (esta acción cierra la sesión del local y desvincula la playlist), después **Conectar Spotify**.
4. Autorizá los permisos nuevos. La cuenta debe tener Spotify Premium y estar habilitada para la aplicación Development Mode.
5. Hacé clic en **Cargar playlists** y seleccioná **una playlist propia o editable**. No todas las playlists seguidas de otras personas permiten escritura.
6. Volvé al panel general y presioná **Abrir sesión**.
7. En la aplicación oficial Spotify Desktop, **abrí y reproducí esa misma playlist**, preferentemente con modo aleatorio (shuffle) desactivado. TOCÁ no reproduce audio por sí misma.

Si la API responde 403 al escribir, comprobar los permisos de la aplicación, la cuenta autorizada, si el usuario controla la playlist y la política de acceso al endpoint. **No cambies la validación de seguridad por `true`** para evitar el error.

## 5. Primera solicitud — canción nueva

1. Portal admin → **QR** → **Copiar enlace** y abrirlo en una pestaña de la misma Mac.
2. Desde el enlace QR, abrí **Pedir canción**, buscá una canción que **no esté** en tu playlist de prueba.
3. Presioná `+` y confirmá.
4. La web debería mostrar confirmación **sin pedir aprobación al bar**.
5. En Spotify Desktop, abrí la playlist y verificá que la canción ahora aparece en la lista. Si la playlist estaba sonando y se identificó la canción actual, debería quedar inmediatamente detrás de esa canción en el **orden de la playlist**. Si no, debería aparecer al principio.
6. Si Spotify no actualiza la cola activa automáticamente, es una limitación de la sincronización del reproductor; no significa que la mutación de playlist haya fallado.

Verificá API y DB:

```bash
# Cambiá <BAR_ID> por el ID real del local; no incluyas los <>.
curl -s "http://localhost:8080/api/venues/<BAR_ID>/playlist" | python3 -m json.tool

docker compose exec postgres psql -U toca -d toca -c \
 "SELECT title,status,playlist_position,request_count,last_requested_at FROM song_request ORDER BY last_requested_at DESC LIMIT 10;"
```

Esperamos `DISPATCHED`, `request_count=1`, una posición cero-basada y que el tema aparezca en la playlist de Spotify.

## 6. Segunda solicitud — misma sesión QR

**Sin volver a escanear el QR:** en la pantalla de éxito tocá **Pedir otra canción**. Buscá un tema diferente y solicitálo.

Esperado: **no** aparece `403 Escaneá el QR`; la playlist se modifica y aparece otro registro en `song_request`.

Si el navegador estaba abierto antes de instalar la nueva versión, recargá la página, ingresá otra vez desde el QR y repetí la prueba; el token se almacena por local en `sessionStorage`.

Si solicitás dos canciones en menos de cuatro segundos con el mismo invitado, puede responder `429` como protección contra doble clic: esperá unos segundos.

## 7. Canción ya existente

Elegí una canción de la playlist que no esté sonando ahora y que **no sea la próxima**.

- Solicitála otra vez desde el mismo enlace QR.
- Esperado: Spotify **reordena una ocurrencia existente**, sin añadir otra copia.
- Si ya estaba inmediatamente después de la actual, debería devolver éxito sin escritura a Spotify.
- Si es la canción actualmente sonando y no tiene otra copia en la lista, TOCÁ añade otra ocurrencia detrás para permitir repetirla después.
- En PostgreSQL, si el tema ya tenía una solicitud activa, su `request_count` se incrementa y no se crea otra fila activa.

Para comprobar manualmente que Spotify no duplicó un tema que ya existía, compará el número de ocurrencias de esa canción **antes y después** en la lista de Spotify.

## 8. Reglas y sesiones

- Bloqueá una canción en admin → Música: pedirla desde el QR debe devolver 403 con mensaje de bloqueo y **no** modificar Spotify.
- Activá whitelist: solo temas permitidos se pueden buscar/solicitar.
- Cerrá sesión desde admin: una nueva solicitud debe devolver 409 y no modificar la lista.
- Abrí una sesión nueva: si el `join_token` no fue rotado, el mismo QR sigue siendo válido. Si lo rotás desde admin, necesitás utilizar el enlace nuevo.

## 9. Diagnóstico

```bash
docker compose ps
docker compose logs --tail=120 api
docker compose exec postgres psql -U toca -d toca -c "SELECT version,success FROM flyway_schema_history ORDER BY installed_rank;"
```

| Código | Qué revisar |
| --- | --- |
| 403 al buscar | Debés entrar desde QR; no desde el mapa sin sesión de invitado |
| 403 al editar playlist | Volvé a autorizar OAuth con scopes nuevos; verificá propiedad/edición de playlist y restricciones de Spotify |
| 412 al solicitar | `SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES`, conexión Spotify y playlist seleccionada |
| 409 al solicitar | Sesión cerrada o la playlist cambió durante una lectura |
| 429 | Esperá por el rate limit/cooldown de TOCÁ o Spotify |
| 500 | Revisa `docker compose logs --tail=120 api` y Flyway V3 |
| Tema en la playlist pero no se oye después | La cola ya cargada de Spotify puede ser distinta del orden visible; reiniciá la playlist en un contexto de prueba para verificar el nuevo orden, sin alterar la canción actual automáticamente desde TOCÁ |

## 10. Qué no se garantiza

- El orden de reproducción real y el salto inmediato a un tema *no están garantizados* por cambiar posiciones de playlist; esto requiere pruebas de Spotify Desktop y podría requerir otra estrategia técnica.
- No se incluye un reproductor web, audio en TOCÁ ni lógica para forzar un salto automático en Spotify.
- Si alguien edita la misma playlist directamente en Spotify al mismo tiempo, puede haber conflictos: el backend usa `snapshot_id` para reordenar y serializa solicitudes por establecimiento, pero no dispone de una transacción distribuida entre Spotify y PostgreSQL.
- El comportamiento con playlists con canciones duplicadas de origen o cola nativa pre-cargada tiene limitaciones documentadas.
- No se probó OAuth o reproducción real desde este entorno; hacen falta tus pruebas privadas con la cuenta Premium.
