from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil

root = Path.cwd()
api_file = Path("backend/src/main/kotlin/com/amplify/api/ApiController.kt")
app_file = Path("web/app.js")
ui_file = Path("web/toca-ui.js")
css_file = Path("web/toca.css")
migration = Path("backend/src/main/resources/db/migration/V6__venue_instagram.sql")

for path in (api_file, app_file, ui_file, css_file):
    if not path.is_file():
        raise SystemExit(f"Falta {path}. Ejecutá desde la raíz de toca.")

if migration.exists():
    raise SystemExit("La migración V6 ya existe. Revisá si la actualización fue aplicada.")

def replace_once(source, old, new, filename):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{filename}: esperaba una coincidencia y encontré {count}. "
            "No se modificó ningún archivo."
        )
    return source.replace(old, new, 1)

api = api_file.read_text(encoding="utf-8")

# Incluir Instagram en la consulta pública.
api = replace_once(
    api,
    'spotify_premium AS "spotifyConnected",playlist_id AS "playlistId"',
    'spotify_premium AS "spotifyConnected",playlist_id AS "playlistId", instagram_handle AS "instagramHandle"',
    str(api_file)
)

# Normalizar y validar el perfil.
helper = '''
    private fun normalizeInstagram(input: Any?): String? {
        val raw = (input as? String)?.trim()
            ?: return if (input == null) null else
                fail(HttpStatus.BAD_REQUEST, "Instagram inválido")

        if (raw.isBlank()) return null

        val username = if (raw.startsWith("https://", ignoreCase = true)) {
            val uri = try {
                URI(raw)
            } catch (_: Exception) {
                fail(HttpStatus.BAD_REQUEST, "URL de Instagram inválida")
            }

            if (uri.host?.lowercase() !in setOf(
                    "instagram.com", "www.instagram.com"
                ) || uri.port != -1 || uri.userInfo != null ||
                uri.fragment != null) {
                fail(HttpStatus.BAD_REQUEST, "El enlace debe ser de Instagram")
            }

            val path = uri.path.trim('/')
            if ('/' in path) {
                fail(HttpStatus.BAD_REQUEST, "Ingresá un perfil, no una publicación")
            }
            path
        } else {
            if (raw.contains("/") || raw.contains(":")) {
                fail(HttpStatus.BAD_REQUEST, "Instagram inválido")
            }
            raw.removePrefix("@")
        }

        if (!username.matches(Regex("[A-Za-z0-9._]{1,30}")) ||
            username.startsWith(".") || username.endsWith(".") ||
            username.contains("..")) {
            fail(HttpStatus.BAD_REQUEST, "Usuario de Instagram inválido")
        }

        return username.lowercase(java.util.Locale.ROOT)
    }

'''
api = replace_once(
    api,
    '    private fun venueById(',
    helper + '    private fun venueById(',
    str(api_file)
)

# Exponer Instagram en la ficha del bar.
api = replace_once(
    api,
    '"coverPhotoUrl" to coverPhoto(id),"photos" to venuePhotos(id),"now" to now)',
    '"instagramHandle" to v["instagram_handle"],"coverPhotoUrl" to coverPhoto(id),"photos" to venuePhotos(id),"now" to now)',
    str(api_file)
)

# Exponer Instagram en el listado para los marcadores del mapa.
api = replace_once(
    api,
    '"coverPhotoUrl" to coverPhoto(v["id"].toString())',
    '"instagramHandle" to v["instagramHandle"],"coverPhotoUrl" to coverPhoto(v["id"].toString())',
    str(api_file)
)

