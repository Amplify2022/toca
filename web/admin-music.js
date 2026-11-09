/* Admin-only player and playlist editor. OAuth refresh tokens stay on the server. */
(() => {
 let current=null,sdkPromise=null,browser=null;
 const musicPath=id=>`/api/admin/venues/${encodeURIComponent(id)}/music`;
 const time=n=>{const seconds=Math.floor(Math.max(0,Number(n)||0)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`};
 const key=id=>'toca-music-edit:'+id;
 const live=ctx=>!!ctx&&ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId;
 const notify=(ctx,message)=>{if(live(ctx))ctx.root.querySelector('[data-studio-status]').textContent=message};
 function stopBrowser(){if(browser){browser.player.disconnect();browser=null}}
 window.tocaMusicDisconnect=()=>{stopBrowser();if(current){clearInterval(current.timer);current=null}};
 window.tocaAdminMusicMarkup=(venue,settings)=>`<section class="toca-studio" data-admin-studio data-venue-id="${esc(venue.id)}"><div class="toca-studio-head"><div><span class="eyebrow">CABINA DEL BAR</span><h2>Tu música, desde TOCÁ</h2><p>Creá y organizá tu playlist. Elegí dónde escucharla.</p></div><span class="pill ${settings.connected?'on':''}">Spotify ${settings.connected?'conectado':'sin conectar'}</span></div>${settings.connected?`<div class="toca-studio-player"><div class="toca-studio-now"><span class="toca-studio-art" aria-hidden="true">♫</span><div><strong data-player-title>Sin reproducción activa</strong><small data-player-artist>Elegí audio y reproducí tu playlist</small></div></div><div class="toca-player-controls"><button type="button" class="btn ghost small" data-player-command="previous" aria-label="Canción anterior" ${settings.controlEnabled?'':'disabled'}>${iconSvg('back',18)}</button><button type="button" class="btn" data-player-toggle ${settings.controlEnabled?'':'disabled'}>Reproducir</button><button type="button" class="btn ghost small" data-player-command="next" aria-label="Siguiente canción" ${settings.controlEnabled?'':'disabled'}>${iconSvg('arrow',18)}</button><button type="button" class="btn ghost small" data-player-start ${settings.controlEnabled?'':'disabled'}>Reproducir playlist</button></div><input type="range" class="toca-studio-seek" min="0" max="1" value="0" aria-label="Posición de reproducción" data-player-seek ${settings.controlEnabled?'':'disabled'} /><div class="toca-studio-time"><span data-player-elapsed>0:00</span><span data-player-duration>0:00</span></div><div class="toca-tool-row"><button type="button" class="btn ghost small" data-browser-connect ${settings.controlEnabled?'':'disabled'}>Usar audio de este navegador</button><span class="toca-studio-connection" data-browser-status>${browser?.id===venue.id?'Audio de TOCÁ conectado':'Requiere Spotify Premium y habilitar audio'}</span></div><div class="toca-studio-volume"><label>Volumen <input type="range" min="0" max="100" value="50" aria-label="Volumen" data-player-volume ${settings.controlEnabled?'':'disabled'} /></label><label><input type="checkbox" data-player-shuffle ${settings.controlEnabled?'':'disabled'} /> Aleatorio</label><label>Repetir <select class="input" data-player-repeat ${settings.controlEnabled?'':'disabled'}><option value="off">Desactivado</option><option value="context">Playlist</option><option value="track">Tema</option></select></label></div>${settings.controlEnabled?'':'<p class="notice">El control de audio está desactivado en este entorno.</p>'}</div><div data-studio-status role="status" class="toca-studio-status"></div><div data-studio-operation></div><div class="toca-tool-row"><h3 class="toca-grow" data-studio-playlist-name>Tu playlist</h3><button type="button" class="btn ghost small" data-studio-refresh>Actualizar</button></div><div class="toca-tool-row"><label class="toca-grow">Nombre de la playlist<input class="input" data-studio-name maxlength="100" placeholder="La noche de mi bar" /></label><button type="button" class="btn ghost small" data-studio-rename>Guardar nombre</button><button type="button" class="btn small" data-studio-create>Crear nueva playlist</button></div>${settings.playlistWriteEnabled?'':'<p class="notice">La edición de playlists está desactivada en este entorno.</p>'}<div class="toca-tool-row"><label class="toca-grow">Agregar música<input class="input" type="search" data-studio-search placeholder="Buscar canción o artista…" autocomplete="off" /></label></div><div class="toca-studio-search-results" data-studio-search-results></div><div class="toca-studio-list" data-studio-tracks aria-label="Canciones de la playlist"></div><p class="toca-muted">Los pedidos de clientes actualizan esta playlist. El reproductor puede conservar una cola precargada; «Reproducir playlist» permite retomarla desde el inicio.</p>`:'<p>Conectá tu cuenta en la configuración de abajo para comenzar.</p>'}</section>`;
 function updateButtons(ctx){
  if(!live(ctx))return;
  ctx.root.querySelectorAll('[data-studio-edit],[data-studio-create],[data-studio-rename]').forEach(b=>{b.disabled=!ctx.settings.playlistWriteEnabled||ctx.busy||!!ctx.operation||!!sessionStorage.getItem(key(ctx.id))});
 }
 function renderPlaylist(ctx,data){
  if(!live(ctx))return;
  ctx.playlist=data.playlist;ctx.operation=data.operation;if(data.error)notify(ctx,data.error);
  const root=ctx.root,playlist=ctx.playlist;
  root.querySelector('[data-studio-playlist-name]').textContent=playlist?`${playlist.name} · ${playlist.tracks.length} temas`:'Todavía no hay playlist seleccionada';
  if(document.activeElement!==root.querySelector('[data-studio-name]'))root.querySelector('[data-studio-name]').value=playlist?.name||'';
  root.querySelector('[data-studio-tracks]').innerHTML=playlist?.tracks.length?playlist.tracks.map((t,i)=>`<div class="toca-studio-track"><span>${i+1}</span><div class="toca-song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${time(t.durationMs)}</small></div><div class="toca-track-actions"><button type="button" class="btn ghost small" data-play-position="${i}" aria-label="Reproducir ${esc(t.title)}" ${ctx.settings.controlEnabled&&t.id?'':'disabled'}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 4 13 8-13 8z"/></svg></button>${i>0?`<button type="button" class="btn ghost small" data-studio-edit="move" data-from="${i}" data-to="${i-1}" aria-label="Subir ${esc(t.title)}">↑</button>`:''}${i<playlist.tracks.length-1?`<button type="button" class="btn ghost small" data-studio-edit="move" data-from="${i}" data-to="${i+1}" aria-label="Bajar ${esc(t.title)}">↓</button>`:''}${t.id?`<button type="button" class="btn ghost small" data-studio-edit="remove" data-position="${i}" aria-label="Quitar ${esc(t.title)}">Quitar</button>`:''}</div></div>`).join(''):'<p>Buscá un tema para comenzar o creá una playlist nueva.</p>';
  root.querySelector('[data-studio-operation]').innerHTML=ctx.operation?`<div class="notice"><p>${esc(ctx.operation.message||'Hay una edición en proceso de verificación.')}</p><button type="button" class="btn ghost small" data-studio-reconcile>Consultar resultado</button> <button type="button" class="btn ghost small" data-studio-accept>Aceptar estado actual</button></div>`:'';
  updateButtons(ctx);
 }
 async function reload(ctx){const data=await api(musicPath(ctx.id)+'/playlist');renderPlaylist(ctx,data)}
 async function poll(ctx){
  if(!live(ctx)){clearInterval(ctx.timer);return}
  if(document.hidden||ctx.polling)return;ctx.polling=true;
  try{
   const data=await api(musicPath(ctx.id)+'/player');if(!live(ctx))return;
   ctx.playback=data;const root=ctx.root,track=data.now;
   root.querySelector('[data-player-title]').textContent=track?.title||'Sin reproducción activa';
   root.querySelector('[data-player-artist]').textContent=track?.artist||'Seleccioná el audio y reproducí tu playlist';
   root.querySelector('[data-player-toggle]').textContent=data.isPlaying?'Pausar':'Reproducir';
   root.querySelector('[data-player-elapsed]').textContent=time(data.progressMs);root.querySelector('[data-player-duration]').textContent=time(track?.durationMs);
   const seek=root.querySelector('[data-player-seek]');if(document.activeElement!==seek){seek.max=track?.durationMs||1;seek.value=data.progressMs||0}
   const volume=root.querySelector('[data-player-volume]');if(document.activeElement!==volume&&data.device)volume.value=data.device.volume;
   const shuffle=root.querySelector('[data-player-shuffle]');if(document.activeElement!==shuffle)shuffle.checked=!!data.shuffle;
   const repeat=root.querySelector('[data-player-repeat]');if(document.activeElement!==repeat)repeat.value=data.repeat||'off';
  }catch(error){notify(ctx,error.message)}finally{ctx.polling=false}
 }
 async function edit(ctx,body){
  if(ctx.busy||ctx.operation)return;ctx.busy=true;updateButtons(ctx);
  const id=crypto.randomUUID(),input={...body,...(body.action==='create'?{}:{snapshot:ctx.playlist?.snapshot})};
  sessionStorage.setItem(key(ctx.id),JSON.stringify({id,input}));
  try{
   const result=await api(musicPath(ctx.id)+`/edits/${id}`,{method:'POST',body:input});
   sessionStorage.removeItem(key(ctx.id));
   notify(ctx,result.status==='COMPLETED'?'Playlist actualizada.':result.message||'Edición pendiente de verificación.');
   if(result.status==='COMPLETED'&&result.result?.playlistId){
    ctx.settings.playlistId=result.result.playlistId;state.spotify.playlistId=result.result.playlistId;
    localStorage.setItem(tocaPlaylistNameKey(ctx.id,result.result.playlistId),result.result.name);
    const label=document.getElementById('toca-selected-playlist-name');if(label)label.textContent=result.result.name;
   }
   await reload(ctx);
  }catch(error){notify(ctx,error.message+' Actualizá para consultar el resultado antes de volver a editar.');ctx.operation={id,status:'UNKNOWN'};try{await reload(ctx)}catch{} }
  finally{ctx.busy=false;updateButtons(ctx)}
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
  if(live(current)){
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
  player.addListener('player_state_changed',()=>{if(current)void poll(current)});
  if(!await player.connect()){stopBrowser();throw Error('No se pudo conectar el audio. Verificá Spotify Premium y los permisos de reproducción.');}
 }
 window.tocaInitAdminMusic=async(id,settings)=>{
  if(current)clearInterval(current.timer);
  const root=document.querySelector('[data-admin-studio]');if(!root||!settings.connected){if(browser?.id===id)stopBrowser();current=null;return;}
  const ctx={id,root,settings,session:state.token,busy:false,operation:null,playlist:null};current=ctx;
  if(browser&&(browser.id!==id||browser.session!==ctx.session))stopBrowser();
  try{
   const saved=JSON.parse(sessionStorage.getItem(key(id))||'null');
   if(saved){const result=await api(musicPath(id)+`/edits/${saved.id}`,{method:'POST',body:saved.input});if(!['PREPARING','APPLYING'].includes(result.status))sessionStorage.removeItem(key(id));}
   await reload(ctx);await poll(ctx);
  }catch(error){notify(ctx,error.message)}
  if(live(ctx))ctx.timer=setInterval(()=>{if(browser&&browser.session!==state.token)stopBrowser();void poll(ctx)},7000);
 };
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-admin-studio] button');const ctx=current;
  if(!button||!ctx||!live(ctx)||button.disabled)return;
  try{
   if(button.hasAttribute('data-studio-refresh')){await window.tocaInitAdminMusic(ctx.id,ctx.settings);return}
   if(button.hasAttribute('data-browser-connect')){button.disabled=true;await connect(ctx);return}
   if(button.hasAttribute('data-studio-create')||button.hasAttribute('data-studio-rename')){
    const name=ctx.root.querySelector('[data-studio-name]').value.trim();if(!name)throw Error('Ingresá un nombre para la playlist');
    await edit(ctx,{action:button.hasAttribute('data-studio-create')?'create':'rename',name});return;
   }
   if(button.hasAttribute('data-studio-edit')){
    const action=button.dataset.studioEdit;if(action==='remove'&&!confirm('¿Quitar esta canción de la playlist?'))return;
    await edit(ctx,{action,...(action==='add'?{trackId:button.dataset.track}:action==='move'?{from:Number(button.dataset.from),to:Number(button.dataset.to)}:{position:Number(button.dataset.position)})});return;
   }
   if(button.hasAttribute('data-studio-reconcile')||button.hasAttribute('data-studio-accept')){
    if(!ctx.operation)return;
    let body={};if(button.hasAttribute('data-studio-accept')){
     if(!confirm('¿Revisaste la lista actual? Se aceptará ese estado sin repetir la edición anterior.'))return;
     body={...(ctx.playlist?{acceptSnapshot:ctx.playlist.snapshot}:{}),...(ctx.operation.action==='create'?{acceptMissing:true}:{})};
    }
    const result=await api(musicPath(ctx.id)+`/edits/${ctx.operation.id}/reconcile`,{method:'POST',body});notify(ctx,result.status==='COMPLETED'?'Edición confirmada.':result.message||result.status);await reload(ctx);return;
   }
   let body;
   if(button.dataset.playerCommand)body={action:button.dataset.playerCommand};
   if(button.hasAttribute('data-player-toggle'))body={action:ctx.playback?.isPlaying?'pause':ctx.playback?.now?'resume':'start',position:0};
   if(button.hasAttribute('data-player-start'))body={action:'start',position:0};
   if(button.hasAttribute('data-play-position'))body={action:'start',position:Number(button.dataset.playPosition)};
   if(body){browser?.player.activateElement();button.disabled=true;await api(musicPath(ctx.id)+'/player',{method:'POST',body});notify(ctx,'Control enviado.');await poll(ctx)}
  }catch(error){notify(ctx,error.message)}finally{if(button.isConnected)button.disabled=false;updateButtons(ctx)}
 });
 document.addEventListener('change',async event=>{
  const ctx=current,input=event.target;if(!ctx||!live(ctx)||!input.closest('[data-admin-studio]'))return;
  let body;if(input.hasAttribute('data-player-seek'))body={action:'seek',positionMs:Number(input.value)};
  if(input.hasAttribute('data-player-volume'))body={action:'volume',volume:Number(input.value)};
  if(input.hasAttribute('data-player-shuffle'))body={action:'shuffle',enabled:input.checked};
  if(input.hasAttribute('data-player-repeat'))body={action:'repeat',state:input.value};
  if(body)try{await api(musicPath(ctx.id)+'/player',{method:'POST',body});notify(ctx,'Control enviado.');await poll(ctx)}catch(error){notify(ctx,error.message)}
 });
 let searchTimer,searchGeneration=0;
 document.addEventListener('input',event=>{
  const input=event.target;if(!input.hasAttribute('data-studio-search'))return;
  const ctx=current,generation=++searchGeneration,query=input.value.trim();clearTimeout(searchTimer);
  const output=ctx.root.querySelector('[data-studio-search-results]');if(query.length<2){output.innerHTML='';return}
  searchTimer=setTimeout(async()=>{
   try{const tracks=await api(`/api/admin/venues/${ctx.id}/tracks?q=${encodeURIComponent(query)}`);if(!live(ctx)||generation!==searchGeneration)return;
    output.innerHTML=tracks.map(t=>`<div class="toca-studio-track"><div class="toca-song-meta"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><button type="button" class="btn ghost small" data-studio-edit="add" data-track="${esc(t.id)}">Agregar</button></div>`).join('')||'<p>No se encontraron canciones.</p>';updateButtons(ctx);
   }catch(error){if(live(ctx)&&generation===searchGeneration)output.textContent=error.message}
  },300);
 });
 window.addEventListener('pagehide',stopBrowser);
})();
