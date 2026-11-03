
(() => {
  'use strict';

  const STYLE = 'https://tiles.versatiles.org/assets/styles/gray-dark/style.json';

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
        '© <a href="https://versatiles.org/">VersaTiles</a> · ' +
        '© <a href="https://www.openstreetmap.org/copyright">' +
        'OpenStreetMap</a>'
    });
  }

  Object.assign(tocaTileLayer, originalTileLayer);
  L.tileLayer = tocaTileLayer;

  console.info('TOCÁ: VersaTiles Gray Dark activado');
})();
