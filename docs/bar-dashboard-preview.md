# Dashboard del bar

La pantalla principal está integrada en `/#/admin` y `/#/admin/general`. Reemplaza el dashboard anterior con métricas reales del bar autenticado, sin reproductor, solicitudes ni horarios.

Para actualizar una instalación local:

```bash
git pull origin main
docker compose up --build -d api web
```

Abrir `http://localhost:5173/#/admin/general` y recargar con `⌘+Shift+R` (Mac) o `Ctrl+Shift+R`. Es necesario reconstruir la API porque las métricas usan un endpoint nuevo. Este cambio no agrega migraciones.

## Datos reales

`GET /api/admin/venues/{id}/analytics?period=week|month` exige sesión de administrador y propiedad del bar. La respuesta es privada y no se almacena en caché. Una consulta a PostgreSQL cuenta solamente los comandos `SUCCEEDED`, por fecha de confirmación y zona `America/Montevideo`:

- Usuarios distintos con al menos un pedido confirmado.
- Pedidos confirmados, incluyendo repeticiones de una canción. No son reproducciones efectivas.
- Evolución diaria y cinco canciones más pedidas.
- Usuarios nuevos/recurrentes, según su primer pedido confirmado en ese bar, y promedio de pedidos por usuario.
- Comparación con el mismo tramo de la semana o mes anterior.

Los ingresos semanales y mensuales se muestran como **Por definir**. Las recargas simuladas no son ingresos del bar; todavía hace falta definir el reparto o comisión. No se reutilizan los importes del preview.

El dashboard consulta automáticamente cada 30 segundos y al volver a la pestaña. Maneja períodos sin actividad, errores recuperables y cambios de bar/período sin mostrar respuestas anteriores. No consulta Spotify ni necesita que la música esté sonando. Los pedidos históricos que no estén registrados como comandos confirmados no se inventan ni se reconstruyen a partir de la playlist actual.

Verificación: 70 pruebas unitarias del backend; sonda PostgreSQL con 201 aserciones; autorización y aislamiento por bar mediante HTTP real; Chromium en 390 y 1440 px, incluyendo login, cambio de período/bar, estados vacíos, errores y respuestas fuera de orden.

## Preview visual independiente

Abrir `/prototypes/bar-dashboard/` en la web local, por ejemplo `http://localhost:5173/prototypes/bar-dashboard/`.

Este enlace conserva el prototipo navegable con datos ilustrativos para comparar el diseño. No consulta la API ni modifica saldos. La pantalla real está en las rutas indicadas arriba. Ambos usan la navegación y los colores del portal, con la misma familia visual que Mi Bar y Música.

La propuesta concentra la pantalla en resultados del bar:

- Usuarios que pidieron: usuarios distintos con al menos un pedido confirmado en el período.
- Canciones pedidas: cantidad de pedidos confirmados, incluidos los pedidos repetidos de una misma canción. No equivale a canciones diferentes ni a reproducciones efectivas.
- Generado esta semana y este mes: ambos importes siempre visibles, identificados como simulados. El modelo de reparto del bar todavía no está definido.
- Evolución diaria: selector de semana/mes y de pedidos/ingresos, con detalle al enfocar o señalar una barra.
- Cinco canciones más pedidas.
- Usuarios nuevos/recurrentes y promedio de pedidos por usuario.

El gráfico de actividad ocupa todo el ancho. No incluye distribución por horarios ni franja de mayor actividad. El preview no incluye reproductor, aprobaciones, configuración musical ni listado de solicitudes. El período de ejemplo es hasta el 14 de noviembre de 2026; usuarios recurrentes son quienes ya habían pedido en ese bar antes de comenzar el período seleccionado.

Los importes del preview son ilustrativos: los reales dependen de definir la comisión o valor asignado al bar.

Verificación: Chromium en 1440, 390 y 320 px; cambio de período, totales de pedidos, gráfico de ingresos, detalle de barras, ausencia de desbordamiento horizontal y de llamadas a la API. No usa cuentas ni dinero reales.
