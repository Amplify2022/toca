/* Standalone J + H prototype. No authentication, payment, Spotify or request APIs. */
(() => {
  'use strict';
  const STORE = 'toca:tokens-prototype:v1';
  const PACKS = [{tokens:5,price:99},{tokens:12,price:199},{tokens:30,price:399}];
  const SONGS = [
    {id:'original-prankster',title:'Original Prankster',artist:'The Offspring',duration:'3:41',art:''},
    {id:'instant-crush',title:'Instant Crush',artist:'Daft Punk',duration:'5:37',art:'alternate'},
    {id:'brillas',title:'Brillas',artist:'León Larregui',duration:'3:45',art:'warm'},
    {id:'billie-jean',title:'Billie Jean',artist:'Michael Jackson',duration:'4:54',art:'cool'}
  ];
  const PATHS = {
    ticket:'<path d="M4 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z" transform="rotate(-20 12 12)"/>',
    user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    music:'<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
    search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6"/>',
    settings:'<path d="m9 3 1-2h4l1 2 3 2 2-.2 2 3-1 2v4l1 2-2 3-2-.2-3 2-1 2h-4l-1-2-3-2-2 .2-2-3 1-2v-4L2 8l2-3 2 .2Z"/><circle cx="12" cy="12" r="3.5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    check:'<path d="m4 12 5 5L21 5"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.1"/>',
    clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 3"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 4v17M3 12h18"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
    refund:'<path d="M3 8v6h6m12 2a9 9 0 1 1-2-10"/>',
    pin:'<path d="M19 10c0 6-7 12-7 12S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.music}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const tokens = n => `${n} token${n === 1 ? '' : 's'}`;
  const song = id => SONGS.find(s=>s.id===id) || SONGS[0];
  const artwork = (item,large=false) => `<img class="${large?'detail-art':'art'} ${item.art}" src="cover.svg" alt="" width="${large?208:54}" height="${large?208:54}">`;
  const balanceOf = value => value.ledger.reduce((sum,item)=>sum+item.amount,0);
  const initial = (credits=3) => ({version:1,name:'Nacho',selectedSong:SONGS[0].id,requests:[],ledger:credits?[{id:uid(),kind:'welcome',amount:credits,at:Date.now()}]:[]});
  function restore() {
    try {
      const value=JSON.parse(sessionStorage.getItem(STORE));
      if(value?.version!==1 || typeof value.name!=='string' || !value.name.trim() || value.name.length>40 || !Array.isArray(value.ledger) || !Array.isArray(value.requests))throw Error('Invalid prototype');
      if(!value.ledger.every(e=>typeof e.id==='string' && Number.isSafeInteger(e.amount) && Math.abs(e.amount)<=30 && ['welcome','topup','request','refund'].includes(e.kind)))throw Error('Invalid movements');
      if(!value.requests.every(r=>typeof r.id==='string' && SONGS.some(s=>s.id===r.songId) && ['pending','accepted','failed'].includes(r.status)))throw Error('Invalid requests');
      const credits=balanceOf(value);
      if(!Number.isSafeInteger(credits) || credits<0 || credits>1000000)throw Error('Invalid balance');
      value.selectedSong=song(value.selectedSong).id;
      return value;
    } catch {return initial();}
  }
  let model=restore(), sheetState=null, topupTimer=null, toastTimer=null, epoch=0, returnFocus=null;
  const requestTimers=new Set();
  const view=document.getElementById('view'), sheet=document.getElementById('sheet'), sheetContent=document.getElementById('sheet-content');
  const balance=()=>balanceOf(model);
  const accepted=id=>model.requests.some(r=>r.songId===id&&r.status==='accepted');
  const pending=()=>model.requests.filter(r=>r.status==='pending').length;
  const persist=()=>{try{sessionStorage.setItem(STORE,JSON.stringify(model));}catch{/* The interactive demo can still run in memory. */}};
  function release(request,reason) {
    request.status='failed';request.reason=reason;
    const hold=model.ledger.find(e=>e.kind==='request'&&e.requestId===request.id);
    if(hold)hold.status='refunded';
    if(hold&&!model.ledger.some(e=>e.kind==='refund'&&e.requestId===request.id))model.ledger.unshift({id:uid(),kind:'refund',requestId:request.id,songId:request.songId,amount:1,at:Date.now()});
  }
  // Reloading during a simulated request cancels it and releases its reservation.
  for(const request of model.requests.filter(r=>r.status==='pending'))release(request,'La prueba se interrumpió antes de terminar.');
  persist();

  function notify(message) {
    const toast=document.getElementById('toast');clearTimeout(toastTimer);
    toast.textContent=message;toast.hidden=false;
    toastTimer=setTimeout(()=>{toast.hidden=true;toast.textContent='';},5000);
  }
  function dateLabel(entry) {
    if(entry.kind!=='welcome' && Date.now()-entry.at<60000)return 'Recién';
    if(Date.now()-entry.at<86400000)return 'Hoy';
    const date=new Date(entry.at);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-UY',{day:'2-digit',month:'short',timeZone:'America/Montevideo'}).format(date):'De prueba';
  }
  function movement(entry,full=false) {
    const title=entry.kind==='welcome'?'Bienvenida':entry.kind==='topup'?'Recarga simulada':entry.kind==='refund'?'Token devuelto':entry.status==='pending'?'Pedido en proceso':entry.status==='refunded'?'Reserva del pedido':'Pedido aceptado';
    const detail=entry.kind==='request'?(song(entry.songId).title+(entry.status==='refunded'?' · Liberada':'')):entry.kind==='refund'?'El pedido no se completó':entry.kind==='topup'?`${tokens(entry.amount)} · Precio de ejemplo UYU ${entry.price}`:'Para tus primeras canciones';
    return `<article class="movement"><span class="movement-icon">${icon(entry.kind==='welcome'?'gift':entry.kind==='refund'?'refund':entry.kind==='topup'?'ticket':entry.status==='pending'?'clock':'music')}</span><div class="movement-copy"><strong>${title}</strong>${full||entry.kind==='request'?`<small>${esc(detail)}</small>`:''}</div><time>${dateLabel(entry)}</time><span class="movement-amount ${entry.amount<0?'debit':''}">${entry.amount>0?'+':'−'}${tokens(Math.abs(entry.amount))}</span></article>`;
  }
  function reminder(item=song(model.selectedSong)) {
    return `<a class="selected-song" href="#/song/${item.id}">${artwork(item)}<span class="song-copy"><small>Tu canción elegida</small><strong>${esc(item.title)} · Bluzz Bar</strong></span>${icon('chevron')}</a>`;
  }
  function profileView() {
    return `<section class="profile-view"><div class="identity"><span class="avatar" aria-hidden="true">${esc(Array.from(model.name.trim())[0].toUpperCase())}</span><div><strong>${esc(model.name)}</strong><small>Tu perfil</small></div></div><div class="section-heading"><h1 tabindex="-1">Tus tokens</h1></div><section class="balance-card" aria-label="Saldo de tokens"><span class="wallet-icon">${icon('ticket')}</span><div><p class="balance-label">Saldo disponible</p><p class="balance-amount" data-balance>${tokens(balance())}</p></div><button class="btn primary compact" type="button" data-recharge>${icon('plus')}Recargar</button>${pending()?`<p class="reserve-note">${icon('clock')}${tokens(pending())} en reserva</p>`:''}</section><section class="movement-section"><div class="section-heading"><h2>Movimientos</h2>${model.ledger.length>5?'<a href="#/movements">Ver todo</a>':''}</div><div class="movement-list">${model.ledger.length?model.ledger.slice(0,5).map(e=>movement(e)).join(''):'<p class="empty-copy">Todavía no hay movimientos.<br>Tu próxima recarga aparecerá acá.</p>'}</div><p class="movement-help">Cada pedido aceptado usa 1 token.</p></section>${reminder()}</section>`;
  }
  function discoverView() {
    return `<section><h1 tabindex="-1">Elegí qué suena</h1><p class="page-copy">Explorá el bar de ejemplo y probá tu próximo pedido.</p><a class="venue-hero" href="#/bar" style="display:block"><img src="../../assets/venues/bar-1.webp" alt="Interior ilustrativo de un bar"><div><p class="eyebrow">BAR DE EJEMPLO</p><h2>Bluzz Bar</h2><p>Montevideo · Música y buenos encuentros</p></div></a><p class="cost-note">Este es un recorrido de prueba. No usa tu ubicación ni envía pedidos reales.</p></section>`;
  }
  function barView() {
    return `<section><a class="back-link" href="#/discover">${icon('back')}Descubrir</a><h1 tabindex="-1">Bluzz Bar</h1><p class="page-copy">Tu próxima canción, a un toque. Cada pedido aceptado usa 1 token.</p><div class="track-list">${SONGS.map(item=>`<article class="track-row"><button type="button" class="song-open" data-song="${item.id}" aria-label="Ver ${esc(item.title)}">${artwork(item)}<span class="song-copy"><strong>${esc(item.title)}</strong><span>${esc(item.artist)} · ${item.duration}</span></span></button><button type="button" class="btn ${accepted(item.id)?'':'primary'}" data-request="${item.id}" ${pending()?'disabled':''}>${accepted(item.id)?'Ver pedido':'Pedir · 1 token'}</button></article>`).join('')}</div><p class="cost-note">Playlist ilustrativa. Los pedidos se simulan para probar el saldo.</p></section>`;
  }
  function songView(item) {
    return `<section class="profile-view"><a class="back-link" href="#/bar">${icon('back')}Bluzz Bar</a>${artwork(item,true)}<h1 class="detail-title" tabindex="-1">${esc(item.title)}</h1><p class="detail-artist">${esc(item.artist)}</p><p class="detail-venue">Montevideo · ${item.duration} · Bar de ejemplo</p><section class="request-box"><h2>${accepted(item.id)?'Tu pedido está en la lista':'Tu canción sigue acá.'}</h2><p>${accepted(item.id)?'Ya la pediste en esta prueba. No se volverá a descontar otro token.':`Este pedido usa 1 token. ${balance()>=1?`Te ${balance()-1===1?'quedaría':'quedarían'} ${tokens(balance()-1)}.`:'Podés recargar y volver a esta canción.'}`}</p><button class="btn primary full" type="button" data-request="${item.id}" ${pending()?'disabled':''}>${accepted(item.id)?'Ver mi pedido':'Pedir canción · 1 token'}</button><p class="cost-note">Si el pedido falla, te devolvemos el token.</p></section></section>`;
  }
  function requestsView() {
    return `<section><h1 tabindex="-1">Mis pedidos</h1><p class="page-copy">Seguí el estado de tus canciones en esta prueba.</p>${model.requests.length?model.requests.map(request=>{const item=song(request.songId);return `<article class="request-card"><a class="selected-song" href="#/song/${item.id}">${artwork(item)}<span class="song-copy"><strong>${esc(item.title)}</strong><span>${esc(item.artist)} · Bluzz Bar</span></span>${icon('chevron')}</a><div class="status-line ${request.status}">${request.status==='pending'?'<span class="spinner" aria-hidden="true"></span>':icon(request.status==='accepted'?'check':'refund')}${request.status==='pending'?'Preparando tu pedido':request.status==='accepted'?'Agregada a la playlist de prueba':'No se pudo agregar · token devuelto'}</div><p>${request.status==='pending'?'Hay 1 token reservado mientras se confirma.':request.status==='accepted'?'Se descontó 1 token. El orden de reproducción lo gestiona el bar.':esc(request.reason||'Tu saldo volvió a estar disponible.')}</p></article>`;}).join(''):'<p class="empty-copy">Todavía no pediste canciones.<br>Elegí un tema y probá cómo funciona.</p><a class="btn primary full" href="#/bar">Elegir canción</a>'}<p class="cost-note">Los pedidos de este prototipo no se envían al bar.</p></section>`;
  }
  function route() {return location.hash.slice(1)||'/profile';}
  function render(focus=false) {
    const path=route(),isProfile=path==='/profile'||path==='/movements';
    document.getElementById('topbar').innerHTML=`<a class="brand" href="#/profile" aria-label="TOCÁ · Inicio del prototipo">TOCÁ</a>${isProfile?`<button class="icon-button" type="button" data-settings aria-label="Editar perfil de prueba">${icon('settings')}</button>`:`<button class="token-pill" type="button" data-recharge aria-label="Recargar tokens. Saldo disponible: ${tokens(balance())}">${icon('ticket')}${tokens(balance())}</button>`}`;
    if(path==='/discover')view.innerHTML=discoverView();
    else if(path==='/bar')view.innerHTML=barView();
    else if(path.startsWith('/song/'))view.innerHTML=songView(song(path.split('/')[2]));
    else if(path==='/requests')view.innerHTML=requestsView();
    else if(path==='/movements')view.innerHTML=`<section><a class="back-link" href="#/profile">${icon('back')}Tus tokens</a><h1 tabindex="-1">Tus movimientos</h1><p class="page-copy">Recargas, pedidos y devoluciones del saldo de prueba.</p><div class="movement-list">${model.ledger.length?model.ledger.map(e=>movement(e,true)).join(''):'<p class="empty-copy">Todavía no hay movimientos.</p>'}</div></section>`;
    else view.innerHTML=profileView();
    const active=path==='/requests'?'requests':isProfile?'profile':'discover';
    document.getElementById('navigation').innerHTML=[['discover','search','Descubrir'],['requests','music','Mis pedidos'],['profile','user','Perfil']].map(([id,symbol,label])=>`<a href="#/${id}" ${id===active?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></a>`).join('');
    document.title=`${active==='profile'?'Tus tokens':active==='requests'?'Mis pedidos':'Tu música'} · TOCÁ · Prototipo`;
    if(focus)view.querySelector('h1')?.focus({preventScroll:true});
  }
  function navigate(path) {
    if(route()===path)render(true);else location.hash=path;
  }
  function openSong(id) {model.selectedSong=song(id).id;persist();navigate('/song/'+model.selectedSong);}
  const closeButton=()=>`<button type="button" class="icon-button" data-close-sheet aria-label="Cerrar panel" ${topupTimer?'disabled':''}>${icon('close')}</button>`;
  const sheetHead=title=>`<div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${title}</h2>${closeButton()}</div>`;
  const sheetSong=item=>`<div class="sheet-song">${artwork(item)}<div class="song-copy"><strong>${esc(item.title)}</strong><span>${esc(item.artist)} · Bluzz Bar</span></div></div>`;
  function sheetError(message) {const output=sheetContent.querySelector('[data-sheet-error]');if(output)output.textContent=message;}
  function openPanel(value) {
    if(!sheet.open)returnFocus=document.activeElement;
    sheetState=value;paintPanel();
    if(!sheet.open)sheet.showModal();
    sheetContent.querySelector('#sheet-title')?.focus({preventScroll:true});
  }
  function closePanel(force=false) {
    if(topupTimer&&!force)return;
    if(!sheet.open)return;
    sheet.close();sheetState=null;
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    else document.querySelector('[data-recharge],.back-link,#navigation a[aria-current=page]')?.focus({preventScroll:true});
  }
  function openRecharge(songId=null) {openPanel({kind:'recharge',pack:12,songId:songId?song(songId).id:null});}
  function openRequest(id,notice='') {
    const item=song(id);model.selectedSong=item.id;persist();
    if(accepted(item.id)){closePanel();navigate('/requests');notify('Ya pediste esta canción. No se descontó otro token.');return;}
    openPanel({kind:balance()<1?'insufficient':'request',songId:item.id,notice});
  }
  function paintPanel() {
    if(!sheetState)return;
    const item=song(sheetState.songId),credits=balance();
    if(sheetState.kind==='recharge') {
      sheetContent.innerHTML=sheetHead('Recargar tokens')+`<p class="sheet-intro">Elegí un paquete.</p><fieldset class="packs"><legend class="sr-only">Paquete de tokens</legend>${PACKS.map(pack=>`<label class="pack"><input type="radio" name="pack" value="${pack.tokens}" ${pack.tokens===sheetState.pack?'checked':''}><strong>${tokens(pack.tokens)}</strong><small>UYU ${pack.price}</small></label>`).join('')}</fieldset><dl class="receipt"><div><dt>Saldo actual</dt><dd>${tokens(credits)}</dd></div><div><dt>Recarga</dt><dd class="credit" data-pack-credit>+${tokens(sheetState.pack)}</dd></div><div class="receipt-total"><dt>Nuevo saldo</dt><dd data-pack-total>${tokens(credits+sheetState.pack)}</dd></div></dl><p class="simulation-note">${icon('info')}<span>Es una simulación. No se cobrará dinero.<br>Precios de ejemplo en UYU.</span></p><p class="sheet-error" data-sheet-error role="alert"></p><div class="sheet-actions"><button type="button" class="btn primary full" data-confirm-topup>Simular recarga</button><button type="button" class="btn text full" data-close-sheet>Cancelar</button></div>`;
    } else if(sheetState.kind==='insufficient') {
      sheetContent.innerHTML=`<div class="notice-icon">${icon('ticket')}</div>`+sheetHead('Te falta 1 token')+`<p class="sheet-intro">Tu saldo es 0. Recargá para pedir esta canción.</p>${sheetSong(item)}<p class="movement-help" style="margin-bottom:23px">Tu canción te espera mientras recargás.</p><div class="sheet-actions"><button type="button" class="btn primary full" data-refill-for-song="${item.id}">Recargar tokens</button><button type="button" class="btn text full" data-close-sheet>Volver</button></div>`;
    } else if(sheetState.kind==='request') {
      sheetContent.innerHTML=sheetHead('Confirmá tu pedido')+(sheetState.notice?`<p class="sheet-success" role="status">${icon('check')}${esc(sheetState.notice)}</p>`:'')+sheetSong(item)+`<dl class="receipt"><div><dt>Saldo disponible</dt><dd>${tokens(credits)}</dd></div><div><dt>Este pedido usa</dt><dd>1 token</dd></div><div class="receipt-total"><dt>Te ${credits-1===1?'quedaría':'quedarían'}</dt><dd>${tokens(Math.max(0,credits-1))}</dd></div></dl><p class="simulation-note">${icon('info')}Si el pedido falla, te devolvemos el token.</p><p class="sheet-error" data-sheet-error role="alert"></p><div class="sheet-actions"><button type="button" class="btn primary full" data-confirm-request="${item.id}">Confirmar pedido · 1 token</button><button type="button" class="btn text full" data-close-sheet>Volver</button></div>`;
    } else {
      sheetContent.innerHTML=sheetHead('Tu perfil')+`<form id="profile-form"><label class="field">Nombre<input name="name" required minlength="2" maxlength="40" autocomplete="off" value="${esc(model.name)}"></label><p class="simulation-note">${icon('info')}Este nombre solo se usa en el prototipo.</p><div class="sheet-actions"><button type="submit" class="btn primary full">Guardar nombre</button><button type="button" class="btn text full" data-close-sheet>Cancelar</button></div></form>`;
    }
  }
  function recharge() {
    if(topupTimer||sheetState?.kind!=='recharge')return;
    const pack=PACKS.find(p=>p.tokens===sheetState.pack);if(!pack)return;
    const currentEpoch=epoch,source=sheetState.songId,confirmedPanel=sheetState;
    sheetContent.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    sheetContent.querySelector('[data-confirm-topup]').textContent='Simulando recarga…';sheet.setAttribute('aria-busy','true');
    topupTimer=setTimeout(()=>{
      topupTimer=null;sheet.removeAttribute('aria-busy');if(currentEpoch!==epoch)return;
      model.ledger.unshift({id:uid(),kind:'topup',amount:pack.tokens,price:pack.price,at:Date.now()});persist();render();
      const stillHere=sheet.open&&sheetState===confirmedPanel;
      if(source&&stillHere)openRequest(source,`Recarga lista · +${tokens(pack.tokens)}`);
      else{if(stillHere)closePanel();notify(`Recarga simulada lista · +${tokens(pack.tokens)}`);}
    },650);
  }
  function requestSong(id) {
    const item=song(id);
    if(accepted(item.id)){closePanel();navigate('/requests');notify('Este tema ya está pedido. No se descontó otro token.');return;}
    if(pending()){sheetError('Esperá a que termine el pedido anterior.');return;}
    if(balance()<1){openRequest(item.id);return;}
    const failure=document.getElementById('fail-next').checked;document.getElementById('fail-next').checked=false;
    const request={id:uid(),songId:item.id,status:'pending',at:Date.now()};
    model.requests.unshift(request);model.ledger.unshift({id:uid(),kind:'request',requestId:request.id,songId:item.id,status:'pending',amount:-1,at:Date.now()});persist();closePanel();navigate('/requests');render();
    const timer=setTimeout(()=>{
      requestTimers.delete(timer);
      const current=model.requests.find(r=>r.id===request.id);if(!current||current.status!=='pending')return;
      if(failure)release(current,'Simulamos un error para comprobar la devolución del token.');
      else{current.status='accepted';const entry=model.ledger.find(e=>e.kind==='request'&&e.requestId===current.id);if(entry)entry.status='accepted';}
      persist();render();notify(failure?'El pedido falló. Tu token fue devuelto.':'Pedido de prueba aceptado · 1 token');
    },1000);requestTimers.add(timer);
  }
  function reset(credits) {
    epoch++;clearTimeout(topupTimer);topupTimer=null;sheet.removeAttribute('aria-busy');
    for(const timer of requestTimers)clearTimeout(timer);requestTimers.clear();
    closePanel(true);model=initial(credits);persist();document.getElementById('fail-next').checked=false;
    document.querySelector('.prototype-tools').open=false;navigate('/profile');render();notify(credits?'Prueba reiniciada con 3 tokens.':'Escenario de prueba: saldo en cero.');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-scenario'))return reset(button.dataset.scenario==='empty'?0:3);
    if(button.hasAttribute('data-close-sheet'))return closePanel();
    if(button.hasAttribute('data-recharge'))return openRecharge();
    if(button.hasAttribute('data-settings'))return openPanel({kind:'settings'});
    if(button.hasAttribute('data-song'))return openSong(button.dataset.song);
    if(button.hasAttribute('data-request'))return openRequest(button.dataset.request);
    if(button.hasAttribute('data-refill-for-song'))return openRecharge(button.dataset.refillForSong);
    if(button.hasAttribute('data-confirm-topup'))return recharge();
    if(button.hasAttribute('data-confirm-request'))return requestSong(button.dataset.confirmRequest);
  });
  sheetContent.addEventListener('change',event=>{
    if(!event.target.matches('input[name="pack"]')||sheetState?.kind!=='recharge'||topupTimer)return;
    const value=Number(event.target.value);if(!PACKS.some(p=>p.tokens===value))return;
    sheetState.pack=value;sheetContent.querySelector('[data-pack-credit]').textContent='+'+tokens(value);sheetContent.querySelector('[data-pack-total]').textContent=tokens(balance()+value);
  });
  sheetContent.addEventListener('submit',event=>{
    if(event.target.id!=='profile-form')return;event.preventDefault();
    const name=event.target.elements.name.value.trim();if(name.length<2||name.length>40)return;
    model.name=name;persist();render();closePanel();notify('Nombre de prueba actualizado.');
  });
  sheet.addEventListener('cancel',event=>{event.preventDefault();closePanel();});
  sheet.addEventListener('click',event=>{
    if(event.target!==sheet)return;
    const rect=sheet.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closePanel();
  });
  window.addEventListener('hashchange',()=>{closePanel(true);render(true);window.scrollTo({top:0,behavior:'instant'});});
  if(!location.hash)history.replaceState(null,'','#/profile');
  render();
})();
