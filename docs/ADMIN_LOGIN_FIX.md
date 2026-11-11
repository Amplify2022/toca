# Error al abrir el panel después del login

El login podía completarse correctamente y luego aparecer «Cannot read properties of undefined (reading 'find')». El dashboard accedía directamente a `stats.days.find(...)`, pero la serialización de una lista vacía omitía la propiedad `days`.

La respuesta de estadísticas ahora conserva explícitamente el historial vacío:

```json
{"tracks":0,"repeats":0,"synced":0,"days":[]}
```

El frontend también admite las respuestas anteriores que omiten el historial vacío. Si las estadísticas no están disponibles o su formato es inválido, el panel sigue abriendo, muestra los datos desconocidos como `—` y permite acceder a Mi Bar. El gráfico conserva los datos válidos y evita mostrar ceros como si fueran una medición cuando el servicio no está disponible.

## Actualización local

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

Después, recargá con Cmd/Ctrl+Shift+R para renovar el script del dashboard. No requiere migraciones ni cambios de credenciales.

## Verificación

- `VenueStatisticsTest`: el historial vacío se conserva incluso con serialización `NON_EMPTY`.
- `python scripts/test-admin-login.py`: formulario real de login, navegación al dashboard y acceso a Mi Bar, a 390 y 1440 px. Cubre listas omitidas/vacías/nulas, actividad, respuestas inválidas y estadísticas no disponibles. La API se simula en esta prueba.
- `python scripts/test-batch-http.py`: contrato HTTP de estadísticas de un bar nuevo usando PostgreSQL y el rol restringido de la API local de pruebas.
- `python scripts/test-runtime.py`: carga de recursos, mapa alternativo y recarga offline.

La corrección se reprodujo también con la API real anterior: devolvía los tres contadores en cero y omitía `days`; con el nuevo DTO devolvió la lista vacía explícita.
