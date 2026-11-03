# TOCÁ v1.2

**Correcciones P1:** ver [actualización, autorización QR y recuperación de pedidos](docs/P1_FIXES.md).

**Login con Google:** están integrados los parches v1.8.47b y v1.8.47c. Ver [configuración y validación del login](docs/GOOGLE_LOGIN.md).

**Actualización:** leé primero [README-V1.2.md](README-V1.2.md) y [pruebas manuales](docs/PRUEBAS_MANUALES_V1.2.md). Este README contiene también información de la versión inicial.

---

# Actualización TOCÁ v1.1 — Spotify playlist directa

**Esta carpeta fue actualizada** desde la v1.0. El comportamiento musical vigente está documentado en [docs/PRUEBAS_MANUALES_SPOTIFY.md](docs/PRUEBAS_MANUALES_SPOTIFY.md) y en [README-V1.1.md](README-V1.1.md). **Las referencias más abajo a aprobación manual, cola de TOCÁ o configuración antigua corresponden al README de v1.0.** No habilites control del reproductor ni uso comercial a partir de esas instrucciones.

---

# TOCÁ — la noche suena con vos

Primera versión ejecutable del producto **TOCÁ** (anteriormente Amplify). Contiene **web pública de presentación**, **app responsive instalable como PWA**, **portal del administrador**, y un **backend Kotlin + Micronaut 4 / Java 21 + PostgreSQL 16** con integración Spotify para *pruebas privadas autorizadas*.

La marca es TOCÁ y el logo elegido es **vinilo negro + nota musical verde**. Los 3 entornos comparten el mismo diseño dark / lime y el mismo proyecto web. El backend conserva internamente el paquete `com.amplify.api` y algunos nombres de almacenamiento de Amplify para evitar una migración destructiva; no aparecen como marca principal para el usuario.

## 1. Probá la app en 30 segundos (solo demo)

**Requisitos:** Python 3 y un navegador reciente. No hace falta instalar npm, Gradle, PostgreSQL, Docker ni crear una cuenta de Spotify.

En una terminal:

```bash
cd toca
python3 -m http.server 5173 --directory web
```

Abrí estos enlaces:

| Entorno | URL |
| --- | --- |
| Web pública | http://localhost:5173/#/ |
| App / explorar bares | http://localhost:5173/#/explore |
| Mapa | http://localhost:5173/#/map |
| Ficha de un bar | http://localhost:5173/#/venue/demo-1 |
| Pedir una canción | http://localhost:5173/#/request/demo-1 |
| Panel del bar | http://localhost:5173/#/admin |
| Solicitudes del bar | http://localhost:5173/#/admin/requests |
| Reglas / listas | http://localhost:5173/#/admin/music |
| Spotify | http://localhost:5173/#/admin/spotify |
| QR | http://localhost:5173/#/admin/qr |

**Recorrido de prueba**: explorá La Ronda → «Pedí una canción» → buscá un tema → presioná «+» → confirmá → comprobá la pantalla «Tu pedido fue enviado» → entrá a Portal admin → Solicitudes → Aprobar → comprobá la cola del bar. Se persiste en `localStorage`; en Configuración tenés «Restablecer datos demo».

Los seis bares, las imágenes ambientales y las canciones del demo son **datos ilustrativos**. No hay reproducción ni pagos reales en modo demo. El mapa tiene una representación local sin conexión y las coordenadas son ficticias de demostración. La vista `/map` puede operar sin servicios de terceros; cuando hay conexión intenta cargar cartografía OpenStreetMap mediante Leaflet, conservando la ilustración como fallback.

### Abrir en un celular conectado a la misma red

Obtené la IP LAN de tu computadora (por ejemplo `192.168.1.25`). Desde el celular, visitá `http://192.168.1.25:5173/#/explore`. Asegurate de que el firewall permita acceso a la computadora; el servidor Python escucha por defecto en todas las interfaces. Un QR impreso no debe usar `localhost` cuando lo va a abrir otro dispositivo: `localhost` en el celular apunta al propio celular. Para instalar la PWA como aplicación y usar funciones avanzadas, conviene HTTPS; los navegadores exigen un contexto seguro para muchas de ellas.

