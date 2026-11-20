/* TOCÁ – unified mobile PWA, public desktop site and venue portal.
   Kept separate from legacy compatibility layer so the API contract remains reusable. */
const TOCA_ICON = '/assets/icon.svg';
const photoFor = (venue, index = 0) => venue?.coverPhotoUrl ? mediaUrl(venue.coverPhotoUrl) : `/assets/venues/bar-${Math.abs(index % 6) + 1}.webp`;
const brand = (small = false, href = '#/explore') => `<a class="toca-brand ${small?'compact':''}" href="${href}" aria-label="TOCÁ - ${href==='#/'?'inicio':'descubrir bares'}"><img src="${TOCA_ICON}" alt=""/><strong>TOCÁ</strong></a>`;
const iconSvg = (name,size=20) => {const shapes={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 music:'<path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
 sliders:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="#0b1311"/><circle cx="16" cy="12" r="2" fill="#0b1311"/><circle cx="10" cy="18" r="2" fill="#0b1311"/>',
 heart:'<path d="M20.5 5.5c-2-2-5.4-2-7.4 0L12 6.6l-1.1-1.1c-2-2-5.4-2-7.4 0s-2 5.4 0 7.4L12 21l8.5-8.1c2-2 2-5.4 0-7.4Z"/>',
 arrow:'<path d="m5 12 14 0M13 6l6 6-6 6"/>',
 back:'<path d="m15 18-6-6 6-6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m4 13 5 5L20 6"/>',
 settings:'<path d="M10 3h4l.6 2.3 2 1.2 2.4-.4 2 3.6-1.7 1.7v2.3l1.7 1.7-2 3.6-2.4-.4-2 1.2L14 22h-4l-.6-2.3-2-1.2-2.4.4-2-3.6 1.7-1.7v-2.3L3 9.6l2-3.6 2.4.4 2-1.2L10 3Z"/><circle cx="12" cy="12" r="3"/>',
 chart:'<path d="M4 21V11m6 10V4m6 17v-8m5 8H3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 qr:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M15 14v4h4v-4m-4 7h6"/>',
 logout:'<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 4l7 8-7 8m7-8H9"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
 share:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 14v7h16v-7"/>'};return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${shapes[name]||shapes.music}</svg>`};
const mobileLink = (href,icon,label,active) => `<a class="${active?'active':''}" href="#/${href}">${iconSvg(icon,20)}<span>${label}</span></a>`;
// TOCÁ v1.8.24: la sesión del admin y el QR no autentican clientes.
// Conectar este control a la sesión de cliente VERIFICADA por la API cuando se implemente login.
function tocaCustomerAuthenticated(){return !!window.tocaCustomerVerified?.();}
const navItems = () => [['explore','home','Explorar'],...(tocaCustomerAuthenticated()?[['my-requests','music','Mi música']]:[]),['profile','user','Perfil']];
const nav = (where='explore')=>`<nav class="toca-bottom-nav" aria-label="Navegación principal">${navItems().map(([url,ic,l])=>mobileLink(url,ic,l,where===url)).join('')}</nav>`;
const photo = (v,i=0)=>`<img class="${v?.coverPhotoUrl?'toca-user-photo':''}" src="${esc(photoFor(v,i))}" alt="${esc(v?.coverPhotoUrl?'Foto de '+(v.name||'bar'):'Ambiente ilustrativo del bar')}" loading="lazy"/>`;
const oldShell=shell, oldAdmin=admin, oldRender=render, oldTrackRow=trackRow;
// Los favoritos son locales a este navegador, pero siempre asociados a un cliente verificado.
// No migrar automáticamente la clave compartida antigua: podría pertenecer a otra persona.
const favoriteKey = user => `toca-favorites:customer:${encodeURIComponent(String(user.id))}`;
const myFavorites = () => {
  const user = window.tocaCustomerUser?.();
  if (!user?.id) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteKey(user)) || '[]');
    return Array.isArray(stored) ? stored.filter(x => typeof x === 'string') : [];
  } catch (_) { return []; }
};
const favButton=v=>`<button class="toca-heart" type="button" aria-label="${myFavorites().includes(v.id)?'Quitar de favoritos':'Agregar a favoritos'}" data-action="toca-fav" data-id="${esc(v.id)}">${iconSvg('heart',20)}</button>`;
function tocaVenueCard(v,i,wide=false){
  const genre=v.genre?`<small class="toca-card-genre">${esc(v.genre)}</small>`:'';
  const address=v.address?`<small class="toca-card-address">${iconSvg('pin',14)}<span>${esc(v.address)}</span></small>`:'';
  const hours=v.openingHours?`<small class="toca-card-hours" title="${esc(window.tocaHoursSummary(v.openingHours))}">${iconSvg('clock',14)}<span>${esc(window.tocaHoursSummary(v.openingHours))}</span></small>`:'';
  return `<a class="toca-venue ${wide?'wide':''}" href="#/venue/${encodeURIComponent(v.id)}" data-discovery-venue="${esc(v.id)}">
    <div class="toca-venue-photo ${v.coverPhotoUrl?'toca-photo-uncropped':''}">
      ${photo(v,i)}
      <span class="toca-live ${v.active?'':'paused'}">${v.active?'● En vivo':'○ Música inactiva'}</span>
    </div>
    <div class="toca-venue-meta"><strong>${esc(v.name)}</strong>${genre}${address}${hours}</div>
  </a>`;
}
function tocaSideLayout(content, selected='explore'){
 const adminLinks=[['admin/music','music','Música'],['admin/profile','settings','Mi Bar'],['admin/general','home','Dashboard'],['explore','pin','Ver como cliente']];
 return `<div class="toca-admin-frame"><aside class="toca-admin-sidebar">${brand()}<div class="toca-nav-caption">GESTIÓN DEL LOCAL</div><nav class="toca-admin-menu">${adminLinks.map(([url,ic,label])=>`<a class="${((location.hash||'').startsWith('#/'+url)||(url==='admin/music'&&location.hash.startsWith('#/admin/spotify')))?'selected':''}" href="#/${url}">${iconSvg(ic,18)} ${label}</a>`).join('')}</nav><div class="toca-admin-session"><a class="toca-admin-bottom toca-account-trigger" href="#/admin/account" aria-label="Abrir Mi cuenta" title="Mi cuenta"><span class="toca-admin-avatar">${esc((state.user?.name||'A')[0].toUpperCase())}</span><div><strong>${esc(state.user?.name||'Administrador')}</strong><small>Cuenta del establecimiento</small></div></a><button type="button" class="toca-logout" data-action="logout">${iconSvg('logout',17)} <span>Cerrar sesión</span></button></div></aside><div class="toca-admin-body"><header class="toca-admin-top"><div class="toca-admin-breadcrumb">Portal del bar <span>/</span> ${esc(state.detail?.name||'Mi establecimiento')}</div><div class="toca-admin-user"><span class="toca-admin-dot"></span> ${('Conectado')} <a class="toca-admin-avatar toca-admin-avatar-link" href="#/admin/account" aria-label="Abrir Mi cuenta" title="Mi cuenta">${esc((state.user?.name||'T')[0].toUpperCase())}</a><button type="button" class="toca-logout-mobile" data-action="logout" aria-label="Cerrar sesión del administrador" title="Cerrar sesión">${iconSvg('logout',18)}</button></div></header><main class="toca-admin-content">${content}</main></div></div><nav class="toca-bottom-nav toca-admin-mobile-nav" aria-label="Portal admin">${mobileLink('admin/music','music','Música',/^#\/admin\/(music|spotify)/.test(location.hash))}${mobileLink('admin/profile','settings','Mi Bar',location.hash.startsWith('#/admin/profile'))}${mobileLink('admin/general','home','Dashboard',!location.hash.match(/^#\/admin\/(music|spotify|profile|account)/))}${mobileLink('explore','pin','App',false)}</nav>`;
}
shell=(body,selected='explore')=>{
 if(selected==='onboarding')return body;
 if(selected==='auth')return `<div class="toca-auth-frame"><a href="#/" class="toca-auth-back">${iconSvg('back',18)} Volver al inicio</a><main class="toca-auth-content">${body}</main></div>`;
 if(selected==='admin')return tocaSideLayout(body,'admin');
 const current=route().path.replace('/','').split('/')[0];
 return `<div class="toca-app-shell"><header class="toca-app-header">${brand(false,'#/')}<div class="toca-desktop-menu"><a href="#/">Inicio</a><a class="${selected==='explore'?'active':''}" href="#/explore">Descubrir bares</a><a class="${selected==='about'?'active':''}" href="#/?section=la-app">Cómo funciona</a>${tocaCustomerAuthenticated()?'<a href="#/my-requests">Mis canciones</a>':''}</div><div class="toca-header-end"><a class="toca-user-button" href="#/profile" aria-label="Perfil">${iconSvg('user',19)}</a></div></header><main class="toca-app-content">${body}</main>${nav(current==='my-requests'?'my-requests':current==='profile'?'profile':selected)}</div>`;
};
function tocaMap(){
 return `<div class="toca-map-art" role="region" aria-label="Mapa de bares" data-map-state="loading">
  <div class="toca-map-status" role="status">Cargando mapa…</div>
  <div id="leaflet-map"></div>
 </div>`;
}

