# TOCÁ v1.7.3.6 — Dashboard y botón de sesión

Aplicar **después de v1.7.3.5**. No toca la API, Spotify, Instagram, fotos ni PostgreSQL.

1. Desde la raíz del proyecto `toca`:
   ```bash
   unzip -o ~/Downloads/TOCA-v1.7.3.6-header-dashboard.zip -d .
   python3 instalar_admin_header_v1736.py
   node --check web/app.js && node --check web/toca-ui.js
   docker compose up -d --force-recreate web
   ```
2. Refrescar con **Cmd+Shift+R**. Si persiste una versión anterior, desregistrar el Service Worker desde Chrome DevTools → Application → Service Workers.
3. Verificar **Dashboard**: encabezado «Bienvenido a TOCÁ», selector del bar y botón de sesión con Play/Stop de igual tamaño.
4. Verificar **Spotify**, **Mi Bar**, **Solicitudes**, **Música y reglas** y **Código QR**: no aparece la barra redundante «Establecimiento / Cerrar sesión musical». En móvil se conservan las pestañas de navegación.

El instalador respalda los archivos editados antes de escribir y deja un ZIP con los archivos frontend actualizados junto a la carpeta `toca`.
