/* Public map selection: one responsive sheet, real venue photos and playback. */
(() => {
  'use strict';
  let current=null;
  const mobile=()=>matchMedia('(max-width:760px)').matches;
  const valid=ctx=>ctx===current&&ctx.parent.isConnected&&route().path==='/explore';
  const icons={close:'<path d="m6 6 12 12M18 6 6 18"/>',instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r=".7" fill="currentColor" stroke="none"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>'};
  const icon=name=>icons[name]?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`:iconSvg(name,20);
  const unavailable='Por el momento no podés pedir canciones en este bar.';
  function coverUrl(value){
    if(typeof value!=='string'||!value.trim())return '';
    try{const url=new URL(value,location.origin);return !url.username&&!url.password&&(url.protocol==='https:'||(url.protocol==='http:'&&url.origin===location.origin))?url.href:'';}catch(_){return '';}
  }
  function center(ctx){
    if(!ctx.map||!valid(ctx))return;
    const point=ctx.marker?.getLatLng();
    if(!point)return;
    ctx.map.invalidateSize({pan:false});
    const size=ctx.map.getSize(),visible=size.y-ctx.root.getBoundingClientRect().height;
    const panelWidth=ctx.root.getBoundingClientRect().width+ctx.root.offsetLeft;
    const offset=mobile()?L.point(0,(visible-size.y)/2):L.point(panelWidth/2,0);
    const target=ctx.map.unproject(ctx.map.project(point,ctx.map.getZoom()).subtract(offset),ctx.map.getZoom());
    ctx.map.setView(target,ctx.map.getZoom(),{animate:false});
  }
  function expanded(ctx,value){ctx.root.classList.toggle('is-expanded',value);ctx.parent.classList.toggle('place-expanded',value);const b=ctx.root.querySelector('[data-place-expand]');b.setAttribute('aria-expanded',String(value));b.setAttribute('aria-label',value?'Reducir ficha del bar':'Ampliar ficha del bar');if(matchMedia('(prefers-reduced-motion:reduce)').matches)center(ctx);}
  function close(restore=true,focus=false){
    const ctx=current;if(!ctx)return;current=null;clearTimeout(ctx.timer);ctx.abort.abort();ctx.map?.off('unload',ctx.unload);
    const dialog=ctx.root.querySelector('dialog');if(dialog?.open)dialog.close();ctx.root.remove();ctx.parent.classList.remove('toca-place-map','place-expanded');
    const marker=ctx.marker?.getElement();marker?.classList.remove('toca-place-selected');marker?.setAttribute('aria-expanded','false');
    if(restore&&ctx.map&&ctx.parent.isConnected){requestAnimationFrame(()=>{if(!current&&ctx.parent.isConnected&&state.map===ctx.map){ctx.map.invalidateSize({pan:false});ctx.map.setView(ctx.before,ctx.map.getZoom(),{animate:false});}});}
    const opener=ctx.opener||marker;
    if(focus&&opener?.isConnected)opener.focus({preventScroll:true});
  }
  function markup(v){
    const username=String(v.instagramHandle||'').trim().replace(/^@/,'');
    const instagram=/^[A-Za-z0-9._]{1,30}$/.test(username)?`<div class="place-social"><a class="place-social-handle" href="https://www.instagram.com/${encodeURIComponent(username)}/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${esc(v.name)} (se abre en otra pestaña)">${icon('instagram')}<span>@${esc(username)}</span></a></div>`:'';
    const genres=String(v.genre||'').split(/[,•·]/).map(s=>s.trim()).filter(Boolean).join(' · ');
    return `<button type="button" class="place-handle" data-place-expand aria-expanded="false" aria-label="Ampliar ficha del bar"><span></span></button><div class="place-scroll">
      <header class="place-heading"><div><span class="place-status ${v.active?'':'inactive'}"><i></i><span>${v.active?'Pedidos abiertos':'Pedidos cerrados'}</span></span><h2 id="toca-place-name">${esc(v.name||'Bar')}</h2>${genres?`<p>${esc(genres)}</p>`:''}</div><div class="place-heading-actions">${favButton(v)}<button type="button" class="place-close" data-place-close aria-label="Cerrar ficha del bar">${icon('close')}</button></div></header>
      <section class="place-request-block is-unavailable" aria-label="Qué suena y cómo pedir tu canción">
        <div class="place-music" aria-live="polite"><p>Consultando canción actual…</p></div>
        <div class="place-request-controls"></div>
      </section>
      <div class="place-photos" aria-label="Fotos del bar"></div>
      ${v.address||v.city||instagram?`<div class="place-details ${instagram?'has-instagram':''}">${v.address||v.city?`<div class="place-address">${icon('pin')}<div>${v.address?`<strong>${esc(v.address)}</strong>`:''}${v.city?`<span>${esc(v.city)}</span>`:''}</div></div>`:''}${instagram}</div>`:''}
      ${String(v.description||'').trim()?`<section class="place-about"><h3>Un poco del bar</h3><p>${esc(v.description)}</p></section>`:''}
      <a class="place-full-details" href="#/venue/${encodeURIComponent(v.id)}">Ver ficha completa</a>
      </div><dialog class="place-photo-dialog" aria-label="Foto del bar"><button type="button" data-place-photo-close aria-label="Cerrar foto">${icon('close')}</button><img alt=""></dialog>`;
  }
  function photos(ctx){
    const v=ctx.venue,paths=[v.coverPhotoUrl,...(Array.isArray(v.photos)?v.photos.map(p=>p?.url):[])];
    const urls=[...new Set(paths.filter(p=>typeof p==='string'&&p.startsWith('/api/venues/')).map(mediaUrl))];
    if(!urls.length&&false)urls.push(photoFor(v));
    const gallery=ctx.root.querySelector('.place-photos');
    function count(){gallery.querySelector('[data-place-photo-count]')?.remove();if(gallery.children.length){const badge=document.createElement('span');badge.dataset.placePhotoCount='';badge.innerHTML=icon('photo')+`${gallery.children.length} ${gallery.children.length===1?'foto':'fotos'}`;gallery.firstElementChild.append(badge);}else{gallery.innerHTML=`<div class="place-no-photo">${icon('photo')}<span>Este bar todavía no tiene fotos.</span></div>`;}}
    urls.forEach((url,index)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Abrir foto ${index+1} de ${v.name||'este bar'}`);const image=document.createElement('img');image.src=url;image.alt=(`Foto ${index+1} de ${v.name||'este bar'}`);image.loading=index?'lazy':'eager';image.onerror=()=>{button.remove();count();};button.append(image);button.onclick=()=>{const dialog=ctx.root.querySelector('dialog'),full=dialog.querySelector('img');full.src=image.src;full.alt=image.alt;dialog.showModal();};gallery.append(button);});count();
  }
  function music(ctx,snapshot,error=false){
    const box=ctx.root.querySelector('.place-music'),block=ctx.root.querySelector('.place-request-block'),controls=ctx.root.querySelector('.place-request-controls');
    const playing=!error&&snapshot?.isPlaying===true&&typeof snapshot.now?.title==='string'&&!!snapshot.now.title.trim();
    const requestsOpen=snapshot?.active===true;
    const canRequest=playing&&requestsOpen;
    if(!error&&ctx.requestsOpen!==requestsOpen){
      ctx.requestsOpen=requestsOpen;
      const badge=ctx.root.querySelector('.place-status');
      badge.classList.toggle('inactive',!requestsOpen);
      badge.querySelector('span').textContent=requestsOpen?'Pedidos abiertos':'Pedidos cerrados';
    }
    if(canRequest&&!controls.childElementCount)controls.innerHTML=`<p class="place-request-help" id="toca-place-request-help">Elegí tu tema y sumalo a la playlist del bar.</p><div class="place-actions"><a class="place-primary" href="#/request/${encodeURIComponent(ctx.venue.id)}" aria-describedby="toca-place-request-help">${icon('music')}Pedir una canción</a></div>`;
    if(!canRequest&&controls.childElementCount)controls.replaceChildren();
    const cover=playing?coverUrl(snapshot.now.imageUrl):'';
    const signature=playing?JSON.stringify([snapshot.now.id||'',snapshot.now.title,snapshot.now.artist||'',cover]):'unavailable';
    // Position changes every second. Keep the existing cover, focused link and
    // equalizer animation until the actual song or availability changes.
    const retryCover=cover&&ctx.failedCover===cover&&performance.now()>=ctx.coverRetryAt;
    if(ctx.musicSignature===signature&&!retryCover)return;
    ctx.musicSignature=signature;ctx.failedCover=null;
    block.classList.toggle('is-unavailable',!playing);
    if(!playing){box.innerHTML=`<p>${unavailable}</p>`;return;}
    box.innerHTML=`<div class="place-song-cover">${icon('music')}${cover?`<img src="${esc(cover)}" alt="Portada de ${esc(snapshot.now.title)}" decoding="async" referrerpolicy="no-referrer">`:''}</div><div class="place-song-copy"><span>SUENA AHORA</span><strong>${esc(snapshot.now.title)}</strong><small>${esc(snapshot.now.artist||'')}</small></div><div class="place-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
    const image=box.querySelector('.place-song-cover img');if(image)image.onerror=()=>{image.remove();if(valid(ctx)&&ctx.musicSignature===signature){ctx.failedCover=cover;ctx.coverRetryAt=performance.now()+30000;}};
  }
  async function refresh(ctx){
    if(!valid(ctx)||ctx.busy||document.hidden)return;ctx.busy=true;clearTimeout(ctx.timer);
    let delay=1000;
    try{const result=(await api(`/api/venues/${encodeURIComponent(ctx.venue.id)}/playback`,{signal:ctx.abort.signal,cache:'no-store'}));if(valid(ctx)){ctx.failures=0;music(ctx,result);}}
    catch(error){if(valid(ctx)&&error.name!=='AbortError'){ctx.failures=(ctx.failures||0)+1;delay=error.status===429?30000:Math.min(15000,1000*2**Math.min(ctx.failures-1,4));music(ctx,null,true);}}
    finally{ctx.busy=false;if(valid(ctx))ctx.timer=setTimeout(()=>void refresh(ctx),delay);}
  }
  window.tocaOpenMapVenue=(venue,marker=null,map=null,opener=null)=>{
    const parent=map?.getContainer()?.closest('.toca-map-art')||document.querySelector('.toca-primary-map .toca-map-art');if(!parent)return;
    const before=map&&(current?.map===map?current.before:map.getCenter());close(false);
    const root=document.createElement('section');root.className='toca-place-panel';root.setAttribute('role','region');root.setAttribute('aria-labelledby','toca-place-name');root.innerHTML=markup(venue);
    const ctx={venue,marker,map,before,parent,root,opener,abort:new AbortController(),busy:false};current=ctx;
    parent.classList.add('toca-place-map');parent.append(root);photos(ctx);
    if(opener?.matches('[data-discovery-venue]'))parent.scrollIntoView({block:'start'});
    root.querySelector('[data-place-close]').focus({preventScroll:true});
    const selected=marker?.getElement();selected?.classList.add('toca-place-selected');selected?.setAttribute('aria-expanded','true');
    ctx.unload=()=>{if(current===ctx)close(false);};map?.on('unload',ctx.unload);
    requestAnimationFrame(()=>center(ctx));void refresh(ctx);
    let start=null,dragged=false;const handle=root.querySelector('[data-place-expand]');
    handle.onclick=()=>{if(dragged){dragged=false;return;}expanded(ctx,!root.classList.contains('is-expanded'));};
    handle.onpointerdown=e=>{start=e.clientY;dragged=false;handle.setPointerCapture(e.pointerId);};handle.onpointerup=e=>{if(start===null)return;const delta=e.clientY-start;start=null;if(Math.abs(delta)>25){dragged=true;expanded(ctx,delta<0);e.preventDefault();}};handle.onpointercancel=()=>{start=null;dragged=false;};
    root.addEventListener('transitionend',event=>{if(event.target===root&&event.propertyName==='height')center(ctx);});
    root.querySelector('[data-place-close]').onclick=()=>close(true,true);
    const dialog=root.querySelector('dialog');root.querySelector('[data-place-photo-close]').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest('.toca-explore [data-discovery-venue], .toca-explore .toca-map-pin');
    if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const id=link.dataset.discoveryVenue||decodeURIComponent(link.hash.split('/venue/')[1]||'');
    const venue=state.venues.find(v=>v.id===id);
    if(!venue)return;
    event.preventDefault();
    const map=state.map;
    let marker=null;
    map?.eachLayer(layer=>{if(layer.options?.tocaVenueId===id)marker=layer;});
    window.tocaOpenMapVenue(venue,marker,map,link);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&current&&!current.root.querySelector('dialog').open)close(true,true);});
  window.addEventListener('hashchange',()=>close(false));window.addEventListener('pagehide',()=>close(false));
  window.addEventListener('resize',()=>{if(current&&valid(current))center(current);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current)void refresh(current);});
})();
