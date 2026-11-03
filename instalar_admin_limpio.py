#!/usr/bin/env python3
"""TOCÁ v1.7.3.5 · limpieza de navegación y panel Spotify (solo frontend).

Ejecutar desde la raíz del proyecto tocá:
    unzip -o ~/Downloads/TOCA-v1.7.3.5-admin-limpio.zip -d .
    python3 instalar_admin_limpio.py

Preserva los cambios locales de Instagram, fotos, popup y backend.
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
css_path = root / 'web/toca-admin-clean.css'

for f in (app_path, ui_path, index_path, css_path):
    if not f.is_file():
        sys.exit(f'Falta {f.relative_to(root)}. Descomprimí el ZIP en la carpeta toca y volvé a ejecutar.')


def one(source, old, new, name):
    matches = source.count(old)
    if matches != 1:
        raise RuntimeError(f'{name}: esperaba 1 coincidencia y encontré {matches}. No se modificó ningún archivo.')
    return source.replace(old, new, 1)

app = app_path.read_text(encoding='utf-8')
ui = ui_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8') if sw_path.exists() else None

# No dejar correr dos veces: evitar acumulación de estilos y copias de markup.
if 'toca-admin-clean.css' in index or 'toca-admin-toolbar' in app:
    sys.exit('Este parche ya fue instalado. No se modificó ningún archivo.')

# 1) Barra lateral: Mi cuenta se abre desde los dos avatares; ya no ocupa una entrada del menú.
ui = one(ui,
    "['admin/account','user','Mi cuenta'],",
    '', 'navegación lateral')
ui = one(ui,
    '''<div class="toca-admin-bottom"><span class="toca-admin-avatar">${esc((state.user?.name||'A')[0].toUpperCase())}</span><div><strong>${esc(state.user?.name||'Administrador')}</strong><small>Cuenta del establecimiento</small></div></div><button type="button" class="toca-logout"''',
    '''<a class="toca-admin-bottom toca-account-trigger" href="#/admin/account" aria-label="Abrir Mi cuenta" title="Mi cuenta"><span class="toca-admin-avatar">${esc((state.user?.name||'A')[0].toUpperCase())}</span><div><strong>${esc(state.user?.name||'Administrador')}</strong><small>Cuenta del establecimiento</small></div></a><button type="button" class="toca-logout"''',
    'tarjeta de usuario inferior')
ui = one(ui,
    '''<span class="toca-admin-avatar">${esc((state.user?.name||'T')[0].toUpperCase())}</span>''',
    '''<a class="toca-admin-avatar toca-admin-avatar-link" href="#/admin/account" aria-label="Abrir Mi cuenta" title="Mi cuenta">${esc((state.user?.name||'T')[0].toUpperCase())}</a>''',
    'avatar de usuario superior')

# 2) No repetir "Hola, ..." ni descripción en cada pestaña.
app = one(app,
    "['account','Mi cuenta']",
    '', 'eliminar tab Mi cuenta')
# Quitamos la coma sobrante de la última pestaña del array.
app = one(app,
    "['profile','Mi bar'],];",
    "['profile','Mi bar']];",
    'normalizar pestañas')

start = app.find('const header=`', app.find('async function admin()'))
end = app.find(";let body='';", start)
if start < 0 or end < 0:
    raise RuntimeError('No encontré el encabezado de admin. No se modificó ningún archivo.')
old_header = app[start:end]
if old_header.count('Hola,') != 1 or 'admin-venue-selector' not in old_header or 'panel-tabs' not in old_header:
    raise RuntimeError('El encabezado de admin cambió respecto de v1.7.2. No se modificó ningún archivo.')
new_header = '''const header=state.adminTab==='account'
    ? `<a class="toca-account-back" href="#/admin/general">← Volver al panel</a>`
    : `<div class="toca-admin-toolbar">
         <div class="toca-admin-toolbar-venue"><span>Establecimiento</span><strong>${esc(v.name)}</strong></div>
         <div class="toca-admin-toolbar-actions">
           <select id="admin-venue-selector" class="input" aria-label="Cambiar establecimiento">${venues.map(x=>`<option value="${esc(x.id)}" ${x.id===v.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
           <button class="btn ${v.active?'red':''} small" data-action="toggle-session">${v.active?'■ Cerrar sesión musical':'▶ Abrir sesión musical'}</button>
         </div>
       </div>
       <div class="panel-tabs">${tabs.map(([key,label])=>`<a href="#/admin/${key}" class="${state.adminTab===key?'active':''}">${label}</a>`).join('')}</div>`'''
app = app[:start] + new_header + app[end:]

# 3) Eliminar columna auxiliar entera de Spotify (Integración / banner repetido).
start = app.find("if(state.adminTab==='spotify'){body=")
end = app.find("if(state.adminTab==='qr'){", start)
if start < 0 or end < 0:
    raise RuntimeError('No encontré el panel Spotify. No se modificó ningún archivo.')
spotify = app[start:end]
spotify = one(spotify,
    'body=`<div class="grid2"><div class="stack">',
    'body=`<div class="toca-spotify-settings"><div class="stack">',
    'contenedor Spotify')
removal_start = spotify.find('</div></div><div class="stack">${liveWarn}')
if removal_start < 0 or 'OAuth + PKCE' not in spotify[removal_start:] or 'Edición de playlist:' not in spotify[removal_start:]:
    raise RuntimeError('La tarjeta de Integración Spotify no coincide. No se modificó ningún archivo.')
spotify = spotify[:removal_start] + '''</div></div><p class="toca-spotify-footnote">Nota: actualizar la playlist no siempre modifica la cola que Spotify ya tiene cargada en el reproductor.</p></div>`}
'''
app = app[:start] + spotify + app[end:]

# 4) Nueva hoja CSS de alcance limitado a admin; quitar estilos duplicados si hubiera.
if '</head>' not in index:
    raise RuntimeError('web/index.html no contiene </head>. No se modificó ningún archivo.')
index = index.replace('</head>', '  <link rel="stylesheet" href="/toca-admin-clean.css?v=1735" />\n</head>', 1)

if sw is not None:
    cache_pattern = r"const CACHE='[^']+'"
    if re.search(cache_pattern, sw):
        sw = re.sub(cache_pattern, "const CACHE='toca-shell-v1735-admin-clean'", sw, count=1)
        if "'/toca-admin-clean.css'" not in sw:
            sw = one(sw, "'/toca.css'", "'/toca.css','/toca-admin-clean.css'", 'precache PWA')

# Todas las validaciones anteriores se hacen ANTES de escribir.
changes = {app_path: app, ui_path: ui, index_path: index}
if sw is not None: changes[sw_path] = sw

backup = root.parent / ('toca-admin-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
for f in changes:
    dest = backup / f.relative_to(root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(f, dest)

for f, content in changes.items():
    f.write_text(content, encoding='utf-8')

zip_output = root.parent / 'TOCA-v1.7.3.5-admin-frontend-aplicado.zip'
with ZipFile(zip_output, 'w', ZIP_DEFLATED) as z:
    for f in (app_path, ui_path, index_path, sw_path, css_path):
        if f.exists(): z.write(f, f.relative_to(root).as_posix())

print('OK: menú Mi cuenta, encabezados y Spotify simplificados.')
print('Respaldo:', backup)
print('ZIP de frontend aplicado:', zip_output)
print('Validar: node --check web/app.js && node --check web/toca-ui.js')
print('Aplicar: docker compose up --build -d web')
