/* TOCÁ — API adapter and shared business functionality. */
const API_URL = window.TOCA_CONFIG?.apiUrl || localStorage.getItem('amplify-api') || (location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://localhost:8080':location.origin);
// Gallery URLs are served by the API (8080), not the web static server (5173).
const mediaUrl = (url) => {
  const value = String(url || '');
  return value.startsWith('/api/') ? API_URL.replace(/\/+$/, '') + value : value;
};
const GUEST_ID = localStorage.getItem('amplify-guest-id') || (globalThis.crypto?.randomUUID?.()||`guest-${Date.now()}-abcdefghijkl`);
localStorage.setItem('amplify-guest-id',GUEST_ID);
const demoVenueData = [
 {id:'demo-1',name:'La Ronda',slug:'nebula-bar',address:'Cordón, Montevideo',city:'Montevideo',latitude:-34.9027,longitude:-56.1729,description:'Cócteles, beats nocturnos y una playlist que nunca se detiene.',genre:'Indie • Electrónica',art:'🪩',from:'#6956b1',to:'#202342',active:true,now:{title:'Midnight City',artist:'M83'},spotifyConnected:true},
 {id:'demo-2',name:'El Club',slug:'la-esquina-club',address:'Pocitos, Montevideo',city:'Montevideo',latitude:-34.9147,longitude:-56.1671,description:'Encuentros, vinilos y clásicos que todos cantamos.',genre:'Rock • Alternativo',art:'🎸',from:'#af654c',to:'#542c42',active:true,now:{title:'Do I Wanna Know?',artist:'Arctic Monkeys'},spotifyConnected:true},
 {id:'demo-3',name:'Mala Vida',slug:'luna-roja',address:'Pocitos, Montevideo',city:'Montevideo',latitude:-34.9084,longitude:-56.1524,description:'Un rincón para acompañar la noche con buena música.',genre:'Pop • Latino',art:'🌙',from:'#c45983',to:'#46234f',active:true,now:{title:'Ojitos Lindos',artist:'Bad Bunny, Bomba Estéreo'},spotifyConnected:true},
 {id:'demo-4',name:'Vinilo Social',slug:'casa-violeta',address:'Ciudad Vieja, Montevideo',city:'Montevideo',latitude:-34.9062,longitude:-56.2073,description:'Atardeceres, tragos de autor y sonido ecléctico.',genre:'Jazz • Soul',art:'🎷',from:'#8978bc',to:'#35355b',active:false,now:null,spotifyConnected:false},
 {id:'demo-5',name:'La Clandestina',slug:'beat-21',address:'Centro, Montevideo',city:'Montevideo',latitude:-34.9061,longitude:-56.1932,description:'Las mejores noches empiezan con una buena canción.',genre:'Hip hop • Funk',art:'♫',from:'#3b8d9a',to:'#22415e',active:true,now:{title:'Get Lucky',artist:'Daft Punk'},spotifyConnected:true},
 {id:'demo-6',name:'La Terraza',slug:'bruma-social',address:'Punta Carretas, Montevideo',city:'Montevideo',latitude:-34.9258,longitude:-56.1617,description:'Buena compañía y una selección musical relajada.',genre:'Chill • House',art:'🍸',from:'#648a85',to:'#243c46',active:false,now:null,spotifyConnected:false}
];
const demoCatalog=[
 {id:'demo-track-1',title:'Midnight City',artist:'M83',durationMs:243000,art:'🌃'},
 {id:'demo-track-2',title:'Do I Wanna Know?',artist:'Arctic Monkeys',durationMs:272000,art:'🎸'},
 {id:'demo-track-3',title:'Get Lucky',artist:'Daft Punk',durationMs:369000,art:'✨'},
 {id:'demo-track-4',title:'Tadow',artist:'Masego, FKJ',durationMs:302000,art:'🎷'},
 {id:'demo-track-5',title:'The Less I Know The Better',artist:'Tame Impala',durationMs:216000,art:'💿'},
 {id:'demo-track-6',title:'Ojitos Lindos',artist:'Bad Bunny, Bomba Estéreo',durationMs:259000,art:'🌙'},
 {id:'demo-track-7',title:'Electric Feel',artist:'MGMT',durationMs:229000,art:'⚡'},
 {id:'demo-track-8',title:'Feel Good Inc.',artist:'Gorillaz',durationMs:223000,art:'🌆'},
 {id:'demo-track-9',title:'Sweater Weather',artist:'The Neighbourhood',durationMs:240000,art:'🧥'},
 {id:'demo-track-10',title:'Take On Me',artist:'a-ha',durationMs:225000,art:'🎹'},
 {id:'demo-track-11',title:'Blinding Lights',artist:'The Weeknd',durationMs:200000,art:'🌠'},
 {id:'demo-track-12',title:'Music Sounds Better with You',artist:'Stardust',durationMs:379000,art:'🌈'}
];
const initialDemoRequests=[
 {id:'demo-r1',venueId:'demo-1',trackId:'demo-track-7',title:'Electric Feel',artist:'MGMT',status:'APPROVED',createdAt:new Date(Date.now()-14*60000).toISOString()},
 {id:'demo-r2',venueId:'demo-1',trackId:'demo-track-4',title:'Tadow',artist:'Masego, FKJ',status:'APPROVED',createdAt:new Date(Date.now()-9*60000).toISOString()},
 {id:'demo-r3',venueId:'demo-1',trackId:'demo-track-11',title:'Blinding Lights',artist:'The Weeknd',status:'DISPATCHED',createdAt:new Date(Date.now()-3*60000).toISOString()}
];
function db(){try{return JSON.parse(localStorage.getItem('amplify-demo')||'null')||{venues:demoVenueData,requests:initialDemoRequests,blocks:[],allows:[],curatedOnly:false,settings:{requireApproval:false},stats:{requests:13},votes:{}}}catch{return {venues:demoVenueData,requests:initialDemoRequests,blocks:[],allows:[],curatedOnly:false,settings:{requireApproval:false},stats:{requests:13},votes:{}}}}
function saveDemo(v){localStorage.setItem('amplify-demo',JSON.stringify(v))}
const state={demo:(window.TOCA_CONFIG?.mode||localStorage.getItem('amplify-mode')||(['localhost','127.0.0.1'].includes(location.hostname)?'demo':'live'))!=='live',token:sessionStorage.getItem('amplify-token')||'',user:JSON.parse(sessionStorage.getItem('amplify-user')||'null'),venues:[],detail:null,requests:[],catalog:[],search:'',filter:'Todos',adminTab:'general',venueId:null,busy:false,error:'',playlist:[],spotify:{},lastUrl:'',joinToken:'',map:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(d)=>{try{return new Intl.DateTimeFormat('es-UY',{hour:'2-digit',minute:'2-digit'}).format(new Date(d))}catch{return ''}};
const toast=(msg)=>{let n=document.getElementById('toast');n.innerHTML=`<div class="toasty">${esc(msg)}</div>`;clearTimeout(window.toastTimeout);window.toastTimeout=setTimeout(()=>n.innerHTML='',3600)};
const api=async(path,opts={})=>{const res=await fetch(`${API_URL}${path}`,{method:opts.method||'GET',headers:{...(path.match(/^\/api\/venues\/[^/]+\/requests$/) && (opts.method||'GET')==='POST' && window.tocaCustomerBearer?.()?{'X-TOCA-Customer':window.tocaCustomerBearer()}:{}),...(state.token?{Authorization:`Bearer ${state.token}`}:{}),...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})},body:opts.body?JSON.stringify(opts.body):undefined,signal:opts.signal||((opts.method||'GET')==='GET'?window.tocaNavigationSignal?.():undefined)});let data;try{data=await res.json()}catch{data={}}if(!res.ok){const error=Error(data._embedded?.errors?.[0]?.message||data.message||data.error||`Error HTTP ${res.status}`);error.status=res.status;throw error}return data};
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
let shell=(body,nav='explore')=>{const link=(path,sym,label,key)=>`<a href="#/${path}" class="${nav===key?'active':''}"><span class="ico">${sym}</span>${label}</a>`;return `<div class="shell"><aside class="sidebar"><a href="#/explore" class="brand"><span class="logo">≋</span> amplify<span style="color:var(--lime)">.</span></a><div><div class="side-label">Descubrí</div><nav class="nav">${link('explore','◈','Explorar bares','explore')}${link('map','⌖','Mapa de bares','map')}</nav></div><div><div class="side-label">Tu música</div><nav class="nav">${link('my-requests','♫','Mis solicitudes','requests')}${link('admin','▦','Panel de bar','admin')}${link('settings','⚙','Configuración','settings')}</nav></div><div class="side-spacer"></div><div class="side-card"><div class="mini-icon">🎶</div><strong>El lugar. La música. Vos.</strong><p>Descubrí bares y participá en su experiencia musical desde tu celular.</p><a class="btn ghost small" href="#/about">Sobre TOCÁ ↗</a></div><div class="side-foot">AMPLIFY v2 · ${state.demo?'Entorno de demostración':'API conectada'}<br>Pruebas privadas de Spotify</div></aside><div class="main"><header class="topbar"><div class="top-location"><span class="location-dot"></span><span>📍 Montevideo, Uruguay</span></div><div class="top-right"><a href="#/settings" class="status-demo" title="Configuración">${state.demo?'✧ MODO DEMO':'● MODO API'} ⚙</a>${state.user?`<span class="avatar" title="${esc(state.user.name||state.user.email)}">${esc((state.user.name||'A')[0].toUpperCase())}</span>`:`<a href="#/login" class="avatar">↗</a>`}</div></header><main class="content fade">${body}</main></div></div><nav class="mobile-nav">${link('explore','◈','Explorar','explore')}${link('map','⌖','Mapa','map')}${link('my-requests','♫','Pedidos','requests')}${link('admin','▦','Mi bar','admin')}</nav>`};
function vcard(v){return `<a href="#/venue/${encodeURIComponent(v.id)}" class="card venue-card"><div class="venue-cover" style="--from:${esc(v.from||'#536b9a')};--to:${esc(v.to||'#29354d')}"><span class="art">${esc(v.art||'🎵')}</span><span class="online ${v.active?'':'off'}">${v.active?'● Música activa':'○ Fuera de sesión'}</span></div><div class="venue-body"><h3>${esc(v.name)}</h3><p>⌖ ${esc(v.address||v.city||'')}</p><div class="tags"><span class="tag">${esc(v.genre||'Música en vivo')}</span><span class="tag">${v.active?'▶ Participación disponible':'♫ Ver bar'}</span></div></div></a>`}
function mini(v){return `<a href="#/venue/${encodeURIComponent(v.id)}" class="mini-venue"><div class="mini-photo" style="--from:${esc(v.from||'#506c8b')};--to:${esc(v.to||'#29344d')}">${esc(v.art||'🎵')}</div><div class="mini-info"><strong>${esc(v.name)}</strong><small>${esc(v.genre||'Música')}&nbsp; · &nbsp;${v.active?'🟢 Activo':'Sin sesión'}</small></div><span class="chev">›</span></a>`}
function notice(text,type='info'){return `<div class="notice ${type}"><span>ⓘ</span><span>${text}</span></div>`}
function normalizeVenue(v){return {...v,active:!!(v.active??v.sessionActive),art:v.art||'🎶',from:v.from||'#465a8b',to:v.to||'#292744'}}
async function fetchVenues(){if(state.demo)return db().venues.map(normalizeVenue);const all=[];for(let offset=0;;offset+=50){const page=await api('/api/venues?limit=50&offset='+offset);all.push(...page);if(page.length<50)break;}return all.map(normalizeVenue)}
async function fetchDetail(id){if(state.demo)return db().venues.find(v=>v.id===id)||null;return normalizeVenue(await api('/api/venues/'+encodeURIComponent(id)))}
async function fetchRequests(id){if(state.demo)return db().requests.filter(r=>r.venueId===id).slice().reverse();return await api('/api/venues/'+encodeURIComponent(id)+'/requests')}
async function fetchCatalog(id,q){if(!state.demo)setGuestVenue(id,route().params.get("join")||"");if(state.demo)return demoCatalog.filter(t=>!q||`${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()));return await api(`/api/venues/${encodeURIComponent(id)}/tracks?q=${encodeURIComponent(q)}`)}
function getAdminVenue(){return state.demo?'demo-1':state.venueId||state.venues[0]?.id||null}
function livePlayer(v){if(!v?.active)return `<div class="empty"><div class="big">♪</div>No hay sesión musical activa en este momento.</div>`;return `<div class="now"><div class="now-top"><span class="pill on"><span class="dot"></span> ${v.now?'SONANDO AHORA':'SESIÓN ACTIVA'}</span>${v.now?'<div class="bars"><i></i><i></i><i></i><i></i></div>':''}</div>${v.now?`<div class="now-song"><div class="album">🎵</div><div><h3>${esc(v.now.title||'')}</h3><p>${esc(v.now.artist||'')}</p></div></div>`:`<small>El reproductor no informó una canción actual. Nunca confundimos la playlist con lo que está sonando.</small>`}</div>`}
async function explore(){const all=await fetchVenues();state.venues=all;const filtered=all.filter(v=>(state.filter==='Todos'||(state.filter==='Activos'?v.active:v.genre?.toLowerCase().includes(state.filter.toLowerCase())))&&(`${v.name} ${v.address} ${v.genre}`.toLowerCase().includes(state.search.toLowerCase())));const body=`<div class="head-row"><div><div class="eyebrow">TU NOCHE TIENE BANDA SONORA</div><h1>Encontrá tu próximo <span style="color:var(--lime)">lugar favorito.</span></h1><p class="subtitle">Explorá bares, descubrí qué música suena y conectá con la noche.</p></div><a href="#/explore" class="btn ghost">Explorar bares</a></div>${state.demo?`<div class="demo-banner">✧ Estás explorando <strong>bares ficticios de demostración</strong>. Ninguna canción se reproduce ni se solicita realmente a Spotify. Podés probar toda la experiencia o cambiar a la API real en Configuración.</div>`:''}<div class="hero"><div><div class="eyebrow">MÚSICA QUE SE COMPARTE</div><h2>No solo escuches.<br><span style="color:var(--lime)">Sé parte.</span></h2><p>Elegí el bar, descubrí su playlist y pedí tus canciones favoritas.</p><a href="#/explore" class="btn">Descubrir bares <span>↗</span></a></div><div class="hero-art">🎧</div></div><div class="section-line"><h2>Bares cerca tuyo <span style="font-size:12px;color:#97a5b9;font-family:DM Sans">(${filtered.length})</span></h2><a href="#/explore" class="link">Descubrir bares ↗</a></div><div class="filterbar"><div class="search-wrap"><input id="venue-search" class="input search" placeholder="Buscar bar, zona o música..." value="${esc(state.search)}" /></div>${['Todos','Activos','Rock','Indie','Pop','Jazz'].map(f=>`<button class="chip ${state.filter===f?'active':''}" data-action="filter" data-value="${f}">${f}</button>`).join('')}</div><div class="grid3" id="venue-grid">${filtered.length?filtered.map((v,i)=>typeof tocaVenueCard==='function'?tocaVenueCard(v,i):vcard(v)).join(''):'<div class="card empty">No hay bares que coincidan con tu búsqueda.</div>'}</div>${legalNote()}`;mount(body,'explore')}
function mapCanvas(venues){const coords=venues.filter(v=>Number.isFinite(Number(v.latitude))&&Number.isFinite(Number(v.longitude)));const minlon=-56.24,maxlon=-56.105,minlat=-34.945,maxlat=-34.865;return `<div class="map-fallback"><svg viewBox="0 0 750 500" preserveAspectRatio="xMidYMid slice"><rect width="750" height="500" fill="#22313a"/><path d="M-100 380Q150 330 320 465T820 420L820 540H-100Z" fill="#183744" stroke="#306270" stroke-width="3"/><path d="M-20 40L730 490M-20 110L660 520M-20 200L590 530M130 -60L740 370M310 -70L790 260M-40 450L620 -80M130 530L750 90M330 530L800 200M-30 300L520 -70" stroke="#43515b" stroke-width="20"/><path d="M-20 40L730 490M-20 110L660 520M-20 200L590 530M130 -60L740 370M310 -70L790 260M-40 450L620 -80M130 530L750 90M330 530L800 200M-30 300L520 -70" stroke="#78838b" stroke-width="1.2"/><path d="M40 0V500M260 0V500M490 0V500M690 0V500M0 90H750M0 245H750M0 405H750" stroke="#586a6c" stroke-width="7" opacity=".7"/><text x="70" y="65" fill="#879a99" font-size="18">MONTEVIDEO</text><text x="275" y="260" fill="#879a99" font-size="13">CORDÓN</text><text x="520" y="105" fill="#879a99" font-size="13">POCITOS</text><text x="50" y="380" fill="#879a99" font-size="13">CIUDAD VIEJA</text></svg>${coords.map(v=>{const x=8+84*(Number(v.longitude)-minlon)/(maxlon-minlon);const y=8+82*(maxlat-Number(v.latitude))/(maxlat-minlat);return `<a href="#/venue/${esc(v.id)}" title="${esc(v.name)}" class="pin ${v.active?'':'off'}" style="left:${Math.max(6,Math.min(95,x))}%;top:${Math.max(11,Math.min(93,y))}%"><span>♫</span></a>`}).join('')}<div class="map-note">Mapa ilustrativo sin conexión. Con internet se carga el mapa interactivo OpenStreetMap.</div></div><div id="leaflet-map"></div>`}
function mapView(){const all=state.venues;return `<div class="eyebrow">EXPLORÁ LA CIUDAD</div><div class="head-row"><div><h1>La música está <span style="color:var(--lime)">en todas partes.</span></h1><p class="subtitle">Elegí un punto del mapa para conocer el bar y su experiencia musical.</p></div><span class="pill">⌖ ${all.length} establecimientos</span></div><div class="map-layout"><div class="map-frame">${mapCanvas(all)}</div><div><h3 style="margin:0 0 13px">Bares de la zona</h3><div class="list-stack">${all.map(mini).join('')||'<div class="empty">No hay bares registrados.</div>'}</div></div></div>${legalNote()}`}

// A single filter predicate drives both venue cards and map markers.
function filteredVenues(){
  const query=(state.search||'').trim().toLocaleLowerCase('es');
  return state.venues.filter(v => {
    const matchesFilter = state.filter==='Todos' ||
      (state.filter==='Activos' ? !!v.active : (v.genre||'').toLocaleLowerCase('es').includes(state.filter.toLocaleLowerCase('es')));
    const haystack=[v.name,v.address,v.city,v.genre].join(' ').toLocaleLowerCase('es');
    return matchesFilter && haystack.includes(query);
  });
}
function refreshDiscoveryResults(){
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

// TOCÁ v1.7.3.4: ficha compacta del bar en el mapa, con foto completa y enlaces discretos.
function tocaVenuePopup(v) {
  const name = String(v.name || 'Establecimiento');
  const genre = String(v.genre || 'Música');
  const imagePath = String(v.coverPhotoUrl || '');
  // La API devuelve rutas relativas a sus propias fotos; no aceptamos URLs arbitrarias.
  const photoUrl = imagePath.startsWith('/api/venues/') ? mediaUrl(imagePath) : '';
  const image = photoUrl
    ? `<img class="toca-popup-cover" src="${esc(photoUrl)}" alt="Foto de ${esc(name)}" loading="lazy">`
    : `<img class="toca-popup-placeholder" src="/assets/icon.svg" alt="" aria-hidden="true">`;
  const instagram = String(v.instagramHandle || '').trim().replace(/^@/, '');
  const instagramLink = /^[A-Za-z0-9._]{1,30}$/.test(instagram)
    ? `<a class="toca-popup-link toca-map-popup-v1844c-instagram" href="https://www.instagram.com/${encodeURIComponent(instagram)}/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${esc(name)} (se abre en otra pestaña)" style="display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;flex:0 1 auto!important;box-sizing:border-box!important;padding:8px 0!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#f2faf7!important;box-shadow:none!important;text-decoration:none!important;font-weight:800!important;font-size:12px!important;line-height:1.2!important;white-space:nowrap!important;"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block!important;width:17px!important;height:17px!important;min-width:17px!important;min-height:17px!important;max-width:17px!important;max-height:17px!important;flex:0 0 17px!important;position:static!important;transform:none!important;vertical-align:middle!important"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> Instagram</a>`
    : '';
  return `<article class="toca-popup-card">
    <div class="toca-popup-media ${photoUrl ? 'has-photo' : 'no-photo'}">${image}</div>
    <div class="toca-popup-copy">
      <strong class="toca-popup-name">${esc(name)}</strong>
      <span class="toca-popup-meta">${esc(genre)}</span>
      <nav class="toca-popup-links" aria-label="Enlaces de ${esc(name)}" style="display:flex!important;align-items:center!important;justify-content:flex-start!important;column-gap:clamp(8px,1.5vw,10px)!important;row-gap:8px!important;flex-wrap:nowrap!important;">
        <a class="toca-popup-link toca-map-popup-v1844c-primary" href="#/venue/${encodeURIComponent(v.id)}" style="display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;flex:0 0 auto!important;box-sizing:border-box!important;padding:10px 13px!important;margin:0!important;border:0!important;border-radius:999px!important;background:#aaff56!important;color:#102016!important;-webkit-text-fill-color:#102016!important;text-shadow:none!important;box-shadow:none!important;text-decoration:none!important;font-weight:800!important;font-size:12px!important;line-height:1.2!important;white-space:nowrap!important;">Ver bar <span style="font-size:17px!important;line-height:1!important;color:#102016!important;-webkit-text-fill-color:#102016!important;text-shadow:none!important" aria-hidden="true">→</span></a>
        ${instagramLink}
      </nav>
    </div>
  </article>`;
}

function initMap(){
 const el=document.getElementById('leaflet-map');if(!el||!window.L||typeof window.tocaMapLayer!=='function')return null;
 try{
  if(state.map){state.map.remove();state.map=null;}
  const map=L.map(el,{zoomControl:false}).setView([-34.906,-56.173],12);state.map=map;
  L.control.zoom({position:'topright'}).addTo(map);
  const layer=window.tocaMapLayer().addTo(map),bounds=[];
  filteredVenues().forEach(v=>{
   if(v.latitude===null||v.longitude===null||v.latitude===''||v.longitude==='')return;
   const lat=Number(v.latitude),lon=Number(v.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
   const pt=[lat,lon];bounds.push(pt);
   const pin=L.divIcon({html:`<div class="toca-map-venue-pin-v1845" style="width:32px;height:32px;background:${v.active?'#b9fc89':'#b6b7c3'};border:3px solid #fff;border-radius:50%;display:grid;place-items:center;font-size:17px;color:#13271b;box-shadow:0 3px 9px #0006">♫</div>`,className:'',iconSize:[34,34]});
   L.marker(pt,{icon:pin}).addTo(map).bindPopup(tocaVenuePopup(v));
  });
  if(bounds.length)map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
  map.invalidateSize({pan:false});return {map,layer};
 }catch(error){if(state.map){state.map.remove();state.map=null;}console.warn('Map unavailable',error);return null;}
}
function legalNote(){return ''}
async function viewVenue(id){const v=await fetchDetail(id);if(!v){mount('<div class="card empty">Bar no encontrado.</div>');return}state.detail=v;state.venueId=id;const requests=await fetchRequests(id);state.requests=requests;let playlist=state.demo?demoCatalog.slice(0,7):[];try{if(!state.demo)playlist=await api(`/api/venues/${encodeURIComponent(id)}/playlist`)}catch(e){}state.playlist=playlist;const queue=requests.filter(r=>['APPROVED','DISPATCHED'].includes(r.status));const body=`<div class="split" style="margin-bottom:20px"><a href="#/explore" class="link">← Volver a explorar</a><span class="pill ${v.active?'on':''}"><span class="dot"></span>${v.active?'Sesión musical activa':'Sin sesión'}</span></div><div class="two-col"><div><div class="big-cover" style="--from:${esc(v.from)};--to:${esc(v.to)}"><span>${esc(v.art)}</span></div><div class="detail-summary"><div><h1>${esc(v.name)}</h1><p class="subtitle">⌖ ${esc(v.address||'')} · ${esc(v.city||'')}</p></div><button class="btn ghost small" data-action="share" data-id="${esc(id)}">↗ Compartir</button></div><p class="subtitle">${esc(v.description||'Descubrí la música de este bar.')}</p><div class="stat-list"><span class="pill">♫ ${esc(v.genre||'Selección musical')}</span><span class="pill">☰ ${queue.length} canciones en cola</span>${v.spotifyConnected?'<span class="pill">♬ Conexión musical configurada</span>':''}</div><div class="section-line"><h2>Elegí la próxima canción</h2></div>${v.active?(state.demo||state.joinToken)?`<div class="search-wrap"><input class="input search" id="song-search" placeholder="Buscá canción o artista..." /></div><div id="song-results" class="queue"><div class="empty">Escribí para buscar en la música disponible.</div></div>`:notice('Para pedir canciones necesitás acceder con el código QR del establecimiento. El mapa y la playlist pueden consultarse sin ingresar.','info'):notice('Este establecimiento no tiene una sesión activa. Podés consultar su información, pero no solicitar canciones.')}<div style="margin-top:23px">${notice('Las solicitudes de esta versión no tienen costo. Cada solicitud válida actualiza la playlist del bar, sin garantizar la cola activa de Spotify.','info')}</div></div><div class="stack"><div><h3 style="margin-bottom:15px">Ahora suena</h3>${livePlayer(v)}</div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Próximas canciones</h3><span class="pill">${queue.length} en cola</span></div><div class="queue">${queue.length?queue.map((r,i)=>trackRow(r,i+1,'queue')).join(''):'<div class="empty">Todavía no hay canciones aprobadas.</div>'}</div></div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Playlist del bar</h3><span class="pill">${playlist.length} temas</span></div><div class="queue">${playlist.length?playlist.slice(0,8).map((t,i)=>trackRow(t,i+1,'playlist')).join(''):'<div class="empty">No se pudo mostrar la playlist.</div>'}</div></div><div class="card"><div class="split" style="margin-bottom:12px"><h3>Solicitudes recientes</h3><span class="pill">${requests.length}</span></div><div class="queue">${requests.slice(0,5).map((r,i)=>trackRow(r,i+1,'history')).join('')||'<div class="empty">Todavía no hay solicitudes.</div>'}</div></div><a href="#/explore" class="btn ghost full">Descubrir otros bares</a></div></div>${legalNote()}`;mount(body,'explore')}
function trackRow(t,i,mode='search'){const title=t.title||t.name||'Sin título';const artist=t.artist||(t.artists||[]).map(x=>x.name).join(', ');const art=t.art||'♪';return `<div class="track"><div class="tracknum">${i}</div><div class="album">${esc(art)}</div><div class="trackmeta"><strong>${esc(title)}</strong><small>${esc(artist)}${t.status?' · '+esc(statusLabel(t.status)):''}</small></div><div class="actions">${mode==='search'?`<button class="btn small" data-action="request" data-track="${esc(t.id)}">+ Pedir</button>`:''}</div></div>`}
const statusLabel=s=>({PENDING:'Pendiente',APPROVED:'Aprobada',DISPATCHED:'Playlist actualizada',PLAYED:'Finalizada',REJECTED:'Rechazada',FAILED:'Error'})[s]||s;
function clearAdminSession(){
  window.tocaMusicDisconnect?.();state.token='';state.user=null;state.venueId=null;state.spotify={};
  sessionStorage.removeItem('amplify-token');
  sessionStorage.removeItem('amplify-user');
}
function mount(body,nav){document.getElementById('app').innerHTML=shell(body,nav)}
function demoRequest(venueId,track){
  const d=db();
  if(d.blocks.some(b=>b.venueId===venueId&&b.trackId===track.id))throw Error('Esta canción está bloqueada');
  if(d.curatedOnly&&!d.allows.some(a=>a.venueId===venueId&&a.trackId===track.id))throw Error('Solo se permiten canciones autorizadas');
  const prev=d.requests.find(r=>r.venueId===venueId&&r.trackId===track.id&&['PENDING','APPROVED','DISPATCHED'].includes(r.status));
  const now=new Date().toISOString();
  if(prev){prev.status='DISPATCHED';prev.createdAt=now;prev.requestCount=(prev.requestCount||1)+1;}
  else d.requests.push({id:'demo-r'+Date.now(),venueId,trackId:track.id,title:track.title,artist:track.artist,createdAt:now,status:'DISPATCHED',requestCount:1});
  d.stats.requests++;saveDemo(d);return prev||d.requests[d.requests.length-1];
}

async function getMyVenues(){if(state.demo)return db().venues.slice(0,1);if(!state.token)return [];return (await api('/api/admin/venues')).map(normalizeVenue)}
async function admin(){if(!state.demo&&!state.token){mount(`<div class="auth-layout card auth-box"><h2>Tu bar, tu música</h2><p>Iniciá sesión para administrar establecimientos, conectar Spotify y gestionar solicitudes automáticas.</p><a href="#/login" class="btn full">Iniciar sesión →</a><div class="center" style="margin-top:20px"><a href="#/register" class="link">Crear cuenta de administrador</a></div></div>`,'admin');return}let venues=await getMyVenues();if(!venues.length){mount(adminOnboarding(),'admin');queueMicrotask(tocaInitVenueLocation);return}if(!state.venueId||!venues.find(v=>v.id===state.venueId))state.venueId=venues[0].id;const v=state.demo?db().venues.find(x=>x.id===state.venueId)||venues[0]:{...venues.find(x=>x.id===state.venueId),...await fetchDetail(state.venueId)};state.detail=normalizeVenue(v);state.venues=venues;const items=await fetchRequests(v.id);state.requests=items;const pending=items.filter(x=>x.status==='PENDING');const queue=items.filter(x=>['APPROVED','DISPATCHED'].includes(x.status));let spotify={};if(!state.demo){try{spotify=await api(`/api/admin/venues/${v.id}/spotify/status`)}catch(e){spotify={connected:false,error:e.message}}}else spotify={connected:true,premium:true,profile:'Demo Spotify Premium',playlistId:'demo-list'};state.spotify=spotify;const tabs=[['general','Resumen'],['requests',`Solicitudes (${items.length})`],['music','Música y Spotify'],['profile','Mi bar']];const header=state.adminTab==='account'
  ? `<a class="toca-account-back" href="#/admin/general">← Volver al panel</a>`
  : `<div class="panel-tabs" aria-label="Secciones del panel">${tabs.map(([key,label])=>`<a href="#/admin/${key}" class="${state.adminTab===key?'active':''}">${label}</a>`).join('')}</div>`;let body='';const liveWarn='';if(state.adminTab==='general'){body=`<div id="toca-live-music" class="toca-live-placeholder"></div><div class="grid4"><div class="card kpi"><span class="meta">Canciones solicitadas</span><strong>${items.length}</strong><span class="under">En esta cuenta</span></div><div class="card kpi"><span class="meta">Sin aprobación</span><strong>✓</strong><span class="under">Sin aprobación manual</span></div><div class="card kpi"><span class="meta">Próximas canciones</span><strong>${queue.length}</strong><span class="under">Canciones modificadas en Spotify</span></div><div class="card kpi"><span class="meta">Spotify Premium</span><strong>${spotify.connected?'✓':'—'}</strong><span class="under">${spotify.connected?'Cuenta conectada':'Sin conexión'}</span></div></div><div class="grid2" style="margin-top:23px"><div class="card"><div class="split"><h3>Últimas solicitudes</h3><a class="link" href="#/admin/requests">Ver todas →</a></div><div class="queue">${items.slice(0,6).map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">Todavía no hay solicitudes.</div>'}</div></div><div class="stack"><div class="card"><h3 style="margin-bottom:17px">Estado musical</h3>${livePlayer(v)}<p class="legal">Cola de Amplify ≠ cola real de Spotify. Los estados se mantienen separados.</p></div></div></div>`}
if(state.adminTab==='requests'){
let spotifyOrder=[];if(!state.demo&&v.active){try{spotifyOrder=await api(`/api/venues/${encodeURIComponent(v.id)}/playlist`)}catch(e){console.warn(e)}}else if(state.demo)spotifyOrder=demoCatalog.slice(0,8);
body=`<div class="grid2"><div class="card"><div class="split"><h3>Solicitudes automáticas (${items.length})</h3><span class="pill">Se insertan directamente en la playlist</span></div><div class="queue">${items.slice(0,12).map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">Todavía no hay solicitudes.</div>'}</div></div><div class="card"><h3>Playlist Spotify (orden visible)</h3><div class="queue">${spotifyOrder.slice(0,15).map((x,i)=>trackRow(x,i+1,'playlist')).join('')||'<div class="empty">No se pudo consultar la playlist.</div>'}</div><p class="legal">El reproductor puede conservar una cola anterior aunque se haya modificado este orden.</p><hr class="sep"><h3>Historial</h3><div class="queue">${items.map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">Sin historial todavía.</div>'}</div></div>`}
if(state.adminTab==='music'){
 const d=db(),blocks=state.demo?d.blocks.filter(b=>b.venueId===v.id):await api(`/api/admin/venues/${v.id}/blocked`);
 const allows=state.demo?d.allows.filter(b=>b.venueId===v.id):await api(`/api/admin/venues/${v.id}/allowed`);
 const ruleList=(rules,mode)=>rules.length?rules.map(b=>`<div class="toca-rule-item"><div class="toca-song-meta"><strong>${esc(b.title||'Canción guardada')}</strong><small>${esc(b.artist||'Sin artista registrado')}</small></div><button type="button" class="btn ghost small" data-action="${mode==='BLOCK'?'unblock':'unallow'}" data-id="${esc(b.trackId)}">Quitar</button></div>`).join(''):'<p class="toca-muted">Todavía no hay canciones en esta lista.</p>';
 const selector=(mode,label,placeholder)=>`<section class="toca-rule-search" data-rule-mode="${mode}"><label for="rule-search-${mode}">${label}</label><div class="toca-search-field">${typeof iconSvg==='function'?iconSvg('search',18):'⌕'}<input class="input" id="rule-search-${mode}" type="search" autocomplete="off" placeholder="${placeholder}" aria-label="Buscar canción para ${label.toLowerCase()}" /></div><div class="toca-rule-results" id="rule-results-${mode}" aria-live="polite"><p class="toca-muted">Escribí el título de una canción o el nombre de un artista.</p></div></section>`;
 body=`<section class="toca-rule-panel"><div class="toca-rule-heading"><span class="eyebrow">CONTROL DE LA PLAYLIST</span><h2>Música y reglas</h2><p>Buscá canciones por nombre o artista, sin copiar IDs de Spotify.</p></div><div class="card toca-rule-policy"><div class="split"><div><strong>Modo whitelist</strong><p class="toca-muted">Al activarlo, solo se pueden solicitar canciones permitidas.</p></div><button class="switch ${(state.demo?d.curatedOnly:v.curatedOnly)?'on':''}" data-action="toggle-curated" aria-label="Activar lista blanca"><i></i></button></div></div><div class="toca-rule-columns"><div class="card"><h3>Lista negra</h3><p class="toca-muted">Impedí que se soliciten canciones concretas.</p>${selector('BLOCK','Bloquear una canción','Buscar tema para bloquear...')}<div class="toca-rule-list">${ruleList(blocks,'BLOCK')}</div></div><div class="card"><h3>Lista blanca</h3><p class="toca-muted">Elegí los temas permitidos cuando el modo whitelist esté activo.</p>${selector('ALLOW','Permitir una canción','Buscar tema para permitir...')}<div class="toca-rule-list">${ruleList(allows,'ALLOW')}</div></div></div></section>`;
}
if(state.adminTab==='spotify'||state.adminTab==='music'){const tocaSpotifyContent=`${window.tocaAdminMusicMarkup?.(v,spotify)||''}<div class="toca-spotify-settings"><div class="stack"><div class="card"><div class="split" style="margin-bottom:17px"><h3>Spotify Premium</h3><span class="pill ${spotify.connected?'on':''}">${spotify.connected?'● Conectado':'○ Desconectado'}</span></div>${spotify.connected?`<p class="subtitle" style="margin-top:0">Cuenta: <strong>${esc(spotify.profile||spotify.spotifyUserId||'Spotify')}</strong></p><p class="subtitle" style="margin-top:0">Premium: <strong>${state.demo?'Simulado':spotify.premiumVerification==='not_available_via_me'?'No verificable por la API':'No verificado'}</strong></p><div class="stack" style="margin-top:20px"><button class="btn ghost full" data-action="disconnect-spotify">Desconectar Spotify</button></div>`:`<p class="subtitle" style="margin-top:0">Conectá tu cuenta mediante OAuth. Nunca ingreses tu contraseña de Spotify en TOCÁ.</p><button class="btn full" data-action="connect-spotify" style="margin-top:20px">♫ Conectar con Spotify Premium</button>`}</div><div class="card"><h3 style="margin-bottom:15px">Playlist del establecimiento</h3>${spotify.connected?`<div class="toca-spotify-selected" aria-live="polite"><span class="toca-spotify-selected-label">${spotify.playlistId?'Playlist seleccionada':'Sin playlist vinculada'}</span><div class="toca-spotify-selected-row"><span class="toca-spotify-selected-icon" aria-hidden="true">♫</span><div class="toca-spotify-selected-info"><strong id="toca-selected-playlist-name">${esc(spotify.playlistId?(state.demo?'Playlist de demostración':localStorage.getItem(tocaPlaylistNameKey(v.id,spotify.playlistId))||'Playlist vinculada'):'Seleccioná una playlist')}</strong><small>${spotify.playlistId?'Las solicitudes se agregan a esta playlist':'Elegí la playlist que utilizará el establecimiento'}</small></div>${spotify.playlistId&&!state.demo?`<a class="toca-spotify-open-link" href="https://open.spotify.com/playlist/${encodeURIComponent(spotify.playlistId)}" rel="noopener noreferrer" target="_blank">Abrir en Spotify ↗</a>`:''}</div></div><button data-action="load-playlists" class="btn ghost small" style="margin-top:14px">${spotify.playlistId?'Cambiar playlist':'Elegir playlist'}</button><div id="playlist-container" style="margin-top:14px"></div><hr class="sep"><details class="toca-spotify-device-details"><summary>Dispositivo de reproducción <span class="toca-spotify-optional">Opcional</span></summary><p class="toca-spotify-device-help">Es la computadora, teléfono o parlante que aparece en Spotify Connect. Sirve para enviar comandos de reproducción a ese dispositivo. <strong>No necesitás elegirlo para agregar canciones a la playlist.</strong></p>${spotify.deviceId?'<p class="toca-spotify-device-help">Hay un dispositivo vinculado. Podés consultarlo o cambiarlo aquí.</p>':''}<p class="toca-spotify-device-help">${spotify.controlEnabled?'El control directo del reproductor está habilitado.':'El control directo de reproducción está deshabilitado; Spotify sigue reproduciendo desde su aplicación.'}</p><button type="button" class="btn ghost small" data-action="load-devices">Buscar dispositivos Spotify Connect</button><div id="device-container" style="margin-top:12px"></div></details>`:notice('Primero debés conectar Spotify Premium.','info')}</div></div><p class="toca-spotify-footnote">Nota: actualizar la playlist no siempre modifica la cola que Spotify ya tiene cargada en el reproductor.</p></div>`;body=state.adminTab==='music' ? `<section class="toca-v1832-spotify-combined"><div class="toca-v1832-spotify-heading"><div><h2>Spotify Premium</h2><p>Conexión, playlist y dispositivo de reproducción</p></div></div>`+tocaSpotifyContent+`</section>`+body : tocaSpotifyContent;}
if(state.adminTab==='qr'){let join=state.demo?'demo-access':v.joinToken||'';let full=location.origin+location.pathname+'#/venue/'+encodeURIComponent(v.id)+(join?'?join='+encodeURIComponent(join):'');body=`<div class="grid2"><div class="card"><h3 style="margin-bottom:15px">Invitá a tus clientes</h3><p class="subtitle" style="margin-top:0">Mostrá este enlace o imprimí un código QR para que entren directamente a tu establecimiento.</p><div class="field" style="margin-top:19px"><label>Enlace exclusivo del bar</label><input class="input" id="join-link" readonly value="${esc(full)}" /></div><button class="btn" style="margin-top:15px" data-action="copy-join">⧉ Copiar enlace</button>${state.demo?'':`<button class="btn ghost" style="margin:15px 0 0 10px" data-action="rotate-join">↻ Renovar código</button>`}<p class="legal">El código de acceso se utiliza para validar las solicitudes de invitados. Compartirlo públicamente permite solicitar desde fuera del local.</p></div><div class="card center"><h3 style="margin-bottom:13px">QR para imprimir</h3><div id="qr-container" class="qrbox"><span style="color:#243238">GENERANDO QR...</span></div><p class="legal">El QR se genera localmente; tu enlace privado no se envía a proveedores externos.</p><button class="btn ghost small" data-action="print-qr" style="margin-top:14px">⎙ Imprimir</button></div></div>`;window.currentJoin=full;setTimeout(drawQr,0)}
if(state.adminTab==='profile'){body=`<section class="toca-profile-editor">${window.tocaVenueImportMarkup?.()||''}<div class="card toca-venue-editor-card"><header class="toca-editor-heading"><span class="eyebrow">CONFIGURACIÓN DEL LOCAL</span><h2>Mi bar</h2><p>Actualizá los datos públicos y confirmá en el mapa dónde encontrar tu establecimiento.</p></header><form id="venue-update" class="stack"><div class="toca-editor-fields"><div class="field"><label>Nombre del establecimiento <span class="toca-field-required" aria-hidden="true">*</span></label><input class="input" name="name" minlength="2" maxlength="160" value="${esc(v.name)}" required /></div><div class="field"><label>Dirección <span class="toca-field-required" aria-hidden="true">*</span></label><input class="input" name="address" minlength="4" maxlength="240" value="${esc(v.address||'')}" placeholder="Calle y número" required /></div><input type="hidden" name="city" value="${esc(v.city||'Montevideo')}" /></div>${tocaVenueLocationMarkup(v)}${tocaGenreMarkup(v.genre||'')}<div class="field"><label>Descripción</label><textarea class="input" name="description" maxlength="2000">${esc(v.description||'')}</textarea></div>${window.tocaHoursEditorMarkup(v.openingHours||'')}<div class="field">
<label for="venue-instagram">Instagram del bar</label>
<input class="input" id="venue-instagram" name="instagramHandle"
  value="${esc(v.instagramHandle||'')}"
  placeholder="@usuario o https://www.instagram.com/usuario/"
  maxlength="160" autocomplete="off" />
<small class="toca-location-help">
  Opcional. Se mostrará en la ficha pública y en el mapa.
</small>
</div></form><p class="toca-fields-note">* Campos obligatorios. También necesitás una foto de portada para publicar el bar.</p>${!v.coverPhotoUrl?'<p class="toca-cover-required" role="status">Falta la portada. Subí al menos una foto para completar tu bar y mostrarlo en Descubrir bares.</p>':''}${typeof tocaPhotoGalleryMarkup === 'function' ? tocaPhotoGalleryMarkup(v) : ''}<div class="toca-editor-actions toca-profile-save"><button type="submit" form="venue-update" class="btn">Guardar cambios del bar</button></div><section class="toca-delete-venue" aria-labelledby="toca-delete-title"><h3 id="toca-delete-title">¿Querés dejar TOCÁ?</h3><p>Si ya no querés que tu bar aparezca en TOCÁ, podés eliminarlo cuando quieras.</p><button type="button" class="btn toca-delete-trigger" data-action="open-delete-venue">Eliminar mi bar</button></section></div></section>`}
if(state.adminTab==='account'){body=`<section class="toca-profile-editor"><div class="card toca-account-card"><header class="toca-editor-heading"><span class="eyebrow">PERFIL DEL ADMINISTRADOR</span><h2>Mi cuenta</h2><p>Este perfil es de tu usuario administrador, independiente de los datos públicos del bar.</p></header><form id="account-update" class="stack"><div class="field"><label for="account-name">Nombre</label><input id="account-name" class="input" name="name" value="${esc(state.user?.name||'')}" minlength="2" maxlength="120" required autocomplete="name" /></div><div class="field"><label>Correo electrónico</label><input class="input" value="${esc(state.user?.email||'')}" disabled /></div><p class="toca-location-help">Por ahora podés actualizar tu nombre. La dirección de correo se mantiene sin cambios.</p><div class="toca-editor-actions"><button class="btn">Guardar mi perfil</button></div></form>
<details class="toca-dev-settings">
  <summary>Opciones avanzadas</summary>
  <p>Configuración técnica del entorno de desarrollo:
     modo demostración y conexión con la API.</p>
  <a href="#/settings">Abrir configuración del entorno ↗</a>
</details>
</div></section>`}
mount(header+body+legalNote(),'admin');if(['music','spotify'].includes(state.adminTab))window.tocaInitAdminMusic?.(v.id,spotify);if(state.adminTab==='profile')queueMicrotask(tocaInitVenueLocation);if(state.adminTab==='spotify')void tocaRefreshSelectedPlaylist(v.id,spotify);}
function adminOnboarding(){return `<div class="auth-layout"><div class="eyebrow">PRIMEROS PASOS</div><div class="card auth-box toca-onboarding-card"><h2>Registrá tu primer bar</h2><p>Ingresá el nombre, la dirección y confirmá el pin. Después subí al menos una foto de portada para publicarlo en el mapa.</p>${window.tocaVenueImportMarkup?.()||''}<form id="create-venue"><div class="field"><label>Nombre del bar *</label><input name="name" class="input" placeholder="Nombre del local" minlength="2" maxlength="160" required /></div><div class="field"><label>Dirección *</label><input name="address" class="input" placeholder="Calle y número" minlength="4" maxlength="240" required /></div><input type="hidden" name="city" value="Montevideo" />${tocaVenueLocationMarkup(null)}${tocaGenreMarkup('')}<button class="btn full">Crear bar</button></form></div></div>`}
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
  if(!spotify?.connected || !spotify?.playlistId || state.demo)return;
  try{
    const playlists=await api(`/api/admin/venues/${venueId}/spotify/playlists`);
    tocaSetPlaylistSummary(venueId,spotify.playlistId,playlists);
  }catch(error){
    // La playlist sigue visible usando la selección guardada aunque Spotify esté indisponible.
    console.info('No se pudo actualizar el nombre de la playlist:',error.message);
  }
}
function loginPage(register=false){const body=`<div class="auth-layout"><div class="center auth-logo">🎧</div><div class="card auth-box"><div class="eyebrow">ACCESO DE ADMINISTRADORES</div><h2>${register?'Creá tu cuenta':'Bienvenido de nuevo'}</h2><p>${register?'Empezá a gestionar la música de tu establecimiento.':'Ingresá para administrar los bares asociados a tu cuenta.'}</p><form id="${register?'register-form':'login-form'}">${register?'<div class="field"><label>Tu nombre</label><input class="input" name="name" required minlength="2" autocomplete="name" /></div>':''}<div class="field"><label>Correo electrónico</label><input class="input" name="email" type="email" required autocomplete="email" /></div><div class="field"><label>Contraseña</label><input class="input" name="password" type="password" minlength="10" required autocomplete="${register?'new-password':'current-password'}" /></div><button class="btn full">${register?'Crear cuenta':'Iniciar sesión'}</button></form><hr class="sep"><div class="center"><a class="link" href="#/${register?'login':'register'}">${register?'Ya tengo una cuenta':'¿No tenés cuenta? Registrate'}</a></div></div>${state.demo?'<p class="toca-auth-hint">Para iniciar sesión con tu bar, activá el <a href="#/settings">modo API real</a>.</p>':''}</div>`;mount(body,'auth')}
function settingsView(){const body=`<div class="eyebrow">CONFIGURACIÓN DEL ENTORNO</div><h1>TOCÁ</h1><p class="subtitle" style="margin-bottom:27px">Elegí cómo querés utilizar la aplicación.</p><div class="grid2"><div class="card stack"><h3>Modo de ejecución</h3><p class="subtitle" style="margin-top:0">Modo demo: explorá la app con datos ficticios y almacenamiento local. Modo API: utilizá un servidor Micronaut real.</p><div class="row"><button class="btn ${state.demo?'':'ghost'}" data-action="switch-demo">Modo demo</button><button class="btn ${!state.demo?'':'ghost'}" data-action="switch-live">Modo API real</button></div><div class="field"><label>Dirección del backend</label><input class="input" id="api-url" value="${esc(API_URL)}" placeholder="http://localhost:8080" /></div><button class="btn ghost" data-action="save-api">Guardar dirección</button>${state.demo?'<button class="btn red small" data-action="reset-demo">Restablecer datos demo</button>':''}</div><div class="card stack"><h3>Alcance de esta versión</h3>${notice('El mapa, las solicitudes, la moderación, el perfil de bares y la conexión OAuth están implementados. El modo demo simula los datos: no produce audio.','success')}</div></div>`;mount(body)}
function requestsView(){const req=state.demo?db().requests:state.requests;mount(`<div class="eyebrow">TU HISTORIAL</div><h1>Las canciones que <span style="color:var(--lime)">pediste.</span></h1><p class="subtitle" style="margin-bottom:24px">Historial de esta demostración o las solicitudes del establecimiento consultado.</p><div class="card"><div class="queue">${req.slice().reverse().map((x,i)=>trackRow(x,i+1,'history')).join('')||'<div class="empty">No hay solicitudes aún. Descubrí un bar para empezar.</div>'}</div></div>`,'requests')}
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
async function submitSynchronizedRequest(venueId, track) {
  requestSyncFeedback(venueId, 'Enviando tu pedido…');
  const client = requestSyncClient();
  let result;
  try {
    result = await client.submit(venueId, track.id, {
      trackId: track.id, guestId: GUEST_ID
    });
    for (let attempt=0; attempt<8 && ['PENDING','PROCESSING'].includes(result.status); attempt++) {
      requestSyncFeedback(venueId, 'Pedido recibido. Estamos confirmando la playlist con Spotify…');
      if (!result.commandId || route().path !== '/request/' + venueId) break;
      await new Promise(resolve => setTimeout(resolve,1000));
      result = await client.refresh(venueId, track.id, result.commandId);
    }
  } catch (error) {
    requestSyncFeedback(venueId, 'No pudimos confirmar la respuesta. Volvé a consultar este tema: conservamos el mismo pedido para evitar duplicados.');
    throw error;
  }
  if (result.status === 'DISPATCHED') {
    toast('¡Playlist actualizada!');
    if (route().path === '/request/' + venueId)
      navigate(`#/success/${encodeURIComponent(venueId)}?track=${encodeURIComponent(track.id)}`);
  } else if (result.status === 'FAILED') {
    requestSyncFeedback(venueId, result.message || 'El pedido no pudo completarse. Podés intentarlo nuevamente.');
  } else {
    requestSyncFeedback(venueId, result.status === 'UNCERTAIN'
      ? 'Tu pedido necesita revisión del bar. No lo reenviaremos mientras se confirma el resultado en Spotify.'
      : 'Tu pedido quedó recibido y sigue en proceso. Podés consultar su estado volviendo a elegir este tema.');
  }
  return result;
}

async function tocaLoadRequestCommands(venueId) {
  const dashboard = document.querySelector('.toca-ad-dashboard');
  if (!dashboard || state.demo) return;
  let panel = dashboard.querySelector('#toca-request-commands');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'toca-request-commands';
    panel.className = 'toca-ad-card'; dashboard.prepend(panel);
  }
  panel.dataset.venueId = venueId;
  panel.innerHTML = '<h2>Estado de pedidos</h2><p role="status">Consultando pedidos pendientes…</p>';
  try {
    const commands = await api(`/api/admin/venues/${encodeURIComponent(venueId)}/request-commands`);
    if (!panel.isConnected || panel.dataset.venueId !== venueId) return;
    const labels = {PENDING:'Recibido',PROCESSING:'Confirmando',UNCERTAIN:'Requiere revisión',FAILED:'No completado'};
    panel.innerHTML = `<div class="toca-section-title"><h2>Estado de pedidos</h2><button type="button" class="btn small" data-action="refresh-request-commands" data-venue="${esc(venueId)}">Actualizar</button></div>` +
      (commands.length ? commands.map(command => `<div class="toca-panel"><strong>${esc(command.title || command.trackId)}</strong><p>${esc(labels[command.status] || command.status)} · ${esc(command.message || '')}</p>${command.status==='UNCERTAIN' ? `<p>Revisá la playlist en Spotify antes de cerrar el pedido.</p><button type="button" class="btn small" data-action="reconcile-request-command" data-venue="${esc(venueId)}" data-command="${esc(command.commandId)}">Comprobar en Spotify</button> <button type="button" class="btn small ghost" data-action="cancel-request-command" data-venue="${esc(venueId)}" data-command="${esc(command.commandId)}">Cerrar tras revisar</button>` : ''}</div>`).join('') : '<p>No hay pedidos pendientes de confirmación.</p>');
  } catch (error) {
    if (panel.isConnected) panel.textContent = 'No se pudo consultar el estado de pedidos: ' + error.message;
  }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || !['refresh-request-commands','reconcile-request-command','cancel-request-command'].includes(button.dataset.action)) return;
  if (button.disabled) return;
  const venueId = button.dataset.venue;
  if (button.dataset.action === 'cancel-request-command' && !confirm('Confirmá que ya revisaste la playlist. Cerrar este pedido no elimina canciones de Spotify.')) return;
  button.disabled = true;
  try {
    if (button.dataset.command) await api(`/api/admin/venues/${encodeURIComponent(venueId)}/request-commands/${encodeURIComponent(button.dataset.command)}/${button.dataset.action==='reconcile-request-command'?'reconcile':'cancel'}`, {
      method:'POST', ...(button.dataset.action==='cancel-request-command'?{body:{acknowledgeProviderState:true}}:{})
    });
    await tocaLoadRequestCommands(venueId);
  } catch (error) { toast(error.message); }
  finally { if (button.isConnected) button.disabled = false; }
});

