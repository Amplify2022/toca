#!/usr/bin/env python3
"""TOCÁ: reemplaza arreglos anteriores del popup por CSS limpio y acotado.

Uso: desde la raíz del proyecto, descomprimir el ZIP y ejecutar:
    python3 instalar_popup.py
"""
from pathlib import Path
from datetime import datetime
import re
import shutil
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path.cwd()
index_path = ROOT / 'web/index.html'
app_path = ROOT / 'web/app.js'
css_path = ROOT / 'web/toca-popup-clean.css'
sw_path = ROOT / 'web/sw.js'

for file in (index_path, app_path, css_path):
    if not file.is_file():
        sys.exit(f'ERROR: falta {file.relative_to(ROOT)}. Ejecutá desde la carpeta toca y descomprimí el ZIP ahí.')

html = index_path.read_text(encoding='utf-8')
app = app_path.read_text(encoding='utf-8')

if 'toca-map-popup-actions' not in app or 'instagramLink(' not in app:
    sys.exit('ERROR: falta el código de Instagram en web/app.js. Este parche necesita tu proyecto ya actualizado.')
if '</head>' not in html:
    sys.exit('ERROR: web/index.html no tiene un cierre </head>. No se realizaron cambios.')

# Quitar el experimento anterior: copiaba al popup los estilos de Guardar cambios.
updated_html, removed_script = re.subn(
    r'\s*<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*toca-popup-buttons\.js[^"\']*["\'][^>]*>\s*</script>',
    '', html, flags=re.IGNORECASE
)
# Quitar reglas de color claro que quedaron embebidas dentro de index.html.
updated_html, removed_inline = re.subn(
    r'\s*<style\b[^>]*\bid\s*=\s*["\']toca-popup-colors-v1732["\'][^>]*>.*?</style>',
    '', updated_html, flags=re.IGNORECASE | re.DOTALL
)
# Eliminar referencias anteriores, si se reinstala el parche.
updated_html = re.sub(
    r'\s*<link\b[^>]*href\s*=\s*["\'][^"\']*toca-popup-clean\.css[^"\']*["\'][^>]*>',
    '', updated_html, flags=re.IGNORECASE
)

stylesheet = '  <link rel="stylesheet" href="/toca-popup-clean.css?v=17333" />\n'
updated_html = updated_html.replace('</head>', stylesheet + '</head>', 1)

updated_sw = None
if sw_path.is_file():
    sw = sw_path.read_text(encoding='utf-8')
    # Cambiar versión de cache para instalar esta hoja de estilos en la PWA.
    if "const CACHE='" in sw and "'/toca.css'" in sw:
        updated_sw = re.sub(r"const CACHE='[^']+'", "const CACHE='toca-shell-13-popup-limpio'", sw, count=1)
        if "'/toca-popup-clean.css'" not in updated_sw:
            updated_sw = updated_sw.replace("'/toca.css'", "'/toca.css','/toca-popup-clean.css'", 1)

# Backup incluso en caso de reejecución.
timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup = ROOT.parent / f'toca-popup-backup-{timestamp}'
(backup / 'web').mkdir(parents=True, exist_ok=True)
shutil.copy2(index_path, backup / 'web/index.html')
if updated_sw is not None:
    shutil.copy2(sw_path, backup / 'web/sw.js')

index_path.write_text(updated_html, encoding='utf-8')
if updated_sw is not None:
    sw_path.write_text(updated_sw, encoding='utf-8')

patch_zip = ROOT.parent / 'TOCA-popup-limpio-parche-web.zip'
with ZipFile(patch_zip, 'w', ZIP_DEFLATED) as archive:
    for file in (index_path, css_path):
        archive.write(file, file.relative_to(ROOT).as_posix())
    if updated_sw is not None:
        archive.write(sw_path, sw_path.relative_to(ROOT).as_posix())

print('OK: popup de mapa actualizado, sin alterar la API ni PostgreSQL.')
print(f'Eliminado script de estilos anterior: {removed_script} referencia(s).')
print(f'Eliminadas reglas viejas incrustadas: {removed_inline} bloque(s).')
print(f'Respaldo: {backup}')
print(f'Parche reutilizable: {patch_zip}')
print('Recargá la web con Cmd + Shift + R. Si hace falta: docker compose up -d --force-recreate web')
