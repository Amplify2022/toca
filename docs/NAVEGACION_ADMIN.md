# Navegación del administrador

El portal ya no incluye una pantalla separada de **Solicitudes**. Los pedidos siguen entrando automáticamente y conservan sus estados y mecanismos de recuperación.

- Dashboard: estadísticas, pedidos recientes y «Ver más actividad» para consultar el resto de los pedidos cargados. Conserva «Estado de pedidos» y sus acciones de consulta, conciliación y cancelación.
- Música y Spotify: reproducción, playlist y reglas musicales.
- Mi Bar: perfil, fotos, horarios y acceso por cercanía o desde cualquier lugar.

Los enlaces antiguos a `#/admin/requests` redirigen al dashboard. No se modifican las APIs, los datos ni las pantallas de pedidos de los clientes.

Validación: `python scripts/test-admin-navigation.py` comprueba la redirección, la navegación de escritorio/móvil, el historial, los controles de recuperación y el acceso a Mi Bar con respuestas sintéticas de la API. También se verificaron login, reproductor, pedidos, acceso, modo sin conexión y navegación con las pruebas de navegador existentes.

Las dos propuestas visuales de Música son prototipos independientes: no forman parte de este cambio de navegación.
