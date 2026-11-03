from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import re

paths = {
    "ui": Path("web/toca-ui.js"),
    "app": Path("web/app.js"),
    "css": Path("web/toca.css"),
    "html": Path("web/index.html"),
}

for path in paths.values():
    if not path.is_file():
        raise SystemExit(f"No existe {path}. Ejecutá desde la raíz de toca.")

original = {
    key: path.read_text(encoding="utf-8")
    for key, path in paths.items()
}
updated = dict(original)

def replace_once(text, old, new, description):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{description}: esperaba 1 coincidencia, encontré {count}. "
            "No se modificó ningún archivo."
        )
    return text.replace(old, new, 1)

# 1. Eliminar botón de filtros sin funcionalidad.
updated["ui"] = replace_once(
    updated["ui"],
    '<a href="#/explore" class="toca-filter-btn" aria-label="Filtros de bares">${iconSvg(\'sliders\',20)}</a>',
    '',
    "Botón de filtros"
)

# 2. Mover el panel Qué está sonando a la columna derecha.
playing = '''<div class="toca-tabs"><span class="active">En vivo</span></div><div class="toca-detail-playing"><h2>Qué está sonando</h2><div id="toca-live-music">${tocaNowPlaying(v)}</div><a href="#/request/${encodeURIComponent(id)}${joinQuery}" class="toca-btn full">${iconSvg('music',19)} Pedí una canción ${iconSvg('arrow',17)}</a></div>'''

updated["ui"] = replace_once(
    updated["ui"], playing, "", "Panel de reproducción"
)

new_playing = '''<div class="toca-panel toca-detail-playing">
<div class="toca-section-title">
  <h2>Qué está sonando</h2>
</div>
<div id="toca-live-music">${tocaNowPlaying(v)}</div>
<a href="#/request/${encodeURIComponent(id)}${joinQuery}"
   class="toca-btn full">
  ${iconSvg('music',19)} Pedí una canción ${iconSvg('arrow',17)}
</a>
</div>'''

updated["ui"] = replace_once(
    updated["ui"],
    '<aside class="toca-detail-aside"><div class="toca-panel">',
    '<aside class="toca-detail-aside">' + new_playing +
    '<div class="toca-panel">',
    "Columna derecha de Ver bar"
)

# 3. Eliminar ajustes del entorno del perfil del cliente.
updated["ui"] = replace_once(
    updated["ui"],
    '''<a href="#/settings">${iconSvg('settings',19)} Ajustes del entorno ${iconSvg('arrow',17)}</a>''',
    '',
    "Ajustes del perfil público"
)

# 4. Colocar los ajustes técnicos dentro de Mi cuenta.
account_start = updated["app"].find(
    "if(state.adminTab==='account')"
)
account_end = updated["app"].find(
    "function adminOnboarding()", account_start
)

if account_start < 0 or account_end < 0:
    raise RuntimeError("No se encontró la sección Mi cuenta.")

account_section = updated["app"][account_start:account_end]

advanced = '''</form>
<details class="toca-dev-settings">
  <summary>Opciones avanzadas</summary>
  <p>Configuración técnica del entorno de desarrollo:
     modo demostración y conexión con la API.</p>
  <a href="#/settings">Abrir configuración del entorno ↗</a>
</details>
</div></section>'''

account_section = replace_once(
    account_section,
    '</form></div></section>',
    advanced,
    "Opciones avanzadas de Mi cuenta"
)

updated["app"] = (
    updated["app"][:account_start] +
    account_section +
    updated["app"][account_end:]
)

# 5. Estilos para la nueva distribución.
updated["css"] += '''

/* TOCÁ v1.7.3.7 — Distribución de ficha y opciones avanzadas */

.toca-detail-aside > .toca-detail-playing:first-child {
  margin-top: 0;
}

.toca-detail-aside .toca-detail-playing {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.toca-detail-aside .toca-detail-playing .toca-btn {
  margin-top: 6px;
}

.toca-dev-settings {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,.12);
}

.toca-dev-settings summary {
  cursor: pointer;
  color: #aebdc0;
  font-size: 14px;
}

.toca-dev-settings p {
  color: #9aabad;
  font-size: 13px;
  line-height: 1.6;
}

.toca-dev-settings a {
  color: #c5d5d7;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.toca-dev-settings a:hover {
  color: #ffffff;
}
'''

# 6. Evitar que el navegador cargue archivos JS/CSS anteriores.
html = updated["html"]
for filename in ("app.js", "toca-ui.js", "toca.css"):
    html = re.sub(
        rf'/{re.escape(filename)}(?:\\?v=[a-zA-Z0-9._-]+)?(?=")',
        f'/{filename}?v=1737',
        html
    )
updated["html"] = html

# 7. Respaldo antes de modificar.
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-backup-v1737-{stamp}"

for key, path in paths.items():
    target = backup / path
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

# 8. Guardar archivos.
for key, path in paths.items():
    path.write_text(updated[key], encoding="utf-8")
    print("Actualizado:", path)

# 9. Crear ZIP reutilizable.
zip_path = Path("..") / "TOCA-v1.7.3.7-layout.zip"
with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
    for path in paths.values():
        z.write(path, path.as_posix())

print("\nTOCÁ v1.7.3.7 aplicada.")
print("Respaldo:", backup.resolve())
print("ZIP generado:", zip_path.resolve())
