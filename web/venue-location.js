/* TOCÁ v1.5 · Bar address and pin confirmation (admin only).
 * Authenticated Micronaut endpoint searches Photon, then Nominatim on demand.
 * For production use a dedicated geocoder with quotas and caching.
 */
(() => {
  'use strict';
  const DEFAULT_CENTER = [-34.906, -56.19];
  const resultsCache = new Map();
  let leafletPromise = null;
  let activeMap = null;
  let activeMarker = null;
  let activeWidget = null;

  const isFiniteLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const fmt = n => Number(n).toFixed(6);
  const notify = msg => typeof toast === 'function' ? toast(msg) : alert(msg);
  const safeText = v => typeof esc === 'function' ? esc(String(v)) : String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

  const genres=['Rock','Cumbia','Pop','Electrónica','Reggaetón','Jazz','Indie','Salsa','Plena','Hip Hop','Trap','Otros'];
  const splitGenres=value=>String(value||'').split(/[,;•]+/).map(x=>x.trim()).filter(Boolean);
  window.tocaGenreMarkup = value => {
    const selected=splitGenres(value);
    return `<section class="field toca-genre-widget"><label for="toca-genre-value">Géneros musicales <span class="toca-optional">(opcional)</span></label>
      <input class="input" id="toca-genre-value" name="genre" value="${safeText(selected.join(', '))}" maxlength="160" placeholder="Ej.: Rock, Cumbia, Pop" />
      <div class="toca-location-help">Elegí géneros sugeridos o escribí los tuyos, separados por comas.</div>
      <div class="toca-genre-suggestions" role="group" aria-label="Géneros sugeridos">${genres.map(g=>
        `<button type="button" class="toca-genre-chip" data-action="genre-suggest" data-genre="${safeText(g)}" aria-pressed="${selected.some(x=>x.toLowerCase()===g.toLowerCase())}">${safeText(g)}</button>`).join('')}</div>
    </section>`;
  };
  function syncGenreButtons(widget){
    const input=widget.querySelector('[name="genre"]');
    const selected=splitGenres(input?.value).map(g=>g.toLowerCase());
    widget.querySelectorAll('[data-action="genre-suggest"]').forEach(btn=>{
      btn.setAttribute('aria-pressed',String(selected.includes(btn.dataset.genre.toLowerCase())));
    });
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-action="genre-suggest"]');
    if(!btn)return;
    const widget=btn.closest('.toca-genre-widget');
    const input=widget?.querySelector('[name="genre"]');
    if(!input)return;
    if(btn.dataset.genre==='Otros'){
      input.focus();input.setSelectionRange(input.value.length,input.value.length);
      notify('Escribí el género nuevo en el campo, separado por una coma.');
      return;
    }
    let selected=splitGenres(input.value);
    const existing=selected.findIndex(x=>x.toLowerCase()===btn.dataset.genre.toLowerCase());
    if(existing>=0)selected.splice(existing,1);
    else selected.push(btn.dataset.genre);
    const next=selected.join(', ');
    if(next.length>160){notify('Máximo 160 caracteres en géneros musicales.');return;}
    input.value=next;
    syncGenreButtons(widget);
  });
  document.addEventListener('input',e=>{
    if(e.target.name==='genre'&&e.target.closest('.toca-genre-widget'))syncGenreButtons(e.target.closest('.toca-genre-widget'));
  });
  // Admin account: authenticated update, independent of venue data and OAuth.
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='account-update')return;
    e.preventDefault();
    const name=e.target.elements.namedItem('name')?.value.trim()||'';
    if(name.length<2){notify('Ingresá un nombre de al menos 2 caracteres.');return;}
    const submit=e.target.querySelector('[type="submit"],button:not([type])');
    if(submit)submit.disabled=true;
    try{
      const updated=await api('/api/auth/me',{method:'PUT',body:{name}});
      state.user=updated;
      sessionStorage.setItem('amplify-user',JSON.stringify(updated));
      notify('Perfil actualizado');
      await render();
    }catch(err){notify('No pudimos guardar el perfil: '+err.message);}
    finally{if(submit?.isConnected)submit.disabled=false;}
  });

  window.tocaVenueLocationMarkup = (venue) => {
    const lat = venue?.latitude == null || String(venue.latitude).trim()==='' ? '' : Number(venue.latitude);
    const lon = venue?.longitude == null || String(venue.longitude).trim()==='' ? '' : Number(venue.longitude);
    const confirmed = isFiniteLatLon(lat, lon) && lat !== '' && lon !== '';
    return `<section class="toca-location-widget" data-initial-lat="${confirmed ? lat : ''}" data-initial-lon="${confirmed ? lon : ''}" data-confirmed="${confirmed}">
      <div class="field"><label>Ubicación en el mapa</label>
        <p class="toca-location-help">Escribí la dirección arriba, buscá el lugar y ajustá el pin haciendo clic en el mapa o arrastrándolo. Confirmá la posición antes de guardar.</p>
      </div>
      <div class="toca-location-searchbar">
<button type="button" class="btn ghost" data-action="location-search">
Buscar en el mapa
</button>
</div>
      <span class="toca-location-feedback" role="status">${confirmed ? 'Ubicación actual guardada. Podés ajustarla en el mapa.' : 'Buscá una dirección o marcá el lugar en el mapa.'}</span>
      <div class="toca-location-results" aria-live="polite"></div>
      <div id="toca-location-map" role="group" aria-label="Mapa para marcar el establecimiento"></div>
      <div class="toca-location-controls"><button type="button" class="btn ghost small" data-action="location-confirm">✓ Confirmar ubicación del pin</button>
        <span class="toca-location-coords">${confirmed ? '✓ Ubicación guardada' : 'Pendiente de confirmar'}</span></div>
      <input type="hidden" name="latitude" value="${confirmed ? lat : ''}">
      <input type="hidden" name="longitude" value="${confirmed ? lon : ''}">

    </section>`;
  };

  function ensureLeaflet() {
    if(window.tocaLoadMaps)return window.tocaLoadMaps().then(()=>window.L);
    if(window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if(!document.getElementById('toca-location-leaflet-css') && !document.querySelector('link[href*="leaflet.css"]')){
        const css = document.createElement('link');css.id='toca-location-leaflet-css';css.rel='stylesheet';
        css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
      }
      let script = document.getElementById('toca-location-leaflet-script') || document.getElementById('toca-leaflet-script');
      if(!script){
        script = document.createElement('script');script.id='toca-location-leaflet-script';
        script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';document.head.appendChild(script);
      }
      if(window.L){resolve(window.L);return;}
      script.addEventListener('load',() => window.L ? resolve(window.L) : reject(new Error('Leaflet no disponible')), {once:true});
      script.addEventListener('error',() => reject(new Error('No se pudo descargar el mapa')), {once:true});
    }).catch(err=>{leafletPromise=null;throw err});
    return leafletPromise;
  }

  function setFeedback(widget, message, confirmed = false) {
    const element=widget?.querySelector('.toca-location-feedback');
    if(element){element.textContent=message;element.classList.toggle('toca-location-confirmed',confirmed);}
  }
  function setPending(widget, lat, lon){
    if(!isFiniteLatLon(lat,lon))return;
    widget.dataset.pendingLat=String(lat);widget.dataset.pendingLon=String(lon);widget.dataset.needsNewPin='false';
    widget.dataset.confirmed='false';
    setFeedback(widget,'Posición elegida. Presioná «Confirmar ubicación del pin».');
    const coords=widget.querySelector('.toca-location-coords');
    if(coords)coords.textContent=`Ubicación pendiente de confirmar`;
  }
  function putPin(widget, lat, lon, zoom=16){
    if(!isFiniteLatLon(lat,lon) || !activeMap || widget!==activeWidget)return;
    const point=[lat,lon];
    if(activeMarker)activeMarker.setLatLng(point);
    else {
      activeMarker=window.L.marker(point,{draggable:true,title:'Arrastrá el pin para ajustar la ubicación',alt:'Ubicación del bar'})
        .addTo(activeMap);
      activeMarker.on('dragend', () => {
        const {lat,lng}=activeMarker.getLatLng();setPending(widget,lat,lng);
      });
    }
    activeMap.setView(point,zoom);
    setPending(widget,lat,lon);
  }
  window.tocaApplyImportedLocation = (form,lat,lon) => {
    const widget=form.querySelector('.toca-location-widget');
    if(!widget || !isFiniteLatLon(lat,lon))return;
    widget.querySelector('[name="latitude"]').value='';
    widget.querySelector('[name="longitude"]').value='';
    setPending(widget,lat,lon);putPin(widget,lat,lon);
  };
  window.tocaInitVenueLocation = async () => {
    const widget=document.querySelector('.toca-location-widget');
    if(!widget || (widget===activeWidget && activeMap))return;
    if(activeMap){try{activeMap.remove()}catch(_){} activeMap=null;activeMarker=null;}
    activeWidget=widget;
    setFeedback(widget,'Cargando mapa...');
    try {
      const L = await ensureLeaflet();
      if(!widget.isConnected || widget!==activeWidget)return;
      const lat=Number(widget.dataset.initialLat),lon=Number(widget.dataset.initialLon);
      const existing=widget.dataset.initialLat!=='' && widget.dataset.initialLon!=='' && isFiniteLatLon(lat,lon);
      const center=existing?[lat,lon]:DEFAULT_CENTER;
      activeMap=L.map(widget.querySelector('#toca-location-map'),{zoomControl:true}).setView(center,existing?16:13);
      window.tocaMapLayer().addTo(activeMap);
      if(existing){
        activeMarker=L.marker(center,{draggable:true,title:'Arrastrá el pin para ajustar la ubicación'}).addTo(activeMap);
        activeMarker.on('dragend',()=>{const p=activeMarker.getLatLng();setPending(widget,p.lat,p.lng)});
        setFeedback(widget,'Ubicación actual guardada. Podés ajustarla en el mapa.',true);
      }else setFeedback(widget,'Hacé clic en el mapa para ubicar el bar, o buscá la dirección.');
      activeMap.on('click', ev => putPin(widget,ev.latlng.lat,ev.latlng.lng,activeMap.getZoom()));
      setTimeout(()=>{if(widget.isConnected)activeMap?.invalidateSize()},120);
    } catch(err) {
      setFeedback(widget,'No se pudo cargar el mapa. Comprobá la conexión a Internet e intentá recargar.');
      console.warn('TOCÁ location map:',err);
    }
  };

  async function searchAddress(widget){
    const form=widget.closest('form');
    const queryInput=widget.querySelector('#toca-location-query');
    const address=queryInput?.value.trim() || form?.querySelector('[name="address"]')?.value.trim() || '';
    const city=form?.querySelector('[name="city"]')?.value.trim() || '';
    if(address.length<4){notify('Escribí una dirección de al menos 4 caracteres para buscar.');return;}
    const resultBox=widget.querySelector('.toca-location-results');
    const key=`${address}|${city}`.toLowerCase();
    setFeedback(widget,'Buscando dirección...');
    const button=widget.querySelector('[data-action="location-search"]');
    if(button)button.disabled=true;
    try{
      let list=resultsCache.get(key);
      if(!list){
        // The backend queries the provider. No direct cross-origin browser calls.
        const data=await api(`/api/admin/geocode?address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`);
        list=(data.results||[]).map(p=>({lat:Number(p.lat),lon:Number(p.lon),name:String(p.name||address)}))
          .filter(p=>isFiniteLatLon(p.lat,p.lon));
        resultsCache.set(key,list);
      }
      if(!widget.isConnected)return;
      widget._tocaLocationResults=list;
      widget.dataset.lookupAddress=address;
      if(!list.length){resultBox.replaceChildren();setFeedback(widget,'No encontramos esa dirección. Probá con la calle y número o colocá el pin manualmente.');return;}
      resultBox.innerHTML=list.map((p,i)=>`<button type="button" class="toca-location-result" data-action="location-result" data-index="${i}">${safeText(p.name)}<small>Seleccionar esta ubicación en el mapa</small></button>`).join('');
      setFeedback(widget,`${list.length} ubicaciones encontradas. Seleccioná la correcta y confirmá el pin.`);
    }catch(err){
      setFeedback(widget,err.message||'Falló la búsqueda. Podés ubicar el pin manualmente.');
      console.warn('TOCÁ address lookup:',err);
    }finally{if(button?.isConnected)button.disabled=false;}
  }
  function confirmLocation(widget){
    const lat=Number(widget.dataset.pendingLat||widget.dataset.initialLat),
          lon=Number(widget.dataset.pendingLon||widget.dataset.initialLon);
    if(!isFiniteLatLon(lat,lon) || widget.dataset.needsNewPin==='true' ||
       (!widget.dataset.pendingLat && !widget.dataset.initialLat)) {
      notify('Primero seleccioná una ubicación en el mapa.');return;
    }
    widget.querySelector('[name="latitude"]').value=String(lat);
    widget.querySelector('[name="longitude"]').value=String(lon);
    widget.dataset.confirmed='true';
    widget.dataset.initialLat=String(lat);widget.dataset.initialLon=String(lon);
    widget.dataset.pendingLat='';widget.dataset.pendingLon='';
    const coords=widget.querySelector('.toca-location-coords');
    if(coords)coords.textContent=`✓ Ubicación confirmada`;
    setFeedback(widget,'¡Listo! Confirmaste la ubicación del bar. Guardá los cambios para publicarla.',true);
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-action]');
    if(!button)return;
    const widget=button.closest('.toca-location-widget');
    if(!widget)return;
    if(button.dataset.action==='location-search') searchAddress(widget);
    if(button.dataset.action==='location-result') {
      const result=widget._tocaLocationResults?.[Number(button.dataset.index)];
      if(result){
        const addressInput=widget.closest('form')?.querySelector('[name="address"]');
        if(addressInput)addressInput.value=widget.dataset.lookupAddress||addressInput.value;
        putPin(widget,result.lat,result.lon);
      }
    }
    if(button.dataset.action==='location-confirm') confirmLocation(widget);
  });
  document.addEventListener('keydown',e=>{
    if(e.target.id==='toca-location-query'&&e.key==='Enter'){
      e.preventDefault();searchAddress(e.target.closest('.toca-location-widget'));
    }
  });
  document.addEventListener('input',e=>{
    const widget=e.target.closest?.('form')?.querySelector('.toca-location-widget');
    if(!widget || !['address','city'].includes(e.target.name))return;
    widget.dataset.confirmed='false';
    // The coordinates must be actively reconfirmed when the address text changes.
    widget.dataset.pendingLat='';widget.dataset.pendingLon='';widget.dataset.needsNewPin='true';
    widget.querySelector('.toca-location-results').replaceChildren();
    widget.querySelector('[name="latitude"]').value='';
    widget.querySelector('[name="longitude"]').value='';
    setFeedback(widget,'La dirección cambió. Buscá o elegí de nuevo el pin y confirmá.');
  });
  document.addEventListener('submit',e=>{
    if(!['venue-update','create-venue'].includes(e.target.id))return;
    const widget=e.target.querySelector('.toca-location-widget');
    if(!widget)return;
    const lat=Number(widget.querySelector('[name="latitude"]').value),
          lon=Number(widget.querySelector('[name="longitude"]').value);
    if(widget.dataset.confirmed==='true' && isFiniteLatLon(lat,lon) &&
       widget.querySelector('[name="latitude"]').value!=='' && widget.querySelector('[name="longitude"]').value!=='')return;
    e.preventDefault();e.stopImmediatePropagation();
    notify('Confirmá el pin del bar en el mapa antes de guardar.');
    widget.querySelector('#toca-location-map')?.scrollIntoView({behavior:'smooth',block:'center'});
  },true);
})();
