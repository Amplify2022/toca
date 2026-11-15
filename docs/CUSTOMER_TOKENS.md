# Tokens de usuario y pedidos

El saldo ahora está integrado con la API y PostgreSQL. Las cuentas nuevas y existentes empiezan con **0 tokens**; no se importan los 3 tokens ni los datos del prototipo independiente.

## Recorrido

1. Al tocar **Pedir**, la app consulta el saldo de la cuenta de cliente.
2. Sin saldo, abre **Mi perfil → Tus tokens** con el panel de recarga. No envía el pedido ni consulta Spotify para agregarlo. Conserva el tema y el bar elegidos.
3. La recarga simulada permite elegir 5, 12 o 30 tokens. Se acredita en el servidor y cierra el panel. No se cobra dinero.
4. Si la recarga vino de un pedido sin saldo, continúa automáticamente con el tema y el bar elegidos: valida el acceso, envía el mismo pedido y espera su confirmación. No requiere volver a tocar **Pedir**. Al confirmarse, muestra **«¡Tema agregado!»** en el centro durante 1,5 segundos y vuelve automáticamente a la playlist.
5. **Sólo al confirmar el éxito descuenta 1 token**. Un pedido iniciado con saldo conserva su aviso y regreso directo a la playlist. No hay aprobación del bar. Una recarga habitual desde el perfil, sin pedido elegido, sólo acredita tokens y muestra el aviso de recarga.
6. Mientras se procesa, el saldo y los movimientos permanecen iguales. Si falla, no se descuenta ningún token. Los reintentos y pedidos simultáneos se coordinan internamente para impedir un doble gasto; no se muestran tokens en reserva.
7. Si la playlist terminó y Spotify sigue con recomendaciones u otro contexto, coloca el tema pedido al principio y reinicia **toda la playlist** desde ese primer tema. Requiere la salida de audio y el control de reproducción que usa el bar. Si la playlist sigue sonando normalmente, el pedido mantiene el flujo habitual y no interrumpe la canción actual.
8. Al reiniciar comienza una nueva vuelta de pedidos: los pedidos históricos no ocupan lugares pendientes. Si el primer tema está pausado y no hay otros pedidos pendientes de esa misma vuelta, el siguiente pedido va en la posición 2. Los pedidos de esa vuelta respetan el orden de llegada. La migración V22 reconoce los reinicios automáticos ya confirmados en versiones anteriores.

Para bares con control por distancia, la ubicación validada por el servidor sigue vigente durante 20 minutos dentro de la misma sesión del bar. Los pedidos siguientes reutilizan esa validación; un reinicio de playlist no la invalida. Al vencer o comenzar otra sesión del bar, se vuelve a pedir ubicación. Los bares que permiten pedidos desde cualquier lugar no solicitan GPS.

Una falla temporal del proveedor de ubicación se reintenta automáticamente, con el mismo límite de precisión. Si no se recupera, se vuelve a consultar la autorización del servidor antes de mostrar un error. El usuario puede intentar nuevamente sin refrescar la página; no se envía el pedido ni se toca el saldo sin acceso validado.

La falta de saldo tiene un manejo común en la consulta inicial, el envío y los reintentos: abre la recarga y conserva la canción, sin quedarse en un aviso de error. También se reconocen respuestas guardadas de versiones anteriores.

El panel del bar muestra actividad de solo lectura y se actualiza automáticamente. Los pedidos no se aprueban manualmente.

Un conflicto persistente con la playlist no se convierte en una tarea de revisión del bar: después de comprobarlo con el proceso anterior ya detenido, la app puede terminar el pedido sin descontar tokens y continuar con los siguientes. No sobrescribe una playlist incompatible ni informa una canción como agregada sin verificarlo.

El perfil habitual mantiene foto, favoritos y accesos de cuenta. Ahora incluye saldo y un enlace a los movimientos. La pantalla de tokens se abre en **http://localhost:5173/#/profile/tokens** con sesión de cliente.

