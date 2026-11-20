/* TOCÁ — API adapter and shared business functionality. */
const API_URL = window.TOCA_CONFIG?.apiUrl || localStorage.getItem('amplify-api') || (location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:8080':location.origin);
const ADMIN_HOME = '#/admin/music';
function confirmNewPassword(fields, key='password'){
 if(fields[key]!==fields.passwordConfirmation)throw Error('Las contraseñas no coinciden.');
 delete fields.passwordConfirmation;
}
// Gallery URLs are served by the API (8080), not the web static server (5173).
const mediaUrl = (url) => {
  const value = String(url || '');
  return value.startsWith('/api/') ? API_URL.replace(/\/+$/, '') + value : value;
};
const GUEST_ID = localStorage.getItem('amplify-guest-id') || (globalThis.crypto?.randomUUID?.()||`guest-${Date.now()}-abcdefghijkl`);
localStorage.setItem('amplify-guest-id',GUEST_ID);
// Remove obsolete demo preferences; all application data now comes from the API.
localStorage.removeItem('amplify-mode');
localStorage.removeItem('amplify-demo');
const state={token:sessionStorage.getItem('amplify-token')||'',user:JSON.parse(sessionStorage.getItem('amplify-user')||'null'),venues:[],detail:null,requests:[],catalog:[],search:'',filter:'Todos',adminTab:'general',venueId:null,busy:false,error:'',playlist:[],spotify:{},lastUrl:'',joinToken:'',map:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(d)=>{try{return new Intl.DateTimeFormat('es-UY',{hour:'2-digit',minute:'2-digit'}).format(new Date(d))}catch{return ''}};
let toastRevision=0;
const toast=(msg,duration=4000)=>{
 const host=document.getElementById('toast');if(!host)return;
 const revision=++toastRevision;clearTimeout(window.toastTimeout);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 const show=()=>{
  if(revision!==toastRevision)return;
  const node=document.createElement('div');node.className='toasty';node.textContent=msg;node.setAttribute('role','status');host.replaceChildren(node);
  node.animate([{opacity:0,transform:reduced?'none':'translateY(18px)'},{opacity:1,transform:'none'}],{duration:reduced?160:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
  window.toastTimeout=setTimeout(()=>{
   if(revision!==toastRevision||!node.isConnected)return;
   node.dataset.leaving='true';const exit=reduced?160:650;
   const remove=()=>{if(node.isConnected)node.remove();};
   node.animate([{opacity:1,transform:'none'},{opacity:0,transform:reduced?'none':'translateY(12px)'}],{duration:exit,easing:'ease-in',fill:'forwards'}).finished.then(remove,remove);
   setTimeout(remove,exit+50);
  },duration);
 };
 const previous=host.firstElementChild;
 if(previous){previous.animate([{opacity:getComputedStyle(previous).opacity},{opacity:0}],{duration:reduced?100:180,fill:'forwards'});setTimeout(show,reduced?100:180);}else show();
};
const api=async(path,opts={})=>{const res=await fetch(`${API_URL}${path}`,{method:opts.method||'GET',cache:opts.cache,headers:{...(path.match(/^\/api\/venues\/[^/]+\/requests$/) && (opts.method||'GET')==='POST' && window.tocaCustomerBearer?.()?{'X-TOCA-Customer':window.tocaCustomerBearer()}:{}),...(state.token?{Authorization:`Bearer ${state.token}`}:{}),...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})},body:opts.body?JSON.stringify(opts.body):undefined,signal:opts.signal||((opts.method||'GET')==='GET'?window.tocaNavigationSignal?.():undefined)});let data;try{data=await res.json()}catch{data={}}if(!res.ok){const error=Error(data._embedded?.errors?.[0]?.message||data.message||data.error||`Error HTTP ${res.status}`);error.status=res.status;error.code=data.code||data._embedded?.errors?.[0]?.code;throw error}return data};
const joinKey=(id)=>`toca:join:${id}`;
function rememberJoin(id,token){
  if(!id)return '';
  if(token){sessionStorage.setItem(joinKey(id),token);return token;}
  return sessionStorage.getItem(joinKey(id))||'';
}
function setGuestVenue(id,queryToken=''){
  state.venueId=id;
  state.joinToken=rememberJoin(id,queryToken);
  return state.joinToken;
}
const route=()=>{let r=(location.hash||'#/explore').slice(1);let [path,params]=r.split('?');return {path:path||'/explore',params:new URLSearchParams(params||'')}};
const navigate=hash=>{location.hash=hash;scrollTo(0,0)};
let shell=(body,nav='explore')=>{const link=(path,sym,label,key)=>`<a href="#/${path}" class="${nav===key?'active':''}"><span class="ico">${sym}</span>${label}</a>`;return `<div class="shell"><aside class="sidebar"><a href="#/explore" class="brand"><span class="logo">≋</span> amplify<span style="color:var(--lime)">.</span></a><div><div class="side-label">Descubrí</div><nav class="nav">${link('explore','◈','Explorar bares','explore')}${link('map','⌖','Mapa de bares','map')}</nav></div><div><div class="side-label">Tu música</div><nav class="nav">${link('my-requests','♫','Mis solicitudes','requests')}${link('admin','▦','Panel de bar','admin')}${link('settings','⚙','Configuración','settings')}</nav></div><div class="side-spacer"></div><div class="side-card"><div class="mini-icon">🎶</div><strong>El lugar. La música. Vos.</strong><p>Descubrí bares y participá en su experiencia musical desde tu celular.</p><a class="btn ghost small" href="#/about">Sobre TOCÁ ↗</a></div><div class="side-foot">AMPLIFY v2 · API<br>Pruebas privadas de Spotify</div></aside><div class="main"><header class="topbar"><div class="top-location"><span class="location-dot"></span><span>📍 Montevideo, Uruguay</span></div><div class="top-right"><a href="#/settings" class="status-api" title="Preferencias">⚙ Preferencias</a>${state.user?`<span class="avatar" title="${esc(state.user.name||state.user.email)}">${esc((state.user.name||'A')[0].toUpperCase())}</span>`:`<a href="#/login" class="avatar">↗</a>`}</div></header><main class="content fade">${body}</main></div></div><nav class="mobile-nav">${link('explore','◈','Explorar','explore')}${link('map','⌖','Mapa','map')}${link('my-requests','♫','Pedidos','requests')}${link('admin','▦','Mi bar','admin')}</nav>`};
function vcard(v){return `<a href="#/venue/${encodeURIComponent(v.id)}" class="card venue-card"><div class="venue-cover" style="--from:${esc(v.from||'#536b9a')};--to:${esc(v.to||'#29354d')}"><span class="art">${esc(v.art||'🎵')}</span><span class="online ${v.active?'':'off'}">${v.active?'● Música activa':'○ Fuera de sesión'}</span></div><div class="venue-body"><h3>${esc(v.name)}</h3><p>⌖ ${esc(v.address||v.city||'')}</p><div class="tags"><span class="tag">${esc(v.genre||'Música en vivo')}</span><span class="tag">${v.active?'▶ Participación disponible':'♫ Ver bar'}</span></div></div></a>`}
function mini(v){return `<a href="#/venue/${encodeURIComponent(v.id)}" class="mini-venue"><div class="mini-photo" style="--from:${esc(v.from||'#506c8b')};--to:${esc(v.to||'#29344d')}">${esc(v.art||'🎵')}</div><div class="mini-info"><strong>${esc(v.name)}</strong><small>${esc(v.genre||'Música')}&nbsp; · &nbsp;${v.active?'🟢 Activo':'Sin sesión'}</small></div><span class="chev">›</span></a>`}
function notice(text,type='info'){return `<div class="notice ${type}"><span>ⓘ</span><span>${text}</span></div>`}
function normalizeVenue(v){return {...v,active:!!(v.active??v.sessionActive),art:v.art||'🎶',from:v.from||'#465a8b',to:v.to||'#292744'}}
async function fetchVenues(){const all=[];for(let offset=0;;offset+=50){const page=await api('/api/venues?limit=50&offset='+offset);all.push(...page);if(page.length<50)break;}return all.map(normalizeVenue)}
async function fetchDetail(id){return normalizeVenue(await api('/api/venues/'+encodeURIComponent(id)))}
async function fetchRequests(id){return await api('/api/venues/'+encodeURIComponent(id)+'/requests')}
async function fetchCatalog(id,q){{setGuestVenue(id,route().params.get("join")||"");}return await api(`/api/venues/${encodeURIComponent(id)}/tracks?q=${encodeURIComponent(q)}`)}
function getAdminVenue(){return (state.venueId||state.venues[0]?.id||null)}
function livePlayer(v){if(!v?.active)return `<div class="empty"><div class="big">♪</div>No hay sesión musical activa en este momento.</div>`;return `<div class="now"><div class="now-top"><span class="pill on"><span class="dot"></span> ${v.now?'SONANDO AHORA':'SESIÓN ACTIVA'}</span>${v.now?'<div class="bars"><i></i><i></i><i></i><i></i></div>':''}</div>${v.now?`<div class="now-song"><div class="album">🎵</div><div><h3>${esc(v.now.title||'')}</h3><p>${esc(v.now.artist||'')}</p></div></div>`:`<small>El reproductor no informó una canción actual. Nunca confundimos la playlist con lo que está sonando.</small>`}</div>`}
async function explore(){const all=await fetchVenues();state.venues=all;const filtered=all.filter(v=>(state.filter==='Todos'||(state.filter==='Activos'?v.active:v.genre?.toLowerCase().includes(state.filter.toLowerCase())))&&(`${v.name} ${v.address} ${v.genre}`.toLowerCase().includes(state.search.toLowerCase())));const body=`<div class="head-row"><div><div class="eyebrow">TU NOCHE TIENE BANDA SONORA</div><h1>Encontrá tu próximo <span style="color:var(--lime)">lugar favorito.</span></h1><p class="subtitle">Explorá bares, descubrí qué música suena y conectá con la noche.</p></div><a href="#/explore" class="btn ghost">Explorar bares</a></div><div class="hero"><div><div class="eyebrow">MÚSICA QUE SE COMPARTE</div><h2>No solo escuches.<br><span style="color:var(--lime)">Sé parte.</span></h2><p>Elegí el bar, descubrí su playlist y pedí tus canciones favoritas.</p><a href="#/explore" class="btn">Descubrir bares <span>↗</span></a></div><div class="hero-art">🎧</div></div><div class="section-line"><h2>Bares cerca tuyo <span style="font-size:12px;color:#97a5b9;font-family:DM Sans">(${filtered.length})</span></h2><a href="#/explore" class="link">Descubrir bares ↗</a></div><div class="filterbar"><div class="search-wrap"><input id="venue-search" class="input search" placeholder="Buscar bar, zona o música..." value="${esc(state.search)}" /></div>${['Todos','Activos','Rock','Indie','Pop','Jazz'].map(f=>`<button class="chip ${state.filter===f?'active':''}" data-action="filter" data-value="${f}">${f}</button>`).join('')}</div><div class="grid3" id="venue-grid">${filtered.length?filtered.map((v,i)=>typeof tocaVenueCard==='function'?tocaVenueCard(v,i):vcard(v)).join(''):'<div class="card empty">No hay bares que coincidan con tu búsqueda.</div>'}</div>${legalNote()}`;mount(body,'explore')}
function mapCanvas(venues){const coords=venues.filter(v=>Number.isFinite(Number(v.latitude))&&Number.isFinite(Number(v.longitude)));const minlon=-56.24,maxlon=-56.105,minlat=-34.945,maxlat=-34.865;return `<div class="map-fallback"><svg viewBox="0 0 750 500" preserveAspectRatio="xMidYMid slice"><rect width="750" height="500" fill="#22313a"/><path d="M-100 380Q150 330 320 465T820 420L820 540H-100Z" fill="#183744" stroke="#306270" stroke-width="3"/><path d="M-20 40L730 490M-20 110L660 520M-20 200L590 530M130 -60L740 370M310 -70L790 260M-40 450L620 -80M130 530L750 90M330 530L800 200M-30 300L520 -70" stroke="#43515b" stroke-width="20"/><path d="M-20 40L730 490M-20 110L660 520M-20 200L590 530M130 -60L740 370M310 -70L790 260M-40 450L620 -80M130 530L750 90M330 530L800 200M-30 300L520 -70" stroke="#78838b" stroke-width="1.2"/><path d="M40 0V500M260 0V500M490 0V500M690 0V500M0 90H750M0 245H750M0 405H750" stroke="#586a6c" stroke-width="7" opacity=".7"/><text x="70" y="65" fill="#879a99" font-size="18">MONTEVIDEO</text><text x="275" y="260" fill="#879a99" font-size="13">CORDÓN</text><text x="520" y="105" fill="#879a99" font-size="13">POCITOS</text><text x="50" y="380" fill="#879a99" font-size="13">CIUDAD VIEJA</text></svg>${coords.map(v=>{const x=8+84*(Number(v.longitude)-minlon)/(maxlon-minlon);const y=8+82*(maxlat-Number(v.latitude))/(maxlat-minlat);return `<a href="#/venue/${esc(v.id)}" title="${esc(v.name)}" class="pin ${v.active?'':'off'}" style="left:${Math.max(6,Math.min(95,x))}%;top:${Math.max(11,Math.min(93,y))}%"><span>♫</span></a>`}).join('')}<div class="map-note">Mapa ilustrativo sin conexión. Con internet se carga el mapa interactivo OpenStreetMap.</div></div><div id="leaflet-map"></div>`}
function mapView(){const all=state.venues;return `<div class="eyebrow">EXPLORÁ LA CIUDAD</div><div class="head-row"><div><h1>La música está <span style="color:var(--lime)">en todas partes.</span></h1><p class="subtitle">Elegí un punto del mapa para conocer el bar y su experiencia musical.</p></div><span class="pill">⌖ ${all.length} establecimientos</span></div><div class="map-layout"><div class="map-frame">${mapCanvas(all)}</div><div><h3 style="margin:0 0 13px">Bares de la zona</h3><div class="list-stack">${all.map(mini).join('')||'<div class="empty">No hay bares registrados.</div>'}</div></div></div>${legalNote()}`}

// A single filter predicate drives both venue cards and map markers.
function filteredVenues(){
  const query=(state.search||'').trim().toLocaleLowerCase('es');
  const favorites=state.filter==='Favoritos'?new Set(myFavorites()):null;
  return state.venues.filter(v => {
    const matchesFilter = state.filter==='Todos' ||
      (favorites ? favorites.has(v.id) : state.filter==='Activos' ? !!v.active : (v.genre||'').toLocaleLowerCase('es').includes(state.filter.toLocaleLowerCase('es')));
    const haystack=[v.name,v.address,v.city,v.genre].join(' ').toLocaleLowerCase('es');
    return matchesFilter && haystack.includes(query);
  });
}
function refreshDiscoveryResults({rebuildMap=true}={}){
  const grid=document.getElementById('venue-grid');
  if(!grid)return;
  const visible=filteredVenues();
  grid.innerHTML=visible.length ? visible.map((v,i)=>typeof tocaVenueCard==='function'?tocaVenueCard(v,i):vcard(v)).join('') : '<p class="toca-empty">No encontramos bares con esos filtros.</p>';
  const cityLabel=document.getElementById('toca-map-city-label');
  if(cityLabel && typeof tocaVisibleCityLabel==='function') {
    cityLabel.textContent=tocaVisibleCityLabel(visible);
  }
  const count=document.getElementById('toca-results-count');
  if(count)count.textContent=`${visible.length} ${visible.length===1?'lugar':'lugares'}`;
  document.querySelectorAll('.toca-explore [data-action="filter"]').forEach(button=>{
    const selected=button.dataset.value===state.filter;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  if(!rebuildMap)return;
  const oldMap=document.querySelector('.toca-primary-map .toca-map-art');
  if(oldMap && typeof tocaMap==='function'){
    if(state.map){try{state.map.remove()}catch(e){console.warn('Removing previous map:',e)}state.map=null;}
    oldMap.outerHTML=tocaMap(visible);
    if(typeof tocaLoadLiveMap==='function')tocaLoadLiveMap();
  }
}

function instagramLink(handle) {
  const username = String(handle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return '';
  const url = 'https://www.instagram.com/' +
    encodeURIComponent(username) + '/';
  return `<a class="toca-instagram-link"
    href="${url}" target="_blank" rel="noopener noreferrer"
    aria-label="Instagram del bar @${esc(username)}">
    <svg class="toca-instagram-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.7" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg><span class="toca-instagram-handle">@${esc(username)}</span>
  </a>`;
}

// Photo-led map preview. Keep the venue photo and actions in one surface.
function tocaVenuePopup(v) {
  const name = String(v.name || 'Establecimiento');
  const genre = String(v.genre || 'Música').split(/[,•·]/).map(x=>x.trim()).filter(Boolean).join(' · ');
  const imagePath = String(v.coverPhotoUrl || '');
  // Venue uploads belong to the API.
  const photoUrl = imagePath.startsWith('/api/venues/') ? mediaUrl(imagePath)
    : '';
  const image = photoUrl
    ? `<img class="toca-popup-cover" src="${esc(photoUrl)}" alt="Foto de ${esc(name)}">`
    : '';
  const instagram = String(v.instagramHandle || '').trim().replace(/^@/, '');
  const instagramLink = /^[A-Za-z0-9._]{1,30}$/.test(instagram)
    ? `<a class="toca-popup-link toca-popup-instagram" href="https://www.instagram.com/${encodeURIComponent(instagram)}/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${esc(name)} (se abre en otra pestaña)" title="Instagram de ${esc(name)}"><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>`
    : '';
  return `<article class="toca-popup-card" aria-label="${esc(name)}">
    <div class="toca-popup-media ${photoUrl ? 'has-photo' : 'no-photo'}">${image}<img class="toca-popup-placeholder" src="/assets/icon.svg" alt="" aria-hidden="true"></div>
    <p class="toca-popup-status ${v.active ? 'is-active' : 'is-inactive'}"><span aria-hidden="true"></span>${v.active ? 'Música activa' : 'Música inactiva'}</p>
    <div class="toca-popup-copy">
      <strong class="toca-popup-name" title="${esc(name)}">${esc(name)}</strong>
      <span class="toca-popup-meta" title="${esc(genre)}">${esc(genre)}</span>
      <nav class="toca-popup-links" aria-label="Enlaces de ${esc(name)}">
        <a class="toca-popup-link toca-popup-open" href="#/venue/${encodeURIComponent(v.id)}">Ver bar</a>
        ${instagramLink}
      </nav>
    </div>
  </article>`;
}

function tocaPrepareVenuePopup(popup) {
 const element=popup.getElement();
 const close=element?.querySelector('.leaflet-popup-close-button');
 if(close){close.setAttribute('aria-label','Cerrar ficha del bar');close.title='Cerrar';}
 const image=element?.querySelector('.toca-popup-cover');
 if(image){
  const fallback=()=>{image.closest('.toca-popup-media')?.classList.replace('has-photo','no-photo');image.remove();};
  image.onerror=fallback;if(image.complete&&!image.naturalWidth)fallback();
 }
}

function initMap(){
 const el=document.getElementById('leaflet-map');if(!el||!window.L||typeof window.tocaMapLayer!=='function')return null;
 try{
  if(state.map){state.map.remove();state.map=null;}
  const map=L.map(el,{zoomControl:false}).setView([-34.906,-56.173],12);state.map=map;
  L.control.zoom({position:'bottomright'}).addTo(map);
  const layer=window.tocaMapLayer().addTo(map),bounds=[];
  filteredVenues().forEach(v=>{
   if(v.latitude===null||v.longitude===null||v.latitude===''||v.longitude==='')return;
   const lat=Number(v.latitude),lon=Number(v.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
   const pt=[lat,lon];bounds.push(pt);
   const pin=L.divIcon({html:`<div class="toca-map-venue-pin-v1845" style="width:32px;height:32px;background:${v.active?'#b9fc89':'#b6b7c3'};border:3px solid #fff;border-radius:50%;display:grid;place-items:center;font-size:17px;color:#13271b;box-shadow:0 3px 9px #0006">♫</div>`,className:'',iconSize:[34,34]});
   const marker=L.marker(pt,{icon:pin,tocaVenueId:v.id,autoPanOnFocus:false,title:String(v.name||'Establecimiento')}).addTo(map);
   marker.getElement()?.setAttribute('aria-label',`Ver detalles de ${v.name||'este bar'}`);
   marker.getElement()?.setAttribute('aria-expanded','false');
   marker.getElement()?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();window.tocaOpenMapVenue(v,marker,map);}});
   marker.on('click',()=>window.tocaOpenMapVenue(v,marker,map));
  });
  if(bounds.length)map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
  map.invalidateSize({pan:false});return {map,layer};
 }catch(error){if(state.map){state.map.remove();state.map=null;}console.warn('Map unavailable',error);return null;}
}
function legalNote(){return ''}
async function viewVenue(id){const v=await fetchDetail(id);if(!v){mount('<div class="card empty">Bar no encontrado.</div>');return}state.detail=v;state.venueId=id;const requests=await fetchRequests(id);state.requests=requests;let playlist=([]);try{{playlist=await api(`/api/venues/${encodeURIComponent(id)}/playlist`)}}catch(e){}state.playlist=playlist;const queue=requests.filter(r=>['APPROVED','DISPATCHED'].includes(r.status));const body=`<div class="split" style="margin-bottom:20px"><a href="#/explore" class="link">← Volver a explorar</a><span class="pill ${v.active?'on':''}"><span class="dot"></span>${v.active?'Sesión musical activa':'Sin sesión'}</span></div><div class="two-col"><div><div class="big-cover" style="--from:${esc(v.from)};--to:${esc(v.to)}"><span>${esc(v.art)}</span></div><div class="detail-summary"><div><h1>${esc(v.name)}</h1><p class="subtitle">⌖ ${esc(v.address||'')} · ${esc(v.city||'')}</p></div><button class="btn ghost small" data-action="share" data-id="${esc(id)}">↗ Compartir</button></div><p class="subtitle">${esc(v.description||'Descubrí la música de este bar.')}</p><div class="stat-list"><span class="pill">♫ ${esc(v.genre||'Selección musical')}</span><span class="pill">☰ ${queue.length} canciones en cola</span>${v.spotifyConnected?'<span class="pill">♬ Conexión musical configurada</span>':''}</div><div class="section-line"><h2>Elegí la próxima canción</h2></div>${v.active?((state.joinToken))?`<div class="search-wrap"><input class="input search" id="song-search" placeholder="Buscá canción o artista..." /></div><div id="song-results" class="queue"><div class="empty">Escribí para buscar en la música disponible.</div></div>`:notice('Para pedir canciones necesitás acceder con el código QR del establecimiento. El mapa y la playlist pueden consultarse sin ingresar.','info'):notice('Este establecimiento no tiene una sesión activa. Podés consultar su información, pero no solicitar canciones.')}<div style="margin-top:23px">${notice('Las solicitudes de esta versión no tienen costo. Cada solicitud válida actualiza la playlist del bar, sin garantizar la cola activa de Spotify.','info')}</div></div><div class="stack"><div><h3 style="margin-bottom:15px">Ahora suena</h3>${livePlayer(v)}</div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Próximas canciones</h3><span class="pill">${queue.length} en cola</span></div><div class="queue">${queue.length?queue.map((r,i)=>trackRow(r,i+1,'queue')).join(''):'<div class="empty">Todavía no hay canciones aprobadas.</div>'}</div></div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Playlist del bar</h3><span class="pill">${playlist.length} temas</span></div><div class="queue">${playlist.length?playlist.slice(0,8).map((t,i)=>trackRow(t,i+1,'playlist')).join(''):'<div class="empty">No se pudo mostrar la playlist.</div>'}</div></div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Solicitudes recientes</h3><span class="pill">${requests.length}</span></div><div class="queue">${requests.slice(0,5).map((r,i)=>trackRow(r,i+1,'history')).join('')||'<div class="empty">Todavía no hay solicitudes.</div>'}</div></div><a href="#/explore" class="btn ghost full">Descubrir otros bares</a></div></div>${legalNote()}`;mount(body,'explore')}
function trackRow(t,i,mode='search'){const title=t.title||t.name||'Sin título';const artist=t.artist||(t.artists||[]).map(x=>x.name).join(', ');const art=t.art||'♪';return `<div class="track"><div class="tracknum">${i}</div><div class="album">${esc(art)}</div><div class="trackmeta"><strong>${esc(title)}</strong><small>${esc(artist)}${t.status?' · '+esc(statusLabel(t.status)):''}</small></div><div class="actions">${mode==='search'?`<button class="btn small" data-action="request" data-track="${esc(t.id)}">+ Pedir</button>`:''}</div></div>`}
const statusLabel=s=>({PENDING:'Pendiente',APPROVED:'Aprobada',DISPATCHED:'Playlist actualizada',PLAYED:'Finalizada',REJECTED:'Rechazada',FAILED:'Error'})[s]||s;
function clearAdminSession(){
  window.tocaMusicDisconnect?.();state.token='';state.user=null;state.venueId=null;state.spotify={};
  sessionStorage.removeItem('amplify-token');
  sessionStorage.removeItem('amplify-user');
}
function mount(body,nav){document.getElementById('app').innerHTML=shell(body,nav)}

async function getMyVenues(){if(!state.token)return [];return (await api('/api/admin/venues')).map(normalizeVenue)}
async function admin(){if((!state.token)){mount(`<div class="auth-layout card auth-box"><h2>Tu bar, tu música</h2><p>Iniciá sesión para administrar establecimientos, conectar Spotify y gestionar solicitudes automáticas.</p><a href="#/login" class="btn full">Iniciar sesión →</a><div class="center" style="margin-top:20px"><a href="#/register" class="link">Crear cuenta de administrador</a></div></div>`,'admin');return}let venues=await getMyVenues();if(!venues.length){navigate('#/admin/onboarding');return}if(!state.venueId||!venues.find(v=>v.id===state.venueId))state.venueId=venues[0].id;const v=({...venues.find(x=>x.id===state.venueId),...await fetchDetail(state.venueId)});state.detail=normalizeVenue(v);state.venues=venues;const items=await fetchRequests(v.id);state.requests=items;const pending=items.filter(x=>x.status==='PENDING');const queue=items.filter(x=>['APPROVED','DISPATCHED'].includes(x.status));let spotify={};{try{spotify=await api(`/api/admin/venues/${v.id}/spotify/status`)}catch(e){spotify={connected:false,error:e.message}}}state.spotify=spotify;const tabs=[['general','Resumen'],['music','Música y Spotify'],['profile','Mi bar']];const header=['music','spotify'].includes(state.adminTab)?'':state.adminTab==='account'
  ? `<a class="toca-account-back" href="#/admin/general">← Volver al panel</a>`
  : `<div class="panel-tabs" aria-label="Secciones del panel">${tabs.map(([key,label])=>`<a href="#/admin/${key}" class="${state.adminTab===key?'active':''}">${label}</a>`).join('')}</div>`;let body='';const liveWarn='';if(state.adminTab==='general'){body=`<div id="toca-live-music" class="toca-live-placeholder"></div><div class="grid4"><div class="card kpi"><span class="meta">Canciones solicitadas</span><strong>${items.length}</strong><span class="under">En esta cuenta</span></div><div class="card kpi"><span class="meta">Sin aprobación</span><strong>✓</strong><span class="under">Sin aprobación manual</span></div><div class="card kpi"><span class="meta">Próximas canciones</span><strong>${queue.length}</strong><span class="under">Canciones modificadas en Spotify</span></div><div class="card kpi"><span class="meta">Spotify Premium</span><strong>${spotify.connected?'✓':'—'}</strong><span class="under">${spotify.connected?'Cuenta conectada':'Sin conexión'}</span></div></div><div class="grid2" style="margin-top:23px"><div class="card"><div class="split"><h3>Últimas solicitudes</h3><a class="link" href="#/admin/music">Ver música →</a></div><div class="queue">${items.slice(0,6).map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">Todavía no hay solicitudes.</div>'}</div></div><div class="stack"><div class="card"><h3 style="margin-bottom:17px">Estado musical</h3>${livePlayer(v)}<p class="legal">Cola de Amplify ≠ cola real de Spotify. Los estados se mantienen separados.</p></div></div></div>`}
if(['music','spotify'].includes(state.adminTab)){
 const blocks=(await api(`/api/admin/venues/${v.id}/blocked`));
 const allows=(await api(`/api/admin/venues/${v.id}/allowed`));
 body=window.tocaAdminMusicMarkup(v,spotify,{blocks,allows,requests:items});
}
if(state.adminTab==='qr'){let join=(v.joinToken||'');let full=location.origin+location.pathname+'#/venue/'+encodeURIComponent(v.id)+(join?'?join='+encodeURIComponent(join):'');body=`<div class="grid2"><div class="card"><h3 style="margin-bottom:15px">Invitá a tus clientes</h3><p class="subtitle" style="margin-top:0">Mostrá este enlace o imprimí un código QR para que entren directamente a tu establecimiento.</p><div class="field" style="margin-top:19px"><label>Enlace exclusivo del bar</label><input class="input" id="join-link" readonly value="${esc(full)}" /></div><button class="btn" style="margin-top:15px" data-action="copy-join">⧉ Copiar enlace</button>${(`<button class="btn ghost" style="margin:15px 0 0 10px" data-action="rotate-join">↻ Renovar código</button>`)}<p class="legal">El código de acceso se utiliza para validar las solicitudes de invitados. Compartirlo públicamente permite solicitar desde fuera del local.</p></div><div class="card center"><h3 style="margin-bottom:13px">QR para imprimir</h3><div id="qr-container" class="qrbox"><span style="color:#243238">GENERANDO QR...</span></div><p class="legal">El QR se genera localmente; tu enlace privado no se envía a proveedores externos.</p><button class="btn ghost small" data-action="print-qr" style="margin-top:14px">⎙ Imprimir</button></div></div>`;window.currentJoin=full;setTimeout(drawQr,0)}
if(state.adminTab==='account'){body=`<section class="toca-profile-editor"><div class="card toca-account-card"><header class="toca-editor-heading"><span class="eyebrow">PERFIL DEL ADMINISTRADOR</span><h2>Mi cuenta</h2><p>Este perfil es de tu usuario administrador, independiente de los datos públicos del bar.</p></header>${window.tocaAdminAvatarMarkup?.()||''}<form id="account-update" class="stack"><div class="field"><label for="account-name">Nombre</label><input id="account-name" class="input" name="name" value="${esc(state.user?.name||'')}" minlength="2" maxlength="120" required autocomplete="name" /></div><div class="field"><label>Correo electrónico</label><input class="input" value="${esc(state.user?.email||'')}" disabled /></div><p class="toca-location-help">La foto y el nombre son de tu cuenta. El correo electrónico se mantiene sin cambios.</p><div class="toca-editor-actions"><button class="btn">Guardar mi perfil</button></div></form>
</div></section>`}
mount(header+body+legalNote(),'admin');if(['music','spotify'].includes(state.adminTab))window.tocaInitAdminMusic?.(v.id,spotify);if(state.adminTab==='profile')queueMicrotask(tocaInitVenueLocation);}
function tocaPlaylistNameKey(venueId,playlistId){
  return `toca-playlist-name:${venueId}:${playlistId}`;
}
function tocaSetPlaylistSummary(venueId,playlistId,playlists){
  if(state.venueId!==venueId || state.adminTab!=='spotify')return;
  const nameNode=document.getElementById('toca-selected-playlist-name');
  if(!nameNode || !playlistId)return;
  const selected=Array.isArray(playlists)?playlists.find(p=>p.id===playlistId):null;
  if(selected?.name){
    localStorage.setItem(tocaPlaylistNameKey(venueId,playlistId),selected.name);
    nameNode.textContent=selected.name;
  }
}
async function tocaRefreshSelectedPlaylist(venueId,spotify){
  if(!spotify?.connected || !spotify?.playlistId )return;
  try{
    const playlists=await api(`/api/admin/venues/${venueId}/spotify/playlists`);
    tocaSetPlaylistSummary(venueId,spotify.playlistId,playlists);
  }catch(error){
    // La playlist sigue visible usando la selección guardada aunque Spotify esté indisponible.
    console.info('No se pudo actualizar el nombre de la playlist:',error.message);
  }
}
function loginPage(register=false){if(register&&window.tocaAdminSignupPage)return window.tocaAdminSignupPage();const body=`<div class="auth-layout"><div class="center auth-logo">🎧</div><div class="card auth-box"><div class="eyebrow">ACCESO DE ADMINISTRADORES</div><h2>${register?'Creá tu cuenta':'Bienvenido de nuevo'}</h2><p>${register?'Empezá a gestionar la música de tu establecimiento.':'Ingresá para administrar los bares asociados a tu cuenta.'}</p><form id="${register?'register-form':'login-form'}">${register?'<div class="field"><label>Tu nombre</label><input class="input" name="name" required minlength="2" autocomplete="name" /></div>':''}<div class="field"><label>Correo electrónico</label><input class="input" name="email" type="email" required autocomplete="email" /></div><div class="field"><label>Contraseña</label><input class="input" name="password" type="password" minlength="10" required autocomplete="${register?'new-password':'current-password'}" /></div>${register?'<div class="field"><label>Repetí la contraseña<input class="input" name="passwordConfirmation" type="password" autocomplete="new-password" minlength="10" required></label></div>':''}<button class="btn full">${register?'Crear cuenta':'Iniciar sesión'}</button></form><hr class="sep"><div class="center"><a class="link" href="#/${register?'login':'register'}">${register?'Ya tengo una cuenta':'¿No tenés cuenta? Registrate'}</a></div>${register?'':'<div class="toca-auth-recovery"><a href="#/account?kind=admin" data-manage-account>¿Olvidaste tu contraseña?</a></div>'}</div></div>`;mount(body,'auth')}
function settingsView(){mount('<h1>Preferencias</h1><p>Tus favoritos se sincronizan con tu cuenta.</p><a href="#/account?kind=customer">Acceso y privacidad de la cuenta</a>','profile')}
function requestsView(){const req=(state.requests);mount(`<div class="eyebrow">TU HISTORIAL</div><h1>Las canciones que <span style="color:var(--lime)">pediste.</span></h1><p class="subtitle" style="margin-bottom:24px">Las canciones que pediste en este establecimiento.</p><div class="card"><div class="queue">${req.slice().reverse().map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">No hay solicitudes aún. Descubrí un bar para empezar.</div>'}</div></div>`,'requests')}
function aboutView(){mount(`<div class="eyebrow">ACERCA DE TOCÁ</div><h1>La música nos <span style="color:var(--lime)">conecta.</span></h1><p class="subtitle">TOCÁ ayuda a descubrir lugares a través de su música y ofrece herramientas de moderación para los administradores.</p><div class="grid2" style="margin-top:27px"><div class="card stack"><h3>Para visitantes</h3><p class="subtitle">Mapa, perfil de bares, música actual cuando el proveedor lo informa, solicitudes gratis y cola visible.</p></div><div class="card stack"><h3>Portal de bares</h3><p class="subtitle">Panel, sesiones, Spotify, reglas por canción, solicitudes automáticas y acceso QR.</p></div></div>${legalNote()}`)}
let tocaDeletePreviousFocus=null;
function tocaOpenDeleteModal(venueId,venueName){
  tocaCloseDeleteModal();
  tocaDeletePreviousFocus=document.activeElement;
  const layer=document.createElement('div');
  layer.id='toca-delete-dialog';
  layer.className='toca-dialog-backdrop';
  layer.dataset.venueId=venueId;
  layer.dataset.venueName=venueName;
  layer.innerHTML=`<section class="toca-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="toca-dialog-title" aria-describedby="toca-dialog-description" tabindex="-1">
    <button type="button" class="toca-dialog-close" data-action="cancel-delete-venue" aria-label="Cerrar ventana">×</button>
    <p class="toca-dialog-eyebrow">MI BAR · ELIMINAR</p>
    <h2 id="toca-dialog-title">¿Seguro que querés eliminar tu bar?</h2>
    <p class="toca-dialog-lead">Tus clientes tienen buen gusto musical. ¿Seguro que te lo querés perder?</p>
    <p id="toca-dialog-description" class="toca-dialog-warning">Si eliminás tu bar de TOCÁ, desaparecerá del mapa y perderás toda su configuración. Esta acción no se puede deshacer.</p>
    <label for="toca-confirm-venue-name">Para confirmar, escribí el nombre de tu bar: <strong>${esc(venueName)}</strong></label>
    <input id="toca-confirm-venue-name" class="input toca-dialog-input" type="text" autocomplete="off" spellcheck="false" placeholder="Nombre de tu bar" />
    <p class="toca-dialog-progress" id="toca-delete-progress" role="status" hidden>Eliminando bar...</p>
    <div class="toca-dialog-actions"><button type="button" class="btn ghost" id="toca-delete-cancel" data-action="cancel-delete-venue">Me quedo</button><button type="button" class="btn toca-danger-btn" data-action="confirm-delete-venue" disabled>Eliminar mi bar</button></div>
  </section>`;
  document.body.appendChild(layer);
  document.body.classList.add('toca-dialog-open');
  layer.querySelector('input').focus();
}
function tocaCloseDeleteModal(){
  const layer=document.getElementById('toca-delete-dialog');
  if(layer?.querySelector('#toca-delete-cancel')?.disabled)return;
  layer?.remove();document.body.classList.remove('toca-dialog-open');
  if(tocaDeletePreviousFocus?.isConnected)tocaDeletePreviousFocus.focus();
  tocaDeletePreviousFocus=null;
}
document.addEventListener('keydown',e=>{
  const modal=document.getElementById('toca-delete-dialog');if(!modal)return;
  if(e.key==='Escape'){e.preventDefault();tocaCloseDeleteModal();return}
  if(e.key==='Tab'){
    const items=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
    if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
document.addEventListener('click',e=>{
 const modal=document.getElementById('toca-delete-dialog');
 if(modal&&e.target===modal)tocaCloseDeleteModal();
});
let tocaRequestSyncClient;
function requestSyncClient() {
  return tocaRequestSyncClient ||= createTocaRequestSync({
    api, storage: sessionStorage,
    customerId: () => window.tocaCustomerUser?.()?.id || 'anonymous',
    bearer: () => window.tocaCustomerBearer?.() || '',
    makeId: () => crypto.randomUUID()
  });
}
function requestSyncFeedback(venueId, message) {
  if (route().path !== '/request/' + venueId) return;
  let box = document.getElementById('toca-request-sync-feedback');
  if (!box) {
    const area = document.getElementById('song-results');
    if (!area) return;
    box = document.createElement('p'); box.id = 'toca-request-sync-feedback';
    box.className = 'notice'; box.setAttribute('role','status');
    area.before(box);
  }
  box.textContent = message;
}
const tocaRequestsInFlight = new Set();
window.tocaRequestSongPending = (venueId,trackId) => requestSyncClient().pending(venueId,trackId);
window.tocaRequestSong = async (venueId, track, options={}) => {
  if ((!(await window.tocaCustomerRequireForRequest(location.hash)))) return;
  if(options.isCurrent&&!options.isCurrent())return;
  const customerId=window.tocaCustomerUser?.()?.id;
  const key = `${customerId}:${venueId}:${track.id}`;
  if (tocaRequestsInFlight.has(key)) return;
  tocaRequestsInFlight.add(key);
  try {

    // Retained commands are queried without starting another admission or charge.
    if (!requestSyncClient().pending(venueId,track.id) && !(await window.tocaWalletCanRequest(venueId,track))) return;
    if(options.isCurrent&&!options.isCurrent())return;
    if (!(await window.tocaPresenceEnsure(venueId))) return;
    if(options.isCurrent&&!options.isCurrent())return;
    return await submitSynchronizedRequest(venueId,track,options);
  } catch(error) {
    if(window.tocaCustomerUser?.()?.id!==customerId)return;
    if(window.tocaWalletHandleInsufficient(error,venueId,track)){
      requestSyncClient().clearUnadmitted(venueId,track.id);return;
    }
    throw error;
  } finally {tocaRequestsInFlight.delete(key);}
};
async function submitSynchronizedRequest(venueId, track, options={}) {
  const flowPath=route().path,customer=window.tocaCustomerUser?.()?.id;
  requestSyncFeedback(venueId, 'Agregando tu canción…');
  const client = requestSyncClient();
  let result;
  try {
    result = await client.submit(venueId, track.id, {
      trackId: track.id, guestId: GUEST_ID
    });
    if(result.status==='FAILED'&&result.code==='REQUEST_RETRY_AFTER_UPDATE')
      result=await client.submit(venueId,track.id,{trackId:track.id,guestId:GUEST_ID});
    for (let attempt=0; attempt<90 && ['PENDING','PROCESSING','UNCERTAIN'].includes(result.status); attempt++) {
      if (!result.commandId || route().path !== flowPath || window.tocaCustomerUser?.()?.id!==customer) break;
      await new Promise(resolve => setTimeout(resolve,attempt<8?1000:3000));
      if (route().path !== flowPath || window.tocaCustomerUser?.()?.id!==customer) break;
      result = await client.refresh(venueId, track.id, result.commandId);
    }
  } catch (error) {
    if (window.tocaCustomerUser?.()?.id!==customer) return;
    if (window.tocaWalletHandleInsufficient(error,venueId,track)) {client.clearUnadmitted(venueId,track.id);return;}
    requestSyncFeedback(venueId, 'No pudimos confirmar la respuesta. Volvé a consultar este tema: conservamos el mismo pedido para evitar duplicados.');
    throw error;
  }
  if (window.tocaCustomerUser?.()?.id!==customer) return result;
  if (result.status === 'DISPATCHED') {
    window.tocaWalletRequested(venueId,track.id);
    const currentFlow=()=>route().path===flowPath&&window.tocaCustomerUser?.()?.id===customer&&(!options.isCurrent||options.isCurrent());
    if(options.confirmation==='center'){
      if(currentFlow()&&await window.tocaWalletConfirmSong(track,currentFlow)&&currentFlow())navigate(`#/venue/${encodeURIComponent(venueId)}`);
    }else{
      toast(`“${track.title}” se agregó a la playlist · 1 token`);
      if(currentFlow())navigate(`#/venue/${encodeURIComponent(venueId)}`);
    }
  } else if (result.status === 'FAILED') {
    if(window.tocaWalletHandleInsufficient(result,venueId,track))return result;
    const message=result.message || 'No pudimos agregar la canción. No se descontaron tokens.';
    requestSyncFeedback(venueId,message);toast(message);
    if(route().path==='/profile/tokens')await window.tocaWalletPage();
  } else {
    requestSyncFeedback(venueId, 'Tu canción sigue en proceso. El saldo sólo cambia cuando se confirma que se agregó.');
  }
  return result;
}

let tocaRequestActivityTimer;
function scheduleRequestActivity(panel,venueId) {
  clearTimeout(tocaRequestActivityTimer);
  tocaRequestActivityTimer=setTimeout(()=>{
    if(!panel.isConnected)return;
    if(document.visibilityState==='hidden')scheduleRequestActivity(panel,venueId);
    else void tocaLoadRequestCommands(venueId);
  },5000);
}
async function tocaLoadRequestCommands(venueId) {
  const dashboard=document.querySelector('.toca-ad-dashboard');
  if(!dashboard)return;
  let panel=dashboard.querySelector('#toca-request-commands');
  if(!panel){
    panel=document.createElement('section');panel.id='toca-request-commands';
    panel.className='toca-ad-card';dashboard.append(panel);
    panel.innerHTML='<h2>Actividad de canciones</h2><p role="status">Cargando actividad…</p>';
  }
  panel.dataset.venueId=venueId;
  try {
    const data=await api(`/api/admin/venues/${encodeURIComponent(venueId)}/request-commands`);
    if(!panel.isConnected||panel.dataset.venueId!==venueId)return;
    const commands=Array.isArray(data)?data.slice(0,5):[];
    const labels={PENDING:'Agregando a la playlist',PROCESSING:'Agregando a la playlist',UNCERTAIN:'Reintentando automáticamente',DISPATCHED:'Agregada a la playlist',FAILED:'No se pudo agregar'};
    panel.innerHTML='<div class="toca-section-title"><h2>Actividad de canciones</h2><span>Actualización automática</span></div>'+
      (commands.length?commands.map(command=>`<div class="toca-song-row"><div class="toca-song-meta"><strong>${esc(command.title||'Canción solicitada')}</strong><small>${esc(labels[command.status]||'En proceso')}</small>${command.status==='FAILED'?`<small>${esc(command.message||'El pedido no pudo completarse.')}</small>`:''}</div></div>`).join(''):'<p class="toca-muted">Los pedidos con saldo se agregan directamente a la playlist.</p>');
  }catch(error){
    if(panel.isConnected)panel.innerHTML='<h2>Actividad de canciones</h2><p class="toca-muted">No pudimos actualizar la actividad. Volveremos a intentarlo automáticamente.</p>';
  }finally{if(panel.isConnected)scheduleRequestActivity(panel,venueId);}
}
window.addEventListener('hashchange',()=>clearTimeout(tocaRequestActivityTimer));

async function render(){const r=route();state.error='';try{if(r.path==='/explore'||r.path==='/'){await explore();return}if(r.path==='/map'){state.venues=await fetchVenues();mount(mapView(),'map');if(!window.L){if(!document.getElementById('leaflet-style')){const s=document.createElement('link');s.id='leaflet-style';s.rel='stylesheet';s.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(s)}const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=initMap;s.onerror=()=>console.info('Offline map fallback active');document.head.append(s)}else initMap();return}if(r.path.startsWith('/venue/')){setGuestVenue(decodeURIComponent(r.path.split('/')[2]),r.params.get('join')||'');await viewVenue(decodeURIComponent(r.path.split('/')[2]));return}if(r.path==='/admin/requests'){location.replace('#/admin/general');return;}if(r.path==='/admin/onboarding')return await window.tocaVenueOnboarding();if(r.path==='/admin/profile'||r.path.startsWith('/admin/profile/'))return await window.tocaVenueProfile();if(r.path.startsWith('/admin')){state.adminTab=r.path.split('/')[2]||'general';await admin();return}if(r.path==='/login'){loginPage();return}if(r.path==='/register'){loginPage(true);return}if(r.path==='/settings'){settingsView();return}if(r.path==='/my-requests'){requestsView();return}if(r.path==='/about'){aboutView();return}navigate('#/explore')}catch(e){console.error(e);mount(`<div class="card empty"><div class="big">⚠</div><h2>No pudimos cargar esta pantalla</h2><p style="margin:13px auto;max-width:450px">${esc(e.message)}</p><button type="button" data-action="retry-api" class="btn ghost" style="margin-top:20px">Volver a intentar</button></div>`,'explore')}}
// Event handling: one listener per event type, no handlers injected into dynamic HTML.
document.addEventListener('input',e=>{if(e.target.id==='toca-confirm-venue-name'){const modal=document.getElementById('toca-delete-dialog');const button=modal?.querySelector('[data-action="confirm-delete-venue"]');if(button)button.disabled=e.target.value!==modal.dataset.venueName;}if(e.target.id==='venue-search'){state.search=e.target.value;refreshDiscoveryResults();}if(e.target.id==='song-search'){clearTimeout(window.searchTimer);window.searchTimer=setTimeout(async()=>{const q=e.target.value.trim(),area=document.getElementById('song-results');if(!area)return;if(q.length<2){area.innerHTML='<div class="empty">Escribí al menos dos caracteres.</div>';return}area.innerHTML='<div class="empty">Buscando música...</div>';try{const venueId=state.venueId;let data=await fetchCatalog(venueId,q);if(!area.isConnected||state.venueId!==venueId||document.getElementById('song-search')?.value.trim()!==q)return;state.catalog=data;area.innerHTML=data.length?data.map((t,i)=>trackRow(t,i+1,'search')).join(''):'<div class="empty">No encontramos canciones para esa búsqueda.</div>'}catch(err){if(!area.isConnected||document.getElementById('song-search')?.value.trim()!==q)return;area.innerHTML=`<div class="notice">${esc(err.message)}</div>`}},350)}});
document.addEventListener('change',e=>{if(e.target.id==='admin-venue-selector'){state.venueId=e.target.value;render()}});
document.addEventListener('submit',async e=>{const id=e.target.id;if(!['login-form','register-form','create-venue','venue-update','block-form','allow-form'].includes(id))return;e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{if(id==='login-form'||id==='register-form'){if(id==='register-form')confirmNewPassword(f);const result=await api('/api/auth/'+(id==='login-form'?'login':'register'),{method:'POST',body:f});state.token=result.token;state.user=result.user;sessionStorage.setItem('amplify-token',result.token);sessionStorage.setItem('amplify-user',JSON.stringify(result.user));navigate(ADMIN_HOME);return}if(id==='create-venue'){const data={...f,openingHours:window.tocaSerializeHours(e.target),latitude:Number(f.latitude),longitude:Number(f.longitude)};const created=await api('/api/admin/venues',{method:'POST',body:data});state.venueId=created.id;toast('Bar creado. Completá la portada para publicarlo.');navigate('#/admin/profile');return}if(id==='venue-update'){if(!state.detail?.coverPhotoUrl && state.detail?.published!==false){toast('Subí al menos una foto de portada antes de guardar Mi Bar.');document.querySelector('.toca-photos-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return}f.openingHours=window.tocaSerializeHours(e.target);const data={...f,latitude:Number(f.latitude),longitude:Number(f.longitude)};{await api(`/api/admin/venues/${state.venueId}`,{method:'PUT',body:data});}toast('Datos actualizados');render();return}if(id==='block-form'||id==='allow-form'){{await api(`/api/admin/venues/${state.venueId}/${id==='block-form'?'blocked':'allowed'}`,{method:'POST',body:f});}toast('Regla guardada');render()}}catch(err){toast('Error: '+err.message)}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;if(action==='retry-api'){await render();return;}try{if(action==='logout'){
  try {if((state.token))await api('/api/auth/logout',{method:'POST'});}
  catch(err){console.warn('No se pudo revocar la sesión en el servidor:',err.message);}
  finally {clearAdminSession();navigate('#/login');}
  return;
 }if(action==='open-delete-venue'){
  const venueId=state.venueId;
  const venueName=state.detail?.name;
  if(!venueId||!venueName){toast('No se encontró el bar seleccionado.');return}
  tocaOpenDeleteModal(venueId,venueName);
  return;
 }if(action==='cancel-delete-venue'){
  tocaCloseDeleteModal();return;
 }if(action==='confirm-delete-venue'){
  const modal=document.getElementById('toca-delete-dialog');
  const venueId=modal?.dataset.venueId;
  const venueName=modal?.dataset.venueName;
  const typed=modal?.querySelector('#toca-confirm-venue-name')?.value;
  if(!modal||!venueId||!venueName||typed!==venueName){return}
  b.disabled=true;
  modal.querySelector('#toca-delete-cancel').disabled=true;
  modal.querySelector('#toca-delete-progress').hidden=false;
  try{
    {
      await api(`/api/admin/venues/${encodeURIComponent(venueId)}`,{method:'DELETE'});
    }
    modal.querySelector('#toca-delete-cancel').disabled=false;
    tocaCloseDeleteModal();
    state.venueId=null;state.detail=null;state.venues=[];
    toast('Bar eliminado.');navigate('#/admin');
  }catch(error){
    toast('No se pudo eliminar el bar: '+error.message);
    b.disabled=false;
    modal.querySelector('#toca-delete-cancel').disabled=false;
    modal.querySelector('#toca-delete-progress').hidden=true;
  }
  return;
 }if(action==='filter'){state.filter=b.dataset.value;refreshDiscoveryResults();return}if(action==='share'){await navigator.clipboard.writeText(location.href);toast('Enlace copiado');return}if(action==='request'){
  if(b.disabled)return;
  const track=state.catalog.find(t=>t.id===b.dataset.track);if(!track)return;
  const venueId=state.venueId;
  b.disabled=true;
  try {
    await window.tocaRequestSong(venueId,track);
  } finally {if(b.isConnected)b.disabled=false;}
  return;
}if(['approve','reject','played'].includes(action)){const targetStatus={approve:'APPROVED',reject:'REJECTED',played:'PLAYED'}[action];{await api(`/api/admin/venues/${state.venueId}/requests/${b.dataset.id}/${action}`,{method:'POST'});}toast('Solicitud actualizada');render();return}if(action==='toggle-session'){{await api(`/api/admin/venues/${state.venueId}/session`,{method:'POST',body:{active:!state.detail.active}});}toast('Estado de la sesión actualizado');render();return}if(action==='toggle-approval'||action==='toggle-curated'){{await api(`/api/admin/venues/${state.venueId}/policy`,{method:'PUT',body:{requireApproval:action==='toggle-approval'?!state.detail.requireApproval:state.detail.requireApproval,curatedOnly:action==='toggle-curated'?!state.detail.curatedOnly:state.detail.curatedOnly}});}render();return}if(['unblock','unallow'].includes(action)){const k=action==='unblock'?'blocks':'allows';{await api(`/api/admin/venues/${state.venueId}/${action==='unblock'?'blocked':'allowed'}/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});}render();return}if(action==='connect-spotify'){let res=await api(`/api/admin/venues/${state.venueId}/spotify/authorize`);location.href=res.url;return}if(action==='disconnect-spotify'){await api(`/api/admin/venues/${state.venueId}/spotify/disconnect`,{method:'POST'});render();return}if(action==='load-playlists'){let pls=await api(`/api/admin/venues/${state.venueId}/spotify/playlists`);tocaSetPlaylistSummary(state.venueId,state.spotify.playlistId,pls);document.getElementById('playlist-container').innerHTML=`<div class="row"><select id="playlist-select" class="input"><option value="">Seleccionar...</option>${pls.map(p=>`<option value="${esc(p.id)}" ${p.id===state.spotify.playlistId?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button class="btn small" data-action="select-playlist">Guardar</button></div>`;return}if(action==='load-devices'){

 let dev=await api(`/api/admin/venues/${state.venueId}/spotify/devices`);
 document.getElementById('device-container').innerHTML=dev.length?`<div class="row"><select id="device-select" class="input"><option value="">Seleccionar...</option>${dev.filter(d=>!d.restricted).map(d=>`<option value="${esc(d.id)}" ${d.id===state.spotify.deviceId?'selected':''}>${esc(d.name)} (${esc(d.type)}) ${d.active?'✓':''}</option>`).join('')}</select><button class="btn small" data-action="select-device">Guardar</button></div>`:'<div class="notice">No hay dispositivos Spotify Connect activos.</div>';return
}if(action==='select-device'){
 const deviceId=document.getElementById('device-select')?.value;if(!deviceId)return;
 await api(`/api/admin/venues/${state.venueId}/spotify/device`,{method:'PUT',body:{deviceId}});
 toast('Dispositivo asociado');render();return
}
if(action==='select-playlist'){const selector=document.getElementById('playlist-select');const p=selector?.value;if(!p)return;await api(`/api/admin/venues/${state.venueId}/spotify/playlist`,{method:'PUT',body:{playlistId:p}});const chosenName=selector.options[selector.selectedIndex]?.textContent?.trim();if(chosenName)localStorage.setItem(tocaPlaylistNameKey(state.venueId,p),chosenName);toast('Playlist vinculada');render();return}if(action==='copy-join'){await navigator.clipboard.writeText(window.currentJoin||'');toast('Enlace de acceso copiado');return}if(action==='rotate-join'){if(!confirm('Los enlaces QR anteriores dejarán de aceptar nuevas solicitudes. ¿Continuar?'))return;await api(`/api/admin/venues/${state.venueId}/join-token/rotate`,{method:'POST'});render();return}if(action==='print-qr'){window.print();return}}catch(err){console.error(err);toast('Error: '+err.message)}finally{if(b&&b.isConnected)b.disabled=false}});
function drawQr(){
 const el=document.getElementById('qr-container');if(!el)return;
 try{
  if(!window.AmplifyQR)throw Error('Generador local no disponible');
  const qr=new window.AmplifyQR(-1,1);qr.addData(window.currentJoin||'');qr.make();
  const count=qr.getModuleCount(),size=6,margin=4;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=(count+margin*2)*size;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111';
  for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))ctx.fillRect((c+margin)*size,(r+margin)*size,size,size);
  const img=document.createElement('img');img.src=canvas.toDataURL('image/png');img.alt='QR del bar';el.replaceChildren(img);
 }catch(e){console.error('QR generation failed:',e);el.innerHTML='<span style="color:#222">Compartí el enlace del bar</span>'}
}
window.addEventListener('hashchange',()=>{tocaCloseDeleteModal();render()});
window.addEventListener('DOMContentLoaded',()=>{if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('/sw.js').catch(()=>{});render()});
