# Publicar TOCÁ gratis en Render

El Blueprint de este repo crea un servicio Docker gratuito. Sirve el home,
la app y `/api` bajo la URL HTTPS de Render. Supabase provee PostgreSQL.

## Preparar Supabase

Creá un proyecto dedicado en el plan Free y desactivá **Enable Data API**.
En el editor SQL del proyecto, como propietario de la base, prepará el
esquema y un usuario exclusivo de la API. Reemplazá el valor de ejemplo
por una contraseña aleatoria en el panel privado de Supabase.

```sql
CREATE SCHEMA IF NOT EXISTS toca;
CREATE ROLE toca_app LOGIN PASSWORD 'REEMPLAZAR_EN_SUPABASE';
GRANT USAGE ON SCHEMA toca TO toca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA toca
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO toca_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA toca
  GRANT USAGE, SELECT ON SEQUENCES TO toca_app;
```

El usuario que ejecute Flyway debe ser el mismo que ejecutó
`ALTER DEFAULT PRIVILEGES`. El comando de inicio aplica las migraciones
antes de levantar la API y quita el acceso de `toca_app` al historial de Flyway.

## Crear el servicio

1. En Render, creá un **Blueprint** desde la rama con `render.yaml`.
   Si administrás el servicio manualmente, elegí Docker, el plan Free,
   la ruta `./deployment/Dockerfile.render` y el health check `/api/health`.
2. Cargá el certificado de la base de Supabase como **Secret File** con
   el nombre `supabase-ca.pem` y completá las variables del Blueprint.
   Usá el host y el usuario que muestra Supabase en **Connect → Session pooler**.
   Ambas URLs JDBC tienen esta forma:

   ```text
   jdbc:postgresql://HOST:5432/postgres?currentSchema=toca&sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.pem
   ```

   Para `TOCA_MIGRATION_DB_USERNAME` y `TOCA_MIGRATION_DB_PASSWORD`, usá
   el usuario de migración y su contraseña. Para `DB_USERNAME` usá
   `toca_app.REFERENCIA_DEL_PROYECTO` y para `DB_PASSWORD`, la contraseña
   del rol de aplicación.
3. Agregá la configuración de las integraciones en el panel de Render.
   Registrá su URL pública en Google y la URI
   `https://TU_SERVICIO.onrender.com/api/integrations/spotify/callback`
   en Spotify. El servicio deriva ambas URLs de su dominio de Render.
4. Comprobá el home, `/#/explore`, `/api/health` y los flujos de Google y
   Spotify. Validá aparte el envío de correos y la renovación programada
   de Instagram si se van a usar en este entorno.

Render suspende el servicio gratuito después de 15 minutos sin tráfico.
Supabase puede pausar una base gratuita que pasa una semana inactiva.
