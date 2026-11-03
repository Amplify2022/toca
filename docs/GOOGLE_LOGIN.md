# Login de clientes con Google — v1.8.47c

Incluye los parches v1.8.47b y v1.8.47c sobre el código de la app:

- Verifica la sesión TOCÁ con `/api/customers/me` y actualiza el estado en memoria antes de navegar, sin recargar la página.
- Conserva el regreso al pedido del bar y evita que una comprobación anterior borre la nueva sesión.
- Asigna el rol `CUSTOMER` al iniciar sesión con Google. También repara las cuentas Google creadas sin ese rol en la versión anterior.
- Mantiene separadas las sesiones de clientes y administradores. Los correos ya registrados con contraseña requieren vincular Google desde el perfil.

## Actualizar una instalación con Docker

Desde la raíz del proyecto, con el código actualizado:

```bash
docker compose up --build -d api web
```

Recargá la web para obtener la nueva versión del Service Worker. La configuración existente de `GOOGLE_CLIENT_ID` y los orígenes autorizados en Google se conserva. Estos parches no modifican migraciones ni requieren borrar cuentas o datos.

Al iniciar sesión, `POST /api/customers/google` debe devolver 200, seguido de `GET /api/customers/me` con 200. El cliente debe permanecer autenticado y volver al pedido pendiente o a su perfil.

## Pruebas de regresión

```bash
node --check web/toca-customer-v1826.js
node --check web/toca-google-v1847.js
python3 scripts/test-google-login.py
```

La prueba de navegador requiere Playwright y `/usr/bin/chromium`. Usa los módulos actuales del repositorio con Google y la API simulados; no requiere credenciales ni archivos ZIP. Comprueba ocho escenarios: sesión válida, regreso por QR, conflicto de correo, identidad distinta, respuesta tardía de una sesión anterior, rechazo de `/me` y dos destinos de retorno inválidos. El flujo real de Google requiere una cuenta y un origen autorizados.

Las pruebas del backend se ejecutan desde `backend/` con Java 21 y Gradle 8.14:

```bash
gradle --no-daemon test
```
