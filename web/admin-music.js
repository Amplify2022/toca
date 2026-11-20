/* Admin-only player and playlist editor. OAuth refresh tokens stay on the server. */
(() => {
 let current=null,sdkPromise=null,browser=null,audioSetup=null;
 const musicPath=id=>`/api/admin/venues/${encodeURIComponent(id)}/music`;
 const time=n=>{const seconds=Math.floor(Math.max(0,Number(n)||0)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`};
 const key=id=>'toca-music-edit:'+id;
 const savedEdit=id=>{
  try{return JSON.parse(sessionStorage.getItem(key(id))||'null')}catch{return null}
 };
 const removalError=(ctx,reason)=>notify(ctx,reason||'No pudimos confirmar que Spotify quitara la canción. Se conserva la última lista disponible.',false,true);
 const syncChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('toca-playlist-changes'):null;
 const live=ctx=>!!ctx&&ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId;
 const notify=(ctx,message,transient=false,error=false)=>{
  if(!live(ctx))return;
  clearTimeout(ctx.noticeTimer);ctx.noticeVersion=(ctx.noticeVersion||0)+1;
  const status=ctx.root.querySelector('[data-studio-status]');
  status.textContent=message;status.classList.toggle('cabina-status-error',error);window.tocaCabinaNotify?.(ctx,message);
  if(transient){const version=ctx.noticeVersion;ctx.noticeTimer=setTimeout(()=>{if(live(ctx)&&ctx.noticeVersion===version&&ctx.root.querySelector('[data-studio-status]').textContent===message){ctx.root.querySelector('[data-studio-status]').textContent='';window.tocaCabinaNotify?.(ctx,'')}},5000);}
 };
 const dispose=ctx=>{if(ctx){clearInterval(ctx.timer);clearInterval(ctx.clockTimer);clearInterval(ctx.syncTimer);clearTimeout(ctx.syncSoon);clearTimeout(ctx.noticeTimer);clearTimeout(ctx.feedbackTimer)}};
 const browserAuthorizationError=()=>Object.assign(Error('Renová los permisos de Spotify para activar el audio del navegador. Usá la misma cuenta para conservar tu playlist.'),{browserAuthorization:true});
 function connectionMessage(error,fallback){
  return !error?.message||/failed to fetch|load failed|networkerror|network request failed/i.test(error.message)
   ?fallback:error.message;
 }
 function reportError(ctx,error){
  if(!live(ctx))return;
  if(error.browserAuthorization){window.tocaCabinaRequireAuthorization?.(ctx);}
  notify(ctx,connectionMessage(error,'No pudimos conectar con TOCÁ. Volvé a intentar.'));
 }

 function stopBrowser(){if(browser){const registration=browser;browser=null;clearTimeout(registration.readyTimer);registration.rejectReady?.(Error('Conexión de audio cancelada.'));registration.player.disconnect();}}
 window.tocaMusicDisconnect=()=>{window.tocaCabinaReset?.();stopBrowser();if(current){dispose(current);current=null}};
 window.tocaAdminMusicMarkup=(venue,settings,options)=>window.tocaCabinaMarkup(venue,settings,options);
 function updateButtons(ctx){
  if(!live(ctx))return;
  ctx.root.querySelectorAll('[data-studio-edit],[data-studio-create],[data-studio-rename]').forEach(b=>{b.disabled=b.hidden||!ctx.settings.playlistWriteEnabled||ctx.busy||!!ctx.operation||!!sessionStorage.getItem(key(ctx.id))||(!ctx.playlist&&!b.hasAttribute('data-studio-create'))});
  window.tocaCabinaUpdateButtons?.(ctx);
 }
 function renderPlaylist(ctx,data,announceError=true){
  if(!live(ctx))return;
  const incoming=data.playlist;ctx.operation=data.operation;if(data.error&&announceError)notify(ctx,data.error);
  if(!data.error){if(ctx.playlist?.id!==incoming?.id)ctx.retiredSnapshots=new Set();if(!incoming||incoming.id!==ctx.playlist?.id||!ctx.retiredSnapshots?.has(incoming.snapshot))ctx.playlist=incoming;}
  ctx.playlistError=data.error||null;
  const root=ctx.root,playlist=ctx.playlist,fingerprint=JSON.stringify([playlist,!playlist&&ctx.playlistError]);
  if(ctx.playlistFingerprint!==fingerprint){
  ctx.playlistFingerprint=fingerprint;
  root.querySelector('[data-studio-playlist-name]').textContent=playlist?playlist.name:'Elegí tu playlist';
  if(!root.querySelector('[data-cabina-dialog="name"][open]'))root.querySelector('[data-studio-name]').value=playlist?.name||'';
  const list=root.querySelector('[data-studio-tracks]'),scroll=list.scrollTop;
  list.innerHTML=window.tocaCabinaTracks(ctx);list.scrollTop=scroll;
  window.tocaCabinaPlaylistUpdated?.(ctx);
  }
  optimisticRemoval(ctx);updateButtons(ctx);
 }
 function optimisticRemoval(ctx){
  let position=-1;
  if(ctx.optimisticRemoval)try{position=window.tocaMusicEditIntent.resolve(ctx.optimisticRemoval,ctx.playlist)?.position??-1}catch{}
  let count=0;
  ctx.root.querySelectorAll('[data-track-index]').forEach(row=>{const hidden=Number(row.dataset.trackIndex)===position;row.style.display=hidden?'none':'';if(!hidden)row.querySelector('.cabina-track-number').textContent=++count;});
  if(ctx.playlist)ctx.root.querySelector('[data-playlist-count]').textContent=`${count} canciones${ctx.settings.playlistWriteEnabled?' · Arrastrá para ordenar':''}`;
 }
 async function reload(ctx,background=false){const generation=(ctx.playlistGeneration||0)+1;ctx.playlistGeneration=generation;const data=await api(musicPath(ctx.id)+'/playlist');if(!live(ctx)||generation!==ctx.playlistGeneration||(background&&syncBlocked(ctx)))return ctx.playlist;renderPlaylist(ctx,data,!background);if(data.error)throw Error(data.error);ctx.settings.playlistId=ctx.playlist?.id||'';state.spotify.playlistId=ctx.settings.playlistId;return ctx.playlist}
 const syncBlocked=ctx=>!live(ctx)||document.hidden||ctx.busy||ctx.root.hasAttribute('data-cabina-dragging')||!!ctx.root.querySelector('dialog[open]');
 function syncStatus(ctx,message='Se actualiza automáticamente'){
  if(live(ctx))ctx.root.querySelector('[data-playlist-sync]').textContent=message;
 }
 async function syncPlaylist(ctx,force=false){
  if(syncBlocked(ctx)||ctx.syncing||(!force&&Date.now()<(ctx.syncRetryAt||0)))return;
  ctx.syncing=true;const generation=ctx.playlistGeneration;
  try{
   const data=await api(musicPath(ctx.id)+'/playlist/revision');
   if(syncBlocked(ctx)||generation!==ctx.playlistGeneration)return;
   const revision=data.playlist,previous=ctx.playlist;
   if(ctx.playlistError||revision?.id!==previous?.id||revision?.snapshot!==previous?.snapshot||revision?.name!==previous?.name||JSON.stringify(data.operation)!==JSON.stringify(ctx.operation))await reload(ctx,true);
   if(!live(ctx))return;
   if(ctx.operation||savedEdit(ctx.id))await recoverPendingEdit(ctx);
   ctx.syncFailures=0;ctx.syncRetryAt=0;syncStatus(ctx);
  }catch(error){
   if(!live(ctx)||error.name==='AbortError')return;
   ctx.syncFailures=(ctx.syncFailures||0)+1;
   ctx.syncRetryAt=Date.now()+(error.status===429?60000:Math.min(60000,5000*2**Math.min(ctx.syncFailures-1,4)));
   syncStatus(ctx,'Sincronización pendiente · reintentando…');
  }finally{ctx.syncing=false}
 }
 function syncSoon(ctx){if(!live(ctx))return;clearTimeout(ctx.syncSoon);ctx.syncSoon=setTimeout(()=>void syncPlaylist(ctx,true),0)}
 function playlistChanged(ctx){syncChannel?.postMessage({venueId:ctx.id});}
 if(syncChannel)syncChannel.onmessage=event=>{if(live(current)&&event.data?.venueId===current.id)syncSoon(current)};
 document.addEventListener('close',event=>{
  if(!event.target.matches?.('.cabina-dialog')||!live(current))return;
  if(event.target===current.playAfterOutput?.dialog&&!event.target.open)current.playAfterOutput=null;
  syncSoon(current);
 },true);
 document.addEventListener('cabina-connection-open',event=>{
  if(!live(current)||event.target!==current.root)return;
  current.playAfterOutput=null;
  if(current.settings.controlEnabled&&!current.settings.browserMissingScopes?.length)void loadSdk().catch(()=>{});
 });
 async function refreshActivity(ctx){
  if(!live(ctx))return;
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
  if(browser?.id===ctx.id){browser.selected=false;browser.selection=(browser.selection||0)+1;await browser.linkPromise?.catch(()=>{});}
  if(!live(ctx))return;
  await api(`/api/admin/venues/${ctx.id}/spotify/device`,{method:'PUT',body:{deviceId:button.dataset.cabinaSelectDevice}});
  if(!live(ctx))return;
  ctx.settings.deviceId=button.dataset.cabinaSelectDevice;
  await api(musicPath(ctx.id)+'/player',{method:'POST',body:{action:'transfer'}});
  notify(ctx,'Salida de audio seleccionada.');await poll(ctx);
 }
 function accountPlaylists(ctx){
  return api(`/api/admin/venues/${ctx.id}/spotify/playlists`);
 }
 function renderPlaylistChoices(ctx,lists){
  const output=ctx.root.querySelector('[data-cabina-playlists]');
  output.innerHTML=lists.length?`<label class="cabina-field">Playlist<select class="input" data-cabina-playlist-select><option value="">Seleccionar…</option>${lists.map(p=>`<option value="${esc(p.id)}" ${p.id===ctx.settings.playlistId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button type="button" class="btn primary" data-cabina-select-playlist data-cabina-selection>Usar esta playlist</button>`:'<p class="cabina-help">No encontramos playlists. Podés crear una desde el menú de playlist.</p>';
  updateButtons(ctx);
 }
 async function loadPlaylists(ctx){
  if(!live(ctx))return;
  const output=ctx.root.querySelector('[data-cabina-playlists]');
  output.textContent='Buscando playlists…';
  try{
   const lists=await accountPlaylists(ctx);
   if(live(ctx))renderPlaylistChoices(ctx,lists);
  }catch(error){
   if(live(ctx))output.textContent=connectionMessage(error,'No se pudieron cargar tus playlists. Volvé a intentarlo.');
  }
 }
 async function savePlaylistSelection(ctx,playlist,onlyIfMissing=false){
  const body=onlyIfMissing?{playlistId:playlist.id,onlyIfMissing:true}:{playlistId:playlist.id};
  const result=await api(`/api/admin/venues/${ctx.id}/spotify/playlist`,{method:'PUT',body});
  if(!live(ctx))return;
  if(!result?.playlistId||result.playlistId===playlist.id)
   localStorage.setItem(tocaPlaylistNameKey(ctx.id,playlist.id),playlist.name);
  playlistChanged(ctx);
  return await reload(ctx);
 }
 async function selectPlaylist(ctx){
  if(ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id)))return;
  const selector=ctx.root.querySelector('[data-cabina-playlist-select]'),playlistId=selector?.value;
  if(!playlistId)throw Error('Elegí una playlist');
  ctx.busy=true;updateButtons(ctx);
  try{
   await savePlaylistSelection(ctx,{id:playlistId,name:selector.selectedOptions[0].textContent});
   if(!live(ctx))return;
   window.tocaCabinaClose?.(ctx);notify(ctx,'Playlist seleccionada. La reproducción actual sigue igual.');
  }finally{ctx.busy=false;updateButtons(ctx)}
 }
 async function configureFirstPlaylist(ctx){
  if(!live(ctx)||ctx.playlist||ctx.operation||savedEdit(ctx.id))return;
  ctx.busy=true;updateButtons(ctx);
  let playlists;
  try{
   playlists=await accountPlaylists(ctx);
   if(!live(ctx))return;
   const matches=playlists.filter(p=>p.name?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()==='toca');
   if(matches.length===1){
    const playlist=await savePlaylistSelection(ctx,matches[0],true);
    if(!live(ctx)||playlist)return;
   }
  }catch(error){
   notify(ctx,connectionMessage(error,'No se pudieron cargar tus playlists de Spotify. Volvé a intentarlo.'));
  }finally{ctx.busy=false;updateButtons(ctx)}
  if(live(ctx)&&playlists&&!ctx.playlist&&!ctx.root.querySelector('dialog[open]')){
   renderPlaylistChoices(ctx,playlists);
   window.tocaCabinaShowPlaylistChoices?.(ctx);
  }
 }
 document.addEventListener('cabina-playlists',()=>{if(live(current))void loadPlaylists(current);});
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
  if(!root.querySelector('[data-cabina-dialog="playback"][open]')&&!ctx.savingPlaybackSettings)resetPlaybackOptions(ctx);
  renderTime(ctx);window.tocaCabinaPlaybackUpdated?.(ctx);
 }
 function resetPlaybackOptions(ctx){
  ctx.root.querySelectorAll('[data-player-shuffle]').forEach(input=>input.checked=(input.value==='on')===!!ctx.playback?.shuffle);
  ctx.root.querySelectorAll('[data-player-repeat]').forEach(input=>input.checked=input.value===(ctx.playback?.repeat||'off'));
 }
 document.addEventListener('cabina-playback-open',event=>{if(live(current)&&event.target===current.root)resetPlaybackOptions(current)});
 async function applyPlaybackOptions(ctx){
  if(ctx.controlling||!ctx.settings.controlEnabled)return;
  const shuffle=ctx.root.querySelector('[data-player-shuffle]:checked')?.value==='on';
  const repeat=ctx.root.querySelector('[data-player-repeat]:checked')?.value;
  if(!['off','context','track'].includes(repeat))throw Error('Elegí una opción de repetición.');
  const commands=[];
  if(!ctx.playback||shuffle!==!!ctx.playback.shuffle)commands.push({action:'shuffle',enabled:shuffle});
  if(!ctx.playback||repeat!==(ctx.playback.repeat||'off'))commands.push({action:'repeat',state:repeat});
  ctx.controlling=true;ctx.savingPlaybackSettings=true;ctx.playbackGeneration=(ctx.playbackGeneration||0)+1;updateButtons(ctx);
  let applied=0;
  try{
   await ctx.audioSetup;await ctx.outputSetup;
   for(const body of commands){
    if(!live(ctx))return;
    await api(musicPath(ctx.id)+'/player',{method:'POST',body});applied++;
    if(!live(ctx))return;
    ctx.playback={...ctx.playback,...(body.action==='shuffle'?{shuffle:body.enabled}:{repeat:body.state})};
   }
   if(!live(ctx))return;
   if(ctx.root.querySelector('[data-cabina-dialog="playback"][open]'))window.tocaCabinaClose?.(ctx);
   notify(ctx,'Preferencias de reproducción guardadas.',true);await poll(ctx,true);
  }catch(error){
   if(applied)error.message='Se aplicó parte de la configuración. Revisá las opciones y volvé a confirmar. '+error.message;
   reportError(ctx,error);
  }finally{ctx.controlling=false;ctx.savingPlaybackSettings=false;ctx.polling=false;updateButtons(ctx)}
 }
 function browserSelected(ctx){return browser?.id===ctx.id&&browser.selected!==false&&browser.session===ctx.session&&browser.deviceId&&ctx.settings.deviceId===browser.deviceId;}
 function browserOutput(ctx){return browserSelected(ctx)&&(!ctx.playback?.device?.id||ctx.playback.device.id===browser.deviceId);}
 async function readBrowser(ctx){
  // The SDK returns null when this browser is inactive. A delayed HTTP device
  // sample must not prevent it from reporting that local audio has changed.
  if(!live(ctx)||!browserSelected(ctx)||!browser.player.getCurrentState||ctx.readingSdk)return;
  ctx.readingSdk=true;const player=browser.player,revision=ctx.sdkEventRevision||0;
  try{const data=await player.getCurrentState();if(live(ctx)&&browser?.player===player&&browserSelected(ctx)&&revision===(ctx.sdkEventRevision||0))window.tocaMusicPlayback.sdk(ctx,data,{id:browser.deviceId,name:'TOCÁ · '+(state.detail?.name||'Mi Bar')});}catch{}finally{ctx.readingSdk=false}
 }
 async function poll(ctx,force=false){
  if(!live(ctx)){dispose(ctx);return}
  if(document.hidden||(!force&&(ctx.polling||ctx.controlling)))return;
  if(!force){
   if(Date.now()<(ctx.playerRetryAt||0))return;
   // Local audio reports track changes directly. Keep the HTTP fallback light;
   // Spotify Connect needs a faster read because it has no SDK event stream.
   if(browserOutput(ctx)&&ctx.sdkSampledAt!=null&&performance.now()-ctx.sdkSampledAt<1500&&Date.now()-(ctx.playerPolledAt||0)<7000)return;
  }
  const generation=(ctx.playbackGeneration||0)+1;ctx.playbackGeneration=generation;ctx.polling=true;
  const sdkRevision=ctx.sdkEventRevision||0;ctx.playerPolledAt=Date.now();
  try{
   const data=await api(musicPath(ctx.id)+'/player',{cache:'no-store'});if(!live(ctx)||generation!==ctx.playbackGeneration)return;
   ctx.playerFailures=0;ctx.playerRetryAt=0;setPlayerReadWarning(ctx,'');
   // A track-change event received after this request began is newer than its
   // response. Do not put the previous song back on screen while it settles.
   if(sdkRevision===(ctx.sdkEventRevision||0)){
    if(!ctx.pendingPlayback&&browserOutput(ctx)&&ctx.sdkSampledAt!=null&&performance.now()-ctx.sdkSampledAt<2000&&data.device?.id===browser.deviceId){ctx.playback={...ctx.playback,device:data.device,repeat:data.repeat,shuffle:data.shuffle};renderPlayback(ctx);}
    else window.tocaMusicPlayback.sample(ctx,data);
   }
   if(Date.now()-(ctx.activityRefreshedAt||0)>20000){
    ctx.activityRefreshedAt=Date.now();
    // Activity is independent of playback. Keep its previous data until the next read.
    await refreshActivity(ctx).catch(()=>{});
   }
  }catch(error){
   if(!live(ctx)||generation!==ctx.playbackGeneration||error.name==='AbortError')return;
   ctx.playerFailures=(ctx.playerFailures||0)+1;
   ctx.playerRetryAt=Date.now()+(error.status===429?60000:Math.min(30000,1000*2**Math.min(ctx.playerFailures-1,5)));
   if(ctx.playerFailures>=3||[401,403].includes(error.status))
    setPlayerReadWarning(ctx,'No se pudo actualizar el reproductor. Reintentando…');
  }finally{if(generation===ctx.playbackGeneration)ctx.polling=false}
 }
 function setPlayerReadWarning(ctx,message){
  if((ctx.playerReadWarning||'')===message)return;
  ctx.playerReadWarning=message;
  window.tocaCabinaPlaybackStatus?.(ctx);
 }
 function editFeedback(ctx,body){
  notify(ctx,'');
  if(body.action==='add')return;
  toast(body.action==='remove'?'Tema eliminado exitosamente':body.action==='move'?'Se guardó el nuevo orden.':body.action==='create'?'Playlist creada.':'Nombre de la playlist actualizado.');
 }
 const terminalEdit=result=>['COMPLETED','FAILED','RELEASED'].includes(result.status);
 async function checkEdit(ctx,id,result,action){
  // An ambiguous write is only read back. Never send it a second time.
  for(const delay of [0,200,450,850]){
   if(terminalEdit(result)||!live(ctx))break;
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   if(!live(ctx))break;
   try{result=await reconcileEdit(ctx,id)}catch(error){
    if(error.status===404&&action==='remove'){result={status:'UNKNOWN',missing:true};continue;}
    if(result.missing)result={status:'UNKNOWN'};
    if([401,403,429].includes(error.status))return result;
   }
  }
  if(result.missing)return {status:'FAILED'};
  if(action==='remove'&&result.status==='UNCERTAIN'&&live(ctx)){
   return await settleEdit(ctx,id,action).catch(()=>result);
  }
  return result;
 }
 function reconcileEdit(ctx,id,body={}){
  return api(musicPath(ctx.id)+`/edits/${id}/reconcile`,{method:'POST',body});
 }
 async function settleEdit(ctx,id,action){
  // Accept only a fresh snapshot. The server checks it again and confirms a
  // change that arrived in the meantime instead of releasing it as failed.
  if(action==='create')return reconcileEdit(ctx,id,{acceptMissing:true});
  const data=await api(musicPath(ctx.id)+'/playlist');
  if(!live(ctx))return {status:'UNKNOWN'};
  if(data.operation?.id!==id||data.error||!data.playlist?.snapshot)return reconcileEdit(ctx,id);
  return reconcileEdit(ctx,id,{acceptSnapshot:data.playlist.snapshot});
 }
 async function completeEdit(ctx,result,body){
  if(result.result?.playlistId){ctx.settings.playlistId=result.result.playlistId;state.spotify.playlistId=result.result.playlistId;localStorage.setItem(tocaPlaylistNameKey(ctx.id,result.result.playlistId),result.result.name);}
  const confirmed=result.playlist||result.result?.playlist;
  ctx.optimisticRemoval=null;
  if(confirmed){
   if(ctx.playlist?.id===confirmed.id&&ctx.playlist.snapshot!==confirmed.snapshot){ctx.retiredSnapshots||=new Set();ctx.retiredSnapshots.add(ctx.playlist.snapshot);if(ctx.retiredSnapshots.size>32)ctx.retiredSnapshots.delete(ctx.retiredSnapshots.values().next().value);}
   ctx.playlistGeneration=(ctx.playlistGeneration||0)+1;renderPlaylist(ctx,{playlist:confirmed,operation:null});
  }else await reload(ctx);
  if(!live(ctx))return;
  window.tocaCabinaClose?.(ctx);editFeedback(ctx,body);playlistChanged(ctx);
 }
 async function recoverPendingEdit(ctx){
  const saved=savedEdit(ctx.id);
  const operation=ctx.operation||(saved?.id?{id:saved.id,action:saved.input?.action}:null);
  if(!live(ctx)||ctx.busy||ctx.verifyingEdit||!operation?.id)return;
  if(ctx.editRecovery?.id!==operation.id)ctx.editRecovery={id:operation.id,since:Date.now(),next:0};
  const recovery=ctx.editRecovery;
  if(Date.now()<recovery.next)return;
  recovery.next=Date.now()+6000;
  ctx.verifyingEdit=true;
  try{
   let result=await reconcileEdit(ctx,operation.id);
   if(!live(ctx)||(ctx.operation?.id||savedEdit(ctx.id)?.id)!==operation.id)return;
   if(result.status==='UNCERTAIN'&&(operation.action==='remove'||Date.now()-recovery.since>=14000))result=await settleEdit(ctx,operation.id,operation.action);
   if(!live(ctx))return;
   if(terminalEdit(result)){
    if(saved?.id===operation.id)sessionStorage.removeItem(key(ctx.id));
    if(result.status==='COMPLETED')await completeEdit(ctx,result,{action:result.action||operation.action});
    else{
     await reload(ctx);
     if(operation.action==='remove')removalError(ctx,result.status==='FAILED'?result.message:null);
     else notify(ctx,result.status==='FAILED'&&result.message||'Spotify no confirmó el cambio. Revisá la playlist antes de volver a intentarlo.',false,true);
    }
   }
  }catch(error){
   if(error.status===429)recovery.next=Date.now()+60000;
   if(live(ctx)&&error.status===404&&!ctx.operation&&savedEdit(ctx.id)?.id===operation.id){
    sessionStorage.removeItem(key(ctx.id));updateButtons(ctx);
    if(operation.action==='remove')removalError(ctx);
    else notify(ctx,'No se pudo verificar el cambio. Revisá la playlist antes de volver a intentarlo.',false,true);
   }
  }
  finally{ctx.verifyingEdit=false;}
 }
 async function edit(ctx,body){
  if(!live(ctx))return;
  if((!ctx.settings.playlistWriteEnabled)){window.tocaCabinaShowConnection?.(ctx);notify(ctx,'La edición de playlist está deshabilitada en el servidor.');return}
  if(ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id)))return;
  const intent=window.tocaMusicEditIntent.capture(ctx.playlist,body);
  ctx.busy=true;ctx.editAction=body;notify(ctx,'');
  if(body.action==='remove'){ctx.optimisticRemoval=intent;window.tocaCabinaClose?.(ctx);optimisticRemoval(ctx);}
  updateButtons(ctx);
  let sent=false,terminal=false,id;
  try{
   for(let attempt=0;attempt<2;attempt++){
    if(body.action!=='create')await reload(ctx);
    if(!live(ctx))return;
    if(ctx.operation){window.tocaCabinaClose?.(ctx);return;}
    const input=window.tocaMusicEditIntent.resolve(intent,ctx.playlist);
    if(!input){window.tocaCabinaClose?.(ctx);toast('La playlist ya refleja ese cambio.');return;}
    id=crypto.randomUUID();sessionStorage.setItem(key(ctx.id),JSON.stringify({id,input}));sent=true;terminal=false;
    let result=await api(musicPath(ctx.id)+`/edits/${id}`,{method:'POST',body:input});if(!live(ctx))return;
    if(!terminalEdit(result))result=await checkEdit(ctx,id,result,body.action);
    if(!live(ctx))return;
    terminal=terminalEdit(result);if(terminal)sessionStorage.removeItem(key(ctx.id));
    if(attempt===0&&result.status==='FAILED'&&result.result?.code==='PLAYLIST_CHANGED'&&result.result.beforeWrite===true)continue;
    if(result.status==='COMPLETED'){await completeEdit(ctx,result,body);return;}
    if(!terminal)window.tocaCabinaClose?.(ctx);
    else if(body.action==='remove')removalError(ctx,result.status==='FAILED'?result.message:null);
    else notify(ctx,result.message||'No se pudo guardar el cambio. Volvé a intentarlo.',false,true);
    await reload(ctx);return;
   }
  }catch(error){
   if(!live(ctx))return;
   if(sent&&!terminal){
    const result=await checkEdit(ctx,id,{status:'UNKNOWN'},body.action);if(!live(ctx))return;
    if(terminalEdit(result)){terminal=true;sessionStorage.removeItem(key(ctx.id));if(result.status==='COMPLETED'){await completeEdit(ctx,result,body);return;}}
    else ctx.operation={id,status:'UNKNOWN',action:body.action};
   }
   if(sent&&!terminal)window.tocaCabinaClose?.(ctx);
   else if(body.action==='remove')removalError(ctx,error.message);
   else notify(ctx,error.message,false,true);
   try{await reload(ctx)}catch{if(sent&&!terminal)renderPlaylist(ctx,{playlist:ctx.playlist,operation:ctx.operation});}
  }finally{ctx.busy=false;ctx.editAction=null;ctx.optimisticRemoval=null;if(live(ctx)){optimisticRemoval(ctx);updateButtons(ctx);syncSoon(ctx);}}
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
 function choosePlaybackOutput(ctx,body){
  window.tocaCabinaShowConnection?.(ctx);
  const dialog=ctx.root.querySelector('[data-cabina-dialog="connection"][open]');
  if(dialog)ctx.playAfterOutput={body,dialog};
 }
 async function continuePlaybackAfterOutput(ctx){
  const pending=ctx.playAfterOutput;
  ctx.playAfterOutput=null;
  if(!live(ctx)||!pending?.dialog.open)return false;
  await control(ctx,pending.body,true);
  return true;
 }
 async function control(ctx,body,outputConfirmed=false){
  if(!live(ctx)||ctx.controlling)return;
  if((!ctx.settings.controlEnabled)){window.tocaCabinaShowConnection?.(ctx);notify(ctx,'El control de audio está deshabilitado en el servidor.');return}
  if(!outputConfirmed&&['start','resume'].includes(body.action)&&!ctx.audioSetup&&!(audioSetup?.id===ctx.id&&audioSetup.session===ctx.session)&&!ctx.playback?.device?.name&&!ctx.settings.deviceId&&!browser?.deviceId){
   choosePlaybackOutput(ctx,body);notify(ctx,'Elegí dónde va a sonar la música: este navegador o un dispositivo disponible.');return;
  }
  const optimistic=window.tocaMusicPlayback.begin(ctx,body);
  ctx.controlling=true;ctx.playbackGeneration=(ctx.playbackGeneration||0)+1;updateButtons(ctx);
  try{
   if(audioSetup?.id===ctx.id&&audioSetup.session===ctx.session)await audioSetup.promise;
   await ctx.audioSetup;await ctx.outputSetup;
   if(browser?.id===ctx.id&&browser.selected){await browser.ready;await browser.linkPromise;if(!outputConfirmed)await browser.player.activateElement();}
   if(!live(ctx))return;
   window.tocaCabinaClose?.(ctx);
   await api(musicPath(ctx.id)+'/player',{method:'POST',body});if(!live(ctx))return;
   window.tocaMusicPlayback.accepted(ctx,optimistic);notify(ctx,'Control enviado.',true);await poll(ctx,true);void readBrowser(ctx);
  }catch(error){
   window.tocaMusicPlayback.rejected(ctx,optimistic);
   if(error.status===412&&/dispositivo|audio/i.test(error.message)){
    if(['start','resume'].includes(body.action))choosePlaybackOutput(ctx,body);
    else window.tocaCabinaShowConnection?.(ctx);
   }
   reportError(ctx,error);
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
 async function linkBrowser(ctx,deviceId,registration,forceTransfer=false){
  if(browser!==registration||!registration.selected||ctx.session!==state.token)return;
  if(registration.linkedDevice===deviceId&&!forceTransfer)return registration.linkPromise;
  if(registration.linkingDevice===deviceId&&registration.linkPromise)return registration.linkPromise;
  const selection=registration.selection,previous=registration.linkPromise;
  registration.linkingDevice=deviceId;
  const valid=()=>browser===registration&&registration.selected&&registration.selection===selection&&registration.session===state.token&&registration.deviceId===deviceId;
  const linking=(async()=>{
   await previous?.catch(()=>{});if(!valid())return;
   // Spotify Connect can list the SDK device after the SDK emits ready.
   const delays=[0,300,750,1500,2500];
   for(const delay of delays){
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(!valid())return;
    try{
     await api(`/api/admin/venues/${ctx.id}/spotify/device`,{method:'PUT',body:{deviceId}});
     break;
    }catch(error){
     if(!valid())return;
     if(error.status!==400||error.message!=='Dispositivo no disponible')throw error;
     if(delay===delays.at(-1))throw Error('Spotify todavía no reconoce el audio de este navegador. Volvé a conectarlo o elegí una salida de Spotify Connect.');
    }
   }
   if(!valid())return;
   if(!registration.transferred||forceTransfer){
    await api(musicPath(ctx.id)+'/player',{method:'POST',body:{action:'transfer'}});
    if(!valid())return;
    registration.transferred=true;
   }
   registration.linkedDevice=deviceId;
   if(live(current)&&current.id===ctx.id&&current.session===ctx.session){
    current.settings.deviceId=deviceId;current.playback={...current.playback,device:{...current.playback?.device,id:deviceId}};
    current.root.querySelector('[data-browser-status]').textContent='Audio de TOCÁ conectado';
    await poll(current);
   }
  })();
  registration.linkPromise=linking;
  try{await linking}finally{if(registration.linkPromise===linking)registration.linkingDevice=null;}
 }
 function prepareBrowserReady(registration){
  clearTimeout(registration.readyTimer);
  registration.failure=null;
  registration.ready=new Promise((resolve,reject)=>{
   registration.resolveReady=()=>{clearTimeout(registration.readyTimer);resolve()};
   registration.rejectReady=error=>{clearTimeout(registration.readyTimer);registration.failure ||= error;reject(error)};
  });
  registration.ready.catch(()=>{});
  registration.readyTimer=setTimeout(()=>registration.rejectReady(Error('No se pudo preparar el audio del navegador. Volvé a conectarlo.')),20000);
 }
 async function startBrowser(registration){
  // A rejected token can leave the SDK's connect() promise pending. Readiness
  // must be able to reject immediately so the UI can offer authorization again.
  await Promise.all([registration.player.connect().then(connected=>{
   if(!connected)throw registration.failure||Error('No se pudo conectar el audio. Verificá Spotify Premium y los permisos de reproducción.');
  }),registration.ready]);
 }
 async function connect(ctx){
  if(ctx.settings.browserMissingScopes?.length)throw browserAuthorizationError();
  if(browser?.id===ctx.id&&browser.session===ctx.session){
   const registration=browser,wasSelected=registration.selected;
   registration.selected=true;await registration.player.activateElement();
   if(!registration.available){prepareBrowserReady(registration);await startBrowser(registration);}
   await registration.ready;
   if(registration.deviceId)await linkBrowser(ctx,registration.deviceId,registration,!wasSelected);
   return;
  }
  await loadSdk();if(!live(ctx))return;stopBrowser();
  const player=new Spotify.Player({name:'TOCÁ · '+(state.detail?.name||'Mi Bar'),volume:.5,getOAuthToken:callback=>{
   if(ctx.session!==state.token){stopBrowser();return}
   api(musicPath(ctx.id)+'/browser-token',{signal:new AbortController().signal}).then(data=>{if(ctx.session===state.token&&browser?.player===player)callback(data.accessToken)}).catch(error=>{
    if(browser?.player!==player)return;
    if(/Renová los permisos de Spotify|Spotify rechazó la autorización/i.test(error.message))error=browserAuthorizationError();
    browser.rejectReady(error);if(error.browserAuthorization)stopBrowser();reportError(current,error);
   });
  }});
  const registration={id:ctx.id,session:ctx.session,player,selected:true,selection:0,available:false};browser=registration;prepareBrowserReady(registration);
  ['initialization_error','authentication_error','account_error','playback_error'].forEach(type=>player.addListener(type,error=>{
   if(browser!==registration)return;
   const detail=error.message||'Spotify no informó el motivo.';
   const labels={initialization_error:'No se pudo preparar el audio de este navegador.',authentication_error:'Spotify rechazó la autorización. Reconectá la cuenta.',account_error:'La cuenta no permite reproducir en el navegador. Verificá Spotify Premium.',playback_error:'Spotify interrumpió la reproducción.'};
   const failure=type==='authentication_error'?browserAuthorizationError():Error(labels[type]+' '+detail);
   registration.rejectReady(failure);if(failure.browserAuthorization)stopBrowser();reportError(current,failure);
  }));
  player.addListener('autoplay_failed',()=>{if(browser===registration)notify(current,'Pulsá Reproducir para habilitar el audio en este navegador.');});
  player.addListener('ready',async({device_id})=>{
   if(browser!==registration||ctx.session!==state.token)return;
   registration.available=true;registration.deviceId=device_id;
   try{await linkBrowser(ctx,device_id,registration);registration.resolveReady();}catch(error){registration.rejectReady(error);notify(current,error.message)}
  });
  player.addListener('not_ready',({device_id}={})=>{
   if(browser!==registration||device_id&&device_id!==registration.deviceId)return;
   registration.available=false;
   if(registration.selected)notify(current,'El audio del navegador se desconectó. Volvé a habilitarlo.');
  });
  player.addListener('player_state_changed',data=>{const ctx=current;if(browser===registration&&live(ctx)&&browserSelected(ctx)){ctx.sdkEventRevision=(ctx.sdkEventRevision||0)+1;if(data)window.tocaMusicPlayback.sdk(ctx,data,{id:browser.deviceId,name:'TOCÁ · '+(state.detail?.name||'Mi Bar')});else void readBrowser(ctx)}});
  try{await player.activateElement();await startBrowser(registration);}
  catch(error){if(browser===registration)stopBrowser();throw error}
  finally{clearTimeout(registration.readyTimer)}
 }
 window.tocaInitAdminMusic=async(id,settings)=>{
  if(current)dispose(current);
  const root=document.querySelector('[data-admin-studio]');if(!root||!settings.connected){if(browser?.id===id)stopBrowser();current=null;return;}
  const ctx={id,root,settings,session:state.token,busy:false,operation:null,playlist:null,activityFingerprint:JSON.stringify(state.requests)};ctx.onPlayback=()=>renderPlayback(ctx);current=ctx;
  window.tocaCabinaInit?.(ctx);

  if(browser&&(browser.id!==id||browser.session!==ctx.session))stopBrowser();
  try{
   await reload(ctx);await recoverPendingEdit(ctx);await configureFirstPlaylist(ctx);
  }catch(error){
   if(live(ctx))renderPlaylist(ctx,{playlist:ctx.playlist,operation:ctx.operation,error:connectionMessage(error,'No se pudo cargar la playlist. Se volverá a intentar automáticamente.')});
  }
  if(live(ctx))await poll(ctx);
  if(live(ctx)){ctx.syncTimer=setInterval(()=>void syncPlaylist(ctx),7000);ctx.timer=setInterval(()=>{if(browser&&browser.session!==state.token)stopBrowser();void poll(ctx)},1000);ctx.clockTimer=setInterval(()=>{if(!live(ctx)){dispose(ctx);return}if(!document.hidden)renderTime(ctx);if(!document.hidden&&performance.now()-(ctx.sdkReadAt||0)>=500){ctx.sdkReadAt=performance.now();void readBrowser(ctx)}},250);}
 };
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-admin-studio] button');const ctx=current;
  if(!button||!ctx||!live(ctx)||button.disabled)return;
  try{
   if(button.hasAttribute('data-cabina-row-play')){
    const position=Number(button.dataset.cabinaRowPlay),track=ctx.playlist?.tracks[position];if(!track?.id)return;
    await control(ctx,window.tocaCabinaIsCurrent(ctx,track)?{action:ctx.playback.isPlaying?'pause':'resume'}:{action:'start',position,trackId:track.id,playlistId:ctx.playlist.id,snapshot:ctx.playlist.snapshot});return;
   }
   if(button.hasAttribute('data-cabina-track')){window.tocaCabinaOpenTrack(ctx,Number(button.dataset.cabinaTrack));updateButtons(ctx);return}
   if(button.hasAttribute('data-cabina-devices')){await loadDevices(ctx);return}
   if(button.hasAttribute('data-cabina-select-device')){
    if(ctx.outputSetup||ctx.audioSetup)return;
    ctx.outputSetup=selectDevice(ctx,button);
    try{await ctx.outputSetup}finally{ctx.outputSetup=null}
    await continuePlaybackAfterOutput(ctx);return;
   }
   if(button.hasAttribute('data-cabina-select-playlist')){await selectPlaylist(ctx);return}
   if(button.hasAttribute('data-browser-connect')){
    if(ctx.audioSetup||ctx.outputSetup)return;
    button.disabled=true;const setup={id:ctx.id,session:ctx.session,promise:connect(ctx)};audioSetup=setup;ctx.audioSetup=setup.promise;
    try{await setup.promise;}finally{ctx.audioSetup=null;if(audioSetup===setup)audioSetup=null}

    if(live(ctx)&&browser?.id===ctx.id&&browser.session===ctx.session&&browser.selected&&browser.deviceId&&browser.linkedDevice===ctx.settings.deviceId){
     ctx.root.querySelector('[data-browser-authorization]').hidden=true;
     if(await continuePlaybackAfterOutput(ctx))return;
     if(ctx.root.querySelector('[data-cabina-dialog="connection"][open]'))window.tocaCabinaClose?.(ctx);
     notify(ctx,'Audio conectado. Ya podés reproducir tu música.',true);
     toast('Audio conectado. Ya podés reproducir tu música.');
    }
    return;
   }
   if(button.hasAttribute('data-playback-apply')){await applyPlaybackOptions(ctx);return}
   if(button.hasAttribute('data-studio-create')||button.hasAttribute('data-studio-rename')){
    const name=ctx.root.querySelector('[data-studio-name]').value.trim();if(!name)throw Error('Ingresá un nombre para la playlist');
    event.preventDefault();await edit(ctx,{action:button.hasAttribute('data-studio-create')?'create':'rename',name});return;
   }
   if(button.hasAttribute('data-studio-edit')){
    if(button.disabled||ctx.busy||ctx.operation||sessionStorage.getItem(key(ctx.id)))return;
    const action=button.dataset.studioEdit;
    await edit(ctx,{action,...(action==='add'?{trackId:button.dataset.track}:action==='move'?{from:Number(button.dataset.from),to:Number(button.dataset.to)}:{position:Number(button.dataset.position)})});return;
   }
   let body;
   if(button.dataset.playerCommand)body={action:button.dataset.playerCommand};
   if(button.hasAttribute('data-player-toggle'))body=ctx.playback?.now?{action:ctx.playback.isPlaying?'pause':'resume'}:{action:'start',position:0};
   if(button.hasAttribute('data-player-start'))body={action:'start',position:0};
   if(button.hasAttribute('data-play-position'))body={action:'start',position:Number(button.dataset.playPosition)};
   if(body?.action==='start'){const track=ctx.playlist?.tracks[body.position];if(!track?.id)throw Error('La canción no está disponible. Actualizá la playlist.');body={...body,trackId:track.id,playlistId:ctx.playlist.id,snapshot:ctx.playlist.snapshot};}
   if(body){button.disabled=true;await control(ctx,body)}
  }catch(error){reportError(ctx,error)}finally{if(button.isConnected)button.disabled=false;updateButtons(ctx)}
 });
 document.addEventListener('change',async event=>{
  const ctx=current,input=event.target;if(!ctx||!live(ctx)||!input.closest('[data-admin-studio]'))return;
  let body;if(input.hasAttribute('data-player-seek'))body={action:'seek',positionMs:Number(input.value)};
  if(input.hasAttribute('data-cabina-volume'))body={action:'volume',volume:Number(input.value)};
  if(input.hasAttribute('data-player-volume'))body={action:'volume',volume:Number(input.value)};
  if(body?.action==='seek'){ctx.seeking=false;await control(ctx,body);return}
  if(body)try{await api(musicPath(ctx.id)+'/player',{method:'POST',body});notify(ctx,'Control enviado.');await poll(ctx)}catch(error){notify(ctx,error.message)}
 });
 let searchTimer,searchGeneration=0;
 document.addEventListener('input',event=>{
  const input=event.target;if(input.hasAttribute('data-player-seek')&&live(current))current.seeking=true;if(!input.hasAttribute('data-studio-search'))return;
  const ctx=current;if(!live(ctx))return;const generation=++searchGeneration,query=input.value.trim();clearTimeout(searchTimer);
  const output=ctx.root.querySelector('[data-studio-search-results]');if(query.length<2){output.innerHTML='';return}
  searchTimer=setTimeout(async()=>{
   try{const tracks=await api(`/api/admin/venues/${ctx.id}/tracks?q=${encodeURIComponent(query)}`);if(!live(ctx)||generation!==searchGeneration||!output.isConnected)return;
    output.innerHTML=tracks.map(t=>`<div class="toca-studio-track">${window.tocaCabinaArt(t)}<div class="toca-song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><button type="button" class="btn ghost small" data-studio-edit="add" data-track="${esc(t.id)}">Agregar</button></div>`).join('')||'<p>No se encontraron canciones.</p>';updateButtons(ctx);
   }catch(error){if(live(ctx)&&generation===searchGeneration&&output.isConnected)output.textContent=error.message}
  },300);
 });
 document.addEventListener('visibilitychange',()=>{
  const ctx=current;if(document.hidden||!live(ctx))return;
  renderTime(ctx);void readBrowser(ctx);void poll(ctx,true);syncSoon(ctx);
 });
 window.addEventListener('focus',()=>syncSoon(current));
 window.addEventListener('online',()=>syncSoon(current));
 window.addEventListener('pagehide',stopBrowser);
})();