**Importante:** no está incluida una APK ni un paquete iOS nativo. La entrega es una **PWA responsive** (se puede añadir a pantalla de inicio donde el navegador lo permita).

## 2. Arrancar TODO local con Docker (web, backend y PostgreSQL)

**Requisito:** Docker Desktop o Docker Engine con Docker Compose, y acceso a internet para descargar imágenes y dependencias Gradle la primera vez.

```bash
cd toca
cp .env.example .env
```

Editá `.env` y cambiá `DB_PASSWORD` por una contraseña aleatoria fuerte. Podés generarla con:

```bash
openssl rand -hex 24
```

Opcionalmente prepará la clave de cifrado de Spotify:

```bash
openssl rand -base64 32
```

Pegá el valor completo en `SPOTIFY_TOKEN_ENCRYPTION_KEY_BASE64`. Si aún no tenés una app de Spotify, dejá `SPOTIFY_CLIENT_ID=` vacío; la API puede funcionar sin ella, pero no permitirá conectar una cuenta.

Iniciá los servicios:

```bash
docker compose up --build -d
```

Comprobá:

```bash
docker compose ps
curl http://localhost:8080/api/health
```

El `curl` debería devolver `{"status":"ok","service":"amplify-api"}` (el identificador interno del backend es heredado).

- **Web / PWA:** http://localhost:5173/#/
- **Panel:** http://localhost:5173/#/admin
- **API:** http://localhost:8080/api/health
- **PostgreSQL:** `localhost:5432`, solo expuesto en loopback.

Luego: **App → Configuración → Modo API real**. La dirección de la API debe ser `http://localhost:8080` cuando navegás en la misma computadora. Para acceder desde un celular a una API en tu ordenador, debés configurar una dirección HTTPS alcanzable y CORS adecuado; este Compose se restringe deliberadamente a `127.0.0.1` por seguridad.

En el modo API real no hay bares ficticios: hacé **Portal admin → Crear cuenta → Registrar bar**. Para probar solicitudes reales necesitás conectar Spotify Premium, una sesión activa y un acceso por QR válido. Si no tenés Spotify configurado, usá el modo demo para probar el flujo completo.

Detener sin borrar datos: `docker compose down`. Borrar la base de desarrollo **irreversiblemente**: `docker compose down -v`.

> **Limitación de verificación:** el diseño, scripts JS y flujos demo se probaron; la imagen Docker y el backend Kotlin no pudieron compilarse/verificarse con Gradle en este entorno sin dependencias externas. Si el build falla, compartí la primera traza de error para corregirla antes de desplegar.

## 3. Ejecutar manualmente el backend (sin Docker)

Requiere **Java 21**, **Gradle 8.14 o compatible**, **PostgreSQL 16** y una base local `toca` con usuario y contraseña adecuados. Configurá estas variables de entorno (el `.env` raíz no lo lee automáticamente el JVM):

```bash
export JDBC_URL='jdbc:postgresql://localhost:5432/toca'
export DB_USERNAME='toca'
export DB_PASSWORD='TU_PASSWORD'
export FRONTEND_ORIGIN='http://localhost:5173'
export SPOTIFY_CLIENT_ID=''
export SPOTIFY_TOKEN_ENCRYPTION_KEY_BASE64=''
export SPOTIFY_PRIVATE_TEST_CONTROL=false
cd backend
gradle run
```

La aplicación aplica las migraciones Flyway `V1` y `V2` automáticamente. No incluye Gradle Wrapper: la forma recomendada de construirla con una versión consistente es Docker.

## 4. Spotify (sólo pruebas privadas autorizadas)