## Datos y API

La migración `V20__customer_tokens.sql` crea el saldo y los movimientos. `V21__charge_confirmed_requests.sql` cambia el cobro a la confirmación final: la admisión sólo coordina el acceso al crédito, sin alterar el saldo ni crear un débito. El descuento y el estado de pedido exitoso se confirman en la misma transacción. No puede gastarse dos veces el último token, incluso desde distintos bares o pestañas.

V21 devuelve los descuentos anteriores que no llegaron a confirmarse: **4 tokens + 1 pendiente vuelven a ser 5 tokens**. Conserva los cargos ya confirmados y su historial. Los pedidos viejos interrumpidos no se reproducen a ciegas: un nuevo clic en pedir vuelve a prepararlos automáticamente con las reglas actuales.

- `GET /api/customers/me/wallet`: saldo, costo de pedido, paquetes y últimos 50 movimientos confirmados. No expone reservas.
- `POST /api/customers/me/wallet/topups`: recarga simulada con `packId` y `Idempotency-Key` obligatoria. El servidor define los créditos; no acepta un importe o un usuario elegido por el cliente.
- Ambas rutas requieren la sesión de cliente en `Authorization: Bearer …`, separada de la sesión del bar, y responden con `Cache-Control: no-store`.
- Una admisión sin saldo devuelve HTTP 402 con `code: INSUFFICIENT_TOKENS` y no crea un comando ni modifica Spotify. La web también trata una pérdida de saldo entre la consulta y el pedido como una vuelta a recarga.

Las recargas y los pedidos conservan sus claves de reintento por cuenta. Repetir una operación por pérdida de respuesta no acredita ni descuenta dos veces. El historial muestra recargas y canciones confirmadas.

La continuación automática también se guarda por cuenta: al refrescar durante un pedido posterior a la recarga, consulta la misma operación pendiente. Ante una respuesta de pedido perdida, hace un reintento acotado con su clave original. Si no se puede completar, conserva el resultado para reintentar; no muestra éxito ni fuerza un segundo descuento. Cancelar la recarga o salir antes del envío cancela la continuación automática. Una respuesta tardía no envía el tema de la cuenta anterior ni cambia la pantalla de otro usuario.

## Configuración y actualización local

`TOKEN_SIMULATED_TOPUPS_ENABLED=true` es el valor predeterminado de esta etapa. `false` deshabilita las recargas simuladas; no modifica los saldos existentes. Los paquetes y precios (5 / UYU 99, 12 / UYU 199, 30 / UYU 399) son ejemplos. El costo actual es 1 token por canción agregada.

```bash
git pull origin main
docker compose stop api
docker compose up --build -d api web
```

La API anterior debe estar detenida durante esta migración para no mezclar las dos reglas de cobro. Compose ejecuta la migración antes de iniciar la API actualizada. Se conservan cuentas, bares, playlists y cargos confirmados. Después, refrescar el navegador y abrir el perfil de cliente.

## Verificación

`python scripts/test-customer-tokens.py` comprueba el recorrido completo en móvil y escritorio con API simulada: falta de saldo, pedido automático tras la recarga, aviso centrado, regreso a la playlist, un único descuento, respuestas perdidas, carrera de saldo, continuación al refrescar, cancelación y separación de cuentas. También cubre pedidos con saldo y validación de ubicación. Usa `TOCA_WEB_URL` para elegir el servidor estático, por defecto `http://localhost:5174`.

La [sonda de servicios](../scripts/integration/README.md) usa PostgreSQL real y Spotify simulado para comprobar concurrencia, devolución y recuperación. La sonda HTTP verifica autorización, saldo inicial, paquetes e idempotencia. Con `TOCA_TEST_WEB_URL` también prueba la pantalla contra esa API y PostgreSQL reales. Las pruebas no usan una cuenta real de Spotify.