async function render(){const r=route();state.error='';try{if(r.path==='/explore'||r.path==='/'){await explore();return}if(r.path==='/map'){state.venues=await fetchVenues();mount(mapView(),'map');if(!window.L){if(!document.getElementById('leaflet-style')){const s=document.createElement('link');s.id='leaflet-style';s.rel='stylesheet';s.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(s)}const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=initMap;s.onerror=()=>console.info('Offline map fallback active');document.head.append(s)}else initMap();return}if(r.path.startsWith('/venue/')){setGuestVenue(decodeURIComponent(r.path.split('/')[2]),r.params.get('join')||'');await viewVenue(decodeURIComponent(r.path.split('/')[2]));return}if(r.path.startsWith('/admin')){state.adminTab=r.path.split('/')[2]||'general';await admin();return}if(r.path==='/login'){loginPage();return}if(r.path==='/register'){loginPage(true);return}if(r.path==='/settings'){settingsView();return}if(r.path==='/my-requests'){requestsView();return}if(r.path==='/about'){aboutView();return}navigate('#/explore')}catch(e){console.error(e);mount(`<div class="card empty"><div class="big">⚠</div><h2>No pudimos cargar esta pantalla</h2><p style="margin:13px auto;max-width:450px">${esc(e.message)}</p><a href="#/settings" class="btn ghost" style="margin-top:20px">Revisar conexión</a></div>`,'explore')}}
// Event handling: one listener per event type, no handlers injected into dynamic HTML.
document.addEventListener('input',e=>{if(e.target.id==='toca-confirm-venue-name'){const modal=document.getElementById('toca-delete-dialog');const button=modal?.querySelector('[data-action="confirm-delete-venue"]');if(button)button.disabled=e.target.value!==modal.dataset.venueName;}if(e.target.id==='venue-search'){state.search=e.target.value;refreshDiscoveryResults();}if(e.target.id==='song-search'){clearTimeout(window.searchTimer);window.searchTimer=setTimeout(async()=>{const q=e.target.value.trim(),area=document.getElementById('song-results');if(!area)return;if(q.length<2){area.innerHTML='<div class="empty">Escribí al menos dos caracteres.</div>';return}area.innerHTML='<div class="empty">Buscando música...</div>';try{const venueId=state.venueId;let data=await fetchCatalog(venueId,q);if(!area.isConnected||state.venueId!==venueId||document.getElementById('song-search')?.value.trim()!==q)return;state.catalog=data;area.innerHTML=data.length?data.map((t,i)=>trackRow(t,i+1,'search')).join(''):'<div class="empty">No encontramos canciones para esa búsqueda.</div>'}catch(err){if(!area.isConnected||document.getElementById('song-search')?.value.trim()!==q)return;area.innerHTML=`<div class="notice">${esc(err.message)}</div>`}},350)}});
document.addEventListener('change',e=>{if(e.target.id==='admin-venue-selector'){state.venueId=e.target.value;render()}});
document.addEventListener('submit',async e=>{const id=e.target.id;if(!['login-form','register-form','create-venue','venue-update','block-form','allow-form'].includes(id))return;e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{if(id==='login-form'||id==='register-form'){if(state.demo){toast('El login real requiere modo API.');return}const result=await api('/api/auth/'+(id==='login-form'?'login':'register'),{method:'POST',body:f});state.token=result.token;state.user=result.user;sessionStorage.setItem('amplify-token',result.token);sessionStorage.setItem('amplify-user',JSON.stringify(result.user));navigate('#/admin');return}if(id==='create-venue'){const data={...f,latitude:Number(f.latitude),longitude:Number(f.longitude)};const created=await api('/api/admin/venues',{method:'POST',body:data});state.venueId=created.id;toast('Bar creado. Completá la portada para publicarlo.');navigate('#/admin/profile');return}if(id==='venue-update'){if(!state.detail?.coverPhotoUrl && !state.demo){toast('Subí al menos una foto de portada antes de guardar Mi Bar.');document.querySelector('.toca-photos-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return}f.openingHours=window.tocaSerializeHours(e.target);const data={...f,latitude:Number(f.latitude),longitude:Number(f.longitude)};if(state.demo){const d=db();d.venues=d.venues.map(v=>v.id===state.venueId?{...v,...data}:v);saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}`,{method:'PUT',body:data});toast('Datos actualizados');render();return}if(id==='block-form'||id==='allow-form'){if(state.demo){const d=db(),k=id==='block-form'?'blocks':'allows';if(!d[k].some(x=>x.venueId===state.venueId&&x.trackId===f.trackId))d[k].push({venueId:state.venueId,trackId:f.trackId});saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}/${id==='block-form'?'blocked':'allowed'}`,{method:'POST',body:f});toast('Regla guardada');render()}}catch(err){toast('Error: '+err.message)}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;try{if(action==='logout'){
  try {if(!state.demo&&state.token)await api('/api/auth/logout',{method:'POST'});}
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
    if(state.demo){
      const d=db();d.venues=d.venues.filter(v=>v.id!==venueId);
      for(const key of ['requests','blocks','allows'])if(Array.isArray(d[key]))d[key]=d[key].filter(item=>item.venueId!==venueId);
      saveDemo(d);
    }else{
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
 }if(action==='filter'){state.filter=b.dataset.value;render();return}if(action==='share'){await navigator.clipboard.writeText(location.href);toast('Enlace copiado');return}if(action==='request'){
  if(b.disabled)return;
  if(!state.demo&&!(await window.tocaCustomerRequireForRequest(location.hash)))return;
  const track=state.catalog.find(t=>t.id===b.dataset.track);if(!track)return;
  const venueId=state.venueId;
  const label=`${track.title} — ${track.artist}`;
  if(!confirm(`¿Enviar o consultar el pedido de "${label}"? Solo confirmaremos el éxito cuando Spotify informe el resultado.`))return;
  if(!state.demo&&!(await window.tocaPresenceEnsure(venueId)))return;
  b.disabled=true;
  try {
    if(state.demo){demoRequest(venueId,track);toast('Pedido demo registrado');navigate(`#/success/${encodeURIComponent(venueId)}?track=${encodeURIComponent(track.id)}`)}
    else await submitSynchronizedRequest(venueId,track);
  } finally {if(b.isConnected)b.disabled=false;}
  return;
}if(['approve','reject','played'].includes(action)){const targetStatus={approve:'APPROVED',reject:'REJECTED',played:'PLAYED'}[action];if(state.demo){const d=db(),r=d.requests.find(x=>x.id===b.dataset.id);if(r)r.status=targetStatus;saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}/requests/${b.dataset.id}/${action}`,{method:'POST'});toast('Solicitud actualizada');render();return}if(action==='toggle-session'){if(state.demo){let d=db();let v=d.venues.find(x=>x.id===state.venueId);v.active=!v.active;saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}/session`,{method:'POST',body:{active:!state.detail.active}});toast('Estado de la sesión actualizado');render();return}if(action==='toggle-approval'||action==='toggle-curated'){if(state.demo){let d=db();if(action==='toggle-approval')d.settings.requireApproval=!d.settings.requireApproval;else d.curatedOnly=!d.curatedOnly;saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}/policy`,{method:'PUT',body:{requireApproval:action==='toggle-approval'?!state.detail.requireApproval:state.detail.requireApproval,curatedOnly:action==='toggle-curated'?!state.detail.curatedOnly:state.detail.curatedOnly}});render();return}if(['unblock','unallow'].includes(action)){const k=action==='unblock'?'blocks':'allows';if(state.demo){const d=db();d[k]=d[k].filter(x=>!(x.venueId===state.venueId&&x.trackId===b.dataset.id));saveDemo(d)}else await api(`/api/admin/venues/${state.venueId}/${action==='unblock'?'blocked':'allowed'}/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});render();return}if(action==='connect-spotify'){if(state.demo){toast('En modo demo Spotify está simulado. Pasá a modo API para OAuth real.');return}let res=await api(`/api/admin/venues/${state.venueId}/spotify/authorize`);location.href=res.url;return}if(action==='disconnect-spotify'){if(state.demo){toast('Cuenta Spotify simulada en modo demo.');return}await api(`/api/admin/venues/${state.venueId}/spotify/disconnect`,{method:'POST'});render();return}if(action==='load-playlists'){if(state.demo){document.getElementById('playlist-container').innerHTML='<select class="input" disabled><option>TOCÁ — Playlist de demostración</option></select>';return}let pls=await api(`/api/admin/venues/${state.venueId}/spotify/playlists`);tocaSetPlaylistSummary(state.venueId,state.spotify.playlistId,pls);document.getElementById('playlist-container').innerHTML=`<div class="row"><select id="playlist-select" class="input"><option value="">Seleccionar...</option>${pls.map(p=>`<option value="${esc(p.id)}" ${p.id===state.spotify.playlistId?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button class="btn small" data-action="select-playlist">Guardar</button></div>`;return}if(action==='load-devices'){
 if(state.demo){document.getElementById('device-container').innerHTML='<span class="pill on">Dispositivo demo simulado</span>';return}
 let dev=await api(`/api/admin/venues/${state.venueId}/spotify/devices`);
 document.getElementById('device-container').innerHTML=dev.length?`<div class="row"><select id="device-select" class="input"><option value="">Seleccionar...</option>${dev.filter(d=>!d.restricted).map(d=>`<option value="${esc(d.id)}" ${d.id===state.spotify.deviceId?'selected':''}>${esc(d.name)} (${esc(d.type)}) ${d.active?'✓':''}</option>`).join('')}</select><button class="btn small" data-action="select-device">Guardar</button></div>`:'<div class="notice">No hay dispositivos Spotify Connect activos.</div>';return
}if(action==='select-device'){
 const deviceId=document.getElementById('device-select')?.value;if(!deviceId)return;
 await api(`/api/admin/venues/${state.venueId}/spotify/device`,{method:'PUT',body:{deviceId}});
 toast('Dispositivo asociado');render();return
}
if(action==='select-playlist'){const selector=document.getElementById('playlist-select');const p=selector?.value;if(!p)return;await api(`/api/admin/venues/${state.venueId}/spotify/playlist`,{method:'PUT',body:{playlistId:p}});const chosenName=selector.options[selector.selectedIndex]?.textContent?.trim();if(chosenName)localStorage.setItem(tocaPlaylistNameKey(state.venueId,p),chosenName);toast('Playlist vinculada');render();return}if(action==='copy-join'){await navigator.clipboard.writeText(window.currentJoin||'');toast('Enlace de acceso copiado');return}if(action==='rotate-join'){if(!confirm('Los enlaces QR anteriores dejarán de aceptar nuevas solicitudes. ¿Continuar?'))return;await api(`/api/admin/venues/${state.venueId}/join-token/rotate`,{method:'POST'});render();return}if(action==='print-qr'){window.print();return}if(action==='switch-demo'||action==='switch-live'){state.demo=action==='switch-demo';localStorage.setItem('amplify-mode',state.demo?'demo':'live');clearAdminSession();navigate('#/explore');render();return}if(action==='save-api'){const url=document.getElementById('api-url')?.value.trim().replace(/\/$/,'');if(!url||!/^https?:\/\//.test(url))throw Error('Ingresá una URL http/https válida');localStorage.setItem('amplify-api',url);toast('Guardado. Recargá la aplicación para aplicarlo.');return}if(action==='reset-demo'){if(!confirm('¿Restablecer todos los datos de prueba?'))return;localStorage.removeItem('amplify-demo');toast('Demo restablecida');render();return}}catch(err){console.error(err);toast('Error: '+err.message)}finally{if(b&&b.isConnected)b.disabled=false}});
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
