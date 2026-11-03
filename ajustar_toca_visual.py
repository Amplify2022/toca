from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil

app_file = Path("web/app.js")
css_file = Path("web/toca.css")

if not app_file.exists() or not css_file.exists():
    raise SystemExit("Ejecutá este script desde la carpeta raíz de toca.")

app = app_file.read_text(encoding="utf-8")
css = css_file.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"No se pudo actualizar {label}: "
            f"se esperaban 1 coincidencia y se encontraron {count}. "
            "No se modificó ningún archivo."
        )
    return text.replace(old, new, 1)

# 1. Restaurar dos acciones diferenciadas en el popup.
old_popup = '''<a href="#/venue/${encodeURIComponent(v.id)}">Ver establecimiento ↗</a><div>${instagramLink(v.instagramHandle)}</div>'''

new_popup = '''<div class="toca-map-popup-actions"><a class="toca-map-popup-venue" href="#/venue/${encodeURIComponent(v.id)}">Ver establecimiento ↗</a>${instagramLink(v.instagramHandle)}</div>'''

app = replace_once(
    app, old_popup, new_popup, "popup del mapa"
)

# 2. Mover el botón debajo de la galería.
old_profile = '''<div class="toca-editor-actions"><button class="btn">Guardar cambios del bar</button></div></form>${typeof tocaPhotoGalleryMarkup === 'function' ? tocaPhotoGalleryMarkup(v) : ''}</div></section>'''

new_profile = '''</form>${typeof tocaPhotoGalleryMarkup === 'function' ? tocaPhotoGalleryMarkup(v) : ''}<div class="toca-editor-actions toca-profile-save"><button type="submit" form="venue-update" class="btn">Guardar cambios del bar</button></div></div></section>'''

app = replace_once(
    app, old_profile, new_profile, "botón de Mi Bar"
)

# 3. Aplicar estilos neutros (sin verde chillón).
css += '''

/* TOCÁ v1.7.3.1 — Ajustes visuales de Instagram */

.toca-detail-intro .toca-instagram-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 9px 13px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #d3dcdf;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}

.toca-detail-intro .toca-instagram-link:hover {
  background: rgba(255, 255, 255, 0.10);
  color: #f0f3f3;
}

.leaflet-popup-content .toca-map-popup-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.leaflet-popup-content .toca-map-popup-venue,
.leaflet-popup-content .toca-instagram-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 11px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  text-decoration: none;
  white-space: nowrap;
  margin: 0;
}

.leaflet-popup-content .toca-map-popup-venue {
  background: #e7edef;
  border: 1px solid #d1dade;
  color: #253238;
}

.leaflet-popup-content .toca-map-popup-venue:hover {
  background: #d7e2e6;
  color: #253238;
}

.leaflet-popup-content .toca-instagram-link {
  background: #ffffff;
  border: 1px solid #d1dade;
  color: #35434a;
}

.leaflet-popup-content .toca-instagram-link:hover {
  background: #f1f4f5;
  color: #253238;
}

/* Guardar datos del bar después de las fotografías. */
.toca-profile-save {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,0.12);
}

.toca-profile-save .btn {
  min-width: 220px;
}

@media (max-width: 600px) {
  .toca-profile-save .btn {
    width: 100%;
  }
}
'''

# 4. Respaldar los originales.
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-visual-backup-{timestamp}"
backup.mkdir(parents=True, exist_ok=True)

shutil.copy2(app_file, backup / "app.js")
shutil.copy2(css_file, backup / "toca.css")

# 5. Guardar las modificaciones.
app_file.write_text(app, encoding="utf-8")
css_file.write_text(css, encoding="utf-8")

# 6. Crear un ZIP reutilizable.
zip_path = Path("..") / "TOCA-v1.7.3.1-parche-visual.zip"
with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
    z.write(app_file, app_file.as_posix())
    z.write(css_file, css_file.as_posix())

print("Actualización visual aplicada correctamente.")
print("Respaldo:", backup.resolve())
print("ZIP:", zip_path.resolve())
