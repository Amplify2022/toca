# Preview del dashboard del bar

Abrir `/prototypes/bar-dashboard/` en la web local, por ejemplo `http://localhost:5173/prototypes/bar-dashboard/`.

Es un prototipo navegable independiente, con datos ilustrativos. No consulta la API, no lee sesiones, no modifica saldos ni reemplaza la ruta del dashboard actual. Usa la navegación y los colores del portal, con la misma familia visual que Mi Bar y Música.

La propuesta concentra la pantalla en resultados del bar:

- Usuarios que pidieron: usuarios distintos con al menos un pedido confirmado en el período.
- Canciones pedidas: cantidad de pedidos confirmados, incluidos los pedidos repetidos de una misma canción. No equivale a canciones diferentes ni a reproducciones efectivas.
- Generado esta semana y este mes: ambos importes siempre visibles, identificados como simulados. El modelo de reparto del bar todavía no está definido.
- Evolución diaria: selector de semana/mes y de pedidos/ingresos, con detalle al enfocar o señalar una barra.
- Cinco canciones más pedidas.
- Usuarios nuevos/recurrentes y promedio de pedidos por usuario.

El gráfico de actividad ocupa todo el ancho. No incluye distribución por horarios ni franja de mayor actividad. El preview no incluye reproductor, aprobaciones, configuración musical ni listado de solicitudes. El período de ejemplo es hasta el 14 de noviembre de 2026; usuarios recurrentes son quienes ya habían pedido en ese bar antes de comenzar el período seleccionado.

Para conectar los datos reales se necesita un resumen por bar y fecha de los pedidos confirmados, deduplicado por comando, con cuentas distintas y fechas en la zona horaria del local. Los importes reales dependen de definir la comisión o valor asignado al bar. Las recargas simuladas actuales no constituyen ingresos reales y una recarga global de un cliente no debe atribuirse a un bar automáticamente.

Verificación: Chromium en 1440, 390 y 320 px; cambio de período, totales de pedidos, gráfico de ingresos, detalle de barras, ausencia de desbordamiento horizontal y de llamadas a la API. No usa cuentas ni dinero reales.
