# Ficha del bar desde el mapa

En `/#/explore`, seleccionar un pin abre la ficha del establecimiento en lugar del popup anterior:

- En celular: panel inferior de aproximadamente media pantalla, ampliable con el tirador o arrastrándolo hacia arriba. Se puede reducir con el mismo control.
- En web: panel lateral izquierdo, con el mapa visible a la derecha.
- El punto seleccionado queda destacado y centrado en la parte visible del mapa.
- La X y la tecla Escape cierran la ficha y recuperan el mapa original. Los pines funcionan con Enter y espacio.
- La canción actual y el botón compacto «Pedir una canción» están juntos al comienzo de la ficha, con el texto «Elegí tu tema y sumalo a la playlist del bar».
- La portada corresponde a `now.imageUrl` del estado actual, sin buscar otra grabación por título. Si la imagen falta o no carga, se conserva un ícono musical.
- El botón aparece únicamente cuando la API confirma una sesión activa y una canción reproduciéndose. Sin reproducción, en pausa, con la música deshabilitada o si no se puede consultar el estado, sólo se muestra «Por el momento no podés pedir canciones en este bar». No se muestra el botón durante la carga inicial.
- El botón abre directamente la búsqueda de canciones de ese bar. El flujo existente valida la sesión de cliente y pide iniciar sesión si hace falta; abrir el buscador no consume tokens.
- Las fotos se recorren horizontalmente y se pueden ampliar. Instagram aparece debajo de la dirección, como ícono y `@usuario`, sólo si el bar tiene un usuario válido.

La ficha usa los datos públicos y las fotos del bar. La canción actual se consulta en `music-status` para el bar seleccionado y se actualiza cada 15 segundos mientras la ficha está visible. Las consultas se cancelan al cerrar o cambiar de bar; una respuesta anterior no reemplaza la selección actual. Un fallo al consultar Spotify no bloquea la información del bar. Esta pantalla no inicia reproducción, pide canciones ni consume tokens.

El prototipo visual inicial se conserva en `/prototypes/map-place-panel/`, con datos ilustrativos y un mapa de referencia; no alimenta la ficha real.

Verificación:

```bash
python scripts/test-map-layout.py
python scripts/test-map-panel-live.py
```

La primera prueba utiliza los SDK oficiales de mapas (guardados en `/tmp/toca-map-assets` o `TOCA_MAP_TEST_ASSETS`) con una capa simulada. La segunda usa respuestas controladas de la API. Comprueban geometría en móvil/escritorio, fotos, fallos de carga, navegación, gestos, teclado, estados de reproducción y aislamiento entre bares. No validan disponibilidad de proveedores externos ni usan cuentas reales.
