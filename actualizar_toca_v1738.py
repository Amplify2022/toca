from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import re

files = {
    "ui": Path("web/toca-ui.js"),
    "app": Path("web/app.js"),
    "location": Path("web/venue-location.js"),
    "css": Path("web/toca.css"),
    "html": Path("web/index.html"),
}
new_script = Path("web/toca-v1738.js")

for path in files.values():
    if not path.is_file():
        raise SystemExit(f"Falta {path}. Ejecutá desde la raíz de toca.")

if new_script.exists():
    raise SystemExit("La actualización v1.7.3.8 ya parece estar instalada.")

data = {
    key: path.read_text(encoding="utf-8")
    for key, path in files.items()
}

def change(key, old, new, label):
    count = data[key].count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: esperaba 1 coincidencia, encontré {count}. "
            "No se modificaron archivos."
        )
    data[key] = data[key].replace(old, new, 1)

# --------------------------------------------------
# 1. Eliminar ciudad fija del encabezado público.
# --------------------------------------------------

change(
    "ui",
    '<span class="toca-city">${iconSvg(\'pin\',15)} Montevideo</span>',
    '',
    "Ciudad fija del encabezado"
)

change(
    "ui",
    '<span class="eyebrow">MONTEVIDEO · URUGUAY</span>',
    '',
    "Etiqueta Montevideo Uruguay"
)

change(
    "ui",
    '<h2>Bares cerca tuyo</h2>',
    '<h2>Bares en el mapa</h2>',
    "Título del mapa"
)

# --------------------------------------------------
# 2. Ciudad contextual de los bares visibles.
# --------------------------------------------------

city_function = '''
function tocaVisibleCityLabel(venues) {
  if (!venues.length) return 'Sin resultados';

  const cities = new Map();

  venues.forEach(venue => {
    const city = String(venue.city || '').trim();
    if (city) {
      cities.set(city.toLocaleLowerCase('es'), city);
    }
  });

  if (cities.size === 0) return 'Ubicación no indicada';
  if (cities.size > 1) return 'Varias ciudades';

  return [...cities.values()][0];
}

'''

change(
    "ui",
    "explore=async function(){",
    city_function + "explore=async function(){",
    "Función de ciudad contextual"
)

change(
    "ui",
    '<span id="toca-results-count">${filtered.length} lugares</span>',
    '''<div class="toca-map-meta">
<span id="toca-map-city-label">${tocaVisibleCityLabel(filtered)}</span>
<span id="toca-results-count">${filtered.length} lugares</span>
</div>''',
    "Indicador de ciudad y resultados"
)

change(
    "ui",
    "v.city?'Montevideo':'Ubicación registrada'",
    "esc(v.city||'Ubicación registrada')",
    "Ciudad en las tarjetas"
)

change(
    "app",
    "const count=document.getElementById('toca-results-count');",
    """const cityLabel=document.getElementById('toca-map-city-label');
  if(cityLabel && typeof tocaVisibleCityLabel==='function') {
    cityLabel.textContent=tocaVisibleCityLabel(visible);
  }
  const count=document.getElementById('toca-results-count');""",
    "Actualizar ciudad al filtrar"
)

# --------------------------------------------------
# 3. Eliminar segunda entrada de dirección.
# El buscador ya soporta usar el campo del formulario.
# --------------------------------------------------

old_address = '''<div class="toca-location-searchbar"><div class="field"><label for="toca-location-query">Buscar dirección</label><input id="toca-location-query" class="input" type="search" autocomplete="street-address" placeholder="Ej.: Av. 18 de Julio 1234" value="${safeText(venue?.address||'')}" /></div><button type="button" class="btn ghost" data-action="location-search">Buscar en el mapa</button></div>'''

new_address = '''<div class="toca-location-searchbar">
<button type="button" class="btn ghost" data-action="location-search">
Buscar en el mapa
</button>
</div>'''

change(
    "location",
    old_address,
    new_address,
    "Campo de dirección duplicado"
)

# --------------------------------------------------
# 4. Etiqueta de Mi Cuenta.
# --------------------------------------------------

if "CONFIGURACIÓN PERSONAL" in data["app"]:
    change(
        "app",
        "CONFIGURACIÓN PERSONAL",
        "PERFIL DEL ADMINISTRADOR",
        "Encabezado Mi cuenta"
    )

# --------------------------------------------------
# 5. Estilos de la interfaz.
# --------------------------------------------------

data["css"] += '''

/* TOCÁ 1.7.3.8 — Ciudad y encabezados */

.toca-map-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px 14px;
}

#toca-map-city-label {
  color: #c5d1d1;
  font-size: 13px;
  font-weight: 600;
}

.toca-location-searchbar {
  display: flex !important;
  justify-content: flex-end;
  align-items: center;
  margin: 8px 0 16px;
}

.toca-admin-section-heading {
  margin-bottom: 26px;
}

.toca-admin-section-heading h2 {
  font-size: clamp(24px, 2.8vw, 32px);
  margin: 8px 0;
  line-height: 1.2;
}

.toca-admin-section-heading p {
  margin: 0;
  color: #9caaad;
  font-size: 14px;
  line-height: 1.6;
}

/* No mostrar flechas decorativas al final de los links */
.leaflet-popup-content .toca-map-popup-actions a::after,
.leaflet-popup-content .toca-instagram-link::after,
.toca-detail-intro .toca-instagram-link::after {
  content: none !important;
}
'''

