# TOCÁ v1.5 — ubicación de bares y filtros sincronizados

Esta entrega actualiza **solamente el frontend** de TOCÁ v1.4. Los endpoints de Micronaut, las tablas de PostgreSQL y la integración OAuth con Spotify permanecen sin cambios.

## Cambios

1. En la vista antigua del dashboard administrativo se eliminó «Acceso rápido». Además, en escritorio las pestañas superiores redundantes quedan ocultas si está visible el menú lateral; en pantallas pequeñas permanecen para no perder acceso a todas las secciones. Se mantienen los indicadores y la información musical.
2. En **Portal de bares → Mi bar**, el formulario permite escribir dirección y ciudad, pulsar **Buscar dirección en el mapa**, elegir un resultado, mover el pin y hacer clic en **Confirmar ubicación del pin**. Se eliminó el bloque «Información pública» y ya no hay campos visibles de latitud/longitud.
3. La pantalla de **registrar el primer bar** también utiliza el selector de ubicación.
4. En **Descubrir bares**, los chips y la búsqueda actualizan **tanto las tarjetas como los marcadores de Leaflet y del mapa de respaldo**. Cuando no hay resultados se quitan todos los pins.

## Instalar el parche web (recomendado)

Desde la carpeta raíz `toca`:

```bash
cp -R web web-backup-v14
unzip -o ~/Downloads/TOCA-v1.5-parche-web.zip -d .
docker compose up -d --force-recreate web
```

Luego abrí `http://localhost:5173/#/admin/profile`. Si ves una versión anterior, en Chrome usá **DevTools → Application → Service Workers → Unregister** y recargá con **Cmd + Shift + R**. Se cambió el identificador de caché a `toca-shell-6-location-v15`.

**No hagas `docker compose down -v`**: eso eliminaría los datos de PostgreSQL. No es necesario un rebuild de la API ni volver a conectar Spotify.

## Pruebas manuales

### A. Editar la ubicación de un bar

1. Entrá en `http://localhost:5173/#/admin/profile` con la sesión de administrador.
2. Localizá **Mi bar · ubicación e información**. Los campos visibles deben ser nombre, dirección, ciudad, géneros y descripción; no deben aparecer latitud/longitud ni «Información pública».
3. Cambiá la dirección y pulsá **Buscar dirección en el mapa**. Seleccioná uno de los resultados. La búsqueda se realiza **solo al pulsar el botón**, no con cada letra.
4. Ajustá el pin arrastrándolo o pulsando el mapa. Pulsá **Confirmar ubicación del pin**.
5. Pulsá **Guardar cambios**. La información sigue persistiendo en los campos `latitude` y `longitude` existentes de la API.
6. Recargá Mi bar y comprobá que el pin aparece en la ubicación guardada.
7. En otra pestaña abrí **Descubrir bares** y comprobá que el marcador del bar está en esa ubicación.
8. Cambiá nuevamente el texto de la dirección e intentá guardar sin confirmar una ubicación: el frontend debe impedirlo con un mensaje.

### B. Crear un bar nuevo

1. Con una cuenta administradora sin bares, entrá al portal.
2. El formulario de alta debe mostrar el mismo buscador de dirección y pin, en lugar de pedir latitud/longitud.
3. No debería ser posible crear el bar sin confirmar el pin.

### C. Filtros del descubrimiento

1. Entrá en `http://localhost:5173/#/explore`.
2. Escribí el nombre de un bar. Debe quedar solo su tarjeta **y solo su pin**.
3. Buscá una frase que no exista. No deben quedar tarjetas ni marcadores.
4. Limpiá el campo y probá `En vivo`, `Rock`, `Pop` y `Jazz`: los dos paneles deben coincidir.
5. Si no se carga Leaflet (sin conexión), verificá que también se filtren los marcadores del mapa ilustrativo.

### D. Verificar que Spotify no se alteró

1. Entrá al portal del bar y comprobá que sigue vinculado con la misma playlist.
2. Abrí sesión y pedí una canción desde el QR. Debe insertarse o adelantarse en la playlist como en v1.4.

## Servicios de mapas y búsqueda

- El mapa interactivo carga **Leaflet** y teselas OpenStreetMap. Requiere conexión a internet; utiliza un mapa ilustrativo de respaldo para el descubrimiento.
- La búsqueda de direcciones utiliza la API de demostración pública **Photon (komoot)** con una petición iniciada expresamente por el administrador. No implementa autocompletado continuo. Hay una espera de al menos 1,1 segundos entre búsquedas de una página y una caché de consultas repetidas mientras la página permanece abierta.
- Photon permite uso razonable del servidor demo pero **no ofrece garantía de disponibilidad ni es adecuado como dependencia de producción sin gestionar cuotas o un servicio propio**. Para un lanzamiento público hay que utilizar un proveedor contratado o una instancia autogestionada, con caché y límites por aplicación.
- Los textos de dirección buscados se envían a Photon; no incluyas domicilios privados que no quieras compartir con ese tercero.
- Atribución OpenStreetMap visible en el mapa y junto al buscador.

## Validación realizada

- `node --check` de los JavaScript modificados.
- `node scripts/smoke-web.cjs` y `node scripts/test-live-music.cjs`.
- `python scripts/test-v15-ui.py`: prueba Chromium en memoria, con API, mapa y geocodificador simulados, para verificar filtro de tarjetas/markers, edición de dirección y confirmación del pin.

**No se ha probado en este entorno** el servidor real de Photon, las llamadas reales a Spotify, ni una compilación completa de Micronaut. Esas comprobaciones se realizan en tu instalación local.
