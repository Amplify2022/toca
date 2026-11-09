# Precarga de Mi Bar y cabina musical

## Qué cambia

En **Mi Bar** y en el alta del primer bar aparece «Traé los datos de tu bar».

- **Google Maps:** buscá nombre y ciudad, seleccioná el establecimiento y revisá nombre, dirección, ciudad, coordenadas y horarios. Teléfono y web se muestran como información de referencia. Los horarios nocturnos conservan el cierre del día siguiente. Los horarios partidos o continuos se muestran para revisión manual porque el editor actual admite un intervalo diario.
- **Instagram:** ingresá @usuario o un enlace de perfil profesional. Business Discovery aporta nombre, biografía y usuario; la API no entrega dirección y horarios estructurados. No se deducen ni inventan a partir de la biografía.
- Los campos vacíos se seleccionan por defecto; reemplazar datos existentes requiere seleccionarlos. Aplicar sólo actualiza el borrador. Revisá el pin, confirmá ubicación y guardá el bar. No se copian fotos de terceros automáticamente.

En **Música y Spotify → Cabina del bar**, el administrador puede:

- Crear una playlist privada y vincularla automáticamente al bar; también puede elegir una existente desde la configuración.
- Buscar y agregar canciones, quitar una ocurrencia concreta, subir/bajar temas y cambiar el nombre.
- Activar audio en el navegador con Spotify Web Playback SDK; no hace falta abrir la aplicación Spotify para reproducir en ese navegador compatible.
- Reproducir/pausar, avanzar/retroceder, seleccionar una canción, cambiar posición y volumen, aleatorio y repetición. Alternativamente puede elegir un dispositivo Spotify Connect disponible.

Los clientes mantienen sus pedidos. Mi Bar sigue ofreciendo **NEARBY (100 metros, sin QR)** y **ANYWHERE (sin GPS)**.

La playlist se administra desde TOCÁ, pero la cola precargada de Spotify sigue siendo independiente. Editar el orden no promete cambiar inmediatamente lo que ya esté en esa cola. «Reproducir playlist» inicia explícitamente la playlist seleccionada desde el comienzo.

## Configuración única

Agregá las opciones que necesites a tu `.env`; no publiques los secretos ni los pongas en `web/config.js`.

### Google

Habilitá **Places API (New)** en un proyecto de Google Cloud con facturación. Configurá una clave de servidor restringida a esa API y, en producción, a las IP de salida del servidor:

```dotenv
GOOGLE_PLACES_API_KEY=...
```

Se usan Text Search y Place Details con máscaras de campos; Google puede cobrar las consultas. Revisá las condiciones de atribución y almacenamiento aplicables a tu cuenta. La importación es una consulta puntual elegida y revisada por el propietario; no hay sincronización automática ni scraping.

### Instagram

Se usa **Instagram API con Facebook Login / Business Discovery**, mediante un perfil profesional autorizado y permisos aprobados de Meta (incluidos los exigidos por Business Discovery, como `instagram_basic`, `instagram_manage_insights` y `pages_read_engagement`). El acceso a perfiles externos puede necesitar revisión de la aplicación. No funciona para cualquier cuenta personal o privada.

```dotenv
INSTAGRAM_DISCOVERY_TOKEN=...
INSTAGRAM_DISCOVERY_ACCOUNT_ID=...
META_GRAPH_VERSION=v23.0
```

El token se administra en el servidor; el dueño del bar sólo ingresa el usuario a consultar. Mantené/renová el token según su vigencia. Si no configurás un proveedor, el formulario manual sigue disponible y se explica que la importación no está habilitada.

### Spotify para pruebas privadas autorizadas

Se conserva la configuración OAuth y las protecciones existentes. Para probar edición y reproducción:

```dotenv
SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true
SPOTIFY_PRIVATE_TEST_CONTROL=true
```

Después de actualizar, desconectá y reconectá Spotify desde TOCÁ una vez para otorgar los nuevos permisos `streaming` y `user-read-email`. El navegador debe admitir Web Playback SDK/DRM y tener contexto seguro (HTTPS o localhost). Pulsá «Usar audio de este navegador» y después «Reproducir playlist». En dispositivos incompatibles se puede usar Spotify Connect. La cuenta necesita Spotify Premium y acceso permitido a tu aplicación Spotify.

El SDK utiliza un token de acceso de corta duración obtenido por un endpoint exclusivo del propietario, con `Cache-Control: no-store`; el refresh token permanece cifrado en el servidor. Los tokens del SDK no se guardan en almacenamiento del navegador.

Spotify estándar/Premium y su SDK no conceden por sí solos autorización para música pública en bares ni para una rocola comercial. Este desarrollo mantiene los flags de laboratorio privado existentes; la operación comercial requiere un proveedor y derechos adecuados.

## Actualización

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

Flyway ejecuta V17 mediante el contenedor de migración: agrega el registro de operaciones musicales. No borres el volumen de PostgreSQL. Recargá la web con Cmd/Ctrl+Shift+R.

El backend necesita salida HTTPS a `places.googleapis.com` y `graph.facebook.com`, además de Spotify. El navegador necesita los dominios de Web Playback SDK (`sdk.scdn.co`, `*.spotify.com`, `*.scdn.co` y los que Spotify requiera para audio/DRM). El entorno de pruebas actual sólo permite hosts de desarrollo y no tiene credenciales de proveedores: no se hizo reproducción ni importación con cuentas reales.

## Consistencia y recuperación

V17 registra las ediciones con un ID estable y un plan antes de enviar la escritura externa. Una transacción corta bloquea el bar para excluir pedidos/ediciones simultáneos; el HTTP al proveedor ocurre fuera de transacciones SQL. Los reintentos del mismo ID no vuelven a escribir.

Si se pierde una respuesta, el estado queda pendiente de revisión y frena nuevas mutaciones de esa playlist. «Consultar resultado» verifica el estado actual sin repetir la operación. La creación incluye un marcador único en la descripción para poder recuperar el ID sin crear otra playlist. «Aceptar estado actual» permite resolver una diferencia explícitamente después de revisar la lista. Una preparación interrumpida se puede liberar tras cinco minutos; una escritura incierta nunca se reenvía automáticamente.

La edición por posición conserva duplicados. Los snapshots detectan lecturas/ediciones desactualizadas. Cambios desde otra aplicación Spotify aún pueden producir conflictos y requerir revisión.

## Validación reproducible

- `python scripts/test-admin-studio.py`: frontend real a 390 y 1440 px; proveedores y SDK de audio simulados; precarga selectiva sin autoguardado, edición y conexión.
- `python scripts/test-studio-http.py`: API real de pruebas en 8081 con rol DB restringido; autorización por propietario, ausencia de credenciales, flags y alta con datos importados.
- Tests JUnit `VenueImportTest` y `MusicEditPlanTest`: horarios nocturnos/partidos, perfiles y URLs, índices y snapshots.
- `bash scripts/integration/run-p1-services.sh`: PostgreSQL real y Spotify simulado; edición incierta, recuperación sin duplicados y exclusión de pedidos concurrentes, más regresiones P1 existentes.
- Regresión: `test-runtime.py`, `test-request-flow.py`, `test-map-layout.py`, `test-access-settings.py`, `test-presence.cjs` y `test-request-sync.cjs`.

Falta validar con credenciales reales la facturación/permisos Google, el acceso Business Discovery de Meta, los permisos OAuth de Spotify, DRM y audio en el dispositivo final. Las pruebas simuladas no certifican esas capacidades de las cuentas externas.