function tocaVisibleCityLabel(venues) {
  if (!venues.length) return 'Sin resultados';

  const cities = new Map();

  venues.forEach(venue => {
    const city = String(venue.city || '').trim();
    if (city) {
      cities.set(city.toLocaleLowerCase('es'), city);
    }
  });

  if (cities.size === 0) return 'Ubicación no indicada';
  if (cities.size > 1) return 'Varias ciudades';

  return [...cities.values()][0];
}

explore=async function(){
 void window.tocaLoadMaps?.().catch(()=>{});
 const [all]=await Promise.all([fetchVenues(),window.tocaCustomerEnsure?.()]);
 if(route().path!=='/explore')return;
 state.search='';state.venues=all;
 const filtered=filteredVenues();
 const filters=[['Todos','Todos'],['Activos','Con música'],['Favoritos','Favoritos']];
 const chips=filters.map(([value,label])=>`<button type="button" data-action="filter" data-value="${value}" aria-pressed="${state.filter===value}" class="chip ${state.filter===value?'active':''}">${label}</button>`).join('');
 const body=`<section class="toca-explore">
   <div class="toca-explore-toolbar">
     <h1>Descubrí bares</h1>
     <a href="#/?section=la-app" class="toca-explore-help">¿Cómo pido una canción?</a>
     <div class="toca-search-field">${iconSvg('search',18)}<input id="venue-search" class="input" type="search" placeholder="Busca bares o géneros" aria-label="Buscar bares" autocomplete="off"></div>
     <div class="toca-filter-chips" role="group" aria-label="Filtrar bares">${chips}</div>
   </div>
   <div class="toca-primary-map">${tocaMap()}</div>
   <div class="toca-explore-results"><h2>Bares</h2><span id="toca-results-count" role="status">${filtered.length} ${filtered.length===1?'lugar':'lugares'}</span></div>
   <div id="venue-grid" class="toca-venues-grid"></div>
 </section>`;
 mount(body,'explore');refreshDiscoveryResults({rebuildMap:false});tocaLoadLiveMap();
};
mapView=function(){const vs=state.venues;return `<div class="toca-inner-heading"><a href="#/explore">${iconSvg('back',17)} Volver</a><h1>Explorá el mapa</h1><p>Descubrí bares de Montevideo y lo que están escuchando.</p></div><div class="toca-discovery-layout toca-full-map"><div>${tocaMap()}</div><aside><h2>Bares en el mapa <span class="toca-muted">(${vs.length})</span></h2><div class="toca-map-venue-list">${vs.map((v,i)=>`<a href="#/venue/${encodeURIComponent(v.id)}" class="toca-side-venue">${photo(v,i)}<div><b>${esc(v.name)}</b><small>${esc(v.genre||'')} · ${esc(v.address||'')}</small><span>${v.active?'● Sonando ahora':'○ Música inactiva'}</span></div>${iconSvg('arrow',16)}</a>`).join('')}</div></aside></div>`};
async function tocaLoadLiveMap(){
 const el=document.getElementById('leaflet-map');if(!el)return;
 const frame=el.closest('.toca-map-art'),status=frame.querySelector('.toca-map-status');
 let initialized,finished=false;
 function fallback(){
  if(finished)return;
  finished=true;clearTimeout(timeout);
  if(!el.isConnected)return;
  frame.dataset.mapState='unavailable';
  status.textContent='El mapa no está disponible. Podés explorar los bares en la lista.';
  if(initialized&&state.map===initialized.map){initialized.map.remove();state.map=null;}
 }
 const timeout=setTimeout(fallback,18000);
 try{
  await window.tocaLoadMaps();
  if(!el.isConnected||finished){clearTimeout(timeout);return;}
  initialized=initMap();if(!initialized){fallback();return;}
  const gl=initialized.layer.getMaplibreMap();
  const reveal=()=>{
   if(!el.isConnected||finished){clearTimeout(timeout);return;}
   initialized.map.invalidateSize({pan:false});
   gl.resize();
   finished=true;clearTimeout(timeout);
   frame.dataset.mapState='ready';
   status.remove();
  };
  if(gl.loaded())reveal();else gl.once('load',reveal);
 }catch(_){fallback();}
}

