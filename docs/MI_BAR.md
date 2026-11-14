# Mi Bar: resumen y edición por secciones

`#/admin/profile` ahora muestra el resumen del bar. No monta el buscador ni el formulario de edición. Un bar existente, incluido uno en borrador, entra a esta vista. Una cuenta sin bares se deriva al registro guiado, cuyo primer paso conserva el buscador y la carga manual.

Las tarjetas abren pantallas independientes:

- `#/admin/profile/data`: nombre, dirección, ciudad, Instagram, descripción y géneros. El mapa se despliega cuando se necesita ajustar o confirmar la ubicación.
- `#/admin/profile/photos`: portada y galería. Las fotos se guardan al subirlas; no publican automáticamente un borrador.
- `#/admin/profile/hours`: editor semanal de horarios.
- `#/admin/profile/access`: pedidos a 100 metros o desde cualquier ubicación.
- `#/admin/profile/import`: búsqueda opcional en Google Maps o Instagram, seguida de comparación y selección de campos. No tiene un editor de Mi Bar debajo.

La vista de resumen conserva la publicación, la vista pública y la eliminación del bar. Con varios bares, permite seleccionar cuál administrar. Música, pedidos y la cuenta de administrador conservan sus pantallas.

En el perfil público del local (`#/venue/{id}`), todas las fotos se recorren en el carrusel de la cabecera. La portada va primero, sin duplicarse, y se conserva la proporción de las imágenes. Incluye flechas, desplazamiento horizontal, teclado y contador; no cambia de foto automáticamente. Las fotos ya no se repiten debajo de la descripción. Con una única foto no muestra controles de navegación; sin fotos conserva la imagen ilustrativa.

## Actualizar datos desde un perfil

La comparación usa una copia separada de los datos guardados, sin montar un formulario oculto en la página. Los campos completos quedan desmarcados al buscar; se guardan solamente los seleccionados. Si cambia dirección, ciudad o coordenadas, se pasa por Datos y ubicación para confirmar el pin antes de guardar. Los horarios de una biografía requieren revisión, conservan los días no seleccionados y no inventan horas de cierre.

## Guardados independientes

`PATCH /api/admin/venues/{id}` admite `changes`, `expected` y, para una ubicación nueva, `locationConfirmed`. Exige al dueño, valida la lista de campos y comprueba dentro de una transacción los valores que el usuario revisó. No reemplaza otras secciones. Si un mismo dato cambió en otra pantalla, responde 409 y la UI conserva lo escrito. Dos ediciones de campos distintos pueden completarse sin pisarse.

La configuración de acceso y las fotos siguen usando sus endpoints y permisos anteriores. La publicación sigue siendo explícita. Se mantiene `PUT` para clientes anteriores. No se agrega una migración ni se necesitan variables nuevas.

## Actualizar en local

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

Es necesario reconstruir la API para habilitar PATCH y su preflight CORS. Al terminar, abrir `http://localhost:5173` y recargar con Cmd/Ctrl+Shift+R.

## Verificado

- `python scripts/test-venue-profile.py`: UI real en 390 y 1440 px, resumen sin formularios, editores, fotos, acceso, importación selectiva, horarios incompletos y mezcla parcial de la semana, pin bajo demanda, conflictos que conservan los campos y eliminación del bar.
- `python scripts/test-venue-gallery.py`: perfil público a 390 y 1440 px, todas las fotos arriba, portada sin duplicados, flechas/teclado/desplazamiento, cambio de ancho y casos con una foto o sin fotos.
- `TOCA_HTTP_TEST_URL=http://127.0.0.1:8096 python scripts/test-venue-profile-http.py`: API y PostgreSQL reales en una base de tests; autorización, cambios parciales, concurrencia, conflictos y CORS PATCH, con cuentas sintéticas que se eliminan al terminar.
- `test-venue-onboarding.py`: alta completa por Google, Instagram y manual, borrador y publicación a ambos tamaños.
- Regresiones: 45 tests del backend, 16 variantes de ingreso al panel, 8 escenarios de Google de clientes, 45 aserciones de extracción de horarios, estudio musical, acceso por distancia, navegación y recarga offline.

Los SDK cartográficos son reales en las pruebas de UI; el estilo y las respuestas de Google/Meta/Spotify están simulados. Esas pruebas no consultan cuentas externas.
