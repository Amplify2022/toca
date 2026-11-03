#!/usr/bin/env python3
"""TOCÁ v1.7.3.6: header sólo dashboard + iconos uniformes de sesión.

Instalar desde raíz de toca, después de v1.7.3.5:
  unzip -o ~/Downloads/TOCA-v1.7.3.6-header-dashboard.zip -d .
  python3 instalar_admin_header_v1736.py
"""
from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil
import re
import sys

root = Path.cwd()
app_path = root / 'web/app.js'
ui_path = root / 'web/toca-ui.js'
index_path = root / 'web/index.html'
sw_path = root / 'web/sw.js'
css_path = root / 'web/toca-dashboard-controls.css'

for path in (app_path, ui_path, index_path, css_path):
    if not path.is_file():
        sys.exit(f'Falta {path.relative_to(root)}. Extraé el ZIP en la carpeta raíz de toca.')

app = app_path.read_text('utf-8')
ui = ui_path.read_text('utf-8')
index = index_path.read_text('utf-8')
sw = sw_path.read_text('utf-8') if sw_path.is_file() else None

if 'toca-dashboard-controls.css' in index:
    sys.exit('TOCÁ v1.7.3.6 ya está aplicado; no se modificó ningún archivo.')

def replace_one(source, old, new, what):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{what}: esperaba 1 coincidencia y encontré {count}; no se modificó ningún archivo.')
    return source.replace(old, new, 1)

# Para secciones secundarias, quitar toda la barra duplicada.
# Dejar las pestañas de navegación solo para móviles (ya se ocultan en desktop por CSS).
start = app.find("const header=state.adminTab==='account'")
end_marker = ";let body='';const liveWarn='';"
end = app.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('No encontré el encabezado secundario de v1.7.3.5.')
old_header = app[start:end]
if old_header.count('toca-admin-toolbar') != 3 or old_header.count('panel-tabs') != 1:
    raise RuntimeError('El contenido del encabezado cambió; no se aplicó ningún archivo.')
new_header = '''const header=state.adminTab==='account'
  ? `<a class="toca-account-back" href="#/admin/general">← Volver al panel</a>`
  : `<div class="panel-tabs" aria-label="Secciones del panel">${tabs.map(([key,label])=>`<a href="#/admin/${key}" class="${state.adminTab===key?'active':''}">${label}</a>`).join('')}</div>`'''
app = app[:start] + new_header + app[end:]

# Iconos de iguales dimensiones para play/stop.
# HTML explícito evita diferencias de tamaño de glifos de fuente (▶ vs ■).
old_button = '''<button class="btn ${v.active?'red':''} small" data-action="toggle-session">${v.active?'■ Cerrar sesión musical':'▶ Abrir sesión musical'}</button>'''
new_button = '''<button class="btn ${v.active?'red':''} small toca-session-toggle" data-action="toggle-session" type="button"><svg class="toca-session-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${v.active?'<rect x="5" y="5" width="14" height="14" rx="2"/>':'<path d="M6 4.5 19 12 6 19.5Z"/>'}</svg><span>${v.active?'Cerrar sesión musical':'Abrir sesión musical'}</span></button>'''

# La sección admin() mantenía un botón heredado; ya no se muestra, así que
# solo el dashboard necesita reemplazo. Verificar que haya exactamente uno.
ui = replace_one(ui, old_button, new_button, 'control de sesión del dashboard')

# Hoja CSS versionada. No altera otras zonas del sitio.
index = replace_one(index, '</head>', '  <link rel="stylesheet" href="/toca-dashboard-controls.css?v=1736" />\n</head>', 'carga de estilos')

if sw is not None:
    pattern = r"const CACHE='[^']+'"
    if re.search(pattern, sw):
        sw = re.sub(pattern, "const CACHE='toca-shell-v1736-dashboard-controls'", sw, count=1)
    if "'/toca-dashboard-controls.css'" not in sw:
        css_marker = "'/toca-admin-clean.css'" if "'/toca-admin-clean.css'" in sw else "'/toca.css'"
        sw = replace_one(sw, css_marker, css_marker + ",'/toca-dashboard-controls.css'", 'precache de PWA')

# Todos los chequeos se ejecutan antes de modificar el proyecto.
changes = {app_path: app, ui_path: ui, index_path: index}
if sw is not None:
    changes[sw_path] = sw

backup = root.parent / ('toca-backup-v1736-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
for file in changes:
    target = backup / file.relative_to(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, target)

for file, text in changes.items():
    file.write_text(text, encoding='utf-8')

zip_path = root.parent / 'TOCA-v1.7.3.6-frontend-actualizado.zip'
with ZipFile(zip_path, 'w', ZIP_DEFLATED) as archive:
    for file in (app_path, ui_path, index_path, sw_path, css_path):
        if file is not None and file.exists():
            archive.write(file, file.relative_to(root).as_posix())

print('OK: encabezado removido de secciones secundarias; play/stop con SVG iguales.')
print('Backup:', backup)
print('ZIP del frontend resultante:', zip_path)
print('Validar: node --check web/app.js && node --check web/toca-ui.js')
print('Aplicar: docker compose up -d --force-recreate web')
