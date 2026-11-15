# Ficha del bar desde el mapa

En `/#/explore`, seleccionar un pin abre la ficha del establecimiento en lugar del popup anterior:

- En celular: panel inferior de aproximadamente media pantalla, ampliable con el tirador o arrastrándolo hacia arriba. Se puede reducir con el mismo control.
- En web: panel lateral izquierdo, con el mapa visible a la derecha.
- El punto seleccionado queda destacado y centrado en la parte visible del mapa.
- Cerrar, presionar Escape o volver a explorar recupera el mapa original. Los pines funcionan con Enter y espacio.
- «Ver bar» abre el perfil existente. Las fotos se recorren horizontalmente y se pueden ampliar. Instagram sólo aparece si el bar tiene un usuario válido.

La ficha usa los datos públicos y las fotos del bar. La canción actual se consulta en `music-status` para el bar seleccionado y se actualiza cada 15 segundos mientras la ficha está visible. La reproducción pausada se identifica como tal. Las consultas se cancelan al cerrar o cambiar de bar; una respuesta anterior no reemplaza la selección actual. Un fallo al consultar Spotify no bloquea la información del bar. Esta pantalla no inicia reproducción, pide canciones ni consume tokens.

El prototipo visual se conserva en `/prototypes/map-place-panel/`, con datos ilustrativos y un mapa de referencia; no alimenta la ficha real.

Verificación:

```bash
python scripts/test-map-layout.py
python scripts/test-map-panel-live.py
```

La primera prueba utiliza los SDK oficiales de mapas (guardados en `/tmp/toca-map-assets` o `TOCA_MAP_TEST_ASSETS`) con una capa simulada. La segunda usa respuestas controladas de la API. Comprueban geometría en móvil/escritorio, fotos, fallos de carga, navegación, gestos, teclado, estados de reproducción y aislamiento entre bares. No validan disponibilidad de proveedores externos ni usan cuentas reales.
