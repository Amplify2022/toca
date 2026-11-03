# TOCÁ v1.1 — Playlist Spotify directa

Basada en TOCÁ v1 y el comportamiento de Amplify original, con nueva API `/playlists/{id}/items`.

**Cambios:** solicitudes automáticas a Spotify, insertar/mover tema tras la canción actual cuando sea identificable, sin duplicar temas que ya existen, historial con `request_count`, QR por establecimiento reutilizable en la sesión del navegador y migración Flyway V3. No depende de la aprobación manual. Incluye reparaciones de dependencias Micronaut ya realizadas en el proyecto del usuario.

**Advertencia:** cambia el orden de la playlist, **no** garantiza la cola activa o reproducción inmediata de Spotify. El audio lo reproduce la app oficial de Spotify (fuera de TOCÁ). El prototipo es exclusivamente para pruebas privadas autorizadas; Spotify Premium no autoriza reproducción pública en bares.

Guía completa paso a paso: [docs/PRUEBAS_MANUALES_SPOTIFY.md](docs/PRUEBAS_MANUALES_SPOTIFY.md).

Para activar escrituras de playlist en desarrollo en `.env`:

```dotenv
SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true
SPOTIFY_PRIVATE_TEST_CONTROL=false
```

Tras sustituir archivos, ejecutar `docker compose up --build -d api`, autorizar de nuevo OAuth con nuevos scopes y elegir otra vez la playlist. **Preservá `.env` y el volumen PostgreSQL; no uses `down -v`.**
