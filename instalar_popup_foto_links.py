#!/usr/bin/env python3
"""TOCÁ v1.7.3.4: mini-ficha con foto y links en el popup Leaflet.

Ejecutar desde la raíz del proyecto TOCÁ tras descomprimir el ZIP:
    python3 instalar_popup_foto_links.py

Crea respaldo y ZIP portable del frontend resultante. Sin cambios de API/BD.
"""
from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import re
import shutil
import sys

root = Path.cwd()
app_path = root / 'web/app.js'
index_path = root / 'web/index.html'
sw_path = root / 'web/sw.js'
css_path = root / 'web/toca-popup-card.css'

for path in (app_path, index_path, css_path):
    if not path.is_file():
        sys.exit(f'ERROR: falta {path.relative_to(root)}. Ejecutá desde la raíz toca y descomprimí el ZIP ahí.')

app = app_path.read_text(encoding='utf-8')
html = index_path.read_text(encoding='utf-8')
if '</head>' not in html:
    sys.exit('ERROR: no se encontró </head> en web/index.html.')
if 'function initMap()' not in app or 'instagramLink(' not in app:
    sys.exit('ERROR: web/app.js no coincide con TOCÁ + Instagram. No se modificó nada.')
if 'tocaVenuePopup(v)' in app:
    sys.exit('Este parche ya parece estar instalado. No se modificó nada.')

# Reemplazar ÚNICAMENTE el HTML de Leaflet, manteniendo toda su lógica de filtros/pins.
# Las versiones anteriores tienen un único .bindPopup(`...`).
pattern = r'\.bindPopup\(`[^`]*`\)'
found = list(re.finditer(pattern, app, re.DOTALL))
if len(found) != 1 or 'esc(v.name)' not in found[0].group(0):
    sys.exit(f'ERROR: se esperaba un único popup de bar y se encontraron {len(found)}. No se modificó nada.')

helper = '''// TOCÁ v1.7.3.4: ficha compacta del bar en el mapa, con foto completa y enlaces discretos.
function tocaVenuePopup(v) {
  const name = String(v.name || 'Establecimiento');
  const genre = String(v.genre || 'Música');
  const city = String(v.city || '').trim();
  const imagePath = String(v.coverPhotoUrl || '');
  // La API devuelve rutas relativas a sus propias fotos; no aceptamos URLs arbitrarias.
  const photoUrl = imagePath.startsWith('/api/venues/') ? mediaUrl(imagePath) : '';
  const image = photoUrl
    ? `<img class="toca-popup-cover" src="${esc(photoUrl)}" alt="Foto de ${esc(name)}" loading="lazy">`
    : `<img class="toca-popup-placeholder" src="/assets/icon.svg" alt="" aria-hidden="true">`;
  const instagram = String(v.instagramHandle || '').trim().replace(/^@/, '');
  const instagramLink = /^[A-Za-z0-9._]{1,30}$/.test(instagram)
    ? `<a class="toca-popup-link" href="https://www.instagram.com/${encodeURIComponent(instagram)}/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${esc(name)} (se abre en otra pestaña)">Instagram <span aria-hidden="true">↗</span></a>`
    : '';
  return `<article class="toca-popup-card">
    <div class="toca-popup-media ${photoUrl ? 'has-photo' : 'no-photo'}">${image}</div>
    <div class="toca-popup-copy">
      <strong class="toca-popup-name">${esc(name)}</strong>
      <span class="toca-popup-meta">${esc(genre)}${city ? ` · ${esc(city)}` : ''}</span>
      <nav class="toca-popup-links" aria-label="Enlaces de ${esc(name)}">
        <a class="toca-popup-link" href="#/venue/${encodeURIComponent(v.id)}">Ver bar <span aria-hidden="true">→</span></a>
        ${instagramLink}
      </nav>
    </div>
  </article>`;
}

'''
app_updated = app[:found[0].start()] + '.bindPopup(tocaVenuePopup(v))' + app[found[0].end():]
app_updated = app_updated.replace('function initMap(){', helper+'function initMap(){', 1)

# Eliminar hojas de estilo anteriores y JS dinámico que recoloreaba links.
html_updated = re.sub(
    r'\s*<link\b[^>]*\bhref\s*=\s*["\'][^"\']*toca-popup-clean\.css[^"\']*["\'][^>]*>',
    '', html, flags=re.IGNORECASE)
html_updated = re.sub(
    r'\s*<link\b[^>]*\bhref\s*=\s*["\'][^"\']*toca-popup-card\.css[^"\']*["\'][^>]*>',
    '', html_updated, flags=re.IGNORECASE)
html_updated = re.sub(
    r'\s*<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*toca-popup-buttons\.js[^"\']*["\'][^>]*>\s*</script>',
    '', html_updated, flags=re.IGNORECASE)
html_updated = re.sub(
    r'\s*<style\b[^>]*\bid\s*=\s*["\']toca-popup-colors-v1732["\'][^>]*>.*?</style>',
    '', html_updated, flags=re.IGNORECASE | re.DOTALL)
html_updated = html_updated.replace('</head>', '  <link rel="stylesheet" href="/toca-popup-card.css?v=1734" />\n</head>', 1)

sw_updated = None
if sw_path.is_file():
    sw = sw_path.read_text(encoding='utf-8')
    if 'const CACHE=' in sw:
        sw_updated = re.sub(r"const CACHE='[^']+'", "const CACHE='toca-shell-v1734-popup-card'", sw, count=1)
        # La hoja nueva debe precachearse para modo PWA/offline.
        if "'/toca-popup-card.css'" not in sw_updated:
            if "'/toca-popup-clean.css'" in sw_updated:
                sw_updated = sw_updated.replace("'/toca-popup-clean.css'", "'/toca-popup-card.css'")
            elif "'/toca.css'" in sw_updated:
                sw_updated = sw_updated.replace("'/toca.css'", "'/toca.css','/toca-popup-card.css'", 1)

backup_dir = root.parent / f'toca-popup-links-backup-{datetime.now().strftime("%Y%m%d-%H%M%S")}'
for f in (app_path, index_path, sw_path):
    if f.exists():
        dest = backup_dir / f.relative_to(root)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)

app_path.write_text(app_updated, encoding='utf-8')
index_path.write_text(html_updated, encoding='utf-8')
if sw_updated is not None:
    sw_path.write_text(sw_updated, encoding='utf-8')

zip_path = root.parent / 'TOCA-v1.7.3.4-popup-frontend-aplicado.zip'
with ZipFile(zip_path, 'w', ZIP_DEFLATED) as z:
    for f in (app_path, index_path, css_path, sw_path):
        if f.exists():
            z.write(f, f.relative_to(root).as_posix())

print('OK: popup actualizado con foto y enlaces de texto.')
print('Respaldo:', backup_dir)
print('Parche web generado:', zip_path)
print('Verificación opcional: node --check web/app.js')
print('Desplegar: docker compose up -d --force-recreate web')