1. Registrá una aplicación en [Spotify for Developers](https://developer.spotify.com/dashboard).
2. Configurá como redirect URI **exactamente** `http://127.0.0.1:8080/api/integrations/spotify/callback`. `localhost` no equivale a `127.0.0.1` en el redirect.
3. Copiá el Client ID a `SPOTIFY_CLIENT_ID` de `.env`. El backend implementa OAuth Authorization Code con PKCE; **no guardes un Client Secret en el frontend**.
4. Generá `SPOTIFY_TOKEN_ENCRYPTION_KEY_BASE64` mediante `openssl rand -base64 32`, reiniciá el backend y conservá esa clave segura.
5. Incorporá en Spotify Dashboard los usuarios de pruebas permitidos por tu modo de aplicación, teniendo en cuenta los límites y la aprobación de Spotify.
6. En modo API, creá tu usuario administrador, registrá un bar, entrá a **Spotify Premium → Conectar**, autorizá la cuenta y seleccioná playlist y dispositivo, si están disponibles.
7. La lógica de solicitudes persiste en TOCÁ. Por defecto `SPOTIFY_PRIVATE_TEST_CONTROL=false` y aprobar una canción **no ejecuta comandos reales de reproducción**. Cambiarlo a `true` solo está previsto para pruebas privadas dentro de lo permitido.

**Legal:** Spotify Premium es un requisito funcional del prototipo pero **no otorga licencia para reproducir música públicamente en bares**. Spotify también restringe apps comerciales dirigidas a negocios. Para un lanzamiento real será imprescindible autorización explícita del proveedor y los derechos musicales pertinentes. Por eso no hay pagos ni reproducción comercial habilitados.

**Técnico:** una solicitud confirmada no equivale a una canción reproducida; la cola de TOCÁ y el estado del reproductor se muestran por separado. Algunas API de Spotify, cuotas y campos (por ejemplo `product`) pueden cambiar o dejar de estar disponibles: las pruebas OAuth requieren validación con una cuenta de prueba real.

## 5. ¿Qué incluye?

| Módulo | Implementación |
| --- | --- |
| Landing web | Hero, propuesta de valor, acceso al descubrimiento y al portal |
| PWA móvil | Diseño responsive, manifest, Service Worker, navegación inferior |
| Descubrir bares | Filtros, listado, favoritos locales, visualización geográfica |
| Perfil de bar | Foto ilustrativa, estado musical, canción actual cuando se informa, cola |
| Solicitudes | Búsqueda, selección, confirmación y seguimiento |
| Panel admin | Inicio con métricas derivadas de solicitudes, sesión, solicitud/moderación |
| Reglas | Aprobación manual, whitelist y blacklist por canción |
| Spotify | OAuth PKCE, validación Premium cuando Spotify devuelve el atributo, playlists, dispositivos, tokens cifrados |
| QR | Acceso privado a la sesión de cada bar y rotación del token |
| Autenticación de admin | BCrypt, sesiones con token hasheado y autorización por propietario |
| PostgreSQL | Migraciones Flyway y aislamiento de datos por bar |
| Imágenes del demo | Artes ambientales adaptadas de las propuestas visuales, no fotos verificadas de locales |

**No implementado ni declarado como terminado:** APK/iOS nativos, pagos, recaudación, ratings verificadas, notificaciones push, métricas de vistas/usuarios únicas, presencia real por GPS, catálogo musical comercial licenciado, sincronización infalible de reproducción, despliegue público AWS, monitoreo productivo y pruebas de integración del servidor contra Spotify.

## 6. Validar y depurar

Ejecutá desde la raíz:

```bash
node --check web/app.js
node --check web/toca-ui.js
node scripts/smoke-web.cjs
```

Si la API falla, revisá:

```bash
docker compose logs -f api
```

**Estructura:** `web/` interfaz pública + PWA + admin, `backend/` Micronaut API, `docker-compose.yml` infraestructura, `docs/` capturas y estado, `scripts/` pruebas de humo.

## 7. Antes de publicar

Implementar verificación de bares, dominio y HTTPS, políticas de privacidad, observabilidad, WAF y límites, pruebas e2e con PostgreSQL y Spotify, gestión de secretos en AWS, control de concurrencia del reproductor, comprobación de licencias comerciales, medios de pago bajo un acuerdo legal y un despliegue seguro. El proyecto está preparado como **base de producto y prototipo operativo**, no como un SaaS listo para operar en bares.
