# Registro guiado del bar

El alta separa la cuenta del administrador de los datos del local. Un administrador sin bares entra al registro desde el panel; también se puede abrir `#/admin/onboarding` con una sesión de administrador.

1. **Encontrar:** Google Maps o Instagram, con carga manual siempre disponible. Una fuente sin configurar se informa y no bloquea la alternativa manual. Los resultados de Google muestran nombre y dirección antes de seleccionar el local.
2. **Confirmar:** nombre, dirección, ciudad y pin. Los datos importados se pueden editar. Se reutilizan el autocompletado de direcciones y el mapa reales. Descripción, Instagram y horarios son opcionales.
3. **Acceso:** pedidos a 100 metros (`NEARBY`) o desde cualquier ubicación (`ANYWHERE`). El backend guarda esta elección en la misma creación del bar.
4. **Borrador creado:** accesos a portada y música. Agregar una foto no publica el nuevo bar. La publicación requiere portada, revisión y confirmación explícita del dueño.

El administrador puede editar su borrador sin tener que subir una portada primero. El aviso «Tu bar está en borrador» se muestra tanto en el dashboard como en Mi Bar y lleva a los próximos pasos. Preparar música conserva las conexiones y la creación/gestión de playlists de la app existente. Publicar no abre la sesión musical ni habilita por sí solo pedidos.

## Datos y recuperación

El progreso previo al alta se guarda en `sessionStorage` por ID del administrador verificado. Se conserva al retroceder y recargar esta pestaña. No contiene contraseña ni tokens; es local a la pestaña, no un borrador sincronizado entre dispositivos.

La creación utiliza `registrationId` y una restricción única por dueño. Dos peticiones concurrentes o el reintento tras perder una respuesta recuperan el mismo bar. El reintento no sobrescribe los datos de una creación ya confirmada: cualquier cambio posterior se hace en Mi Bar.

Cambiar de fuente o salir de la pantalla cancela la búsqueda. Una respuesta anterior que llega tarde se descarta. Un error o ausencia de resultados conserva la consulta y permite seguir manualmente.

Los horarios de la biografía de Instagram se proponen sin inventar aperturas ni cierres. Deben revisarse y confirmarse explícitamente; de lo contrario no se guardan. El editor muestra toda la semana y aclara que los días sin marcar se consideran cerrados.

El registro de la cuenta de administrador usa correo y contraseña de la API existente. El inicio de sesión con Google de clientes conserva su flujo y sus permisos separados. Las fuentes de importación implementadas son Google Maps e Instagram; Facebook no se ofrece como si ya estuviera integrado.

## Publicación y actualización

La migración **V18** agrega `published` y `registration_id`. Los registros existentes conservan `published=true`, por lo que mantienen su visibilidad anterior. Los nuevos registros se crean con `published=false`. Descubrir bares y el mapa exigen publicación y portada. Las URLs de vista previa y las fotos conservan el comportamiento anterior; «borrador» indica ausencia del mapa, no almacenamiento privado de archivos.

`PUT /api/admin/venues/{id}/publication` exige autorización del dueño y portada y es idempotente. Abrir una sesión musical exige además que el bar esté publicado, junto con los requisitos existentes de Spotify y playlist.

Desde la carpeta local `toca`:

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

Compose aplica V18 con el contenedor de migración antes de iniciar la API. No requiere variables nuevas ni borrar datos. Abrí `http://localhost:5173` y recargá con Cmd/Ctrl+Shift+R.

## Verificación

- `python scripts/test-venue-onboarding.py`: frontend real a 390 y 1440 px, creación de cuenta, tres fuentes/caminos, SDK cartográfico real con estilo y respuestas de proveedores simulados, confirmación del pin, horas incompletas, vuelta atrás/recarga, acceso, reintento sin duplicación y publicación. También cubre respuestas tardías, errores recuperables, fuentes no configuradas, borradores corruptos y separación por dueño. Reutiliza los SDK oficiales en `TOCA_MAP_TEST_ASSETS` o `/tmp/toca-map-assets`; `test-map-layout.py` describe su descarga.
- `TOCA_HTTP_TEST_URL=http://127.0.0.1:8094 python scripts/test-onboarding-http.py`: sobre una API/base **de pruebas**, crea y limpia cuentas sintéticas y comprueba concurrencia, permisos, acceso persistido, edición sin portada, portada sin publicación y publicación explícita. No llama a proveedores.
- Regresiones: 45 tests JUnit, 16 variantes de ingreso al dashboard, 8 escenarios de Google de clientes, 45 aserciones de extracción de horarios, Mi Bar/importación y estudio musical a ambos tamaños, controles de distancia, navegación y recarga offline.

El harness antiguo `scripts/smoke-web.cjs` falla también sobre el commit base `bf9e664`: su entorno no define `location.hostname`, selecciona modo API y bloquea sus propias llamadas de red. No se modificó ese harness; los recorridos reales de navegador anteriores cubren las áreas afectadas por este cambio.