# --------------------------------------------------
# 6. Script para completar los encabezados del admin
# y quitar las flechas de los enlaces actuales.
# --------------------------------------------------

javascript = r"""
(() => {
  'use strict';

  const headings = {
    requests: [
      'ACTIVIDAD MUSICAL',
      'Solicitudes',
      'Consultá las canciones solicitadas y su estado.'
    ],
    spotify: [
      'CONEXIÓN MUSICAL',
      'Spotify Premium',
      'Administrá la cuenta y la playlist del establecimiento.'
    ],
    qr: [
      'ACCESO DE CLIENTES',
      'Invitaciones QR',
      'Compartí el acceso musical de tu establecimiento.'
    ]
  };

  function updateAdminHeading() {
    const match = location.hash.match(/^#\/admin\/([^/?]+)/);
    if (!match) return;

    const config = headings[match[1]];
    if (!config) return;

    const main = document.querySelector('.toca-admin-content');
    if (!main || main.querySelector('.toca-admin-section-heading')) {
      return;
    }

    const section = document.createElement('section');
    section.className = 'toca-admin-section-heading';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = config[0];

    const title = document.createElement('h2');
    title.textContent = config[1];

    const description = document.createElement('p');
    description.textContent = config[2];

    section.append(eyebrow, title, description);
    main.prepend(section);
  }

  function removeLinkArrows() {
    const links = document.querySelectorAll(
      '.leaflet-popup-content a, ' +
      '.toca-detail-intro a.toca-instagram-link'
    );

    links.forEach(link => {
      const label = (link.textContent || '').toLowerCase();

      if (!/ver bar|ver establecimiento|instagram/.test(label)) {
        return;
      }

      const walker = document.createTreeWalker(
        link,
        NodeFilter.SHOW_TEXT
      );

      let node;

      while ((node = walker.nextNode())) {
        const clean = node.nodeValue.replace(
          /[↗↖↘→➜➝➞➤]/g,
          ''
        );

        if (clean !== node.nodeValue) {
          node.nodeValue = clean;
        }
      }

      // Eliminar solo iconos marcados como flechas.
      link.querySelectorAll(
        'svg[class*="arrow"], ' +
        'svg[class*="external"], ' +
        '[class*="arrow-icon"], ' +
        '[class*="external-icon"]'
      ).forEach(icon => icon.remove());
    });
  }

  let pending = false;

  function update() {
    updateAdminHeading();
    removeLinkArrows();
  }

  function scheduleUpdate() {
    if (pending) return;
    pending = true;

    queueMicrotask(() => {
      pending = false;
      update();
    });
  }

  function init() {
    update();

    const root = document.getElementById('app');
    if (!root) return;

    new MutationObserver(scheduleUpdate).observe(root, {
      childList: true,
      subtree: true
    });

    window.addEventListener('hashchange', scheduleUpdate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }
})();
"""

# --------------------------------------------------
# 7. Activar script y actualizar versión de assets.
# --------------------------------------------------

html = data["html"]

if "</body>" not in html:
    raise RuntimeError("No se encontró </body> en index.html.")

html = html.replace(
    "</body>",
    '<script src="/toca-v1738.js?v=1738" defer></script>\n</body>',
    1
)

for filename in ("app.js", "toca-ui.js", "venue-location.js"):
    html = re.sub(
        rf'(?<=src=")/{re.escape(filename)}(?:\?[^"]*)?',
        f'/{filename}?v=1738',
        html,
        count=1
    )

html = re.sub(
    r'(?<=href=")/toca\.css(?:\?[^"]*)?',
    '/toca.css?v=1738',
    html,
    count=1
)

data["html"] = html

# --------------------------------------------------
# 8. Respaldar y aplicar solo después de validar todo.
# --------------------------------------------------

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-backup-v1738-{stamp}"

for key, path in files.items():
    destination = backup / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)

for key, path in files.items():
    path.write_text(data[key], encoding="utf-8")
    print("Actualizado:", path)

new_script.write_text(javascript, encoding="utf-8")
print("Creado:", new_script)

# --------------------------------------------------
# 9. Generar el ZIP del parche.
# --------------------------------------------------

zip_path = Path("..") / "TOCA-v1.7.3.8-parche.zip"

with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
    for path in [*files.values(), new_script]:
        archive.write(path, path.as_posix())

print("\nTOCÁ v1.7.3.8 aplicada.")
print("Respaldo:", backup.resolve())
print("ZIP:", zip_path.resolve())