# Guardar el dato al editar Mi Bar.
api = replace_once(
    api,
    'UPDATE venue SET name=?,address=?,city=?,description=?,genre=?,latitude=?,longitude=?,updated_at=now() WHERE id=?',
    'UPDATE venue SET name=?,address=?,city=?,description=?,genre=?,instagram_handle=?,latitude=?,longitude=?,updated_at=now() WHERE id=?',
    str(api_file)
)
api = replace_once(
    api,
    '(body["genre"] as? String)?.take(160)?:"",lat,lon,safeUuid(id))',
    '(body["genre"] as? String)?.take(160)?:"",normalizeInstagram(body["instagramHandle"]),lat,lon,safeUuid(id))',
    str(api_file)
)

app = app_file.read_text(encoding="utf-8")

# Campo de Instagram en el formulario Mi Bar.
instagram_field = '''<div class="field">
<label for="venue-instagram">Instagram del bar</label>
<input class="input" id="venue-instagram" name="instagramHandle"
  value="${esc(v.instagramHandle||'')}"
  placeholder="@usuario o https://www.instagram.com/usuario/"
  maxlength="160" autocomplete="off" />
<small class="toca-location-help">
  Opcional. Se mostrará en la ficha pública y en el mapa.
</small>
</div>'''

button = '<div class="toca-editor-actions"><button class="btn">Guardar cambios del bar</button></div>'
app = replace_once(
    app, button, instagram_field + button, str(app_file)
)

# Construir un enlace seguro a Instagram.
link_helper = '''
function instagramLink(handle) {
  const username = String(handle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return '';
  const url = 'https://www.instagram.com/' +
    encodeURIComponent(username) + '/';
  return `<a class="toca-instagram-link"
    href="${url}" target="_blank" rel="noopener noreferrer"
    aria-label="Instagram del bar @${esc(username)}">
    ◎ Instagram · @${esc(username)}
  </a>`;
}

'''
app = replace_once(
    app,
    'function initMap(){',
    link_helper + 'function initMap(){',
    str(app_file)
)

# Instagram en el popup de Leaflet.
app = replace_once(
    app,
    '''<a href="#/venue/${encodeURIComponent(v.id)}">Ver establecimiento ↗</a>`)''',
    '''<a href="#/venue/${encodeURIComponent(v.id)}">Ver establecimiento ↗</a><div>${instagramLink(v.instagramHandle)}</div>`)''',
    str(app_file)
)

# Instagram en la ficha pública del establecimiento.
ui = ui_file.read_text(encoding="utf-8")
ui = replace_once(
    ui,
    """<p class="toca-detail-desc">${esc(v.description||'Encontrá el ambiente que va con vos.')}</p></div>""",
    """<p class="toca-detail-desc">${esc(v.description||'Encontrá el ambiente que va con vos.')}</p>${instagramLink(v.instagramHandle)}</div>""",
    str(ui_file)
)

css = css_file.read_text(encoding="utf-8")
css += '''

/* TOCÁ v1.7.3 — Instagram del establecimiento */
.toca-instagram-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 9px 13px;
  border-radius: 12px;
  background: rgba(185, 255, 76, .09);
  border: 1px solid rgba(185, 255, 76, .25);
  color: #b9ff4c;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.toca-instagram-link:hover {
  background: rgba(185, 255, 76, .17);
}
.leaflet-popup-content .toca-instagram-link {
  color: #173e25;
  background: #e6f7d9;
  border-color: #cce3bc;
}
'''

migration_content = """ALTER TABLE venue
ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(30);
"""

changes = {
    api_file: api,
    app_file: app,
    ui_file: ui,
    css_file: css,
    migration: migration_content,
}

# Respaldar antes de escribir.
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = root.parent / f"toca-instagram-backup-{timestamp}"

for path in changes:
    if path.exists():
        dest = backup / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

# Aplicar cambios.
for path, content in changes.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("Actualizado:", path)

# Generar también un ZIP reutilizable del parche.
zip_path = root.parent / "TOCA-v1.7.3-parche-instagram.zip"
with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
    for path in changes:
        archive.write(path, path.as_posix())

print("\nActualización aplicada.")
print("Respaldo:", backup)
print("ZIP generado:", zip_path)
