from pathlib import Path
from datetime import datetime
from getpass import getpass
from urllib.parse import quote
import re
import shutil

files = [
    Path("web/app.js"),
    Path("web/venue-location.js"),
]
html_file = Path("web/index.html")

for file in [*files, html_file]:
    if not file.is_file():
        raise SystemExit(f"Falta {file}. Ejecutá desde toca.")

key = getpass("Ingresá tu MapTiler API key: ").strip()

if not re.fullmatch(r"[A-Za-z0-9._~-]+", key):
    raise SystemExit("API key inválida.")

url = (
    "https://api.maptiler.com/maps/"
    "streets-v4-dark/256/{z}/{x}/{y}.png?key="
    + quote(key, safe="")
)

attribution = (
    '&copy; <a href="https://www.maptiler.com/copyright/">'
    'MapTiler</a> &copy; '
    '<a href="https://www.openstreetmap.org/copyright">'
    'OpenStreetMap contributors</a>'
)

pattern = re.compile(
    r"L\.tileLayer\(\s*(['\"])(?P<url>https?://.*?)\1"
    r"\s*,\s*\{(?P<options>.*?)\}\s*\)",
    re.DOTALL
)

updates = {}

for file in files:
    original = file.read_text(encoding="utf-8")

    def replace_layer(match):
        previous = match.group("url")
        if not any(x in previous for x in (
            "cartocdn.com",
            "stadiamaps.com",
            "tile.openstreetmap.org",
        )):
            return match.group(0)

        return (
            f"L.tileLayer('{url}', {{"
            f"minZoom: 1, maxZoom: 19, "
            f"attribution: '{attribution}', "
            f"crossOrigin: true"
            f"}})"
        )

    updated, count = pattern.subn(
        replace_layer, original
    )

    if count != 1 or updated == original:
        raise SystemExit(
            f"No encontré una capa compatible en {file}. "
            "No modifiqué archivos."
        )

    updates[file] = updated

html = html_file.read_text(encoding="utf-8")

for filename in ("app.js", "venue-location.js"):
    html, count = re.subn(
        rf'(?<=src=")/{re.escape(filename)}(?:\?[^"]*)?',
        f'/{filename}?v=maptiler-v4-dark',
        html,
        count=1
    )
    if count != 1:
        raise SystemExit(
            f"No encontré {filename} en index.html."
        )

updates[html_file] = html

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-map-backup-{stamp}"

# Respaldar todos los archivos antes de modificarlos.
for file in updates:
    dest = backup / file
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, dest)

for file, content in updates.items():
    file.write_text(content, encoding="utf-8")
    print("Actualizado:", file)

print("\nMapTiler Streets Dark instalado.")
print("Respaldo:", backup.resolve())
