# TOCÁ v1.6 — Ubicación, presentación de Mi bar, géneros y Mi cuenta

## Cambios incluidos

1. **Búsqueda de direcciones**: nuevo `GET /api/admin/geocode?address=...&city=...` autenticado. Micronaut consulta Photon y, si no encuentra la dirección o el servicio falla, intenta Nominatim. El navegador ya no consulta directamente el geocodificador externo, evitando los problemas de CORS. Se selecciona el resultado y **se confirma el pin** antes de guardar. Sigue siendo posible colocar y arrastrar el pin manualmente.
2. **Mi bar**: encabezado limpio, campos agrupados, mapa y formulario con el ancho disponible del panel (sin el antiguo máximo de 1020 px).
3. **Géneros musicales**: botones Rock, Cumbia, Pop, Electrónica, Reggaetón, Jazz, Indie, Salsa, Plena, Hip Hop, Trap y Otros. Permite escribir cualquier género separado por comas. Se persiste en el campo `venue.genre` existente (límite de 160 caracteres), sin migración SQL.
4. **Mi cuenta**: acceso propio en menú del administrador (`#/admin/account`) para modificar el nombre. Nuevo `PUT /api/auth/me`, protegido con Bearer. El nombre se guarda en `admin_user.name` y se actualiza la sesión del navegador. El email se muestra en modo lectura; esta versión no implementa cambio de email ni contraseña.
5. **Caché**: nueva versión de Service Worker para actualizar los recursos web.

## Instalación recomendada sobre v1.5

Desde la carpeta raíz `toca`:

```bash
# Respaldo de la carpeta y de PostgreSQL (antes de sustituir archivos)
cp -R web web-respaldo-antes-v16
cp -R backend backend-respaldo-antes-v16
docker compose exec -T postgres pg_dump -U toca -d toca > ../toca-pre-v16.sql

# Descomprimir en toca/, no dentro de web/
unzip -o ~/Downloads/TOCA-v1.6-parche.zip -d .

# Este parche incluye Kotlin, por lo que SÍ se reconstruye la API
docker compose up --build -d api
docker compose up -d --force-recreate web

# Validación
curl -i http://localhost:8080/api/health
docker compose ps
```

Nunca ejecutes `docker compose down -v` durante esta actualización. El parche no reemplaza `.env`, las tablas existentes ni la integración Spotify. No se requiere revincular Spotify. Si usás el ZIP completo, evitá sobreescribir un `.env` ya existente (el ZIP no lo incluye).

## Pruebas manuales

### 1. Dirección y pin

1. Entrá en `http://localhost:5173/#/admin/profile` con el administrador autenticado.
2. Verificá que el título sea **Mi bar**, el editor use el ancho del contenido y el mapa esté alineado.
3. Colocá `Av. 18 de Julio 1234` como dirección y `Montevideo` como ciudad. En **Buscar dirección**, escribí la misma dirección y presioná **Buscar en el mapa**.
4. Seleccioná una sugerencia y verificá que el pin cambie de lugar. Si la dirección exacta no aparece, elegí un resultado cercano y arrastrá el pin.
5. Presioná **Confirmar ubicación del pin** y luego **Guardar cambios del bar**.
6. Recargá `#/admin/profile` y comprobá que se conserva la dirección y el pin. Probá cambiar la dirección sin reconfirmar el pin: debe impedir el guardado.
7. Si no aparecen sugerencias, el servicio cartográfico puede estar inaccesible desde el contenedor. Revisá `docker compose logs --tail=100 api`; la colocación manual sigue disponible.

### 2. Géneros musicales

1. Tocá **Rock**, **Cumbia** y **Pop**. Los chips se resaltan y se actualiza el campo.
2. Tocá **Pop** de nuevo para quitarlo.
3. Tocá **Otros** y escribí `Candombe` (separado por coma de los demás).
4. Guardá y recargá la pantalla: deben persistir las selecciones.

### 3. Mi cuenta

1. Ingresá a `http://localhost:5173/#/admin/account`.
2. Cambiá tu nombre y pulsá **Guardar mi perfil**.
3. Comprobá que el nuevo nombre se muestre en el menú lateral y al volver al dashboard.
4. Cerrá sesión, volvé a ingresar y verificá que el nombre sigue actualizado.
5. En incógnito, ingresá directamente a `#/admin/account`: sin sesión debe redirigir al login.

### 4. Regresión Spotify

1. Entrá con el QR de tu bar, buscá una canción y solicitala.
2. Confirmá que entra en tu playlist Spotify, sin aprobación manual.
3. Solicitá una segunda canción sin escanear nuevamente el QR.

## Limitaciones y proveedores de mapas

Photon y Nominatim ofrecen instancias públicas de uso limitado, **sin disponibilidad garantizada**. Las consultas ocurren solo al presionar Buscar y Nominatim está limitado a una solicitud cada 1,1 segundos por instancia API del prototipo. El uso en producción debe migrarse a un geocodificador con límites contratados o un servicio propio, especialmente si escalás a varias réplicas.

La búsqueda de v1.6 está ajustada a direcciones de Uruguay. La búsqueda puede devolver aproximaciones: siempre confirmá visualmente el pin. La conexión de la API a los servidores de mapas requiere acceso saliente HTTPS.

## Pruebas automáticas

```bash
node --check web/app.js
node --check web/venue-location.js
node --check web/toca-ui.js
node scripts/smoke-web.cjs
node scripts/test-live-music.cjs
python3 scripts/test-v16-ui.py  # requiere playwright + Chromium
```

El build Docker ejecuta `gradle clean test installDist`, incluyendo `AddressGeocoderTest`. El test de navegador simula los servicios remotos; no comprueba la disponibilidad real de Photon o Nominatim.
