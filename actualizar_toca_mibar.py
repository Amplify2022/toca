from pathlib import Path
from datetime import datetime
import re
import shutil

APP = Path("web/app.js")
UI = Path("web/toca-ui.js")
LOC = Path("web/venue-location.js")
CSS = Path("web/toca.css")
HTML = Path("web/index.html")
API = Path("backend/src/main/kotlin/com/amplify/api/ApiController.kt")
MIG = Path("backend/src/main/resources/db/migration")

paths = [APP, UI, LOC, CSS, HTML, API]
for p in paths:
    if not p.is_file():
        raise SystemExit(f"Falta {p}")

files = {p: p.read_text(encoding="utf-8") for p in paths}

if "TOCA-MIBAR-REWORK-1" in files[CSS]:
    raise SystemExit("El parche ya está aplicado.")

def change(path, old, new):
    current = files[path]
    count = current.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path}: patrón esperado {old[:65]!r}, "
            f"encontrado {count} veces. No se modificó nada."
        )
    files[path] = current.replace(old, new, 1)

# ---------------- BACKEND ----------------

change(
    API,
    'id,name,slug,address,city,description,genre,latitude',
    'id,name,slug,address,city,description,'
    'opening_hours AS "openingHours",genre,latitude'
)

change(
    API,
    '"city" to v["city"],"description" to v["description"],',
    '"city" to v["city"],"description" to v["description"],'
    '"openingHours" to v["opening_hours"],'
)

change(
    API,
    '"city" to v["city"],"genre" to v["genre"],',
    '"city" to v["city"],"genre" to v["genre"],'
    '"openingHours" to v["openingHours"],'
)

# Un bar sin portada todavía es un borrador.
change(
    API,
    'FROM venue ORDER BY updated_at DESC LIMIT 150',
    'FROM venue WHERE EXISTS (SELECT 1 FROM venue_photo vp '
    'WHERE vp.venue_id=venue.id) '
    'ORDER BY updated_at DESC LIMIT 150'
)

change(
    API,
    'FROM venue WHERE lower(city)=lower(?) ORDER BY updated_at DESC LIMIT 150',
    'FROM venue WHERE lower(city)=lower(?) '
    'AND EXISTS (SELECT 1 FROM venue_photo vp '
    'WHERE vp.venue_id=venue.id) '
    'ORDER BY updated_at DESC LIMIT 150'
)

# Género opcional también al crear.
change(
    API,
    'val genre=required(body,"genre",160)',
    'val genre=(body["genre"] as? String)?.trim()?.take(160) ?: ""'
)

# Portada obligatoria para guardar el perfil.
change(
    API,
    '''        ownerVenue(id,authorization)
        val lat=(body["latitude"] as? Number)?.toDouble()''',
    '''        ownerVenue(id,authorization)
        if(coverPhoto(id)==null)
            fail(HttpStatus.BAD_REQUEST,
                "Agregá al menos una foto de portada antes de guardar")
        val lat=(body["latitude"] as? Number)?.toDouble()'''
)

# Guardar horario opcional.

# Actualizar SQL sin depender del formato exacto ni de columnas adicionales.
current = files[API]

begin = current.find('@Put("/admin/venues/{id}")')
finish = current.find(
    '@Post("/admin/venues/{id}/session")', begin
)

if begin < 0 or finish < 0:
    raise RuntimeError(
        "No encontré el método editVenue en ApiController.kt"
    )

section = current[begin:finish]

sql_match = re.search(
    r'UPDATE\s+venue\s+SET\b.*?\bWHERE\s+id\s*=\s*\?\s*""",',
    section,
    flags=re.DOTALL | re.IGNORECASE
)

if not sql_match:
    raise RuntimeError(
        "No encontré la sentencia UPDATE de editVenue"
    )

old_sql = sql_match.group(0)

if "opening_hours=?" in old_sql:
    raise RuntimeError("opening_hours ya está en el UPDATE")

new_sql, count = re.subn(
    r'\blatitude\s*=\s*\?',
    'opening_hours=?,latitude=?',
    old_sql,
    count=1
)

if count != 1:
    raise RuntimeError(
        "No pude localizar latitude=? en el UPDATE"
    )

section = (
    section[:sql_match.start()]
    + new_sql
    + section[sql_match.end():]
)

