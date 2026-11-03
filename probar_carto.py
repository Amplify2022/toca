from pathlib import Path
from datetime import datetime
from getpass import getpass
import shutil
import re

files = [
    Path("web/app.js"),
    Path("web/venue-location.js")
]
index = Path("web/index.html")

for file in [*files, index]:
    if not file.is_file():
        raise SystemExit(f"Falta {file}")

key = getpass("Ingresá tu CARTO API key: ").strip()

if not re.fullmatch(r"[A-Za-z0-9._~-]+", key):
    raise SystemExit("La API key tiene caracteres inesperados.")

url = (
    "https://basemaps.cartocdn.com/rastertiles/"
    "dark_all/{z}/{x}/{y}.png?key=" + key
)

attribution = (
    '&copy; <a href="https://www.openstreetmap.org/copyright">'
    'OpenStreetMap</a> contributors, '
    '&copy; <a href="https://carto.com/attribution/">CARTO</a>'
)

layer_pattern = re.compile(
    r'L\.tileLayer\(\s*(["\'])(.*?)\1\s*,\s*'
    r'\{(.*?)\}\s*\)',
    re.DOTALL
)

updates = {}

for file in files:
    source = file.read_text(encoding="utf-8")

    def update_layer(match):
        old_url = match.group(2)
        options = match.group(3)

        if not (
            "stadiamaps.com" in old_url
            or "tile.openstreetmap.org" in old_url
        ):
            return match.group(0)

        options, count = re.subn(
            r'attribution\s*:\s*(["\']).*?\1',
            lambda _: "attribution: '" + attribution + "'",
            options,
            count=1,
            flags=re.DOTALL
        )

        if count != 1:
            raise RuntimeError(f"Falta attribution en {file}")

        return f"L.tileLayer('{url}', {{{options}}})"

    updated = layer_pattern.sub(update_layer, source)

    if updated == source:
        raise SystemExit(
            f"No encontré Stadia/OpenStreetMap en {file}. "
            "No se aplicaron cambios."
        )

    updates[file] = updated

# Cambiar versión de assets para evitar caché.
html = index.read_text(encoding="utf-8")

for name in ("app.js", "venue-location.js"):
    html, count = re.subn(
        rf'(?<=src=")/{re.escape(name)}(?:\?[^"]*)?',
        f'/{name}?v=carto-dark',
        html,
        count=1
    )
    if count != 1:
        raise SystemExit(f"No encontré {name} en index.html")

updates[index] = html

# Crear respaldo antes de escribir.
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-mapa-anterior-{stamp}"

for file, content in updates.items():
    destination = backup / file
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, destination)
    file.write_text(content, encoding="utf-8")
    print("Actualizado:", file)

print("Mapa CARTO Dark Matter configurado.")
print("Respaldo:", backup.resolve())
