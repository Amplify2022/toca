# TOCÁ v1.7 — Música y reglas, fotos y mapas oscuros

## Qué cambió

- En **Portal de bares → Música y reglas**, whitelist y blacklist utilizan búsqueda Spotify por título o artista, igual que la búsqueda para pedir canciones. El ID es interno. Los nuevos registros muestran el título y el artista. Los anteriores pueden mostrar «Canción guardada» hasta volver a seleccionarlos.
- Se quitó el panel informativo redundante de esa sección.
- Los mapas Leaflet de **Mi bar** y **Descubrir bares** tienen apariencia oscura mediante un filtro CSS sobre las teselas OSM. No requiere API key adicional. **Se mantiene la atribución obligatoria dentro del mapa**; se quitó el párrafo informativo separado.
- «¿Qué suena esta noche?» deja de ser una página paralela: su búsqueda por género se concentra en **Descubrir bares**. Los enlaces antiguos a `#/search` redirigen a `#/explore`.
- Al confirmar el pin se muestra una confirmación destacada, sin coordenadas visibles. Los campos lat/lon ocultos siguen guardándose para el mapa.
- **Mi bar → Fotos del bar:** admite hasta 8 fotos. La primera es portada; se puede cambiar y eliminar. La portada aparece en Descubrir bares y la ficha pública muestra una galería. Las fotos se almacenan en PostgreSQL (no en localStorage).

## Instalar sobre tu v1.6 actual

Desde la carpeta raíz `toca` (la que contiene `docker-compose.yml`):

```bash
# Respaldar el proyecto y la DB
cp -R web ../toca-web-respaldo-v16
cp -R backend ../toca-backend-respaldo-v16
docker compose exec -T postgres pg_dump -U toca -d toca > ../toca-db-pre-v17.sql

# Aplicar PARCHE, no el ZIP del proyecto completo
unzip -o ~/Downloads/TOCA-v1.7-parche.zip -d .

# Debe existir la migración nueva
ls backend/src/main/resources/db/migration/V5__venue_photos_and_rule_labels.sql

# Esta versión necesita rebuild de la API + nuevo frontend
docker compose up --build -d api
docker compose up -d --force-recreate web

docker compose ps
curl -i http://localhost:8080/api/health
```

NO ejecutes `docker compose down -v`: borraría tu volumen de PostgreSQL. El ZIP no contiene `.env`; conserva tus datos de Spotify.

Si Chrome sigue mostrando pantallas antiguas, DevTools → Application → Service Workers → Unregister y luego `Cmd + Shift + R`.

## Pruebas manuales

### 1. Blacklist / whitelist

1. Abrí `http://localhost:5173/#/admin/music` con la cuenta del bar.
2. Buscá `El Polaco` en Lista negra y elegí un resultado. Debe aparecer el **título y artista**, no un campo de ID.
3. Intentá pedir esa canción desde el QR del bar: debe quedar bloqueada.
4. Quitala, elegí una canción en Lista blanca, activá **Modo whitelist** y comprobá que la canción elegida sea aceptada y otra no.
5. Desactivá whitelist para volver al funcionamiento libre.

### 2. Fotos

1. Abrí `http://localhost:5173/#/admin/profile`.
2. En **Fotos del bar**, subí una imagen JPG/PNG/WebP (el navegador la reduce a JPEG, lado máximo 1600 px). Debe aparecer `★ Foto de portada`.
3. Subí otra. Presioná **Usar de portada** en la segunda foto.
4. Abrí `http://localhost:5173/#/explore`: debe mostrar la portada seleccionada.
5. Entrá a la ficha pública y hacé clic en una miniatura de la galería.
6. Eliminá una foto y recargá: la eliminación debe persistir.

Límite: 8 fotos por bar, y cada foto procesada debe ocupar menos de 2,5 MB. Solo se admiten imágenes JPEG, PNG y WebP, que se reencodan como JPEG en la web.

### 3. Ubicación y mapas

1. En **Mi bar**, buscá dirección, mové el pin, confirmá. Debe aparecer `✓ Ubicación confirmada`, sin números de latitud/longitud.
2. Los dos mapas deben tener apariencia oscura; la atribución OSM permanece dentro del control de mapa.
3. Guardá el bar y comprobá que el pin aparezca correctamente en **Descubrir bares**.
4. Filtrá por `Rock`, `Cumbia` o `Electrónica`: tarjetas y marcadores deben filtrarse juntos.
5. Abrí `http://localhost:5173/#/search`: debe llevarte a **Descubrir bares**.

### 4. Regresión Spotify

Confirmá que el QR permita buscar y agregar dos canciones consecutivas; la playlist Spotify del bar debe seguir modificándose como antes. OAuth y el token guardado no se reemplazan con este parche.

## Consideraciones técnicas

- Backend: Kotlin/Micronaut 4, migración Flyway `V5__venue_photos_and_rule_labels.sql`.
- Fotos: PostgreSQL `BYTEA` pensado para prototipo y pocos bares. En producción conviene almacenamiento de objetos (S3) y CDN, validación/optimización en servidor y protecciones antiabuso.
- APIs nuevas: `GET /api/admin/venues/{id}/tracks?q=...`, CRUD `/api/admin/venues/{id}/photos`, lectura pública `/api/venues/{id}/photos/{photoId}`.
- Los mapas siguen usando OpenStreetMap con atribución. Para un producto comercial habrá que verificar los términos del servicio de teselas y geocodificación, y usar proveedores con cuotas adecuadas.
- Solo hubo pruebas de frontend con API/música/mapa simulados y de sintaxis JS en el entorno de generación; **la compilación completa de Micronaut y escritura real en PostgreSQL/Spotify no pudieron verificarse aquí**. El build y los pasos de prueba manual son obligatorios.