section, count = re.subn(
    r',\s*lat\s*,\s*lon\s*,\s*safeUuid\(id\)\s*\)',
    ',openingHours,lat,lon,safeUuid(id))',
    section,
    count=1
)

if count != 1:
    raise RuntimeError(
        "No encontré los parámetros finales del UPDATE"
    )

files[API] = current[:begin] + section + current[finish:]

# No permitir eliminar la única foto.
change(
    API,
    '''        val venueId=safeUuid(id)
        if(db.exec("DELETE FROM venue_photo WHERE venue_id=? AND id=?",venueId,safeUuid(photoId))==0)''',
    '''        val venueId=safeUuid(id)
        val photoCount=(db.one(
            "SELECT count(*) AS total FROM venue_photo WHERE venue_id=?",
            venueId)?.get("total") as Number).toInt()
        if(photoCount<=1)
            fail(HttpStatus.CONFLICT,
                "El bar debe conservar al menos una foto de portada")
        if(db.exec("DELETE FROM venue_photo WHERE venue_id=? AND id=?",venueId,safeUuid(photoId))==0)'''
)

# ---------------- MI BAR ----------------

# La ciudad permanece internamente para búsquedas geográficas.
change(
    APP,
    """<div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(v.city||'')}" required /></div>""",
    """<input type="hidden" name="city" value="${esc(v.city||'Montevideo')}" />"""
)

change(
    APP,
    '''<div class="field"><label>Ciudad</label><input name="city" class="input" value="Montevideo" required /></div>''',
    '''<input type="hidden" name="city" value="Montevideo" />'''
)

hours_field = '''<div class="field toca-hours-field">
<label for="toca-opening-hours">Horario <span class="toca-optional">(opcional)</span></label>
<input id="toca-opening-hours" class="input"
 name="openingHours" maxlength="180"
 value="${esc(v.openingHours||'')}"
 placeholder="Ej.: Mar–Dom · 18:00–02:00" />
<p class="toca-location-help">Indicá los días y horarios de apertura. Se mostrarán en la tarjeta del bar.</p>
</div>'''

change(
    APP,
    '<div class="toca-editor-actions"><button class="btn">Guardar cambios del bar</button>',
    hours_field +
    '<div class="toca-editor-actions"><button class="btn">Guardar cambios del bar</button>'
)

change(
    APP,
    """</form>${typeof tocaPhotoGalleryMarkup === 'function' ? tocaPhotoGalleryMarkup(v) : ''}""",
    """</form>${!v.coverPhotoUrl ? '<p class="toca-required-cover">Falta completar un requisito: agregá al menos una foto de portada debajo para publicar tu bar.</p>' : ''}${typeof tocaPhotoGalleryMarkup === 'function' ? tocaPhotoGalleryMarkup(v) : ''}"""
)

# Luego del alta, llevar directamente a completar la portada.
change(
    APP,
    """state.venueId=created.id;toast('Bar creado');render();return""",
    """state.venueId=created.id;toast('Bar creado. Agregá una foto de portada.');navigate('#/admin/profile');return"""
)

# ---------------- UBICACIÓN ----------------

# Géneros no obligatorios.
change(
    LOC,
    'placeholder="Ej.: Rock, Cumbia, Pop" required />',
    'placeholder="Ej.: Rock, Cumbia, Pop" />'
)

# La búsqueda usa la ciudad guardada internamente.
files[LOC] = files[LOC].replace(
    'Escribí la dirección y la ciudad arriba',
    'Escribí la dirección arriba'
)

# ---------------- TARJETAS ----------------

card_pattern = (
    r'function tocaVenueCard\(v,i,wide=false\)\{.*?'
    r'(?=function tocaSideLayout\()'
)

new_card = """function tocaVenueCard(v,i,wide=false){
  const hours = v.openingHours
    ? `<div class="toca-card-hours" title="${esc(v.openingHours)}">Horario: ${esc(v.openingHours)}</div>`
    : '';
  return `<a class="toca-venue ${wide?'wide':''}" href="#/venue/${encodeURIComponent(v.id)}">
    <div class="toca-venue-photo ${v.coverPhotoUrl?'toca-photo-uncropped':''}">
      ${photo(v,i)}
      <span class="toca-live ${v.active?'':'paused'}">${v.active?'● En vivo':'○ Música inactiva'}</span>
    </div>
    <div class="toca-venue-meta">
      <strong>${esc(v.name)}</strong>
      ${v.genre ? `<small class="toca-card-genre">${esc(v.genre)}</small>` : ''}
      <small class="toca-card-address">${iconSvg('pin',13)} <span>${esc(v.address||'Dirección no disponible')}</span></small>
      ${hours}
      <div class="venue-foot">
        <span>${v.active?'● Música activa':'○ Música inactiva'}</span>
      </div>
    </div>
  </a>`;
}
"""

