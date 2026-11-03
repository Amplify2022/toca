from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import re

root = Path.cwd()
ui_path = Path("web/toca-ui.js")
css_path = Path("web/toca.css")
html_path = Path("web/index.html")
new_js = Path("web/toca-v1739.js")

for p in (ui_path, css_path, html_path):
    if not p.is_file():
        raise SystemExit(f"Falta {p}. Ejecutá desde la raíz de toca.")

ui = ui_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
html = html_path.read_text(encoding="utf-8")

if new_js.exists() or "toca-v1739.js" in html:
    raise SystemExit("La v1.7.3.9 ya parece estar instalada.")

if "toca-v1738.js" not in html:
    raise SystemExit("Este parche necesita que esté aplicada la v1.7.3.8.")

# Estados musicales públicos.
ui = ui.replace("Sin sesión", "Música inactiva")
ui = ui.replace(
    "'Música activa':'Cerrado'",
    "'Música activa':'Música inactiva'"
)

# Estilos compartidos para todas las secciones del admin.
css += r"""

/* TOCÁ v1.7.3.9 — Encabezados del administrador */

.toca-admin-content .toca-profile-editor {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch;
  gap: 0 !important;
}

.toca-admin-content .toca-profile-editor > .toca-editor-heading,
.toca-admin-content .toca-rule-heading,
.toca-admin-content .toca-admin-section-heading,
.toca-admin-content .toca-ad-head {
  margin: 0 0 24px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.toca-admin-content .toca-profile-editor > .card {
  margin-top: 0 !important;
}

.toca-admin-content .toca-editor-heading h2,
.toca-admin-content .toca-rule-heading h2,
.toca-admin-content .toca-admin-section-heading h2,
.toca-admin-content .toca-ad-head h1 {
  font-family: 'Outfit', sans-serif !important;
  font-size: clamp(26px, 2.7vw, 32px) !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  letter-spacing: -0.025em !important;
  margin: 6px 0 8px !important;
}

.toca-admin-content .toca-editor-heading .eyebrow,
.toca-admin-content .toca-rule-heading .eyebrow,
.toca-admin-content .toca-admin-section-heading .eyebrow,
.toca-admin-content .toca-ad-head .eyebrow {
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  letter-spacing: 0.13em !important;
  text-transform: uppercase;
}

.toca-admin-content .toca-editor-heading p,
.toca-admin-content .toca-rule-heading p,
.toca-admin-content .toca-admin-section-heading p,
.toca-admin-content .toca-ad-head p {
  font-size: 14px !important;
  line-height: 1.6 !important;
  margin: 0 !important;
}

/* Ciudad y cantidad de resultados con idéntica tipografía */

.toca-section-title .toca-map-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.toca-section-title .toca-map-meta #toca-map-city-label,
.toca-section-title .toca-map-meta #toca-results-count {
  display: inline-flex !important;
  align-items: center !important;
  color: #b5c4c6 !important;
  font-family: 'DM Sans', sans-serif !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.5 !important;
  letter-spacing: 0 !important;
  margin: 0 !important;
}

.toca-section-title #toca-map-city-label::after {
  content: '·';
  margin-left: 8px;
  color: #70878b;
}
"""

# Ajustes dinámicos de DOM y mapa.
javascript = r"""
(() => {
  'use strict';

  /*
   * Mover los encabezados de Mi Bar y Mi Cuenta
   * afuera de sus tarjetas, conservando sus formularios.
   */
  function normalizeAdminHeadings() {
    const section = document.querySelector(
      '.toca-admin-content .toca-profile-editor'
    );
    if (!section) return;

    const card = section.querySelector(':scope > .card');
    if (!card) return;

    const heading = card.querySelector(
      ':scope > .toca-editor-heading'
    );

    if (heading) {
      section.insertBefore(heading, card);
    }
  }

  /*
   * Actualizar la ciudad según los marcadores realmente
   * visibles en el área actual del mapa.
   */
  function updateMapCity(map) {
    const label = document.getElementById(
      'toca-map-city-label'
    );
    if (!label || !map) return;

    try {
      const bounds = map.getBounds();
      if (!bounds?.isValid()) return;

      const venues = typeof filteredVenues === 'function'
        ? filteredVenues()
        : state.venues;

      const visible = venues.filter(v => {
        const lat = Number(v.latitude);
        const lon = Number(v.longitude);

        return Number.isFinite(lat)
          && Number.isFinite(lon)
          && v.latitude != null
          && v.longitude != null
          && bounds.contains([lat, lon]);
      });

      label.textContent = visible.length
        ? tocaVisibleCityLabel(visible)
        : 'Sin bares en esta zona';
    } catch (error) {
      console.warn('No se pudo actualizar la ciudad:', error);
    }
  }

  /*
   * El mapa se recrea después de filtrar.
   * Asociamos los eventos a cada instancia nueva.
   */
  const originalInitMap = typeof initMap === 'function'
    ? initMap
    : null;

  if (originalInitMap) {
    initMap = function(...args) {
      const result = originalInitMap.apply(this, args);
      const map = state.map;

      if (map && typeof map.on === 'function') {
        const refresh = () => updateMapCity(map);

        map.on('moveend', refresh);
        map.on('zoomend', refresh);

        refresh();
      }

      return result;
    };
  }

  let scheduled = false;

  function scheduleHeadings() {
    if (scheduled) return;
    scheduled = true;

    queueMicrotask(() => {
      scheduled = false;
      normalizeAdminHeadings();
    });
  }

  function initialize() {
    normalizeAdminHeadings();

    const root = document.getElementById('app');
    if (!root) return;

    new MutationObserver(scheduleHeadings).observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
"""

# Versionar assets para evitar caché.
def replace_asset(text, expression, replacement):
    changed, count = re.subn(expression, replacement, text, count=1)
    if count != 1:
        raise RuntimeError(
            f"No encontré el asset esperado: {replacement}"
        )
    return changed

html = replace_asset(
    html,
    r'(?<=src=")/toca-ui\.js(?:\?[^"]*)?',
    '/toca-ui.js?v=1739'
)

html = replace_asset(
    html,
    r'(?<=href=")/toca\.css(?:\?[^"]*)?',
    '/toca.css?v=1739'
)

if html.count("</body>") != 1:
    raise RuntimeError("index.html no tiene un cierre body válido.")

html = html.replace(
    "</body>",
    '<script src="/toca-v1739.js?v=1739" defer></script>\n</body>',
    1
)

# Respaldo.
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = root.parent / f"toca-backup-v1739-{stamp}"

updates = {
    ui_path: ui,
    css_path: css,
    html_path: html,
    new_js: javascript,
}

for path in updates:
    if path.exists():
        dest = backup / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

# Escribir archivos.
for path, content in updates.items():
    path.write_text(content, encoding="utf-8")
    print("Actualizado:", path)

# ZIP de actualización.
zip_path = root.parent / "TOCA-v1.7.3.9-parche.zip"
with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
    for path in updates:
        z.write(path, path.as_posix())

print("\nActualización v1.7.3.9 aplicada.")
print("Respaldo:", backup)
print("ZIP:", zip_path)
