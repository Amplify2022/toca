
(() => {
  'use strict';

  /*
   * Mover los encabezados de Mi Bar y Mi Cuenta
   * afuera de sus tarjetas, conservando sus formularios.
   */
  function normalizeAdminHeadings() {
    const section = document.querySelector(
      '.toca-admin-content .toca-profile-editor'
    );
    if (!section) return;

    const card = section.querySelector(':scope > .card');
    if (!card) return;

    const heading = card.querySelector(
      ':scope > .toca-editor-heading'
    );

    if (heading) {
      section.insertBefore(heading, card);
    }
  }

  /*
   * Actualizar la ciudad según los marcadores realmente
   * visibles en el área actual del mapa.
   */
  function updateMapCity(map) {
    const label = document.getElementById(
      'toca-map-city-label'
    );
    if (!label || !map) return;

    try {
      const bounds = map.getBounds();
      if (!bounds?.isValid()) return;

      const venues = typeof filteredVenues === 'function'
        ? filteredVenues()
        : state.venues;

      const visible = venues.filter(v => {
        const lat = Number(v.latitude);
        const lon = Number(v.longitude);

        return Number.isFinite(lat)
          && Number.isFinite(lon)
          && v.latitude != null
          && v.longitude != null
          && bounds.contains([lat, lon]);
      });

      label.textContent = visible.length
        ? tocaVisibleCityLabel(visible)
        : 'Sin bares en esta zona';
    } catch (error) {
      console.warn('No se pudo actualizar la ciudad:', error);
    }
  }

  /*
   * El mapa se recrea después de filtrar.
   * Asociamos los eventos a cada instancia nueva.
   */
  const originalInitMap = typeof initMap === 'function'
    ? initMap
    : null;

  if (originalInitMap) {
    initMap = function(...args) {
      const result = originalInitMap.apply(this, args);
      const map = state.map;

      if (map && typeof map.on === 'function') {
        const refresh = () => updateMapCity(map);

        map.on('moveend', refresh);
        map.on('zoomend', refresh);

        refresh();
      }

      return result;
    };
  }

  let scheduled = false;

  function scheduleHeadings() {
    if (scheduled) return;
    scheduled = true;

    queueMicrotask(() => {
      scheduled = false;
      normalizeAdminHeadings();
    });
  }

  function initialize() {
    normalizeAdminHeadings();

    const root = document.getElementById('app');
    if (!root) return;

    new MutationObserver(scheduleHeadings).observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
