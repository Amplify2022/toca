# Mapa y acceso por distancia

El requisito vigente es el que selecciona el propietario en **Mi Bar → Quién puede pedir canciones**:

- **Solo clientes a 100 metros del bar (NEARBY):** la web consulta GPS al intentar cada pedido; la API comprueba distancia y precisión. No se exige QR ni un secreto en el enlace.
- **Permitir pedidos desde cualquier ubicación (ANYWHERE):** no pide GPS ni QR. El cliente sigue iniciando sesión y se mantienen los límites de pedidos y las reglas musicales del bar.

Los registros de proximidad conservan su caducidad de 20 minutos para coordinar el procesamiento del pedido; la web vuelve a consultar ubicación en cada intento. Cambiar la política revoca los registros anteriores y abrir una sesión musical nueva invalida los de la sesión previa. La columna histórica del hash QR queda por compatibilidad, sin participar de la autorización.

El mapa recupera el estilo vectorial VersaTiles Gray Dark mediante Leaflet + MapLibre. Los SDK y sus CSS se cargan bajo demanda y en orden. El contenedor conserva dimensiones reales durante la inicialización; al cargar se recalculan mapa/canvas. Si falla el proveedor, permanece la ilustración alternativa en lugar de un panel vacío. El editor de ubicación del administrador usa el mismo cargador y estilo.

## Actualización local

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

No hay migración nueva, ni requiere modificar `.env` o borrar datos. Recargá con Cmd/Ctrl+Shift+R para obtener los scripts y Service Worker nuevos.

Para probar con un equipo cuyo GPS no es preciso, se puede seleccionar ANYWHERE en Mi Bar. En modo NEARBY hay que permitir ubicación en el navegador y estar a menos de 100 metros de las coordenadas guardadas del bar.

## Validación

- `node scripts/test-presence.cjs`: distancia sin QR, ANYWHERE sin GPS, posición fresca y errores de ubicación/login.
- `bash scripts/integration/run-p1-services.sh`: PostgreSQL real, 99 metros permitidos, 101 rechazados, precisión insuficiente, caducidad y ANYWHERE; Spotify simulado.
- `python scripts/test-map-layout.py`: SDK Leaflet/MapLibre reales, móvil/escritorio, dimensiones del canvas, pines y filtros. El contenido del estilo se simula para no depender del servicio de teselas.
- `python scripts/test-runtime.py`: fallback sin proveedores y apertura offline.

El SDK de mapas y las teselas necesitan conexión. Estas pruebas no certifican disponibilidad permanente del proveedor externo.
