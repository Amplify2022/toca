# Ficha del bar desde el mapa

En `/#/explore`, el mapa es la vista principal. La búsqueda y los filtros Todos, Con música y Favoritos se aplican al mapa y al listado. Seleccionar un marcador o una tarjeta abre la misma ficha del establecimiento.

- En celular, la ficha es un panel inferior ampliable con el tirador. El mapa sigue visible en ambos tamaños.
- En escritorio, la ficha se abre a la izquierda del mapa. «Ver ficha completa» conserva el acceso a la página del establecimiento.
- El punto seleccionado queda destacado y centrado en la parte visible del mapa.
- La X y la tecla Escape cierran la ficha y recuperan el centro anterior respetando el zoom actual. Los pines funcionan con Enter y espacio.
- La canción actual y el botón compacto «Pedir una canción» están juntos al comienzo de la ficha, con el texto «Elegí tu tema y sumalo a la playlist del bar».
- La portada corresponde a `now.imageUrl` del estado actual, sin buscar otra grabación por título. Si la imagen falta o no carga, se conserva un ícono musical.
- El botón aparece únicamente cuando la API confirma una sesión activa y una canción reproduciéndose. Sin reproducción, en pausa, con la música deshabilitada o si no se puede consultar el estado, sólo se muestra «Por el momento no podés pedir canciones en este bar». No se muestra el botón durante la carga inicial.
- El botón abre directamente la búsqueda de canciones de ese bar. El flujo existente valida la sesión de cliente y pide iniciar sesión si hace falta; abrir el buscador no consume tokens.
- Las fotos se recorren horizontalmente y se pueden ampliar. Instagram aparece debajo de la dirección, como ícono y `@usuario`, sólo si el bar tiene un usuario válido.

La ficha usa los datos públicos y las fotos del bar. La canción actual se consulta cada segundo en `/api/venues/{id}/playback` mientras la ficha está visible. Esta lectura consulta sólo el reproductor, sin cargar la playlist ni usar la caché de 12 segundos de `music-status`. Las consultas simultáneas al mismo bar comparten una muestra de 500 ms; ante errores o límites del proveedor se aplica una espera compartida. El JSON público contiene únicamente el estado de reproducción y los metadatos de la canción, sin información del dispositivo ni credenciales.

La portada y las barras animadas se conservan mientras no cambie la canción; la consulta frecuente no reconstruye esos elementos ni reinicia la animación. Las consultas se cancelan al cerrar o cambiar de bar; una respuesta anterior no reemplaza la selección actual. Un fallo al consultar Spotify no bloquea la información del bar. Esta pantalla no inicia reproducción, pide canciones ni consume tokens.

Este endpoint requiere actualizar la API además de la web:

```bash
git pull origin main
docker compose up --build -d api web
```

El prototipo visual inicial se conserva en `/prototypes/map-place-panel/`, con datos ilustrativos y un mapa de referencia; no alimenta la ficha real.

Verificación:

```bash
python scripts/test-map-layout.py
python scripts/test-map-panel-live.py
```

Ambas pruebas usan los SDK cartográficos y respuestas controladas de la API. Los SDK se guardan en `/tmp/toca-map-assets` o `TOCA_MAP_TEST_ASSETS`. Comprueban geometría en móvil/escritorio, fotos, fallos de carga, navegación, gestos, teclado, estados de reproducción y aislamiento entre bares. No validan disponibilidad de proveedores externos ni usan cuentas reales.


La selección antes cambiaba el contenedor del mapa a `position: fixed`, ocultaba el desplazamiento de la página y extendía el mapa por casi toda la vista. Ahora el panel queda contenido en el mapa. En Chromium se compararon las dimensiones internas y externas de la ventana, la escala de la vista, el estado de pantalla completa, el tamaño CSS y el zoom cartográfico antes y después de seleccionar. No se reprodujo una maximización de la ventana del sistema.

Capturas con respuestas HTTP controladas y una base cartográfica de prueba. [Móvil](previews/explore-390.png) · [Escritorio](previews/explore-1440.png)
