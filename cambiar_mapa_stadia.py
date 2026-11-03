from pathlib import Path
from datetime import datetime
import re
import shutil

files = [
    Path("web/app.js"),
    Path("web/venue-location.js")
]

OLD = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
NEW = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"

ATTRIBUTION = (
    '&copy; <a href="https://stadiamaps.com/attribution/">Stadia Maps</a> '
    '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> '
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
)

pattern = re.compile(
    r"L\.tileLayer\(\s*(['\"])" +
    re.escape(OLD) +
    r"\1\s*,\s*\{(?P<options>[^}]+)\}\s*\)",
    re.DOTALL
)

updates = {}

for path in files:
    if not path.exists():
        raise SystemExit(f"No encontré {path}")

    original = path.read_text(encoding="utf-8")

    def replace_layer(match):
        options = match.group("options")
        options, count = re.subn(
            r'attribution\s*:\s*([\'"]).*?\1',
            lambda _: "attribution: '" + ATTRIBUTION + "'",
            options,
            count=1,
            flags=re.DOTALL
        )
        if count != 1:
            raise RuntimeError(f"Falta attribution en {path}")

        return f"L.tileLayer('{NEW}', {{{options}}})"

    updated, count = pattern.subn(replace_layer, original)

    if count != 1:
        raise SystemExit(
            f"Esperaba un mapa OpenStreetMap en {path}, encontré {count}. "
            "No modifiqué archivos. Revisá la versión actual."
        )

    updates[path] = updated

# Crear respaldo antes de modificar
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-mapas-backup-{stamp}"

for path, content in updates.items():
    destination = backup / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)

    path.write_text(content, encoding="utf-8")
    print("Actualizado:", path)

print("\nMapas Stadia configurados.")
print("Respaldo:", backup.resolve())
