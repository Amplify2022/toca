from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
import shutil

html_path = Path("web/index.html")
js_path = Path("web/toca-openfreemap-dark.js")

if not html_path.exists():
    raise SystemExit("Ejecutá desde la raíz de toca.")

html = html_path.read_text(encoding="utf-8")

if "toca-openfreemap-dark.js" in html:
    raise SystemExit("OpenFreeMap Dark ya está instalado.")

assets = """
<!-- OpenFreeMap Dark / Leaflet + MapLibre -->
<link rel="stylesheet"
 href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet"
 href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"></script>
<script src="/toca-openfreemap-dark.js?v=1"></script>

<style>
#leaflet-map .leaflet-layer,
#toca-location-map .leaflet-layer,
#leaflet-map .maplibregl-map,
#toca-location-map .maplibregl-map,
#leaflet-map .maplibregl-canvas,
#toca-location-map .maplibregl-canvas {
  filter: none !important;
  mix-blend-mode: normal !important;
}
</style>
"""

javascript = r"""
(() => {
  'use strict';

  const STYLE = 'https://tiles.openfreemap.org/styles/dark';

  if (!window.L || typeof L.maplibreGL !== 'function') {
    console.error(
      'TOCÁ: no se pudo cargar MapLibre GL Leaflet.'
    );
    return;
  }

  const originalTileLayer = L.tileLayer;

  const providers = [
    'cartocdn.com',
    'stadiamaps.com',
    'tile.openstreetmap.org',
    'api.maptiler.com'
  ];

  function tocaTileLayer(url, options = {}) {
    const isBasemap = typeof url === 'string' &&
      providers.some(provider => url.includes(provider));

    if (!isBasemap) {
      return originalTileLayer.call(L, url, options);
    }

    return L.maplibreGL({
      style: STYLE,
      attribution:
        '© <a href="https://openfreemap.org/">OpenFreeMap</a> · ' +
        '© <a href="https://www.openstreetmap.org/copyright">' +
        'OpenStreetMap</a>'
    });
  }

  Object.assign(tocaTileLayer, originalTileLayer);
  L.tileLayer = tocaTileLayer;

  console.info('TOCÁ: OpenFreeMap Dark activado');
})();
"""

if html.count("</head>") != 1:
    raise SystemExit("No se encontró un </head> válido.")

# Respaldo
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path("..") / f"toca-mapa-backup-{timestamp}"
backup.mkdir(parents=True, exist_ok=True)

shutil.copy2(html_path, backup / "index.html")

if js_path.exists():
    shutil.copy2(js_path, backup / js_path.name)

# Aplicar
html = html.replace("</head>", assets + "\n</head>", 1)
html_path.write_text(html, encoding="utf-8")
js_path.write_text(javascript, encoding="utf-8")

# Crear ZIP reutilizable
zip_path = Path("..") / "TOCA-openfreemap-dark-parche.zip"

with ZipFile(zip_path, "w", ZIP_DEFLATED) as z:
    z.write(html_path, "web/index.html")
    z.write(js_path, "web/toca-openfreemap-dark.js")

print("OpenFreeMap Dark instalado.")
print("Respaldo:", backup.resolve())
print("ZIP:", zip_path.resolve())
