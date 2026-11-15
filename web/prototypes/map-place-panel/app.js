/* Standalone layout preview. Venue/music data are illustrative; no app API. */
(() => {
  'use strict';
  const shapes={music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',user:'<circle cx="12" cy="8" r="3.5"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r=".7" fill="currentColor" stroke="none"/>',locate:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.music}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  const venues=[
    {id:'bluzz',name:'Bluzz Bar',genres:'Rock · Cumbia',address:'Canelones 760',instagram:'bluzzbar',coords:[-34.90728,-56.20164],photos:[1,3,2],song:'Original Prankster',artist:'The Offspring, Redman',description:'Un clásico de Montevideo para encontrarte con amigos, escuchar buena música y elegir lo que sigue.'},
    {id:'ronda',name:'La Ronda',genres:'Indie · Rock',address:'Ciudadela 1182',instagram:null,coords:[-34.9046,-56.199],photos:[2,1,3],song:'Midnight City',artist:'M83',description:'Un punto de encuentro para compartir una charla, un trago y la música que más te gusta.'},
    {id:'jazz',name:'Vinilo Social',genres:'Jazz · Soul',address:'Ciudad Vieja',instagram:null,coords:[-34.9022,-56.2072],photos:[3,2,1],song:'Feeling Good',artist:'Nina Simone',description:'Una selección de jazz y soul para acompañar la noche, con canciones elegidas entre todos.'},
    {id:'club',name:'El Club',genres:'Rock · Alternativo',address:'Centro',instagram:null,coords:[-34.9098,-56.1915],photos:[4,1,5],song:'Do I Wanna Know?',artist:'Arctic Monkeys',description:'Clásicos y canciones nuevas en una playlist que se arma con quienes están en el bar.'}
  ];
  const panel=document.querySelector('#place-panel'),explore=document.querySelector('.explore'),handle=document.querySelector('.sheet-handle'),empty=document.querySelector('#empty-selection');
  const mobile=()=>matchMedia('(max-width:760px)').matches;
  let selected=venues[0],map=null,markers=[],filter='all';
  function setExpanded(value){panel.classList.toggle('expanded',value);handle.setAttribute('aria-expanded',String(value));handle.setAttribute('aria-label',value?'Reducir ficha del bar':'Ampliar ficha del bar');explore.classList.toggle('panel-expanded',value);}
  function focusVenue(venue,animate=true){
    if(!map)return;
    const size=map.getSize(),visible=size.y-Math.min(innerHeight*.52,455);
    const offset=mobile()?L.point(0,Math.max(145,visible*.72)-size.y/2):L.point(160,30),target=map.unproject(map.project(venue.coords,map.getZoom()).subtract(offset),map.getZoom());
    map.setView(target,map.getZoom(),{animate,duration:.35});
  }
  function select(venue,animate=true){
    selected=venue;panel.hidden=false;empty.hidden=true;panel.classList.remove('profile-mode');explore.classList.remove('panel-closed');setExpanded(false);
    for(const [selector,text] of [['#place-name',venue.name],['#place-genres',venue.genres],['#address',venue.address],['#song-title',venue.song],['#song-artist',venue.artist],['#description',venue.description]])document.querySelector(selector).textContent=text;
    const instagram=document.querySelector('#instagram');instagram.hidden=!venue.instagram;if(venue.instagram)instagram.href=`https://www.instagram.com/${venue.instagram}/`;
    const photos=document.querySelector('#photos');photos.replaceChildren();venue.photos.forEach((number,index)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Abrir foto ${index+1} de ${venue.name}`);const img=document.createElement('img');img.src=`/assets/venues/bar-${number}.webp`;img.alt=`Foto de ejemplo del bar ${index+1}`;button.append(img);if(!index){const count=document.createElement('span');count.innerHTML=icon('photo')+'3 fotos';button.append(count);}button.onclick=()=>{const dialog=document.querySelector('#photo-dialog');dialog.querySelector('img').src=img.src;dialog.querySelector('img').alt=img.alt;dialog.showModal();};photos.append(button);});
    panel.querySelector('.panel-scroll').scrollTop=0;photos.scrollLeft=0;
    markers.forEach(({venue:v,marker})=>{const element=marker.getElement();element?.classList.toggle('selected',v.id===venue.id);element?.setAttribute('aria-pressed',String(v.id===venue.id));});
    focusVenue(venue,animate);
  }
  function closePanel(){panel.hidden=true;empty.hidden=false;explore.classList.add('panel-closed');setExpanded(false);markers.forEach(({marker})=>{marker.getElement()?.classList.remove('selected');marker.getElement()?.setAttribute('aria-pressed','false');});}
  if(window.L){
    map=L.map('map',{zoomControl:false,scrollWheelZoom:true,attributionControl:true}).setView(selected.coords,15);
    L.imageOverlay('map.svg',[[-34.921,-56.225],[-34.89,-56.175]],{attribution:'Mapa ilustrativo · Vista previa'}).addTo(map);
    markers=venues.map(venue=>{const marker=L.marker(venue.coords,{title:venue.name,icon:L.divIcon({className:'place-marker',html:`<div class="marker-body">${icon('music')}</div><span class="marker-label">${venue.name}</span>`,iconSize:[40,40],iconAnchor:[20,20]})}).addTo(map);marker.on('click',()=>select(venue));const element=marker.getElement();element.setAttribute('role','button');element.setAttribute('aria-label',`Ver detalles de ${venue.name}`);element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(venue);}};return {venue,marker};});
  }
  function applyFilters(){const term=document.querySelector('#search').value.trim().toLocaleLowerCase('es');markers.forEach(({venue,marker})=>{const shown=(filter==='all'||venue.genres.includes(filter))&&(!term||`${venue.name} ${venue.genres} ${venue.address}`.toLocaleLowerCase('es').includes(term));if(shown&&!map.hasLayer(marker))marker.addTo(map);else if(!shown&&map.hasLayer(marker))map.removeLayer(marker);});}
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});applyFilters();});
  document.querySelector('#search').oninput=applyFilters;
  document.querySelector('.close-panel').onclick=closePanel;
  let dragged=false;
  handle.onclick=()=>{if(dragged){dragged=false;return;}setExpanded(!panel.classList.contains('expanded'));};
  let start=null;handle.addEventListener('pointerdown',event=>{start=event.clientY;dragged=false;handle.setPointerCapture(event.pointerId);});handle.addEventListener('pointerup',event=>{if(start===null)return;const delta=event.clientY-start;if(Math.abs(delta)>25){dragged=true;setExpanded(delta<0);event.preventDefault();}start=null;});handle.addEventListener('pointercancel',()=>{start=null;dragged=false;});
  document.querySelector('#open-bar').onclick=()=>{panel.classList.add('profile-mode');if(mobile())setExpanded(true);};
  document.querySelector('#zoom-in').onclick=()=>map?.zoomIn();document.querySelector('#zoom-out').onclick=()=>map?.zoomOut();document.querySelector('#locate').onclick=()=>{if(panel.hidden)select(selected);else focusVenue(selected);};
  document.querySelector('#close-photo').onclick=()=>document.querySelector('#photo-dialog').close();document.querySelector('#photo-dialog').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.close();};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();document.querySelector('#search').focus();}else if(event.key==='Escape'&&!document.querySelector('#photo-dialog').open)closePanel();});
  window.addEventListener('resize',()=>{map?.invalidateSize();focusVenue(selected,false);});
  select(selected,false);
})();
