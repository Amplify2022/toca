# Mapa y acceso por distancia

El requisito vigente es el que selecciona el propietario en **Mi Bar → Quién puede pedir canciones**:

- **Solo clientes a 100 metros del bar (NEARBY):** la web consulta primero la validación vigente del cliente en ese bar. Si no tiene una, pide ubicación y la API comprueba distancia y precisión. No se exige QR ni un secreto en el enlace.
- **Permitir pedidos desde cualquier ubicación (ANYWHERE):** no pide GPS ni QR. El cliente sigue iniciando sesión y se mantienen los límites de pedidos y las reglas musicales del bar.

Los registros de proximidad duran 20 minutos. Los pedidos siguientes reutilizan la validación que confirme el servidor, sin pedir GPS otra vez. Cambiar la política revoca los registros anteriores y abrir una sesión musical nueva invalida los de la sesión previa. Un reinicio de playlist conserva esa validación. La columna histórica del hash QR queda por compatibilidad, sin participar de la autorización.

Si el proveedor de ubicación falla o demora, la web realiza un segundo intento con posicionamiento de red, aceptando únicamente una lectura con precisión de hasta 100 metros. Puede usar una lectura del navegador de hasta 30 segundos. Si ambos intentos fallan, vuelve a consultar la validación del servidor antes de mostrar el error. No reintenta automáticamente una denegación de permisos. Un intento posterior puede recuperarse en la misma pantalla, sin refrescar; no se envía un pedido ni se descuentan tokens mientras no se valide el acceso.

Los chequeos simultáneos de la misma cuenta/bar comparten una única consulta en curso. Un cambio de cuenta descarta el resultado anterior. Las respuestas de presencia llevan `Cache-Control: no-store, private` y `Vary: X-TOCA-Customer`; no se guarda una autorización local que pueda omitir la comprobación del servidor.

El mapa recupera el estilo vectorial VersaTiles Gray Dark mediante Leaflet + MapLibre. Los SDK y sus CSS se cargan bajo demanda y en orden. El contenedor conserva dimensiones reales durante la inicialización; al cargar se recalculan mapa/canvas. Si falla el proveedor, permanece la ilustración alternativa en lugar de un panel vacío. El editor de ubicación del administrador usa el mismo cargador y estilo.

## Actualización local

```bash
git pull --ff-only origin main
docker compose up --build -d api web
```

No hay migración nueva, ni requiere modificar `.env` o borrar datos. Recargá con Cmd/Ctrl+Shift+R para obtener los scripts y Service Worker nuevos.

Para probar con un equipo cuyo GPS no es preciso, se puede seleccionar ANYWHERE en Mi Bar. En modo NEARBY hay que permitir ubicación en el navegador y estar a menos de 100 metros de las coordenadas guardadas del bar.

## Validación

- `node scripts/test-presence.cjs`: validación vigente, caducidad, recuperación tras errores temporales, precisión, chequeos simultáneos, cambio de cuenta y denegación de permisos.
- `python scripts/test-customer-tokens.py`: pedidos, saldo y recuperación del GPS sin refrescar, en móvil y escritorio, con API simulada.
- La [sonda HTTP](../scripts/integration/README.md) comprueba presencia, aislamiento entre clientes, caducidad y precisión contra la API real. Con `TOCA_TEST_WEB_URL` también verifica la recuperación del navegador contra PostgreSQL real, sin cuentas externas.
- `bash scripts/integration/run-p1-services.sh`: PostgreSQL real, 99 metros permitidos, 101 rechazados, precisión insuficiente, caducidad y ANYWHERE; Spotify simulado.
- `python scripts/test-map-layout.py`: SDK Leaflet/MapLibre reales, móvil/escritorio, dimensiones del canvas, pines y filtros. El contenido del estilo se simula para no depender del servicio de teselas.
- `python scripts/test-runtime.py`: fallback sin proveedores y apertura offline.

El SDK de mapas y las teselas necesitan conexión. Estas pruebas no certifican disponibilidad permanente del proveedor externo.
