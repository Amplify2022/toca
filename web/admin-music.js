/* Admin-only player and playlist editor. OAuth refresh tokens stay on the server. */
(() => {
 let current=null,sdkPromise=null,browser=null;
 const musicPath=id=>`/api/admin/venues/${encodeURIComponent(id)}/music`;
 const time=n=>{const seconds=Math.floor(Math.max(0,Number(n)||0)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`};
 const key=id=>'toca-music-edit:'+id;
 const live=ctx=>!!ctx&&ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId;
 const notify=(ctx,message,transient=false)=>{
  if(!live(ctx))return;
  clearTimeout(ctx.noticeTimer);ctx.noticeVersion=(ctx.noticeVersion||0)+1;
  ctx.root.querySelector('[data-studio-status]').textContent=message;window.tocaCabinaNotify?.(ctx,message);
  if(transient){const version=ctx.noticeVersion;ctx.noticeTimer=setTimeout(()=>{if(live(ctx)&&ctx.noticeVersion===version&&ctx.root.querySelector('[data-studio-status]').textContent===message){ctx.root.querySelector('[data-studio-status]').textContent='';window.tocaCabinaNotify?.(ctx,'')}},5000);}
 };
 const dispose=ctx=>{if(ctx){clearInterval(ctx.timer);clearInterval(ctx.clockTimer);clearTimeout(ctx.noticeTimer);clearTimeout(ctx.feedbackTimer)}};

 function stopBrowser(){if(browser){browser.player.disconnect();browser=null}}
 window.tocaMusicDisconnect=()=>{window.tocaCabinaReset?.();stopBrowser();if(current){dispose(current);current=null}};
 window.tocaAdminMusicMarkup=(venue,settings,options)=>window.tocaCabinaMarkup(venue,settings,options);
 function updateButtons(ctx){
  if(!live(ctx))return;
  ctx.root.querySelectorAll('[data-studio-edit],[data-studio-create],[data-studio-rename]').forEach(b=>{b.disabled=b.hidden||state.demo||!ctx.settings.playlistWriteEnabled||ctx.busy||!!ctx.operation||!!sessionStorage.getItem(key(ctx.id))||(!ctx.playlist&&!b.hasAttribute('data-studio-create'))});
  window.tocaCabinaUpdateButtons?.(ctx);
 }
 function renderPlaylist(ctx,data){
  if(!live(ctx))return;
  const incoming=data.playlist;ctx.operation=data.operation;if(data.error)notify(ctx,data.error);
  if(!data.error){if(ctx.playlist?.id!==incoming?.id)ctx.retiredSnapshots=new Set();if(!incoming||incoming.id!==ctx.playlist?.id||!ctx.retiredSnapshots?.has(incoming.snapshot))ctx.playlist=incoming;}
  const root=ctx.root,playlist=ctx.playlist;
  root.querySelector('[data-studio-playlist-name]').textContent=playlist?playlist.name:'Elegí tu playlist';
  if(!root.querySelector('[data-cabina-dialog="name"][open]'))root.querySelector('[data-studio-name]').value=playlist?.name||'';
  root.querySelector('[data-studio-tracks]').innerHTML=window.tocaCabinaTracks(ctx);
  window.tocaCabinaPlaylistUpdated?.(ctx);
  const saved=sessionStorage.getItem(key(ctx.id));
  root.querySelector('[data-studio-operation]').innerHTML=ctx.operation?`<div class="cabina-notice"><div><strong>Cambio pendiente de verificación.</strong><p>${esc(ctx.operation.message||'Consultá el resultado antes de volver a editar.')}</p></div><button type="button" class="btn small" data-studio-reconcile>Consultar resultado</button><button type="button" class="btn small" data-studio-accept>Aceptar estado actual</button></div>`:saved?'<div class="cabina-notice"><p>No se confirmó el último cambio. Consultá su resultado para continuar.</p><button type="button" class="btn small" data-studio-recover>Consultar resultado</button></div>':'';
  updateButtons(ctx);
 }
 async function reload(ctx){const generation=(ctx.playlistGeneration||0)+1;ctx.playlistGeneration=generation;const data=await api(musicPath(ctx.id)+'/playlist');if(!live(ctx)||generation!==ctx.playlistGeneration)return ctx.playlist;renderPlaylist(ctx,data);ctx.refreshedAt=Date.now();if(data.error)throw Error(data.error);return ctx.playlist}
 async function refreshActivity(ctx){
  if(!live(ctx)||state.demo)return;
  const rows=await fetchRequests(ctx.id);if(!live(ctx))return;
  const fingerprint=JSON.stringify(rows),changed=fingerprint!==ctx.activityFingerprint;ctx.activityFingerprint=fingerprint;
  state.requests=rows;window.tocaCabinaActivityUpdated?.(ctx,rows);return changed;
 }
 async function loadDevices(ctx){
  const output=ctx.root.querySelector('[data-cabina-devices-list]');output.textContent='Buscando dispositivos…';
  const devices=await api(`/api/admin/venues/${ctx.id}/spotify/devices`);if(!live(ctx))return;
  output.innerHTML=devices.filter(d=>!d.restricted).map(d=>`<button type="button" class="btn cabina-device-option" data-cabina-select-device="${esc(d.id)}"><span><strong>${esc(d.name)}</strong><small>${esc(d.type)}${d.active?' · Activo':''}</small></span>${iconSvg('arrow',15)}</button>`).join('')||'<p class="cabina-help">No hay dispositivos disponibles. Podés usar el audio de este navegador.</p>';
 }
 async function selectDevice(ctx,button){
  button.disabled=true;
  await api(`/api/admin/venues/${ctx.id}/spotify/device`,{method:'PUT',body:{deviceId:button.dataset.cabinaSelectDevice}});
  if(!live(ctx))return;
  ctx.settings.deviceId=button.dataset.cabinaSelectDevice;
  await api(musicPath(ctx.id)+'/player',{method:'POST',body:{action:'transfer'}});
  notify(ctx,'Salida de audio seleccionada.');await poll(ctx);
 }
 async function loadPlaylists(ctx){
  if(!live(ctx)||state.demo)return;
  const output=ctx.root.querySelector('[data-cabina-playlists]');output.textContent='Buscando playlists…';
  const lists=await api(`/api/admin/venues/${ctx.id}/spotify/playlists`);if(!live(ctx))return;
  output.innerHTML=lists.length?`<label class="cabina-field">Playlist<select class="input" data-cabina-playlist-select><option value="">Seleccionar…</option>${lists.map(p=>`<option value="${esc(p.id)}" ${p.id===ctx.settings.playlistId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button type="button" class="btn primary" data-cabina-select-playlist data-cabina-selection>Usar esta playlist</button>`:'<p class="cabina-help">No encontramos playlists. Podés crear una desde el menú de playlist.</p>';
  updateButtons(ctx);
 }
 async function selectPlaylist(ctx){
  if(ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id)))return;
  const selector=ctx.root.querySelector('[data-cabina-playlist-select]'),playlistId=selector?.value;
  if(!playlistId)throw Error('Elegí una playlist');
  ctx.busy=true;updateButtons(ctx);
  try{
   await api(`/api/admin/venues/${ctx.id}/spotify/playlist`,{method:'PUT',body:{playlistId}});if(!live(ctx))return;
   ctx.settings.playlistId=playlistId;state.spotify.playlistId=playlistId;
   localStorage.setItem(tocaPlaylistNameKey(ctx.id,playlistId),selector.selectedOptions[0].textContent);
   await reload(ctx);window.tocaCabinaClose?.(ctx);notify(ctx,'Playlist seleccionada. La reproducción actual sigue igual.');
  }finally{ctx.busy=false;updateButtons(ctx)}
 }
 document.addEventListener('cabina-playlists',()=>{const ctx=current;if(live(ctx))void loadPlaylists(ctx).catch(error=>notify(ctx,error.message));});
 function renderTime(ctx){
  if(!live(ctx)||!ctx.playback)return;
  const progress=window.tocaMusicPlayback.position(ctx),root=ctx.root,track=ctx.playback.now;
  root.querySelector('[data-player-elapsed]').textContent=time(progress);root.querySelector('[data-player-duration]').textContent=time(track?.durationMs);
  const seek=root.querySelector('[data-player-seek]');if(!ctx.seeking){seek.max=track?.durationMs||1;seek.value=progress;}
 }
 function renderPlayback(ctx){
  if(!live(ctx)||!ctx.playback)return;
  const root=ctx.root,data=ctx.playback,track=data.now;
  root.querySelector('[data-player-title]').textContent=track?.title||'Sin reproducción activa';
  root.querySelector('[data-player-artist]').textContent=track?.artist||'Seleccioná el audio y reproducí tu playlist';
  const volume=root.querySelector('[data-player-volume]');if(document.activeElement!==volume&&data.device)volume.value=data.device.volume;
  const shuffle=root.querySelector('[data-player-shuffle]');if(document.activeElement!==shuffle)shuffle.checked=!!data.shuffle;
  const repeat=root.querySelector('[data-player-repeat]');if(document.activeElement!==repeat)repeat.value=data.repeat||'off';
  renderTime(ctx);window.tocaCabinaPlaybackUpdated?.(ctx);
 }
 function browserOutput(ctx){return browser?.id===ctx.id&&browser.session===ctx.session&&browser.deviceId&&ctx.settings.deviceId===browser.deviceId&&(!ctx.playback?.device?.id||ctx.playback.device.id===browser.deviceId);}
 async function readBrowser(ctx){
  if(!live(ctx)||!browserOutput(ctx)||!browser.player.getCurrentState||ctx.readingSdk)return;
  ctx.readingSdk=true;const player=browser.player;
  try{const data=await player.getCurrentState();if(live(ctx)&&browser?.player===player&&browserOutput(ctx))window.tocaMusicPlayback.sdk(ctx,data,{id:browser.deviceId,name:'TOCÁ · '+(state.detail?.name||'Mi Bar')});}catch{}finally{ctx.readingSdk=false}
 }
 async function poll(ctx,force=false){
  if(!live(ctx)){dispose(ctx);return}
  if(document.hidden||(!force&&(ctx.polling||ctx.controlling)))return;
  const generation=(ctx.playbackGeneration||0)+1;ctx.playbackGeneration=generation;ctx.polling=true;
  try{
   const data=await api(musicPath(ctx.id)+'/player');if(!live(ctx)||generation!==ctx.playbackGeneration)return;
   if(!ctx.pendingPlayback&&browserOutput(ctx)&&ctx.sdkSampledAt&&performance.now()-ctx.sdkSampledAt<2000&&data.device?.id===browser.deviceId){ctx.playback={...ctx.playback,device:data.device,repeat:data.repeat,shuffle:data.shuffle};renderPlayback(ctx);}
   else window.tocaMusicPlayback.sample(ctx,data);
   if(Date.now()-(ctx.refreshedAt||Date.now())>20000&&!ctx.busy&&!ctx.controlling&&!ctx.root.querySelector('dialog[open]')&&!ctx.root.hasAttribute('data-cabina-dragging')){
    ctx.refreshedAt=Date.now();if(await refreshActivity(ctx))if(live(ctx)&&!ctx.busy&&!ctx.root.querySelector('dialog[open]')&&!ctx.root.hasAttribute('data-cabina-dragging'))await reload(ctx);
   }
  }catch(error){if(generation===ctx.playbackGeneration)notify(ctx,error.message)}finally{if(generation===ctx.playbackGeneration)ctx.polling=false}
 }
 function editFeedback(ctx,body){
  const feedback={action:body.action,trackId:body.trackId,until:performance.now()+5000};
  if(body.action==='add'){
   feedback.position=ctx.playlist.tracks.findLastIndex(t=>t.id===body.trackId);
   feedback.track=ctx.playlist.tracks[feedback.position];
  }
  ctx.feedback=feedback;clearTimeout(ctx.feedbackTimer);
  window.tocaCabinaEditFeedback?.(ctx);updateButtons(ctx);
  ctx.feedbackTimer=setTimeout(()=>{if(live(ctx)&&ctx.feedback===feedback){ctx.feedback=null;window.tocaCabinaEditFeedback?.(ctx);updateButtons(ctx)}},5000);
  const detail=body.action==='add'&&feedback.track?` «${feedback.track.title}» se agregó a la playlist.`:body.action==='remove'?' Se quitó la canción.':body.action==='move'?' Se guardó el nuevo orden.':'';
  notify(ctx,'Playlist actualizada.'+detail,true);
 }
 async function edit(ctx,body){
  if(!live(ctx))return;
  if(state.demo||!ctx.settings.playlistWriteEnabled){window.tocaCabinaShowConnection?.(ctx);notify(ctx,'La edición de playlist está deshabilitada en el servidor.');return}
  if(ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id))){notify(ctx,'Hay un cambio pendiente. Consultá su resultado antes de volver a editar.');return}
  const intent=window.tocaMusicEditIntent.capture(ctx.playlist,body);
  ctx.busy=true;ctx.editAction=body;updateButtons(ctx);
  let sent=false,terminal=false;
  try{
   for(let attempt=0;attempt<2;attempt++){
    if(body.action!=='create')await reload(ctx);
    if(!live(ctx))return;
    if(ctx.operation)throw Error('Hay una edición pendiente. Consultá su resultado antes de continuar.');
    const input=window.tocaMusicEditIntent.resolve(intent,ctx.playlist);
    if(!input){notify(ctx,'La playlist ya refleja ese cambio.',true);window.tocaCabinaClose?.(ctx);return;}
    const id=crypto.randomUUID();sessionStorage.setItem(key(ctx.id),JSON.stringify({id,input}));sent=true;terminal=false;
    const result=await api(musicPath(ctx.id)+`/edits/${id}`,{method:'POST',body:input});if(!live(ctx))return;
    terminal=['COMPLETED','FAILED','RELEASED'].includes(result.status);
    if(terminal)sessionStorage.removeItem(key(ctx.id));
    if(attempt===0&&result.status==='FAILED'&&result.result?.code==='PLAYLIST_CHANGED'&&result.result.beforeWrite===true)continue;
    if(result.status==='COMPLETED'){
     if(result.result?.playlistId){ctx.settings.playlistId=result.result.playlistId;state.spotify.playlistId=result.result.playlistId;localStorage.setItem(tocaPlaylistNameKey(ctx.id,result.result.playlistId),result.result.name);}
     const confirmed=result.playlist||result.result?.playlist;
     if(confirmed){
      if(ctx.playlist?.id===confirmed.id&&ctx.playlist.snapshot!==confirmed.snapshot){ctx.retiredSnapshots||=new Set();ctx.retiredSnapshots.add(ctx.playlist.snapshot);if(ctx.retiredSnapshots.size>32)ctx.retiredSnapshots.delete(ctx.retiredSnapshots.values().next().value);}
      ctx.playlistGeneration=(ctx.playlistGeneration||0)+1;renderPlaylist(ctx,{playlist:confirmed,operation:null});editFeedback(ctx,body);
     }
     if(body.action!=='add')window.tocaCabinaClose?.(ctx);
     try{await reload(ctx)}catch(error){notify(ctx,'El cambio se guardó, pero no se pudo consultar la actualización. '+error.message);return;}
     if(live(ctx)&&!confirmed)editFeedback(ctx,body);return;
    }
    notify(ctx,result.message||'Edición pendiente de verificación.');await reload(ctx);return;
   }
  }catch(error){
   if(!live(ctx))return;
   notify(ctx,error.message+(sent&&!terminal?' Consultá el resultado antes de volver a editar.':''));
   if(sent&&!terminal)ctx.operation={status:'UNKNOWN'};
   try{await reload(ctx)}catch{}
  }finally{ctx.busy=false;ctx.editAction=null;updateButtons(ctx)}
 }
 document.addEventListener('cabina-reorder',async event=>{
  const ctx=current,move=event.detail;
  if(!live(ctx)||event.target!==ctx.root||move?.playlistId!==ctx.playlist?.id)return;
  try{
   if(move.snapshot!==ctx.playlist.snapshot){notify(ctx,'La playlist cambió. Revisá el orden antes de mover otra canción.');await reload(ctx);return}
   if(!Number.isInteger(move.from)||!Number.isInteger(move.to)||move.from===move.to)return;
   await edit(ctx,{action:'move',from:move.from,to:move.to});
  }catch(error){notify(ctx,error.message)}
 });
 async function control(ctx,body){
  if(!live(ctx)||ctx.controlling)return;
  if(state.demo||!ctx.settings.controlEnabled){window.tocaCabinaShowConnection?.(ctx);notify(ctx,'El control de audio está deshabilitado en el servidor.');return}
  if(['start','resume'].includes(body.action)&&!ctx.playback?.device?.name&&!ctx.settings.deviceId&&!browser?.deviceId){
   window.tocaCabinaShowConnection?.(ctx);notify(ctx,'Elegí dónde va a sonar la música: este navegador o un dispositivo disponible.');return;
  }
  const optimistic=window.tocaMusicPlayback.begin(ctx,body);
  ctx.controlling=true;ctx.playbackGeneration=(ctx.playbackGeneration||0)+1;updateButtons(ctx);
  try{
   await browser?.player.activateElement();if(!live(ctx))return;
   window.tocaCabinaClose?.(ctx);
   await api(musicPath(ctx.id)+'/player',{method:'POST',body});if(!live(ctx))return;
   window.tocaMusicPlayback.accepted(ctx,optimistic);notify(ctx,'Control enviado.',true);await poll(ctx,true);void readBrowser(ctx);
  }catch(error){
   window.tocaMusicPlayback.rejected(ctx,optimistic);
   if(error.status===412&&/dispositivo|audio/i.test(error.message))window.tocaCabinaShowConnection?.(ctx);
   notify(ctx,error.message);
  }finally{ctx.controlling=false;ctx.polling=false;updateButtons(ctx)}
 }
 function loadSdk(){
  if(window.Spotify?.Player)return Promise.resolve();
  return sdkPromise ||= new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://sdk.scdn.co/spotify-player.js';
   const timer=setTimeout(()=>{script.remove();sdkPromise=null;reject(Error('No se pudo cargar el reproductor de Spotify'))},20000);
   window.onSpotifyWebPlaybackSDKReady=()=>{clearTimeout(timer);resolve()};
   script.onerror=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(Error('No se pudo cargar el reproductor de Spotify'))};document.head.append(script);
  });
 }
 async function linkBrowser(ctx,deviceId){
  await api(`/api/admin/venues/${ctx.id}/spotify/device`,{method:'PUT',body:{deviceId}});
  await api(musicPath(ctx.id)+'/player',{method:'POST',body:{action:'transfer'}});
  if(live(current)&&current.id===ctx.id&&current.session===ctx.session){
   current.settings.deviceId=deviceId;current.playback={...current.playback,device:{...current.playback?.device,id:deviceId}};
   current.root.querySelector('[data-browser-status]').textContent='Audio de TOCÁ conectado';
   notify(current,'Audio listo. Pulsá Reproducir playlist.');await poll(current);
  }
 }
 async function connect(ctx){
  if(browser?.id===ctx.id){await browser.player.activateElement();if(browser.deviceId)await linkBrowser(ctx,browser.deviceId);else if(!await browser.player.connect())throw Error('No se pudo reconectar el audio');return}
  await loadSdk();if(!live(ctx))return;stopBrowser();
  const player=new Spotify.Player({name:'TOCÁ · '+(state.detail?.name||'Mi Bar'),volume:.5,getOAuthToken:callback=>{
   if(ctx.session!==state.token){stopBrowser();return}
   api(musicPath(ctx.id)+'/browser-token',{signal:new AbortController().signal}).then(data=>{if(ctx.session===state.token)callback(data.accessToken)}).catch(error=>notify(current,error.message));
  }});
  browser={id:ctx.id,session:ctx.session,player};
  ['initialization_error','authentication_error','account_error','playback_error'].forEach(type=>player.addListener(type,error=>notify(current,error.message+' Si acabás de actualizar TOCÁ, reconectá Spotify para renovar los permisos.')));
  player.addListener('autoplay_failed',()=>notify(current,'Pulsá Reproducir para habilitar el audio en este navegador.'));
  player.addListener('ready',async({device_id})=>{
   if(ctx.session!==state.token){stopBrowser();return}
   try{
    if(browser?.player!==player)return;
    browser.deviceId=device_id;await linkBrowser(ctx,device_id);
   }catch(error){notify(current,error.message)}
  });
  player.addListener('not_ready',()=>{if(browser?.player===player)browser.deviceId=null;notify(current,'El audio del navegador se desconectó. Volvé a habilitarlo.');});
  player.addListener('player_state_changed',data=>{const ctx=current;if(live(ctx)&&browserOutput(ctx)){if(data)window.tocaMusicPlayback.sdk(ctx,data,{id:browser.deviceId,name:'TOCÁ · '+(state.detail?.name||'Mi Bar')});else void readBrowser(ctx)}});
  if(!await player.connect()){stopBrowser();throw Error('No se pudo conectar el audio. Verificá Spotify Premium y los permisos de reproducción.');}
 }
 window.tocaInitAdminMusic=async(id,settings)=>{
  if(current)dispose(current);
  const root=document.querySelector('[data-admin-studio]');if(!root||!settings.connected){if(browser?.id===id)stopBrowser();current=null;return;}
  const ctx={id,root,settings,session:state.token,busy:false,operation:null,playlist:null,activityFingerprint:JSON.stringify(state.requests)};ctx.onPlayback=()=>renderPlayback(ctx);current=ctx;
  window.tocaCabinaInit?.(ctx);
  if(state.demo){ctx.settings={...settings,controlEnabled:false,playlistWriteEnabled:false};renderPlaylist(ctx,{playlist:{id:'demo-list',name:'Playlist de demostración',tracks:demoCatalog.slice(0,8)},operation:null});return;}
  if(browser&&(browser.id!==id||browser.session!==ctx.session))stopBrowser();
  try{
   const saved=JSON.parse(sessionStorage.getItem(key(id))||'null');
   if(saved){const result=await api(musicPath(id)+`/edits/${saved.id}`,{method:'POST',body:saved.input});if(!live(ctx))return;if(['COMPLETED','FAILED','RELEASED'].includes(result.status))sessionStorage.removeItem(key(id));}
  }catch(error){notify(ctx,error.message)}
  if(!live(ctx))return;
  try{await reload(ctx);await poll(ctx)}catch(error){notify(ctx,error.message)}
  if(live(ctx)){ctx.timer=setInterval(()=>{if(browser&&browser.session!==state.token)stopBrowser();void poll(ctx)},7000);ctx.clockTimer=setInterval(()=>{if(!live(ctx)){dispose(ctx);return}if(!document.hidden)renderTime(ctx);if(!document.hidden&&performance.now()-(ctx.sdkReadAt||0)>=1000){ctx.sdkReadAt=performance.now();void readBrowser(ctx)}},250);}
 };
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-admin-studio] button');const ctx=current;
  if(!button||!ctx||!live(ctx)||button.disabled)return;
  try{
   if(button.hasAttribute('data-studio-refresh')||button.hasAttribute('data-studio-recover')){await window.tocaInitAdminMusic(ctx.id,ctx.settings);await refreshActivity(current);return}
   if(button.hasAttribute('data-cabina-row-play')){
    const position=Number(button.dataset.cabinaRowPlay),track=ctx.playlist?.tracks[position];if(!track?.id)return;
    await control(ctx,window.tocaCabinaIsCurrent(ctx,track)?{action:ctx.playback.isPlaying?'pause':'resume'}:{action:'start',position});return;
   }
   if(button.hasAttribute('data-cabina-track')){window.tocaCabinaOpenTrack(ctx,Number(button.dataset.cabinaTrack));updateButtons(ctx);return}
   if(button.hasAttribute('data-cabina-devices')){await loadDevices(ctx);return}
   if(button.hasAttribute('data-cabina-select-device')){await selectDevice(ctx,button);return}
   if(button.hasAttribute('data-cabina-select-playlist')){await selectPlaylist(ctx);return}
   if(button.hasAttribute('data-browser-connect')){button.disabled=true;await connect(ctx);return}
   if(button.hasAttribute('data-studio-create')||button.hasAttribute('data-studio-rename')){
    const name=ctx.root.querySelector('[data-studio-name]').value.trim();if(!name)throw Error('Ingresá un nombre para la playlist');
    event.preventDefault();await edit(ctx,{action:button.hasAttribute('data-studio-create')?'create':'rename',name});return;
   }
   if(button.hasAttribute('data-studio-edit')){
    if(button.disabled||ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id)))return;
    const action=button.dataset.studioEdit;if(action==='remove'&&!confirm('¿Quitar esta canción de la playlist?'))return;
    await edit(ctx,{action,...(action==='add'?{trackId:button.dataset.track}:action==='move'?{from:Number(button.dataset.from),to:Number(button.dataset.to)}:{position:Number(button.dataset.position)})});return;
   }
   if(button.hasAttribute('data-studio-reconcile')||button.hasAttribute('data-studio-accept')){
    if(!ctx.operation)return;
    let body={};if(button.hasAttribute('data-studio-accept')){
     if(!confirm('¿Revisaste la lista actual? Se aceptará ese estado sin repetir la edición anterior.'))return;
     body={...(ctx.playlist?{acceptSnapshot:ctx.playlist.snapshot}:{}),...(ctx.operation.action==='create'?{acceptMissing:true}:{})};
    }
    button.disabled=true;const result=await api(musicPath(ctx.id)+`/edits/${ctx.operation.id}/reconcile`,{method:'POST',body});if(!live(ctx))return;if(['COMPLETED','RELEASED','FAILED'].includes(result.status))sessionStorage.removeItem(key(ctx.id));notify(ctx,result.status==='COMPLETED'?'Edición confirmada.':result.message||result.status);await reload(ctx);return;
   }
   let body;
   if(button.dataset.playerCommand)body={action:button.dataset.playerCommand};
   if(button.hasAttribute('data-player-toggle'))body=ctx.playback?.now?{action:ctx.playback.isPlaying?'pause':'resume'}:{action:'start',position:0};
   if(button.hasAttribute('data-player-start'))body={action:'start',position:0};
   if(button.hasAttribute('data-play-position'))body={action:'start',position:Number(button.dataset.playPosition)};
   if(body){button.disabled=true;await control(ctx,body)}
  }catch(error){notify(ctx,error.message)}finally{if(button.isConnected)button.disabled=false;updateButtons(ctx)}
 });
 document.addEventListener('change',async event=>{
  const ctx=current,input=event.target;if(!ctx||!live(ctx)||!input.closest('[data-admin-studio]'))return;
  let body;if(input.hasAttribute('data-player-seek'))body={action:'seek',positionMs:Number(input.value)};
  if(input.hasAttribute('data-cabina-volume'))body={action:'volume',volume:Number(input.value)};
  if(input.hasAttribute('data-player-volume'))body={action:'volume',volume:Number(input.value)};
  if(input.hasAttribute('data-player-shuffle'))body={action:'shuffle',enabled:input.checked};
  if(input.hasAttribute('data-player-repeat'))body={action:'repeat',state:input.value};
  if(body?.action==='seek'){ctx.seeking=false;await control(ctx,body);return}
  if(body)try{await api(musicPath(ctx.id)+'/player',{method:'POST',body});notify(ctx,'Control enviado.');await poll(ctx)}catch(error){notify(ctx,error.message)}
 });
 let searchTimer,searchGeneration=0;
 document.addEventListener('input',event=>{
  const input=event.target;if(input.hasAttribute('data-player-seek')&&live(current))current.seeking=true;if(!input.hasAttribute('data-studio-search'))return;
  const ctx=current;if(!live(ctx)||state.demo)return;const generation=++searchGeneration,query=input.value.trim();clearTimeout(searchTimer);
  const output=ctx.root.querySelector('[data-studio-search-results]');if(query.length<2){output.innerHTML='';return}
  searchTimer=setTimeout(async()=>{
   try{const tracks=await api(`/api/admin/venues/${ctx.id}/tracks?q=${encodeURIComponent(query)}`);if(!live(ctx)||generation!==searchGeneration||!output.isConnected)return;
    output.innerHTML=tracks.map(t=>`<div class="toca-studio-track">${window.tocaCabinaArt(t)}<div class="toca-song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><button type="button" class="btn ghost small" data-studio-edit="add" data-track="${esc(t.id)}">Agregar</button></div>`).join('')||'<p>No se encontraron canciones.</p>';updateButtons(ctx);
   }catch(error){if(live(ctx)&&generation===searchGeneration&&output.isConnected)output.textContent=error.message}
  },300);
 });
 document.addEventListener('visibilitychange',()=>{
  const ctx=current;if(document.hidden||!live(ctx))return;
  renderTime(ctx);void readBrowser(ctx);void poll(ctx,true);
 });
 window.addEventListener('pagehide',stopBrowser);
})();
