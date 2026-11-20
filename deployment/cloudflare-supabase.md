# TOCÁ con Cloudflare Tunnel y Supabase

La web y la API corren en Docker en el VPS. Caddy sirve la web y enruta
`/api/*` a Kotlin en el mismo dominio. PostgreSQL corre en Supabase.

## Supabase

Usá un proyecto dedicado. En la configuración de Data API, desactivá
**Enable Data API**. El backend usa JDBC. Descargá el certificado de la
base desde el panel de Supabase y guardalo en el VPS.

Usá la conexión directa si el VPS tiene IPv6. Si el VPS solo tiene IPv4,
usá el pooler en **Session mode** (puerto 5432). Configurá estas variables
en el archivo de entorno privado del VPS con permisos `600`:

| Variable | Valor |
| --- | --- |
| `TOCA_DB_HOST`, `TOCA_DB_PORT`, `TOCA_DB_NAME` | Host, puerto y base de la conexión elegida |
| `TOCA_DB_CA_FILE` | Ruta absoluta al certificado en el VPS |
| `TOCA_MIGRATION_JDBC_URL`, `TOCA_APP_JDBC_URL` | `jdbc:postgresql://HOST:5432/postgres?currentSchema=toca&sslmode=verify-full&sslrootcert=/run/toca/postgres-ca.pem` |
| `DB_USERNAME`, `DB_PASSWORD` | Usuario de migración y contraseña de Supabase |
| `TOCA_APP_DB_USERNAME` | `toca_app` en conexión directa o `toca_app.REFERENCIA` mediante el pooler |
| `APP_DB_PASSWORD` | Contraseña independiente del usuario de la API |
| `TOCA_DOMAIN` | Dominio público sin protocolo |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token del túnel administrado |
| `TRUSTED_PROXY_TOKEN` | Valor aleatorio de al menos 32 caracteres |

Flyway crea el esquema `toca`. El servicio de aprovisionamiento concede
al rol de la API acceso a las tablas y secuencias de ese esquema. Si hay
datos que conservar, probá primero la restauración en un proyecto de prueba.
Migrar el esquema vacío no copia bares, cuentas ni conexiones a Spotify.
Para recuperar conexiones existentes también necesitás la misma clave de
cifrado del backend de origen.

## Cloudflare y VPS

1. Creá un túnel administrado y agregá una aplicación publicada para el
   dominio configurado. Usá `http://gateway:8080` como destino y dejá que
   el túnel envíe el host público.
2. Configurá las variables de las integraciones que se van a habilitar en
   el VPS. Registrá el origen HTTPS en Google y agregá en Spotify
   `https://TU_DOMINIO/api/integrations/spotify/callback` como URI de retorno.
3. Desde el checkout en el VPS, con Docker Compose 2.24.4 o posterior:

   ```sh
   docker compose -p toca-production --env-file /ruta/privada/toca.env \
     -f docker-compose.yml -f docker-compose.override.yml -f compose.cloudflare.yml \
     up -d --build
   ```

4. Comprobá `/api/health`, el home, `/#/explore`, el portal, los flujos
   de Google y Spotify y las restricciones de las claves de Google Maps.
   Evitá cachear `/api/*` si el dominio tiene reglas de caché personalizadas.