function tocaNowPlaying(v){if(!v.active)return `<div class="toca-no-session">${iconSvg('music',26)}<h3>La música está en pausa</h3><p>Este bar no tiene una sesión activa.</p></div>`;return v.now?`<div class="toca-playing"><div class="toca-equalizer"><span></span><span></span><span></span><span></span><span></span></div><div><span>SONANDO AHORA</span><h3>${esc(v.now.title||'')}</h3><p>${esc(v.now.artist||'')}</p></div><span class="toca-live-dot">EN VIVO</span></div>`:`<div class="toca-no-session"><h3>Sesión activa</h3><p>Spotify no informó qué canción está sonando en este momento.</p></div>`}
livePlayer=tocaNowPlaying;
function tocaQueueRow(t,i){return `<div class="toca-song-row"><span class="toca-number">${i+1}</span><div class="toca-track-art variant-${i%5}">${esc(t.art||'♪')}</div><div class="toca-song-meta"><strong>${esc(t.title||'')}</strong><small>${esc(t.artist||'')}</small></div><span class="toca-song-status">${esc(statusLabel(t.status))}</span></div>`}
viewVenue=async function(id){const v=await fetchDetail(id);if(!v){mount('<div class="toca-empty">No encontramos ese bar.</div>');return}state.detail=v;setGuestVenue(id,route().params.get('join')||'');const requests=await fetchRequests(id);state.requests=requests;let playlist=([]);{try{playlist=await api(`/api/venues/${encodeURIComponent(id)}/playlist`)}catch{}}state.playlist=playlist;const queue=requests.filter(r=>['APPROVED','DISPATCHED'].includes(r.status));const joinQuery=rememberJoin(id,state.joinToken)?'?join='+encodeURIComponent(rememberJoin(id,state.joinToken)):'';const body=`<div class="toca-detail-layout"><section class="toca-detail-main">${window.tocaVenueGallery(v)}<div class="toca-detail-intro"><span class="toca-live ${v.active?'':'paused'}">${v.active?'● Música activa':'○ Música inactiva'}</span><h1>${esc(v.name)}</h1><p class="toca-detail-address">${esc(v.address||v.city||'')}</p><p class="toca-detail-genres">${esc(v.genre||'Música')}</p>${window.tocaHoursDetailMarkup(v.openingHours)}${String(v.description||'').trim()?`<p class="toca-detail-desc">${esc(v.description)}</p>`:''}${instagramLink(v.instagramHandle)}</div></section><aside class="toca-detail-aside"><div class="toca-panel toca-detail-playing">
<h2 class="toca-now-heading">Qué está sonando</h2>
<div id="toca-live-music">${tocaNowPlaying(v)}</div>
<a href="#/request/${encodeURIComponent(id)}${joinQuery}"
   class="toca-btn full">
  ${iconSvg('music',19)} Pedí una canción ${iconSvg('arrow',17)}
</a>
</div><div class="toca-panel"><div class="toca-section-title"><h2>Próximas en la fila</h2><span>Según reproducción Spotify</span></div><div id="toca-live-next"><p class="toca-muted">${('Consultando a Spotify para estimar la próxima canción…')}</p></div></div><div class="toca-panel"><div class="toca-section-title"><h2>Playlist del bar</h2><span>${playlist.length} temas</span></div><div id="toca-live-order">${playlist.slice(0,5).map((t,i)=>`<div class="toca-song-row"><div class="toca-track-art variant-${i%5}">${esc(t.art||'♫')}</div><div class="toca-song-meta"><strong>${esc(t.title||t.name||'Canción')}</strong><small>${esc(t.artist||'')}</small></div></div>`).join('')||'<p>El administrador todavía no seleccionó una playlist.</p>'}</div></div></aside></div>`;mount(body,'explore')};
trackRow=function(t,i,mode='search'){if(mode!=='search')return oldTrackRow(t,i,mode);const title=t.title||t.name||'Sin título',artist=t.artist||(t.artists||[]).map(x=>x.name).join(', ');return `<div class="toca-request-track"><div class="toca-track-art variant-${i%5}">${esc(t.art||'♪')}</div><div class="toca-song-meta"><strong>${esc(title)}</strong><small>${esc(artist)}</small></div><button class="toca-add" data-action="request" data-track="${esc(t.id)}" aria-label="Pedir ${esc(title)}">${iconSvg('plus',20)}</button></div>`};
async function tocaRequestPage(id){const v=await fetchDetail(id);if(!v){mount('<div class="toca-empty">Bar no encontrado.</div>');return}setGuestVenue(id,route().params.get('join')||'');state.detail=v;state.catalog=([]);const body=`<section class="toca-request-page"><header><a href="#/venue/${encodeURIComponent(id)}" aria-label="Volver">${iconSvg('back',23)}</a><div><small>PEDÍ UNA CANCIÓN</small><h1>${esc(v.name)}</h1></div></header>${!v.active?'<div class="toca-service-note">Este bar no está aceptando solicitudes en este momento.</div>':''}<div class="toca-search-field toca-big-search">${iconSvg('search',20)}<input id="song-search" class="input" type="search" autocomplete="off" placeholder="Buscá una canción o artista..." aria-label="Buscar canciones" /></div>${v.curatedOnly?'<div class="toca-request-head"><h2>Canciones permitidas</h2><span>Solo los temas habilitados por este bar</span></div>':''}<div class="toca-results" id="song-results">${state.catalog.map((t,i)=>trackRow(t,i,'search')).join('')}</div></section>`;mount(body,'explore')}
function tocaSuccess(id){const joinQuery=rememberJoin(id,state.joinToken)?'?join='+encodeURIComponent(rememberJoin(id,state.joinToken)):'';const d=(state.requests);const trackId=route().params.get('track');const x=(d||[]).slice().reverse().find(a=>a.trackId===trackId&&a.venueId===id);mount(`<div class="toca-success"><div class="toca-success-icon">${iconSvg('check',48)}</div><span>¡LISTO!</span><h1>Tu pedido fue enviado</h1><p>La playlist del bar fue actualizada. Podés seguir explorando o pedir otra canción.</p>${x?`<div class="toca-success-song"><div class="toca-track-art variant-3">♪</div><div><strong>${esc(x.title)}</strong><small>${esc(x.artist)}</small><span>${esc(statusLabel(x.status))}</span></div></div>`:''}<a href="#/venue/${encodeURIComponent(id)}${joinQuery}" class="toca-btn full">Ver cola de canciones ${iconSvg('arrow',17)}</a><a href="#/request/${encodeURIComponent(id)}${joinQuery}" class="toca-text-link">Pedir otra canción</a></div>`,'explore')}
function tocaProfile(){
 const user=window.tocaCustomerUser?.()||null;
 const f=myFavorites(),venues=(state.venues);
 const account=user?`<p>Hola, ${esc(user.name)} · ${esc(user.email)}</p>
 <div class="toca-customer-profile"><a href="#/my-requests">Mis canciones</a>
 <button type="button" data-customer-logout>Cerrar sesión de cliente</button></div>`:
 `<p>Estás explorando como invitado.</p><div class="toca-customer-profile">
 <a class="toca-btn" href="#/customer/login">Iniciar sesión</a>
 <a href="#/customer/register">Crear cuenta</a></div>`;
 mount(`<div class="toca-profile"><div class="toca-profile-top"><div class="toca-profile-avatar">${iconSvg('user',35)}</div>
 <h1>Tu noche, tu música.</h1>${account}<div class="toca-profile-counts"><div><strong>${f.length}</strong><span>Favoritos</span></div></div></div>
 <div class="toca-panel"><h2>Bares favoritos</h2><div class="toca-profile-favorites">${venues.filter(v=>f.includes(v.id)).map((v,i)=>tocaVenueCard(v,i)).join('')||'<p class="toca-muted">Guardá un bar con el corazón para encontrarlo aquí.</p>'}</div></div>
 </div>`,'profile');
}
requestsView=function(){const req=(state.requests);mount(`<div class="toca-my-songs"><span class="eyebrow">TUS SOLICITUDES</span><h1>Mis canciones</h1><div class="toca-toggle-tabs"><span class="active">Actividad reciente</span><span>${req.length} pedidos</span></div><div class="toca-panel">${req.slice().reverse().map((x,i)=>`<div class="toca-song-row"><div class="toca-track-art variant-${i%5}">♫</div><div class="toca-song-meta"><strong>${esc(x.title)}</strong><small>${esc(x.artist)} · ${esc(statusLabel(x.status))}</small></div><span class="toca-status-label">${esc(statusLabel(x.status))}</span></div>`).join('')||'<p class="toca-muted">Todavía no pediste ninguna canción.</p>'}</div><a class="toca-btn full" href="#/explore">Explorar bares</a></div>`,'my-requests')};
function tocaPortalDestination(){return state.token ? ADMIN_HOME : '#/login';}
function tocaLanding(){document.getElementById('app').innerHTML=`<div class="toca-landing"><header class="toca-landing-header">${brand()}<nav><a href="#/">Inicio</a><a href="#/explore">Descubrir bares</a><a href="#/?section=la-app">Cómo funciona</a></nav><a href="#/explore" class="toca-btn">Abrir TOCÁ ${iconSvg('arrow',17)}</a></header><section class="toca-landing-hero"><div class="toca-hero-copy"><div class="eyebrow">LA NOCHE SUENA CON VOS</div><h1>Descubrí bares.<br>Elegí <em>qué suena.</em></h1><p>Encontrá lugares cerca tuyo, mirá qué música están pasando y pedí tus canciones favoritas desde el celular.</p><div class="toca-landing-actions"><a href="#/explore" class="toca-btn">Explorar bares</a><a href="${tocaPortalDestination()}" class="toca-outline-cta">Portal de bares</a></div><div class="toca-trust"><span>${iconSvg('pin',16)} Descubrí lugares</span><span>${iconSvg('music',16)} Pedí canciones</span><span>${iconSvg('heart',16)} Viví la noche</span></div></div><div class="toca-hero-visual"><div class="toca-hero-photo"></div><div class="toca-hero-phone"><div class="toca-mini-header"><div class="toca-brand compact" aria-hidden="true"><img src="${TOCA_ICON}" alt=""/><strong>TOCÁ</strong></div><span>Montevideo</span></div><span>BARES CERCA TUYO</span><div class="toca-mini-map"><img src="/assets/toca-home-map.svg" alt="Ilustración del mapa de bares" draggable="false" loading="eager"/></div><div class="toca-mini-bar">${photo(null,0)}<div><strong>La Ronda</strong><small>Rock · Indie</small><span>● Música activa</span></div></div></div></div></section><section class="toca-landing-features"><div><span>${iconSvg('pin',26)}</span><h2>Descubrí</h2><p>Encontrá bares y explorá la música de cada lugar en el mapa.</p></div><div><span>${iconSvg('music',26)}</span><h2>Participá</h2><p>Desde el perfil del bar, buscá un tema y seguí tu solicitud.</p></div><div><span>${iconSvg('sliders',26)}</span><h2>Tu bar, tus reglas</h2><p>Moderación, canciones permitidas y control de la experiencia.</p></div></section><footer class="toca-footer">${brand(true)} <span>La noche suena con vos.</span><a href="#/settings">Configuración</a></footer></div>`}
async function tocaAdminDashboard(){return await window.tocaVenueDashboard();}
// TOCÁ v1.8.23 — Página «Cómo funciona», reutilizada por el header y Descubrir bares.
function tocaHowItWorks(){
 const steps=[
  ['Explorá los bares','Entrá en Descubrir bares para explorar el mapa, los géneros musicales y los locales disponibles.'],
  ['Elegí un lugar','Abrí el perfil del bar para conocer su dirección, horarios, fotos y playlist cuando esté disponible.'],
  ['Compartí tu ubicación','Si el bar limita los pedidos por cercanía, debés estar dentro de los 100 metros. Si permite cualquier ubicación, no se solicita GPS. No necesitás QR.'],
  ['Buscá una canción y pedila','Buscá por nombre o artista. Si el tema cumple las reglas del bar, podés agregar tu solicitud.'],
  ['Seguí lo que está sonando','Consultá la canción actual y la playlist. «Mis canciones» está disponible cuando iniciás sesión como cliente.']
 ];
 const faq=[
  ['¿Necesito crear una cuenta?','Para descubrir bares, no. Para pedir canciones necesitás iniciar sesión como cliente.'],
  ['¿Puedo pedir música sin estar en el bar?','Depende del bar: en Mi Bar el administrador elige entre clientes a 100 metros o pedidos desde cualquier ubicación.'],
  ['¿Mi canción suena inmediatamente?','No necesariamente. TOCÁ organiza las solicitudes en la playlist del bar, pero Spotify puede mantener una cola activa diferente.'],
  ['¿Por qué no encuentro una canción?','El administrador del bar puede bloquear temas o limitar los pedidos a canciones permitidas. También puede haber restricciones de Spotify.'],
  ['¿Qué pasa si el bar no tiene una sesión activa?','Podés seguir consultando la información del bar, pero no enviar nuevas solicitudes hasta que el administrador active la sesión musical.']
 ];
 const body=`<article class="toca-how" aria-labelledby="toca-how-title">
  <section class="toca-how-hero">
   <span class="toca-how-kicker">LA NOCHE SUENA CON VOS</span>
   <h1 id="toca-how-title">Así funciona <em>TOCÁ.</em></h1>
   <p>Descubrí bares, conocé su música y participá pidiendo canciones desde el celular. Podés explorar sin registrarte. Ya podés crear una cuenta. Cada canción agregada usa 1 token. Podés recargar tokens de prueba desde tu perfil, sin cobros.</p>
   <div class="toca-how-actions"><a href="#/explore" class="toca-btn">Descubrir bares ${iconSvg('arrow',17)}</a></div>
  </section>
  <section class="toca-how-section" aria-labelledby="toca-how-steps-title">
   <div class="toca-how-section-heading"><span class="toca-how-kicker">PASO A PASO</span><h2 id="toca-how-steps-title">De descubrir un bar a pedir tu tema</h2><p>Todo empieza explorando los locales y termina con tu música en la playlist del lugar.</p></div>
   <div class="toca-how-steps">${steps.map(([title,description],index)=>`<div class="toca-how-step"><span class="toca-how-step-index" aria-hidden="true">${index+1}</span><div><h3>${title}</h3><p>${description}</p></div></div>`).join('')}</div>
   <div class="toca-how-note"><strong>Importante:</strong> TOCÁ administra solicitudes y playlists; no garantiza que un tema se reproduzca de inmediato. El orden efectivo y la música en curso dependen del reproductor Spotify conectado.</div>
  </section>
  <section class="toca-how-section" aria-labelledby="toca-how-faq-title"><div class="toca-how-section-heading"><span class="toca-how-kicker">PREGUNTAS FRECUENTES</span><h2 id="toca-how-faq-title">Lo que necesitás saber</h2></div><div class="toca-how-faq">${faq.map(([question,answer])=>`<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>
  <section class="toca-how-end"><div><h2>¿Listo para explorar?</h2><p>Conocé los bares y descubrí qué música está sonando.</p></div><a href="#/explore" class="toca-btn">Descubrir bares ${iconSvg('arrow',17)}</a></section>
 </article>`;
 mount(body,'about');
}

render=async function(){const r=route();try{
if(r.path==='/admin'){location.replace(ADMIN_HOME);return;}
if(r.path.startsWith('/admin')) {
  if((!state.token)){navigate('#/login');return;}
  try {await api('/api/auth/me');}
  catch(err){if(err.name==='AbortError')return;clearAdminSession();navigate('#/login');toast('Iniciá sesión para acceder al panel.');return;}
}
if(r.path==='/customer/login'){await window.tocaCustomerEnsure();window.tocaCustomerLoginPage(false);return}if(r.path==='/customer/register'){await window.tocaCustomerEnsure();window.tocaCustomerLoginPage(true);return}if(r.path==='/about'){tocaHowItWorks();return}if(r.path==='/my-requests'){await window.tocaCustomerRequestsPage();return}if(r.path==='/login' && state.token){location.replace(ADMIN_HOME);return;}if(r.path==='/map'){location.hash='#/explore';await explore();return}if(r.path==='/'||r.path==='/home'){tocaLanding();return}if(r.path==='/welcome'){mount(`<section class="toca-welcome"><div class="toca-welcome-logo">${brand()}</div><div class="toca-welcome-art"></div><h1>La noche<br><em>suena con vos.</em></h1><p>Descubrí bares, elegí qué suena y disfrutá.</p><a href="#/explore" class="toca-btn full">Empezar ${iconSvg('arrow',17)}</a></section>`,'explore');return}if(r.path.startsWith('/request/')){if((!(await window.tocaCustomerRequireForRequest(location.hash))))return;return await tocaRequestPage(decodeURIComponent(r.path.split('/')[2]));}if(r.path.startsWith('/success/'))return tocaSuccess(decodeURIComponent(r.path.split('/')[2]));if(r.path==='/search'){navigate('#/explore');return}if(r.path==='/profile/tokens')return await window.tocaWalletPage();if(r.path==='/profile'){await window.tocaCustomerEnsure();state.venues=await fetchVenues();return tocaProfile()}if(r.path==='/admin/general'){state.adminTab='general';return await tocaAdminDashboard()}return await oldRender()}catch(e){console.error(e);mount(`<div class="toca-error"><h1>Algo no salió bien</h1><p>${esc(e.message)}</p><button type="button" class="toca-btn" data-action="retry-api">Volver a intentar</button></div>`,'explore')}};
// Capture TOCÁ-only actions; old app.js continues handling API, requests, moderation and session changes.
document.addEventListener('click', async e=>{
 const genre=e.target.closest('[data-toca-filter]');if(genre){state.filter=genre.dataset.tocaFilter;return}
 const btn=e.target.closest('[data-action="toca-fav"]');
 if(btn){
   e.preventDefault();e.stopPropagation();
   const user=await window.tocaCustomerEnsure?.();
   if(!user?.id){
     toast('Iniciá sesión como cliente para guardar bares favoritos.');
     navigate('#/customer/login');
     return;
   }
   const fav=myFavorites(),id=btn.dataset.id;
   {await api(`/api/customers/me/favorites/${encodeURIComponent(id)}`,{method:fav.includes(id)?'DELETE':'PUT',headers:{Authorization:window.tocaCustomerBearer()}});}
   localStorage.setItem(favoriteKey(user),JSON.stringify(fav.includes(id)?fav.filter(x=>x!==id):[...fav,id]));
   toast('Favoritos actualizados');
   if(!btn.closest('.toca-place-panel')){render();return;}
   btn.setAttribute('aria-label',fav.includes(id)?'Agregar a favoritos':'Quitar de favoritos');
   if(state.filter==='Favoritos')refreshDiscoveryResults();
 }
},true);
