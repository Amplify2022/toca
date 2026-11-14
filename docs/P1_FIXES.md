> Cambio de requisito posterior: QR ya no es obligatorio. NEARBY verifica distancia de 100 metros; ANYWHERE no solicita GPS. Las referencias al QR de este registro son históricas. Ver [comportamiento actual](MAP_DISTANCE_FIX.md).

# Correcciones P1

Este cambio cubre los siete P1 del análisis: conexiones/transacciones, límites de pedidos por cuenta, protección del acceso/registro, reglas vigentes, consistencia Spotify/DB, interruptor de escrituras y autorización de cercanía.

## Actualizar una instalación

```bash
docker compose up --build -d api web
```

Flyway aplica V13–V15 conservando las cuentas, bares y pedidos existentes. V13 reemplaza el historial de intentos fallidos que bloqueaba globalmente un correo por contadores temporales compartidos. Los accesos de cercanía anteriores basados únicamente en GPS requieren un nuevo check-in con el QR vigente.

Las escrituras de playlist quedan desactivadas por defecto. Para pruebas privadas autorizadas que deban modificar Spotify, configurá expresamente en `.env`:

```dotenv
SPOTIFY_PRIVATE_TEST_PLAYLIST_WRITES=true
```

`SPOTIFY_PRIVATE_TEST_CONTROL` regula otra capacidad. Ya no se agrega automáticamente un pedido a la cola activa del reproductor: esa operación externa no ofrece una clave de reintento y podía duplicar efectos. La playlist y la cola del reproductor son diferentes; no se garantiza reproducción inmediata.

## Acceso de clientes al bar

- `NEARBY` exige sesión de cliente, QR vigente del bar y ubicación orientativa dentro del radio configurado.
- El permiso dura 20 minutos y queda ligado a la generación del QR. Rotar el QR lo revoca. Abrir una nueva sesión musical genera un QR nuevo; el bar debe mostrar el actualizado desde el panel.
- `ANYWHERE` sigue siendo una elección explícita del propietario para recibir pedidos sin QR ni ubicación.
- El navegador no puede demostrar presencia física infalsificable: un QR puede compartirse y el GPS puede simularse. El control nuevo evita autorizar con coordenadas declaradas únicamente. No debe presentarse como un sistema antifraude físico garantizado.

## Pedidos durables y reintentos

La web genera una `Idempotency-Key`, la conserva en `sessionStorage` y la reutiliza si se pierde la respuesta. La clave se separa por cuenta, bar y tema. El backend persiste la admisión antes de consultar Spotify. Cambiar `guestId` no reinicia el límite: ahora se aplica por cliente autenticado y bar, incluyendo comandos pendientes y eventos históricos del período.

Las transacciones locales son cortas y comparten una conexión. Ninguna llamada al proveedor mantiene una transacción o un bloqueo de fila del bar. Los comandos por bar se procesan en orden y vuelven a comprobar la sesión, la política, el acceso y las reglas antes de ejecutar efectos remotos. Los cambios incompatibles del panel se rechazan mientras hay un pedido sincronizándose o incierto.

Se guarda un plan inmutable de playlist antes de modificarla. Solo se confirma un pedido cuando se observa el resultado esperado y se confirma la transacción local. Los pedidos se agregan automáticamente: no requieren aprobación del bar. Un fallo ambiguo queda como `UNCERTAIN` mientras la app comprueba el resultado. Si Spotify ya aplicó el plan, se confirma sin repetir escrituras. Después del margen de espera del proceso original, la recuperación puede continuar desde un estado intermedio exacto del plan guardado. No recalcula posiciones ni repite pasos ya observados. La API externa no participa en una transacción PostgreSQL y no ofrece una garantía general de ejecución exactamente una vez.

Un error de lectura anterior a cualquier escritura, o un rechazo explícito de la primera escritura por Spotify, se informa como `FAILED` con su motivo. No se presenta como una revisión o aprobación pendiente. Si hubo escrituras previas o se perdió su respuesta, se conserva la verificación automática del resultado.

