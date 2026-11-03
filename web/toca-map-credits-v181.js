/* TOCÁ v1.8.1 — sacar la atribución del mapa y mostrarla discreta debajo.
   La atribución exigida por OSM y proveedores de datos NO se elimina. */
(() => {
  const CREDIT_SELECTOR = '.leaflet-control-attribution, .maplibregl-ctrl-attrib';
  const looksLikeMap = (el) => el && (el.matches('#leaflet-map, #toca-location-map, .leaflet-container, .maplibregl-map') || !!el.querySelector('#leaflet-map, #toca-location-map, .leaflet-container, .maplibregl-map'));
  function owner(credit) {
    const map = credit.closest('#leaflet-map, #toca-location-map, .leaflet-container, .maplibregl-map');
    if (!map) return null;
    // En Descubrí Bares, la superficie visible es .toca-map-art; en Mi Bar,
    // el contenedor de ubicación tiene su propia altura y debe conservarla.
    return map.closest('.toca-map-art') || map.closest('#toca-location-map') || map.closest('#leaflet-map') || map;
  }
  function attributionText(element) {
    // v1.8.0 pone los créditos reales dentro del desplegable; reutilizarlos.
    const original = element.querySelector('.toca-map-credits-full');
    if (original) return original.textContent || '';
    const inner = element.querySelector('.maplibregl-ctrl-attrib-inner');
    if (inner) return inner.textContent || '';
    return element.textContent || '';
  }
  function mapSources(host) {
    const parts = [...host.querySelectorAll(CREDIT_SELECTOR)].map(attributionText);
    const full = parts.join(' · ');
    // Las capas pueden aparecer después: los créditos se actualizan al detectar cambios.
    return {
      osm: /openstreetmap/i.test(full),
      esa: /worldcover|esa\s+world/i.test(full),
      maptiler: /maptiler/i.test(full),
      openfreemap: /openfreemap/i.test(full),
      full: full.trim()
    };
  }
  function link(text, href) {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function draw(footer, sources) {
    const fragments = [];
    if (sources.osm) fragments.push(link('© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'));
    if (sources.maptiler) fragments.push(link('© MapTiler', 'https://www.maptiler.com/copyright/'));
    if (sources.openfreemap) fragments.push(link('OpenFreeMap', 'https://openfreemap.org/'));
    if (sources.esa) {
      fragments.push(link('ESA WorldCover 2021', 'https://esa-worldcover.org/en/data-access'));
      fragments.push(link('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'));
    }
    if (!fragments.length && sources.full) {
      // Si se usa otro proveedor, NO ocultar su atribución desconocida.
      footer.textContent = sources.full.replace(/^Leaflet\s*[|·]?\s*/i, '');
      return;
    }
    footer.replaceChildren();
    fragments.forEach((element, i) => {
      if (i) {
        const dot = document.createElement('span');
        dot.textContent = '·';
        dot.className = 'toca-credit-dot';
        footer.append(dot);
      }
      footer.append(element);
    });
  }
  function scan() {
    const hosts = new Set();
    document.querySelectorAll(CREDIT_SELECTOR).forEach((credit) => {
      const host = owner(credit);
      if (host && looksLikeMap(host)) hosts.add(host);
    });
    for (const host of hosts) {
      const sources = mapSources(host);
      if (!sources.full) continue; // No ocultar atribución si aún no hay créditos.
      let footer = host.nextElementSibling;
      if (!footer?.classList.contains('toca-map-credit-footer')) {
        footer = document.createElement('div');
        footer.className = 'toca-map-credit-footer';
        footer.setAttribute('aria-label', 'Créditos de los datos del mapa');
        host.insertAdjacentElement('afterend', footer);
      }
      const sig = JSON.stringify(sources);
      if (footer.dataset.sources !== sig) {
        draw(footer, sources);
        footer.dataset.sources = sig;
      }
      host.classList.add('toca-credits-relocated');
    }
  }
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  };
  const start = () => {
    scan();
    new MutationObserver(schedule).observe(document.getElementById('app') || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
