# Cabina de música · Opción A

La sección **Música** reemplaza la pantalla extensa de Música y Spotify por la cabina aprobada: playlist como área principal, participación y actividad al costado, reproductor fijo. En móvil la actividad abre un detalle y el reproductor queda sobre la navegación.

Agregar canciones, opciones por canción, creación/renombrado/selección de playlist, reglas y conexión usan ventanas enfocadas. La pantalla no repite formularios debajo de la lista. Los enlaces `#/admin/music` y `#/admin/spotify` muestran la cabina, incluido el retorno de OAuth existente.

## Comportamiento

- La playlist conserva el orden y las ocurrencias duplicadas que devuelve la API. Mover y quitar usan posiciones y el snapshot consultado.
- Cada canción tiene su portada y un botón de play/pausa. Si ya está sonando en esa playlist, continuar usa `resume` para conservar la posición. La API incorpora `imageUrl` en canciones y `contextUri` en el estado del reproductor; los clientes anteriores siguen siendo compatibles.
- El control de mover admite mouse, touch y teclado: Espacio selecciona, flechas cambian la posición y Enter confirma; Escape cancela. No se cambia el orden visible hasta que el servidor confirma. Un snapshot diferente cancela el movimiento y pide revisar la lista.
- «Reproducir playlist» confirma empezar desde la primera canción. Cambiar la playlist seleccionada no envía un comando de reproducción.
- Pedidos abiertos/pausados y reproducción tienen controles independientes. El acceso por 100 metros o desde cualquier lugar sigue en Mi Bar.
- La actividad refleja los estados de los pedidos. No representa una cola garantizada del reproductor de Spotify.
- Spotify se conecta con OAuth y el audio puede salir por Web Playback en el navegador o por un dispositivo disponible de Spotify Connect. Las claves permanecen en el servidor.
- Un cambio pendiente bloquea la edición y la selección de playlist. Se consulta o concilia antes de continuar; se conserva la clave de la operación al recuperarla.
- Los permisos de edición y control informados por el servidor siguen siendo obligatorios. El modo demo usa canciones ilustrativas y no envía comandos ni ediciones reales.
- «Agregar» permite abrir el buscador aunque la edición esté deshabilitada e informa qué falta. La reproducción sin salida activa abre la elección de audio. Los errores de Spotify y los cambios pendientes quedan visibles.
- Si falla la consulta de una edición guardada, la playlist y el reproductor se cargan igualmente. Se conserva la clave pendiente para consultar después; no se descarta ni se repite una escritura con otra clave.

El reproductor consulta su estado cada 7 segundos. Cuando no hay una ventana abierta se consulta actividad aproximadamente cada 21 segundos; la playlist se vuelve a cargar si cambia esa actividad. «Actualizar» permite recargarla manualmente. Se evita descargar la playlist completa en cada consulta del reproductor.

## Validación

`scripts/test-admin-studio.py` usa el frontend real y respuestas simuladas de Spotify/SDK a 1440 y 390 px. Cubre agregar, mover, crear, renombrar, seleccionar playlist sin reiniciar audio, controles, audio del navegador, parlantes, reglas, pedidos independientes, edición pendiente, permisos deshabilitados, estado desconectado y entrada al registro guiado. `TOCA_WEB_TEST_URL` indica el servidor web y `TOCA_SCREENSHOT_DIR` el destino de las capturas.

Se mantienen las pruebas existentes de login, navegación administrativa, pedidos, acceso, modo sin conexión y navegación tardía. Las pruebas de cabina también verifican orden real en ambas direcciones, arrastre con mouse/touch, teclado y cancelación, ocurrencias duplicadas, portadas, play/pausa/continuación por fila y falta de salida de audio. `SpotifyTrackTest` valida los metadatos y la ausencia de imágenes. No requiere migraciones. Las pruebas automatizadas no reproducen audio real ni usan una cuenta del proveedor.

## Actualizar en local

Las portadas y el contexto de reproducción requieren reconstruir la API, además de actualizar los archivos web:

```sh
git pull origin main
docker compose up --build -d api web
```

Para operar Spotify en las pruebas autorizadas del local, `.env` debe habilitar los controles solicitados:

```dotenv
SPOTIFY_PRIVATE_TEST_CONTROL=true
SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true
```

Compose lee estos valores al crear la API. Después de cambiarlos, `docker compose up -d --no-deps --force-recreate api` los aplica. Recargar el navegador por sí solo no cambia los permisos del servidor. La cuenta de Spotify debe permitir la reproducción y la edición de la playlist; conectar una cuenta no habilita estas dos opciones por sí mismo.
