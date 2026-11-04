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

Se guarda un plan inmutable de playlist antes de modificarla. Solo se confirma un pedido cuando se observa el resultado esperado y se confirma la transacción local. Un fallo ambiguo queda como `UNCERTAIN`; no se finge éxito ni se reenvía automáticamente. La API externa no participa en una transacción PostgreSQL y no ofrece una garantía general de ejecución exactamente una vez.

Estados públicos:

| Estado | Significado |
| --- | --- |
| `PENDING` | Recibido, pendiente de preparación |
| `PROCESSING` | Preparando o confirmando la playlist |
| `DISPATCHED` | Resultado observado en Spotify y registrado localmente |
| `FAILED` | No pudo completarse; consultar el mensaje |
| `UNCERTAIN` | Puede haber efectos remotos; requiere revisión del administrador |

La web consulta el estado con la sesión de cliente y solo muestra éxito para `DISPATCHED`. Si se pierde una respuesta, volver a elegir el mismo tema consulta/reintenta el mismo comando pendiente.

## Revisar un resultado incierto

En el dashboard del bar, **Estado de pedidos** muestra los comandos que requieren atención:

1. Revisá la playlist real en Spotify.
2. **Comprobar en Spotify** hace una verificación de solo lectura contra el plan guardado. Si el resultado final coincide, confirma el pedido sin repetir la modificación.
3. **Cerrar tras revisar** requiere una confirmación explícita. Cierra el comando como fallido y permite continuar; no revierte ni elimina canciones en Spotify.

Un proceso original todavía activo o dentro del margen de espera impide reconciliar/cerrar prematuramente. La recuperación tras un corte conserva los comandos aplicados sin confirmación como inciertos. Si el proveedor cambió externamente, el sistema conserva el bloqueo de revisión en lugar de reconstruir un nuevo pedido a ciegas.

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