updated, count = re.subn(
    card_pattern, lambda _: new_card,
    files[UI], count=1, flags=re.DOTALL
)
if count != 1:
    raise RuntimeError(
        "No encontré la función tocaVenueCard. "
        "No se modificó nada."
    )
files[UI] = updated

# ---------------- LAYOUT Y ESTILOS ----------------

files[CSS] += """
/* TOCA-MIBAR-REWORK-1 */

.toca-discovery-layout:not(.toca-full-map) {
  display: grid !important;
  grid-template-columns: minmax(0,1fr) !important;
  gap: 28px !important;
  align-items: start !important;
}

.toca-discovery-layout:not(.toca-full-map) .toca-primary-map,
.toca-discovery-layout:not(.toca-full-map) .toca-nearby {
  min-width: 0;
  width: 100%;
  max-width: none;
  grid-column: 1;
}

.toca-discovery-layout:not(.toca-full-map) .toca-map-art {
  width: 100%;
  height: clamp(360px,55vh,620px);
}

.toca-discovery-layout:not(.toca-full-map) .toca-venues-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill,minmax(230px,1fr)) !important;
  gap: 18px;
  width: 100%;
}

.toca-venue-meta {
  min-width: 0;
}

.toca-venue-meta .toca-card-genre {
  display: block;
  color: var(--text-muted,#a6adb0);
  margin-top: 4px;
}

.toca-venue-meta .toca-card-address {
  display: flex !important;
  align-items: flex-start;
  gap: 6px;
  margin-top: 9px;
  min-width: 0;
  line-height: 1.4;
}

.toca-card-address svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.toca-card-address span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toca-card-hours {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  color: #b7c1c3;
  margin-top: 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toca-venue-meta .venue-foot {
  margin-top: 10px;
}

.toca-optional {
  font-weight: 400;
  color: #9ba5a8;
}

.toca-required-cover {
  font-size: 13px;
  color: #e3cda1;
  line-height: 1.6;
  margin-top: 15px;
}

@media(max-width:600px) {
  .toca-discovery-layout:not(.toca-full-map) .toca-map-art {
    height: 390px;
  }

  .toca-discovery-layout:not(.toca-full-map) .toca-venues-grid {
    grid-template-columns: minmax(0,1fr) !important;
  }
}
"""

# Evitar que Chrome use los assets anteriores.
version = "mibar-rework-1"

for filename in ("app.js", "toca-ui.js", "venue-location.js"):
    pattern = rf'(?<=src=")/{re.escape(filename)}(?:\?[^"]*)?(?=")'
    updated, count = re.subn(
        pattern, f'/{filename}?v={version}', files[HTML]
    )
    if count != 1:
        raise RuntimeError(f"No encontré {filename} en index.html")
    files[HTML] = updated

updated, count = re.subn(
    r'(?<=href=")/toca\.css(?:\?[^"]*)?(?=")',
    f'/toca.css?v={version}', files[HTML]
)
if count != 1:
    raise RuntimeError("No encontré toca.css en index.html")
files[HTML] = updated

# ---------------- MIGRACIÓN ----------------

versions = [
    int(match.group(1))
    for p in MIG.glob("V*__*.sql")
    if (match := re.match(r"V(\d+)__", p.name))
]
next_version = max(versions, default=0) + 1
migration = MIG / f"V{next_version}__venue_opening_hours.sql"

# ---------------- ESCRIBIR ----------------

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-mibar-backup-{stamp}"

for path in paths:
    dest = backup / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

for path, content in files.items():
    path.write_text(content, encoding="utf-8")
    print("Actualizado:", path)

migration.write_text(
    "ALTER TABLE venue ADD COLUMN IF NOT EXISTS "
    "opening_hours VARCHAR(180);\n",
    encoding="utf-8"
)

print("Creada migración:", migration)
print("Respaldo:", backup.resolve())
print("Cambios aplicados. Falta compilar y probar.")
