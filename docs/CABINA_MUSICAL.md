# Cabina de música · Opción A

La sección **Música** reemplaza la pantalla extensa de Música y Spotify por la cabina aprobada: playlist como área principal, participación y actividad al costado, reproductor fijo. En móvil la actividad abre un detalle y el reproductor queda sobre la navegación.

Agregar canciones, opciones por canción, creación/renombrado/selección de playlist, reglas y conexión usan ventanas enfocadas. La pantalla no repite formularios debajo de la lista. Los enlaces `#/admin/music` y `#/admin/spotify` muestran la cabina, incluido el retorno de OAuth existente.

## Comportamiento

- La playlist conserva el orden y las ocurrencias duplicadas que devuelve la API. Mover y quitar usan posiciones y el snapshot consultado.
- Cada canción tiene su portada y un botón de play/pausa. Si ya está sonando en esa playlist, continuar usa `resume` para conservar la posición. La API incorpora `imageUrl` en canciones y `contextUri` en el estado del reproductor; los clientes anteriores siguen siendo compatibles.
- El control de mover admite mouse, touch y teclado: Espacio selecciona, flechas cambian la posición y Enter confirma; Escape cancela. No se cambia el orden visible hasta que el servidor confirma. Un snapshot diferente cancela el movimiento y pide revisar la lista.
- «Reproducir playlist» confirma empezar desde la primera canción. Cambiar la playlist seleccionada no envía un comando de reproducción.
- El inicio envía el ID de la canción y la identidad de la playlist. El servidor resuelve el tema contra la lista vigente y usa su URI cuando es único; los duplicados necesitan una versión coincidente para conservar la ocurrencia. Un tema conocido como no reproducible o local se informa sin avanzar silenciosamente a otro.
- Pedidos abiertos/pausados y reproducción tienen controles independientes. El acceso por 100 metros o desde cualquier lugar sigue en Mi Bar.
- La actividad refleja los estados de los pedidos. No representa una cola garantizada del reproductor de Spotify.
- Spotify se conecta con OAuth y el audio puede salir por Web Playback en el navegador o por un dispositivo disponible de Spotify Connect. Las claves permanecen en el servidor.
- Play espera a que termine la preparación del audio. La transferencia inicial se completa antes de reproducir y los avisos repetidos de disponibilidad del SDK no vuelven a transferir ni pausan la música. Elegir Spotify Connect desactiva la selección del navegador para que una reconexión tardía no cambie la salida.
- Un cambio pendiente bloquea la edición y la selección de playlist. Se consulta o concilia antes de continuar; se conserva la clave de la operación al recuperarla.
- Los permisos de edición y control informados por el servidor siguen siendo obligatorios. El modo demo usa canciones ilustrativas y no envía comandos ni ediciones reales.
- «Agregar» permite abrir el buscador aunque la edición esté deshabilitada e informa qué falta. La reproducción sin salida activa abre la elección de audio. Los errores de Spotify y los cambios pendientes quedan visibles.
- Si falla la consulta de una edición guardada, la playlist y el reproductor se cargan igualmente. Se conserva la clave pendiente para consultar después; no se descarta ni se repite una escritura con otra clave.
- Antes de editar se consulta la versión vigente. Si un conflicto fue confirmado como anterior a la escritura, se permite un solo reintento con una selección que siga siendo inequívoca. Las posiciones se ajustan usando los IDs y anclas originales; duplicados ambiguos requieren revisar la lista. Los resultados inciertos no se reintentan.
- Una edición completada devuelve la playlist verificada en la respuesta y la cabina la muestra de inmediato. No se permite que una lectura con una versión anterior vuelva a mostrar un tema eliminado. La lista completa se devuelve al cliente sin duplicarla en el historial persistido de operaciones.
- Al agregar se muestra el nombre del tema, «Agregado ✓» y un resaltado de la fila. La confirmación y el mensaje de éxito desaparecen a los cinco segundos; los errores permanecen hasta una acción posterior.

El reloj visual avanza a partir de la última muestra y se dibuja cada 250 ms, sin consultar la API cada segundo. Con audio del navegador, los eventos de Web Playback se aplican de inmediato y su estado local se consulta cada segundo. El reproductor mantiene la consulta a la API cada 7 segundos para Spotify Connect y como respaldo. Play/pausa responde al toque, muestra sincronización pendiente y revierte la indicación si Spotify rechaza el comando. Las muestras atrasadas no deshacen la indicación mientras llega la confirmación.

Cuando no hay una ventana abierta se consulta actividad aproximadamente cada 21 segundos; la playlist se vuelve a cargar si cambia esa actividad. «Actualizar» permite recargarla manualmente. Se evita descargar la playlist completa en cada consulta del reproductor.

## Validación

`scripts/test-admin-studio.py` usa el frontend real y respuestas simuladas de Spotify/SDK a 1440 y 390 px. Cubre agregar, mover, crear, renombrar, seleccionar playlist sin reiniciar audio, controles, audio del navegador, parlantes, reglas, pedidos independientes, edición pendiente, permisos deshabilitados, estado desconectado y entrada al registro guiado. `TOCA_WEB_TEST_URL` indica el servidor web y `TOCA_SCREENSHOT_DIR` el destino de las capturas.

Se mantienen las pruebas existentes de login, navegación administrativa, pedidos, acceso, modo sin conexión y navegación tardía. Las pruebas de cabina también verifican orden real en ambas direcciones, arrastre con mouse/touch, teclado y cancelación, ocurrencias duplicadas, portadas, play/pausa/continuación por fila y falta de salida de audio. `SpotifyTrackTest` valida los metadatos y la ausencia de imágenes. No requiere migraciones. Las pruebas automatizadas no reproducen audio real ni usan una cuenta del proveedor.

`scripts/test-music-sync.py` verifica respuestas demoradas, versiones atrasadas, reintento acotado antes de escribir, duplicados ambiguos, resultados inciertos, confirmación de cinco segundos, reloj del SDK, iconos inmediatos y recuperación ante rechazo. También comprueba en escritorio y móvil que los días agrupados en Mi Bar conserven sus horas en la misma línea. `node scripts/test-music-edit-intent.cjs` valida el ajuste seguro de posiciones.

`scripts/test-browser-audio.py` retiene la transferencia inicial diez segundos y emite seis avisos de reconexión. Comprueba que se envíe un solo inicio, que la finalización tardía no lo pause y que las consultas de estado no envíen comandos de salto. También cubre seleccionar un tema, pausar/continuar y cambiar a Spotify Connect. `MusicPlaybackStartTest` valida URI, posiciones concurrentes, duplicados y temas no reproducibles. Estas pruebas usan SDK/API simulados y no una cuenta real de Spotify.

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
