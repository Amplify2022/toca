# Inicio público de TOCÁ

La página reúne la presentación, “La app” (beneficios y recorrido con capturas en una sola sección), el portal para bares, preguntas frecuentes, descarga y contacto. Las capturas usan el nombre de ejemplo “Bar Central”. Respeta los colores y componentes de la app.

Los enlaces de la cabecera y el pie llevan a secciones de la misma página mediante el router existente: `/#/?section=la-app`, `/#/?section=para-bares` y `/#/?section=contacto`. Los enlaces anteriores a `section=como-funciona` siguen llevando a “La app”. Funcionan al abrir un enlace directo y al usar atrás/adelante, y conservan el formulario mientras se navega entre secciones. La cabecera permanece visible; sus enlaces se agrupan a la derecha junto a “Descargá la app”. En celular se reúnen en un menú junto al mismo botón.

El recorrido de cuatro pasos avanza automáticamente cada cinco segundos y vuelve al primero al terminar. Muestra el número de paso, sin barras de progreso ni botón de pausa. El borde y el fondo del paso saliente y entrante cambian suavemente durante 650 ms. El mouse y el foco no detienen el avance; elegir un paso manualmente reinicia los cinco segundos y continúa el recorrido. Se detiene al salir de la sección o al ocultar la pestaña. Al volver comienza un intervalo completo. Con movimiento reducido no hay fundido ni avance automático y los cuatro pasos siguen disponibles manualmente. El temporizador y el observador se eliminan al salir de inicio.

## Vista previa

- [Inicio en escritorio](previews/inicio-1440.png)
- [Inicio en celular](previews/inicio-390.png)
- [Teléfono de la portada](previews/inicio-celular-propuesta.png)

El teléfono de inicio muestra una captura de la interfaz actual: mapa, ficha del bar, canción que está sonando, botón para pedir temas y navegación inferior. La captura usa un mapa ilustrativo, una portada del proyecto y datos de ejemplo. El fondo del mapa conserva su proporción al proyectarse; los tres marcadores de música se renderizan con los componentes de la app. La ruta `http://localhost:5173/prototypes/home-phone/` conserva una vista del mismo inicio en un iframe, sin modificaciones adicionales.

La captura de “Para tu bar” usa una playlist de ejemplo con tres portadas diferentes, almacenadas en `web/assets/landing/covers/`. El generador espera a que todas carguen, comprueba que sean distintas, mantiene las miniaturas cuadradas y verifica que la portada del reproductor corresponda a la canción en curso. La procedencia está documentada en [covers/SOURCES.md](../web/assets/landing/covers/SOURCES.md).

## Descarga y redes

Los enlaces públicos se configuran en `web/config.js`, dentro de `TOCA_CONFIG.marketing`:

```js
{
  appStoreUrl: '', // URL oficial https://apps.apple.com/...
  playStoreUrl: '', // URL oficial https://play.google.com/store/apps/details?id=...
  publicUrl: '', // URL pública de la web; vacío usa el dominio actual
  socials: {
    instagram: 'https://www.instagram.com/tocamusicapp/',
    facebook: 'https://www.facebook.com/1465919206597325',
    tiktok: '', x: '', linkedin: ''
  }
}
```

El botón “Descargá la app” genera el QR en el navegador, sin servicios externos. El QR lleva a `/#/download`, que detecta iOS/Android y abre la tienda correspondiente si su URL oficial está configurada. En escritorio ofrece ambas tiendas. Una tienda sin URL se muestra como “Próximamente”, sin enlace ficticio; la versión web sigue disponible. En localhost el QR solo sirve como vista previa: para compartirlo con otro dispositivo debe apuntar al dominio público accesible.

No se agregan redes sin una URL. Instagram y Facebook usan las cuentas identificadas durante la configuración del proyecto; el resto queda pendiente.

## Contacto

`POST /api/contact` recibe nombre, correo, categoría, mensaje e identificador de envío. La migración Flyway `V24__contact_messages.sql` crea la bandeja persistente `contact_message`.

Los mensajes se guardan antes de confirmar. Reintentar el mismo envío conserva su identificador y evita duplicados. El servidor valida los campos, aplica un campo trampa y limita a cinco mensajes por conexión por hora y 300 globales por hora. Los reintentos de un envío ya guardado no consumen cupo. La bandeja no tiene endpoint público de lectura.

Para recibir notificaciones, configurar en `.env`:

```dotenv
CONTACT_RECIPIENT=
ACCOUNT_SMTP_HOST=
ACCOUNT_SMTP_PORT=587
ACCOUNT_SMTP_USERNAME=
ACCOUNT_SMTP_PASSWORD=
ACCOUNT_SMTP_FROM=
```

El transporte usa STARTTLS y verifica el certificado del servidor. La notificación incluye el correo del visitante como Reply-To. El envío se procesa en segundo plano con reintentos; si SMTP falla, el mensaje permanece guardado. Sin destinatario o SMTP, se conserva en la base sin intentar enviar correo. Las pruebas no envían correos externos. No hay una bandeja visual de administración en este cambio.

Para consultar mensajes con una cuenta autorizada de la base:

```sql
SELECT created_at, name, email, kind, message, notified_at, notification_error
FROM contact_message ORDER BY created_at DESC;
```

## Actualización y verificación

```bash
git pull origin main
docker compose up --build -d api web
```

Compose ejecuta las migraciones antes del API. Actualizar el navegador con `Cmd+Shift+R` si conserva la versión anterior.

Comprobaciones incluidas:

- `scripts/test-landing.py`: escritorio y celulares de 390/320 px, anclas, historial, recorrido y teclado, imágenes cargadas, QR local, destinos iOS/Android y reintentos del formulario.
- `scripts/test-landing-autoplay.py --mode desktop` y `--mode mobile`: duración real de cinco segundos, ciclo completo, avance con el mouse/foco sobre la sección, selección manual, pausas por visibilidad, touch, movimiento reducido, fundido de bordes y limpieza al navegar.
- `ContactInputTest.kt`: normalización, validación y campo trampa.
- `scripts/integration/P1ServiceProbe.java`: persistencia, concurrencia, reintentos y notificaciones con transporte simulado, junto con las regresiones existentes.
- `scripts/integration/http_contact_probe.py`: formulario real → API real → PostgreSQL de prueba, validación HTTP, idempotencia, límites y rechazo de cabeceras de proxy no confiables. Requiere las variables y protecciones de base de prueba de `http_auth_probe.py`; `TOCA_TEST_WEB_URL` habilita el envío desde Chromium.

Las capturas públicas están en `web/assets/landing/` y se incluyen en el precache. Para regenerarlas, `scripts/capture-landing-screens.py` usa Chromium y los SDK de mapas locales en `/tmp/toca-map-assets`, con fixtures de prueba y sin llamar a Spotify. Después ejecutar `python3 scripts/build-precache.py`.
