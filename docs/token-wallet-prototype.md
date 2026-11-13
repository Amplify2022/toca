# Prototipo de tokens: estructura J, paleta H

Abrir **http://localhost:5173/prototypes/tokens/** después de actualizar el repositorio. El servicio `web` de Docker Compose ya sirve esa carpeta; no hace falta reconstruir la API. También se puede servir `web` con cualquier servidor estático.

Es un prototipo navegable independiente, sin inicio de sesión, cobros, reproducción ni llamadas al API. No cambia el perfil, el saldo ni los pedidos de la app real. El nombre y el saldo de prueba se guardan en una clave propia de `sessionStorage`, por pestaña.

## Recorrido

1. **Perfil:** empieza con 3 tokens de bienvenida y muestra el saldo, los movimientos y la canción elegida.
2. **Recargar:** abre un panel inferior con los paquetes de 5, 12 y 30 tokens. La selección actualiza el saldo proyectado; confirmar simula la recarga y cierra el panel. La confirmación desaparece a los 5 segundos.
3. **Descubrir:** abre un bar ilustrativo con cuatro canciones. Cada pedido requiere una confirmación y cuesta 1 token.
4. **Sin saldo:** ofrece recargar y conserva la canción. Después de la recarga vuelve a su confirmación; nunca envía un pedido automáticamente.
5. **Mis pedidos:** muestra el procesamiento y el resultado. Mientras se procesa se reserva 1 token. Si se acepta, se confirma el consumo; si falla, se agrega una devolución de 1 token.

Los paquetes y sus precios son ejemplos: 5 tokens / UYU 99, 12 / UYU 199, 30 / UYU 399. No hay formularios de tarjeta ni cargos reales.

## Controles de prueba

La barra superior **Probar estados** permite reiniciar con 3 tokens, probar con saldo cero y hacer fallar el próximo pedido. Son controles de revisión, separados de las pantallas del usuario.

Los clics repetidos no duplican una recarga ni un pedido. Una canción aceptada no se vuelve a descontar en esta prueba. Si se refresca durante un pedido pendiente, ese pedido se cancela y su token se devuelve una sola vez. Reiniciar descarta los temporizadores de la prueba anterior.

## Verificación

```bash
python scripts/test-token-prototype.py
```

La prueba usa Playwright y Chromium, sirve archivos estáticos en un puerto local libre y verifica el flujo con mouse/teclado, saldo insuficiente, recarga, reservas, devoluciones y persistencia al refrescar. Captura las pantallas en `/tmp/toca-token-prototype-shots`.

## Alcance de la siguiente etapa

Este prototipo sirve para revisar el diseño y las reglas; editar su almacenamiento local puede modificar el saldo de prueba. La integración posterior deberá mantener el saldo y las reservas en el servidor, descontar con la aceptación verificada del pedido y conservar claves de idempotencia. Los controles actuales de ubicación y acceso del bar seguirán siendo necesarios. No se implementó todavía esa integración ni una pasarela de pago.
