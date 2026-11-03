/* TOCÁ v1.8.4 - autocomplete + reverse geocoding for Mi Bar and onboarding.
 * Extends the existing venue-location.js without replacing its genre,
 * Leaflet, account or pin-confirmation logic.
 */
(() => {
  'use strict';
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
  const cache = new Map();
  let apiUnavailableUntil = 0;
  let lastBrowserFallbackAt = 0;
  let fallbackQueue = Promise.resolve();
  const BROWSER_FALLBACK_GAP_MS = 1200;

  // The backend is the primary geocoder. When that endpoint fails (e.g., 404
  // after an incomplete deploy or 502 from the upstream provider), try Photon's
  // CORS API once from the browser. This is a development-only fallback: no
  // Nominatim autocomplete, no private admin token and no repeated burst calls.
  function parsedPhoton(root) {
    const features = Array.isArray(root?.features) ? root.features : [];
    const seen = new Set();
    return features.map(feature => {
      const coords = feature?.geometry?.coordinates;
      const lat = Number(coords?.[1]);
      const lon = Number(coords?.[0]);
      const props = feature?.properties || {};
      const street = String(props.street || '').trim();
      const number = String(props.housenumber || '').trim();
      const place = String(props.name || '').trim();
      const address = [street, number].filter(Boolean).join(' ') || place;
      const city = String(props.city || props.town || props.village || props.municipality || 'Montevideo').trim();
      const name = [place !== address ? place : '', address, city].filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index).join(' · ');
      return { lat, lon, address, city, name };
    }).filter(result => isCoordinate(result.lat, result.lon) && result.address)
      .filter(result => {
        const key = `${result.lat.toFixed(5)}:${result.lon.toFixed(5)}:${result.address}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6);
  }

  async function browserPhoton(typed, city) {
    // One queued fallback request at a time, at most one per 1.2 seconds.
    // Avoids concurrent autocomplete calls bypassing the demo server cooldown.
    const request = fallbackQueue.catch(() => {}).then(async () => {
      const wait = Math.max(0, BROWSER_FALLBACK_GAP_MS - (Date.now() - lastBrowserFallbackAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastBrowserFallbackAt = Date.now();
      const query = `${typed}, ${city}, Uruguay`;
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=es&countrycode=UY`;
      const response = await fetch(url, {headers: {Accept: 'application/json'}, mode: 'cors'});
      if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);
      return parsedPhoton(await response.json());
    });
    fallbackQueue = request;
    return request;
  }

  function errorMessage(error) {
    const message = String(error?.message || '');
    if (/404|not found|no route/i.test(message))
      return 'No se encontró el servicio de sugerencias en la API. Revisá que el backend esté actualizado. Podés buscar con el botón o usar el mapa.';
    if (/401|403|unauthorized|forbidden/i.test(message))
      return 'La sesión de administrador venció o no tiene permiso para buscar direcciones. Volvé a iniciar sesión.';
    if (/429/i.test(message))
      return 'El servicio de mapas está limitando las consultas. Probá de nuevo en unos instantes o ubicá el pin.';
    if (/502|503|504|bad gateway|unavailable/i.test(message))
      return 'El proveedor de direcciones no está disponible. Podés buscar con el botón o marcar el pin.';
    if (/failed to fetch|network|load failed/i.test(message))
      return 'No pudimos conectar con la API de TOCÁ. Revisá que el servidor esté encendido y probá el mapa.';
    return 'No pudimos obtener sugerencias. Probá el botón de búsqueda o elegí el lugar en el mapa.';
  }
  const timers = new WeakMap();
  const seq = new WeakMap();
  const isCoordinate = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  function fields(widget) {
    const form = widget?.closest('form');
    return {
      form,
      address: form?.querySelector('input[name="address"]'),
      city: form?.querySelector('input[name="city"]'),
      query: widget?.querySelector('#toca-location-query'),
      feedback: widget?.querySelector('.toca-location-feedback'),
      confirm: widget?.querySelector('[data-action="location-confirm"]')
    };
  }
  function setStatus(widget, text, good = false) {
    const node = fields(widget).feedback;
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('toca-location-confirmed', good);
  }
  function closeSuggestions(widget) {
    widget?.querySelectorAll('.toca-v183-options').forEach(box => {
      box.hidden = true;
      box.replaceChildren();
    });
  }
  function invalidateReverse(widget) {
    if (!widget) return;
    widget._v183ReverseSeq = (widget._v183ReverseSeq || 0) + 1;
    if (widget._v183ReverseTimer) clearTimeout(widget._v183ReverseTimer);
    widget._v183ReverseTimer = null;
    const confirm = fields(widget).confirm;
    if (confirm) confirm.disabled = false;
  }
  function setAddress(widget, address, city) {
    const f = fields(widget);
    const value = String(address || '').slice(0, 240);
    if (f.address) f.address.value = value;
    if (f.query) f.query.value = value;
    if (f.city && city) f.city.value = String(city).slice(0, 120);
  }
  function getBox(input) {
    if (!input) return null;
    let box = input.parentElement?.querySelector('.toca-v183-options');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toca-v183-options';
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', 'Direcciones sugeridas');
      box.hidden = true;
      input.parentElement?.appendChild(box);
      input.parentElement?.classList.add('toca-v183-address-field');
    }
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');
    return box;
  }
  function matches(widget, input) {
    return widget?.isConnected && input?.isConnected && input.closest('form') === widget.closest('form');
  }

  async function suggest(widget, input, typed, number) {
    const box = getBox(input);
    if (!matches(widget, input) || !box || seq.get(input) !== number) return;
    const city = fields(widget).city?.value.trim() || 'Montevideo';
    const cacheKey = `${typed}|${city}`.toLocaleLowerCase('es');
    let upstreamError = null;
    try {
      let results = cache.get(cacheKey);
      if (!results) {
        if (Date.now() >= apiUnavailableUntil) {
          try {
            const response = await api(`/api/admin/geocode/suggest?address=${encodeURIComponent(typed)}&city=${encodeURIComponent(city)}`);
            if (!Array.isArray(response?.results)) throw new Error('Formato inesperado de la API');
            results = response.results;
          } catch (error) {
            upstreamError = error;
            // Avoid flooding the missing backend route on every keypress.
            if (/404|not found/i.test(String(error.message))) apiUnavailableUntil = Date.now() + 60000;
          }
        }
        if (!results) {
          try {
            results = await browserPhoton(typed, city);
          } catch (error) {
            console.warn('TOCÁ autocomplete: backend/direct Photon unavailable', upstreamError, error);
            if (!matches(widget, input) || seq.get(input) !== number) return;
            box.textContent = errorMessage(upstreamError || error);
            box.classList.add('toca-v183-empty');
            box.hidden = false;
            return;
          }
        }
        if (cache.size > 150) cache.clear();
        cache.set(cacheKey, results);
      }
      if (!matches(widget, input) || seq.get(input) !== number || input.value.trim() !== typed) return;
      input._v183Results = results.filter(result => isCoordinate(Number(result.lat), Number(result.lon))).slice(0, 6);
      box.classList.remove('toca-v183-empty');
      box.innerHTML = input._v183Results.length
        ? input._v183Results.map((entry, index) => `<button type="button" class="toca-v183-option" role="option" data-v183-choice="${index}"><span>${escapeText(entry.name || entry.address)}</span><small>${escapeText(entry.address || 'Elegir esta dirección')}</small></button>`).join('')
        : '<div class="toca-v183-empty">No encontramos sugerencias. Probá otra calle, el botón de búsqueda o ubicá el pin.</div>';
      box.hidden = false;
    } catch (error) {
      if (!matches(widget, input) || seq.get(input) !== number) return;
      box.textContent = errorMessage(error);
      box.classList.add('toca-v183-empty');
      box.hidden = false;
      console.warn('TOCÁ autocomplete:', error);
    }
  }

  function onInput(input, widget) {
    if (!matches(widget, input)) return;
    const typed = input.value.trim();
    const old = timers.get(input);
    if (old) clearTimeout(old);
    const number = (seq.get(input) || 0) + 1;
    seq.set(input, number);
    const box = getBox(input);
    if (box) {box.hidden = true;box.replaceChildren();}
    // When the main address is edited, the legacy code invalidates the saved
    // coordinates. The user must select a suggestion or reconfirm the pin.
    invalidateReverse(widget);
    if (input.name === 'address') {
      const f = fields(widget);
      if (f.query) f.query.value = input.value;
    }
    if (typed.length < 3) return;
    timers.set(input, setTimeout(() => void suggest(widget, input, typed, number), 750));
  }

  // Reuse the original location-result handler so the selected suggestion
  // moves the REAL Leaflet marker and goes through the existing confirm flow.
  function pick(widget, entry) {
    if (!isCoordinate(Number(entry.lat), Number(entry.lon))) return;
    invalidateReverse(widget);
    closeSuggestions(widget);
    const address = String(entry.address || entry.name || '').slice(0, 240);
    const city = String(entry.city || fields(widget).city?.value || 'Montevideo');
    widget._v183Selected = {address, city};
    widget._tocaLocationResults = [{lat:Number(entry.lat), lon:Number(entry.lon), name:String(entry.name || address)}];
    widget.dataset.lookupAddress = address;
    const box = widget.querySelector('.toca-location-results');
    if (!box) return;
    box.innerHTML = `<button type="button" class="toca-location-result" data-action="location-result" data-index="0" data-v183-selected="1">${escapeText(entry.name || address)}<small>Dirección seleccionada. Confirmá el pin.</small></button>`;
    box.querySelector('[data-v183-selected]')?.click();
  }

  async function reverse(widget, lat, lon, requestNumber) {
    if (!widget.isConnected || widget._v183ReverseSeq !== requestNumber) return;
    const f = fields(widget);
    if (f.confirm) f.confirm.disabled = true;
    setAddress(widget, '', ''); // Never leave an old address attached to a moved pin.
    setStatus(widget, 'Buscando la dirección del nuevo pin...');
    try {
      const data = await api(`/api/admin/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
      if (!widget.isConnected || widget._v183ReverseSeq !== requestNumber) return;
      if (data.found && data.address) {
        setAddress(widget, data.address, data.city);
        setStatus(widget, data.precise
          ? 'Dirección sugerida según el pin. Verificá que el número sea correcto y confirmá la ubicación.'
          : 'Dirección aproximada. Revisá la calle y completá el número si hace falta antes de confirmar.');
      } else {
        setStatus(widget, 'No encontramos una dirección para ese pin. Escribila manualmente y confirmá la ubicación.');
      }
    } catch (error) {
      if (!widget.isConnected || widget._v183ReverseSeq !== requestNumber) return;
      setStatus(widget, 'No pudimos obtener la dirección del pin. Ingresala manualmente y confirmá la ubicación.');
      console.warn('TOCÁ reverse geocoding:', error);
    } finally {
      if (widget.isConnected && widget._v183ReverseSeq === requestNumber && f.confirm?.isConnected) f.confirm.disabled = false;
    }
  }

  function pinChanged(widget) {
    if (!widget?.isConnected) return;
    const lat = Number(widget.dataset.pendingLat), lon = Number(widget.dataset.pendingLon);
    if (!widget.dataset.pendingLat || !widget.dataset.pendingLon || !isCoordinate(lat, lon)) return;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (widget._v183LastPin === key) { widget._v183Selected = null; return; }
    widget._v183LastPin = key;
    widget._v183PinEditable = true;
    // The browser already knows the exact address if this marker move came
    // from a selected suggestion; don't replace it with a nearby Photon POI.
    if (widget._v183Selected) {
      const {address, city} = widget._v183Selected;
      widget._v183Selected = null;
      setAddress(widget, address, city);
      setStatus(widget, 'Dirección seleccionada. Confirmá el pin para guardar la ubicación.');
      return;
    }
    invalidateReverse(widget);
    const number = widget._v183ReverseSeq;
    const f = fields(widget);
    if (f.confirm) f.confirm.disabled = true;
    setAddress(widget, '', '');
    setStatus(widget, 'Buscando la dirección del nuevo pin...');
    widget._v183ReverseTimer = setTimeout(() => void reverse(widget, lat, lon, number), 350);
  }

  function attach(widget) {
    if (!widget || widget._v183Attached) return;
    widget._v183Attached = true;
    const f = fields(widget);
    getBox(f.address);
    getBox(f.query);
    new MutationObserver(entries => {
      if (entries.some(item => ['data-pending-lat','data-pending-lon'].includes(item.attributeName))) pinChanged(widget);
    }).observe(widget, {attributes:true, attributeFilter:['data-pending-lat','data-pending-lon']});
  }
  const previousInit = window.tocaInitVenueLocation;
  if (typeof previousInit === 'function') {
    window.tocaInitVenueLocation = async (...args) => {
      const widget = document.querySelector('.toca-location-widget');
      attach(widget);
      return previousInit(...args);
    };
  } else console.warn('TOCÁ location v1.8.3: falta venue-location.js');

  // Manual correction of a reverse-geocoded street must not lose the pin.
  // Capture its coordinates before the legacy input listener clears them;
  // restore them after that listener runs, but still require confirmation.
  document.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'address') return;
    const widget = input.closest('form')?.querySelector('.toca-location-widget');
    if (!widget?._v183PinEditable) return;
    const lat = widget.dataset.pendingLat, lon = widget.dataset.pendingLon;
    if (lat && lon && isCoordinate(Number(lat), Number(lon))) event._v183KeepPin = {lat, lon};
  }, true);

  document.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name !== 'address' && input.id !== 'toca-location-query') return;
    const widget = input.closest('form')?.querySelector('.toca-location-widget');
    if (widget) {
      onInput(input, widget);
      if (event._v183KeepPin) {
        const {lat, lon} = event._v183KeepPin;
        widget._v183LastPin = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
        widget.dataset.pendingLat = lat;
        widget.dataset.pendingLon = lon;
        widget.dataset.needsNewPin = 'false';
        setStatus(widget, 'Dirección ajustada manualmente. Verificá el pin y confirmá para guardar.');
      }
    }
  });

  document.addEventListener('click', event => {
    const choice = event.target.closest?.('[data-v183-choice]');
    if (choice) {
      const box = choice.closest('.toca-v183-options');
      const input = box?.parentElement?.querySelector('input');
      const widget = input?.closest('form')?.querySelector('.toca-location-widget');
      const result = input?._v183Results?.[Number(choice.dataset.v183Choice)];
      if (widget && result) pick(widget, result);
      return;
    }
    // The original click handler ran earlier and has moved the pin.
    const selected = event.target.closest?.('[data-v183-selected]');
    if (selected) {
      const widget = selected.closest('.toca-location-widget');
      if (widget?._v183Selected) {
        setAddress(widget, widget._v183Selected.address, widget._v183Selected.city);
        setStatus(widget, 'Dirección seleccionada. Confirmá el pin para guardar la ubicación.');
      }
      return;
    }
    if (!event.target.closest?.('.toca-v183-address-field')) {
      document.querySelectorAll('.toca-location-widget').forEach(closeSuggestions);
    }
  });

  // Handle keyboard selection before the original Enter handler can fire an
  // explicit search or submit the form while the autocomplete is open.
  document.addEventListener('keydown', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name !== 'address' && input.id !== 'toca-location-query') return;
    const box = input.parentElement?.querySelector('.toca-v183-options');
    if (event.key === 'Escape') {if(box)box.hidden=true;return;}
    if (event.key !== 'Enter' || !box || box.hidden) return;
    const first = box.querySelector('[data-v183-choice]');
    if (!first) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    first.click();
  }, true);
})();