Estados públicos:

| Estado | Significado |
| --- | --- |
| `PENDING` | Recibido, pendiente de preparación |
| `PROCESSING` | Preparando o confirmando la playlist |
| `DISPATCHED` | Resultado observado en Spotify y registrado localmente |
| `FAILED` | No pudo completarse; consultar el mensaje |
| `UNCERTAIN` | Confirmación automática en curso; conserva el mismo pedido |

La web consulta automáticamente el estado con la sesión de cliente, incluyendo `UNCERTAIN`, y solo muestra éxito para `DISPATCHED`. Si se pierde una respuesta, volver a elegir el mismo tema consulta/reintenta el mismo comando pendiente.

## Recuperación y actividad automáticas

El worker comprueba los pedidos inciertos sin intervención del bar. Espera a que venza la autorización del proceso anterior más un margen de 120 segundos antes de reanudar escrituras, adquiere una nueva autorización exclusiva y vuelve a validar las reglas y la sesión. Una playlist modificada externamente que no coincida con ningún estado conocido no se sobrescribe. Una caída del proveedor mantiene el pedido pendiente y vuelve a comprobarlo después del margen de espera.

El dashboard muestra **Actividad de canciones**, una vista de solo lectura que se actualiza cada 5 segundos. Muestra el procesamiento, los reintentos automáticos, los errores y los temas ya agregados. No incluye botones para aprobar, comprobar en Spotify, cerrar revisiones ni actualizar manualmente.

Un proceso original todavía activo o dentro del margen de espera impide finalizar prematuramente. Si, una vez vencido ese margen, se comprueba que el plan ya no es compatible o falta autorización y la comprobación no emitió nuevas escrituras inciertas, el pedido termina como fallido y devuelve el token. Los pedidos siguientes pueden continuar; el bar no debe aprobar ni cerrar una revisión. Las respuestas todavía ambiguas y las caídas transitorias conservan su reserva y se vuelven a comprobar automáticamente.

El saldo y las recargas simuladas ya están [integrados con la API](CUSTOMER_TOKENS.md). Se requiere saldo para admitir un pedido, pero el descuento de 1 token se realiza sólo al confirmar su éxito. La pantalla dirige al usuario sin saldo a recargar en su perfil y vuelve a la playlist después de agregar una canción. No se muestran reservas ni movimientos de pedidos pendientes.

## Protección del acceso

Un filtro bloqueante ejecutado antes de BCrypt/Google usa contadores PostgreSQL compartidos. Combina conexión real, conexión+principal, registro y presupuesto global; devuelve 429 con `Retry-After`. No confía en `X-Forwarded-For` ni `Forwarded` enviados por el cliente. Un correo atacado desde otra conexión no queda bloqueado globalmente. Los contadores rechazados no consumen el presupuesto de los demás y los expirados se purgan.

El despliegue actual es local. Si se agrega un proxy inverso, debe definirse y probarse su política de identificación del cliente: ignorar cabeceras no confiables evita suplantación, pero detrás de un proxy todos podrían compartir su IP y sus límites. No habilitar confianza genérica en cabeceras del público.

## Validación

```bash
node scripts/test-presence.cjs
node scripts/test-request-sync.cjs
python3 scripts/test-google-login.py
cd backend
gradle --no-daemon test
```

Para las regresiones de PostgreSQL y HTTP, ver [el runner de integración](../scripts/integration/README.md). La prueba de interfaz completa es `python3 scripts/test-request-flow.py` con la web local iniciada.

Las pruebas nuevas cubren reutilización/aislamiento de conexiones, rollback de transacciones anidadas, política de limitación, planes/reintentos de playlist, resultados remotos ambiguos y autorización QR. Las sondas de integración adicionales usan PostgreSQL aislado y un gateway Spotify simulado, sin cuentas ni modificaciones reales del proveedor.

El alcance de este lote es P1. El XSS P0 y los P2/P3 del informe requieren sus propios cambios; este lote no debe interpretarse como aprobación para producción.
