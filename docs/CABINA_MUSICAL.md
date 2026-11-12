# Cabina de música · Opción A

La sección **Música** reemplaza la pantalla extensa de Música y Spotify por la cabina aprobada: playlist como área principal, participación y actividad al costado, reproductor fijo. En móvil la actividad abre un detalle y el reproductor queda sobre la navegación.

Agregar canciones, opciones por canción, creación/renombrado/selección de playlist, reglas y conexión usan ventanas enfocadas. La pantalla no repite formularios debajo de la lista. Los enlaces `#/admin/music` y `#/admin/spotify` muestran la cabina, incluido el retorno de OAuth existente.

## Comportamiento

- La playlist conserva el orden y las ocurrencias duplicadas que devuelve la API. Mover y quitar usan posiciones y el snapshot consultado.
- «Reproducir playlist» confirma empezar desde la primera canción. Cambiar la playlist seleccionada no envía un comando de reproducción.
- Pedidos abiertos/pausados y reproducción tienen controles independientes. El acceso por 100 metros o desde cualquier lugar sigue en Mi Bar.
- La actividad refleja los estados de los pedidos. No representa una cola garantizada del reproductor de Spotify.
- Spotify se conecta con OAuth y el audio puede salir por Web Playback en el navegador o por un dispositivo disponible de Spotify Connect. Las claves permanecen en el servidor.
- Un cambio pendiente bloquea la edición y la selección de playlist. Se consulta o concilia antes de continuar; se conserva la clave de la operación al recuperarla.
- Los permisos de edición y control informados por el servidor siguen siendo obligatorios. El modo demo usa canciones ilustrativas y no envía comandos ni ediciones reales.

El reproductor consulta su estado cada 7 segundos. Cuando no hay una ventana abierta se consulta actividad aproximadamente cada 21 segundos; la playlist se vuelve a cargar si cambia esa actividad. «Actualizar» permite recargarla manualmente. Se evita descargar la playlist completa en cada consulta del reproductor.

## Validación

`scripts/test-admin-studio.py` usa el frontend real y respuestas simuladas de Spotify/SDK a 1440 y 390 px. Cubre agregar, mover, crear, renombrar, seleccionar playlist sin reiniciar audio, controles, audio del navegador, parlantes, reglas, pedidos independientes, edición pendiente, permisos deshabilitados, estado desconectado y entrada al registro guiado. `TOCA_WEB_TEST_URL` indica el servidor web y `TOCA_SCREENSHOT_DIR` el destino de las capturas.

Se mantienen las pruebas existentes de login, navegación administrativa, pedidos, acceso, modo sin conexión y navegación tardía. No cambia el contrato de la API ni requiere migraciones. Las pruebas automatizadas no reproducen audio real ni usan una cuenta del proveedor.
