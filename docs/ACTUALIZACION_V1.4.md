# TOCÁ v1.4 — Navegación simplificada

## Cambios

- Se elimina la pestaña y página independiente `Mapa`; el mapa interactivo sigue disponible dentro de **Descubrir bares**.
- Los enlaces guardados a `#/map` redirigen a `#/explore`.
- La portada ahora presenta un mapa SVG ilustrativo (imagen estática, sin botones ni enlaces).
- Los accesos públicos se identifican como **Portal de bares**; el portal continúa requiriendo sesión de administrador.
- Los textos repetidos relativos al carácter privado del prototipo no se muestran en la interfaz; sus condiciones de uso siguen documentadas en README.
- Se incrementa la versión del Service Worker para invalidar la caché web anterior.

## Instalación sobre v1.3

1. Respaldar la carpeta web: `cp -R web web-backup-v13`.
2. Desde la carpeta raíz `toca`, extraer el parche con `unzip -o /ruta/TOCA-v1.4-parche-web.zip -d .`.
3. Reiniciar solo la web: `docker compose up -d --force-recreate web`.
4. Abrir `http://localhost:5173/` y hacer recarga forzada (`Cmd+Shift+R`). Si la versión anterior persiste, DevTools > Application > Service Workers > Unregister y recargar.

No se modifica `.env`, PostgreSQL, el backend ni la autorización Spotify.

## Pruebas manuales

1. Inicio: el mapa de la portada no permite pulsar los puntos; es una sola imagen.
2. Encabezado: el acceso se llama **Portal de bares** y no **Para bares**.
3. Descubrir bares: conserva mapa, filtros y tarjetas.
4. Navegación: no hay una pestaña **Mapa**; abrir `/#/map` redirige a `/#/explore`.
5. Visitante sin login: al abrir el Portal de bares, aparece el login, no el dashboard.
6. Confirmar que los mensajes antiguos de Spotify ya no aparecen ni en Inicio ni en Descubrir.
7. Solicitar canción desde un QR válido para verificar que Spotify sigue funcionando (este parche no cambia su lógica).
