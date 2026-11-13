/* Presentation for the admin music studio. Commands and durable edits stay in admin-music.js. */
(() => {
 'use strict';
 let panelState=null,returnFocus=null;
 const svg=(name,size=18)=>{
  const paths={play:'<path d="m7 4 10 6-10 6Z" fill="currentColor" stroke="none"/>',pause:'<path d="M7 4v12m7-12v12" stroke-width="3.5"/>',previous:'<path d="m16 5-8 5 8 5Z" fill="currentColor" stroke="none"/><path d="M5 4v12"/>',next:'<path d="m4 5 8 5-8 5Z" fill="currentColor" stroke="none"/><path d="M15 4v12"/>',speaker:'<rect x="4" y="2" width="12" height="16" rx="2"/><circle cx="10" cy="12" r="3"/><circle cx="10" cy="5" r=".8"/>',volume:'<path d="M3 8h3l4-4v12l-4-4H3Zm10-1a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12"/>',dots:'<circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/>',close:'<path d="m5 5 10 10M5 15 15 5"/>',list:'<path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"/>',up:'<path d="M10 16V4m-5 5 5-5 5 5"/>',down:'<path d="M10 4v12m-5-5 5 5 5-5"/>',edit:'<path d="m12 4 4 4M4 16l4-1L17 6l-3-3-9 9-1 4Z"/>',trash:'<path d="M3 5h14M8 2h4l1 3H7ZM5 5l1 13h8l1-13M8 8v7m4-7v7"/>',spotify:'<circle cx="10" cy="10" r="8"/><path d="M5 7c3-1 6-1 10 1M6 10c3-1 5-1 8 1M7 13c2-.5 4-.5 6 .5"/>',grip:'<circle cx="7" cy="5" r=".8"/><circle cx="13" cy="5" r=".8"/><circle cx="7" cy="10" r=".8"/><circle cx="13" cy="10" r=".8"/><circle cx="7" cy="15" r=".8"/><circle cx="13" cy="15" r=".8"/>',wave:'<path d="M3 8v4m4-7v10m4-12v14m4-10v6m4-4v2"/>'};
  return paths[name]?`<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`:iconSvg(name,size);
 };
 const ms=n=>{const v=Math.floor(Math.max(0,Number(n)||0)/1000);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`};
 const button=(label,attributes,ic='',kind='')=>`<button type="button" class="btn ${kind}" ${attributes}>${ic?svg(ic):''}${label}</button>`;
 const imageUrl=value=>{try{const url=new URL(value,location.origin);return value&&(url.protocol==='https:'||url.origin===location.origin)?url.href:''}catch{return ''}};
 const art=t=>{const url=imageUrl(t?.imageUrl);return `<span class="cabina-art" aria-hidden="true">${svg('music',19)}<i>${esc((t?.artist||'TOCÁ').slice(0,2).toUpperCase())}</i>${url?`<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`};
 window.tocaCabinaArt=art;
 document.addEventListener('error',event=>{if(event.target.matches?.('.cabina-art img'))event.target.remove()},true);
 const modal=(id,title,body,wide=false)=>`<dialog class="cabina-dialog ${wide?'wide':''}" data-cabina-dialog="${id}" aria-labelledby="cabina-${id}-title"><div class="cabina-dialog-head"><h2 id="cabina-${id}-title">${title}</h2>${button('<span class="sr-only">Cerrar</span>','data-cabina-close','close','icon-btn')}</div>${body}<p class="cabina-dialog-status" data-cabina-dialog-status role="status"></p></dialog>`;
 const actions=body=>`<div class="cabina-dialog-actions">${body}</div>`;
 const playbackChoices=(field,title,options,disabled)=>`<fieldset class="cabina-choice-group"><legend>${title}</legend>${options.map(([value,label,copy])=>`<label class="cabina-choice"><input type="radio" name="cabina-${field}" data-player-${field} value="${value}" ${disabled}><span><strong>${label}</strong><small>${copy}</small></span></label>`).join('')}</fieldset>`;
 function activity(requests,all=false){
  const labels={DISPATCHED:'Agregada a la playlist',PENDING:'Pedido en proceso',APPROVED:'Pedido aceptado',PLAYED:'Marcada como reproducida',REJECTED:'Pedido rechazado',FAILED:'No se pudo agregar'};
  const rows=Array.isArray(requests)?requests:[];
  return (all?rows:rows.slice(0,3)).map(t=>`<div class="cabina-event"><span class="event-icon">${svg(t.status==='DISPATCHED'?'check':'clock',13)}</span><div><strong>${esc(t.title||'Canción solicitada')}</strong><p>${esc(labels[t.status]||statusLabel(t.status))}</p><small>${esc(t.createdAt?new Date(t.createdAt).toLocaleString('es-UY',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Pedido registrado')}</small></div></div>`).join('')||'<p class="cabina-empty-small">Todavía no hay pedidos. La actividad aparecerá acá.</p>';
 }
 function rules(venue,{blocks=[],allows=[]}){
  const list=(rows,mode)=>rows.map(t=>`<div class="toca-rule-item"><div class="toca-song-meta"><strong>${esc(t.title||'Canción guardada')}</strong><small>${esc(t.artist||'Sin artista registrado')}</small></div>${button('Quitar',`data-action="${mode==='BLOCK'?'unblock':'unallow'}" data-id="${esc(t.trackId)}"`,'close','small')}</div>`).join('')||'<p class="cabina-empty-small">Todavía no hay canciones en esta lista.</p>';
  const search=(mode,label)=>`<section class="toca-rule-search" data-rule-mode="${mode}"><label for="rule-search-${mode}">${label}</label><input class="input" id="rule-search-${mode}" type="search" autocomplete="off" placeholder="Canción o artista" /><div class="toca-rule-results" id="rule-results-${mode}" aria-live="polite"><p class="cabina-empty-small">Escribí al menos dos caracteres.</p></div></section>`;
  const enabled=state.demo?db().curatedOnly:venue.curatedOnly;
  return `<p class="dialog-copy">Estas reglas se aplican a los nuevos pedidos. La música que ya está sonando sigue su curso.</p><div class="cabina-rule-policy"><div><strong>Solo canciones permitidas</strong><p>Al activarlo, los clientes solo pueden pedir canciones de tu lista de permitidas.</p></div><button type="button" class="cabina-switch ${enabled?'on':''}" role="switch" aria-checked="${!!enabled}" data-action="toggle-curated" aria-label="Usar solo canciones permitidas"><i></i></button></div><div class="cabina-rules-grid"><section><h3>Canciones bloqueadas</h3><p>No se pueden pedir en tu bar.</p>${search('BLOCK','Bloquear una canción')}${list(blocks,'BLOCK')}</section><section><h3>Canciones permitidas</h3><p>Se usan cuando activás la lista de permitidas.</p>${search('ALLOW','Permitir una canción')}${list(allows,'ALLOW')}</section></div><p class="cabina-help">El acceso por distancia o desde cualquier lugar se configura en <a href="#/admin/profile/access">Mi Bar → Quién puede pedir</a>.</p>`;
 }
 window.tocaCabinaMarkup=(venue,settings,options={})=>{
  const playback=settings.connected&&!state.demo&&settings.controlEnabled,write=settings.connected&&!state.demo&&settings.playlistWriteEnabled;
  const disabled=playback?'':'disabled',locked=write?'':'disabled';
  return `<section class="toca-cabina" data-admin-studio data-venue-id="${esc(venue.id)}"><header class="cabina-heading"><div><span class="eyebrow">LA CABINA DE TU BAR</span><h1>Música</h1><p>Tu playlist y el control de la noche, en un solo lugar.</p></div><div class="cabina-heading-actions">${button('<span>Reglas</span>','data-cabina-open="rules"','sliders')}${button('<span>Conexión</span>','data-cabina-open="connection"','spotify')}</div></header>${settings.error?`<p class="cabina-notice">No pudimos comprobar la conexión de Spotify. ${esc(settings.error)}</p>`:''}${state.demo?'<p class="cabina-notice">Demostración · Canciones ilustrativas, sin reproducción ni cambios reales en Spotify.</p>':''}
  ${settings.connected&&!state.demo&&(!write||!playback)?`<div class="cabina-notice" data-cabina-permissions><div>${!write?'<strong>Edición de playlist deshabilitada.</strong><p>La cuenta está conectada, pero el servidor todavía no permite agregar ni mover canciones.</p>':''}${!playback?'<strong>Reproducción deshabilitada.</strong><p>El control de audio debe estar habilitado en el servidor.</p>':''}</div>${button('Ver conexión','data-cabina-open="connection"','info','small')}</div>`:''}<div data-studio-status class="cabina-status" role="status" aria-live="polite"></div><div data-studio-operation></div>
  ${settings.connected?`<div class="cabina-status-strip"><span class="cabina-connected"><i></i>Spotify conectado</span><span class="cabina-account">${esc(settings.profile||settings.spotifyUserId||'Cuenta del bar')}</span><span class="cabina-device">${svg('speaker',14)}<span data-player-device>Sin salida activa</span></span>${button('Cambiar salida','data-cabina-open="connection"',null,'small')}</div><div class="cabina-grid"><section class="cabina-panel cabina-playlist"><header class="cabina-panel-head"><div><span class="eyebrow">PLAYLIST DEL BAR</span><button type="button" class="cabina-playlist-selector" data-cabina-open="playlist-options" data-cabina-selection aria-label="Administrar playlist" aria-haspopup="dialog" ${locked}><span data-studio-playlist-name>Cargando playlist…</span>${svg('down',14)}</button><p data-playlist-count>Consultando canciones</p></div><div class="cabina-inline">${button('Agregar canción','data-cabina-open="add"','plus','primary')}</div></header><div class="cabina-list-tools">${button('Reproducir playlist','data-cabina-start','play','small')}<span class="cabina-sync-note" data-playlist-sync role="status">Se actualiza automáticamente</span></div><div class="cabina-track-head"><span>#</span><span></span><span>Canción</span><span class="cabina-duration-head">Dur.</span><span></span><span></span></div><p id="cabina-drag-help" class="sr-only">Arrastrá la canción o usá el control de puntos. En celular, arrastrá desde los puntos. Acercate a los bordes para desplazar la lista. Con teclado, presioná Espacio, usá las flechas, Inicio o Fin y confirmá con Enter. Escape cancela.</p><div class="cabina-track-list" data-studio-tracks aria-label="Canciones de la playlist"><p class="cabina-empty-small">Cargando canciones…</p></div><footer class="cabina-playlist-footer"><span class="cabina-save-note">Los cambios se guardan en Spotify.</span><button type="button" class="cabina-mobile-activity" data-cabina-open="activity">Actividad de clientes →</button><details><summary>Sobre el orden</summary><p>Los pedidos modifican esta playlist. Spotify puede conservar canciones que ya tenía preparadas. «Reproducir playlist» vuelve al comienzo.</p></details></footer></section><aside class="cabina-side"><section class="cabina-panel cabina-session"><span class="eyebrow">PARTICIPACIÓN</span><div class="cabina-session-title"><h3>Pedidos ${venue.active?'abiertos':'pausados'}</h3><button type="button" class="cabina-switch ${venue.active?'on':''}" data-action="toggle-session" role="switch" aria-checked="${!!venue.active}" aria-label="Aceptar pedidos de clientes"><i></i></button></div><p>${venue.active?'Tus clientes eligen canciones y TOCÁ las agrega a la playlist.':'La música puede seguir sonando. Los clientes no pueden hacer nuevos pedidos.'}</p><div class="cabina-session-bottom"><span>${venue.requestAccessMode==='ANYWHERE'?'Desde cualquier lugar':'A menos de 100 m'}</span><a href="#/admin/profile/access">Cambiar acceso ${svg('arrow',12)}</a></div></section><section class="cabina-panel cabina-activity"><div class="cabina-panel-head"><div><span class="eyebrow">PASÓ EN TU BAR</span><h3>Actividad de clientes</h3></div></div><div data-cabina-recent-activity>${activity(options.requests)}</div>${button('Ver actividad','data-cabina-open="activity"','arrow','text')}</section><p class="cabina-help">${svg('info',15)}La música y los pedidos se controlan por separado. Podés pausar uno sin pausar el otro.</p></aside></div>
  <footer class="cabina-player" aria-label="Reproductor de música"><div class="cabina-song"><span data-player-art>${art(null)}</span><div class="cabina-song-meta"><strong data-player-title>Sin reproducción activa</strong><small data-player-artist>Elegí audio y reproducí tu playlist</small><small class="cabina-player-sync" data-player-sync role="status"></small></div></div><div class="cabina-player-center"><div class="cabina-transport">${button('<span class="sr-only">Canción anterior</span>','data-player-command="previous" '+disabled,'previous','icon-btn')}<button type="button" class="cabina-play" data-player-toggle aria-label="Reproducir música" ${disabled}>${svg('play')}<span class="sr-only">Reproducir</span></button>${button('<span class="sr-only">Siguiente canción</span>','data-player-command="next" '+disabled,'next','icon-btn')}</div><div class="cabina-seek"><span data-player-elapsed>0:00</span><input type="range" min="0" max="1" value="0" aria-label="Posición de reproducción" data-player-seek ${disabled}><span data-player-duration>0:00</span></div></div><div class="cabina-player-output"><button type="button" class="cabina-output" data-cabina-open="connection">${svg('speaker',13)}<span data-player-output>Elegir salida</span>${svg('arrow',12)}</button><label class="cabina-volume">${svg('volume',14)}<input type="range" min="0" max="100" value="50" aria-label="Volumen" data-player-volume ${disabled}></label></div>${button('<span class="sr-only">Más controles de reproducción</span>','data-cabina-open="playback"','sliders','icon-btn cabina-playback-more')}</footer>
  ${modal('add','Sumá una canción.',`<p class="dialog-copy">Buscá por nombre o artista. Se agrega al final de la playlist del bar.</p>${!write?'<p class="cabina-notice">Podés buscar canciones. Para agregarlas, el administrador debe habilitar la edición en el servidor.</p>':''}<label class="cabina-field">Canción o artista<input class="input" type="search" data-studio-search placeholder="Buscar en Spotify…" autocomplete="off"></label><div class="cabina-add-feedback" data-cabina-add-feedback role="status" aria-live="polite" hidden></div><div class="cabina-search-results" data-studio-search-results></div>`)}
  ${modal('name','Tu playlist.',`<form data-cabina-name-form><p class="dialog-copy" data-cabina-name-copy></p><label class="cabina-field">Nombre de la playlist<input class="input" data-studio-name required maxlength="100" placeholder="La noche de mi bar"></label>${actions(`${button('Cancelar','data-cabina-close')}<button type="submit" class="btn primary" data-studio-rename>Guardar nombre</button><button type="submit" class="btn primary" data-studio-create>Crear playlist</button>`)}</form>`)}
  ${modal('select-playlist','Elegí la playlist del bar.',`<p class="dialog-copy">Los pedidos nuevos se agregarán a la playlist que elijas. Cambiarla no reinicia la reproducción.</p><div id="playlist-container" data-cabina-playlists></div>`)}
  ${modal('playlist-options','Administrar playlist.',`<p class="dialog-copy">Elegí otra playlist, cambiá su nombre o creá una nueva para tu bar.</p><div class="cabina-menu">${button('Cambiar nombre','data-cabina-name-mode="rename" data-cabina-mutation '+locked,'edit')}${button('Crear una playlist nueva','data-cabina-name-mode="create" data-cabina-create-open '+locked,'plus')}${button('Elegir otra playlist','data-cabina-open="select-playlist" data-cabina-selection '+locked,'list')}</div>`)}
  ${modal('track','Opciones de canción.','<div data-cabina-track-menu class="cabina-menu"></div>')}
  ${modal('start','Reproducir desde el comienzo.',`<p class="dialog-copy">Se iniciará la playlist seleccionada desde la primera canción. Esto cambia la reproducción actual.</p>${actions(button('Cancelar','data-cabina-close')+button('Reproducir playlist','data-player-start '+disabled,'play','primary'))}`)}
  ${modal('playback','Controles de reproducción.',`<p class="dialog-copy">Elegí el orden de las canciones y qué querés repetir. Los cambios se aplican cuando confirmás.</p>${playbackChoices('shuffle','Orden de reproducción',[['off','En orden','Seguir el orden de la playlist.'],['on','Aleatorio','Mezclar las canciones de la playlist.']],disabled)}${playbackChoices('repeat','Repetición',[['off','Sin repetir','Al terminar la lista, no volver al inicio.'],['context','Repetir playlist','Volver al comienzo cuando termine.'],['track','Repetir canción','Volver a escuchar la canción actual.']],disabled)}${actions(button('Cancelar','data-cabina-close')+button('Aplicar cambios','data-playback-apply '+disabled,'check','primary'))}`)}
  `:`<section class="cabina-panel cabina-empty"><span class="cabina-empty-icon">${svg('spotify',30)}</span><span class="eyebrow">PRIMERA CONEXIÓN</span><h2>La música empieza acá.</h2><p>Conectá la cuenta de Spotify del bar. Después vas a poder elegir o crear una playlist y manejar la reproducción desde TOCÁ.</p>${button('Conectar Spotify','data-action="connect-spotify"','spotify','primary')}<small>Necesitás Spotify Premium para reproducir desde la app.</small></section>`}
  ${modal('connection','Conexión de Spotify.',`<div class="cabina-account-card"><span class="eyebrow">CUENTA DEL BAR</span><h3>${esc(settings.connected?(settings.profile||settings.spotifyUserId||'Spotify conectado'):'Spotify sin conectar')}</h3><p class="dialog-copy">${settings.connected?'La música se gestiona desde TOCÁ. Para reproducir necesitás Spotify Premium.':'Conectá una cuenta para elegir tu música y habilitar el reproductor.'}</p><p class="cabina-notice" data-browser-authorization ${settings.browserMissingScopes?.length?'':'hidden'}>Renová los permisos para habilitar el audio del navegador. Elegí la misma cuenta de Spotify: tu playlist y las configuraciones se conservan.</p>${actions(button(settings.connected?'Renovar permisos':'Conectar Spotify','data-action="connect-spotify"','spotify','small')+(settings.connected?button('Desconectar','data-cabina-disconnect','','small text'):''))}</div>${settings.connected?`<section class="cabina-output-card"><h3>¿Dónde suena la música?</h3><p class="dialog-copy">Activá el audio de este navegador o elegí un dispositivo disponible.</p>${button('Usar audio de este navegador','data-browser-connect '+disabled,'speaker','primary')}<p class="cabina-help" data-browser-status>Requiere habilitar el audio y mantener esta pestaña abierta.</p>${button('Buscar dispositivos Spotify Connect','data-cabina-devices '+disabled,'speaker','small')}<div id="device-container" data-cabina-devices-list></div><label class="cabina-field cabina-mobile-volume">Volumen del audio<input type="range" min="0" max="100" value="50" aria-label="Volumen del audio" data-cabina-volume ${disabled}></label>${playback?'':'<p class="cabina-notice">El control de audio no está habilitado para esta conexión.</p>'}</section>`:''}`)}
  ${modal('rules','Reglas de tu bar.',rules(venue,options),true)}
  ${modal('activity','Actividad de clientes.',`<p class="dialog-copy">Los pedidos se procesan automáticamente; no necesitan aprobación.</p><div data-cabina-all-activity>${activity(options.requests,true)}</div><p class="cabina-help">Agregar una canción a la playlist no garantiza que sea la siguiente del reproductor.</p>`)}
  ${modal('disconnect','¿Desconectar Spotify?',`<p class="dialog-copy">Se cerrarán los pedidos y se desvinculará la playlist. Para volver a administrar la música vas a tener que conectar la cuenta otra vez.</p>${actions(button('Cancelar','data-cabina-close')+button('Desconectar','data-action="disconnect-spotify"','', 'primary'))}`)}
  </section>`;
 };
 function show(root,name,trigger){
  const dialog=root.querySelector(`[data-cabina-dialog="${name}"]`);if(!dialog)return;
  root.querySelectorAll('dialog[open]').forEach(el=>el.close());
  if(trigger)returnFocus=trigger;
  panelState={id:root.dataset.venueId,session:state.token,name};
  dialog.showModal();dialog.querySelector('[data-cabina-close]')?.focus();
  if(name==='add')dialog.querySelector('input')?.focus();
 }
 function close(root){const dialogs=[...root.querySelectorAll('dialog[open]')];if(!dialogs.length)return;dialogs.forEach(el=>el.close());panelState=null;if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus();else root.querySelector('[data-cabina-open="playlist-options"],.cabina-heading-actions button')?.focus();}
 window.tocaCabinaInit=ctx=>{
  window.tocaCabinaDragInit?.(ctx);
  if(panelState&&(panelState.id!==ctx.id||panelState.session!==ctx.session))panelState=null;
  if(panelState&&['rules','connection','activity'].includes(panelState.name))show(ctx.root,panelState.name);
 };
 window.tocaCabinaReset=()=>{window.tocaCabinaDragCancel?.();panelState=null;returnFocus=null;};
 const isCurrent=(ctx,t)=>!!t.id&&ctx.playback?.now?.id===t.id&&ctx.playback?.contextUri===`spotify:playlist:${ctx.playlist?.id}`;
 const rowPlay=(ctx,t)=>{const playing=isCurrent(ctx,t)&&ctx.playback.isPlaying;return svg(playing?'pause':'play')+`<span class="sr-only">${playing?'Pausar':'Reproducir'} ${esc(t.title)}</span>`};
 window.tocaCabinaTracks=ctx=>ctx.playlist?.tracks.length?ctx.playlist.tracks.map((t,i)=>`<div class="toca-studio-track cabina-track" data-track-index="${i}" data-track-id="${esc(t.id||'')}"><span class="cabina-track-number">${i+1}</span><button type="button" class="btn icon-btn cabina-drag" data-cabina-drag="${i}" aria-label="Mover ${esc(t.title)}" aria-describedby="cabina-drag-help" aria-pressed="false" title="Arrastrar para cambiar el orden">${svg('grip')}</button><div class="cabina-song">${art(t)}<div class="cabina-song-meta"><div class="cabina-title-row"><strong>${esc(t.title)}</strong><span class="cabina-added-badge" data-cabina-added-badge hidden>Agregado</span></div><small>${esc(t.artist)}</small></div></div><span class="cabina-duration">${ms(t.durationMs)}</span><button type="button" class="btn icon-btn cabina-row-play" data-cabina-row-play="${i}" ${t.id?'':'disabled'}>${rowPlay(ctx,t)}</button><button type="button" class="btn icon-btn" data-cabina-track="${i}" aria-label="Opciones de ${esc(t.title)}">${svg('dots')}</button></div>`).join(''):`<div class="cabina-empty-list"><strong>${ctx.playlist?'Tu playlist está lista para recibir canciones.':'Todavía no elegiste una playlist.'}</strong><p>${ctx.playlist?'Usá «Agregar» para empezar.':'Elegí una de Spotify o creá una nueva desde el menú de playlist.'}</p>${button('Elegir playlist','data-cabina-open="select-playlist" data-cabina-selection','list','small')}${button('Crear playlist','data-cabina-name-mode="create" data-cabina-create-open','plus','small')}</div>`;
 window.tocaCabinaIsCurrent=isCurrent;

 window.tocaCabinaPlaylistUpdated=ctx=>{
  window.tocaCabinaDragCancel?.();
  const root=ctx.root;
  root.querySelector('[data-playlist-count]').textContent=ctx.playlist?`${ctx.playlist.tracks.length} canciones${ctx.settings.playlistWriteEnabled?' · Arrastrá para ordenar':''}`:'Elegí o creá la playlist del bar';
  root.querySelector('[data-cabina-dialog="track"]')?.close();
  if(panelState?.name==='track')panelState=null;
  window.tocaCabinaEditFeedback?.(ctx);
 };
 window.tocaCabinaPlaybackUpdated=ctx=>{
  const root=ctx.root,data=ctx.playback||{};
  const toggle=root.querySelector('[data-player-toggle]');if(!toggle)return;
  toggle.innerHTML=svg(data.isPlaying?'pause':'play')+`<span class="sr-only">${data.isPlaying?'Pausar':'Reproducir'}</span>`;
  toggle.setAttribute('aria-label',data.isPlaying?'Pausar música':'Reproducir música');
  const image=root.querySelector('[data-player-art]'),signature=JSON.stringify([data.now?.id,data.now?.imageUrl]);if(image.dataset.signature!==signature){image.innerHTML=art(data.now);image.dataset.signature=signature;}
  root.querySelector('[data-player-sync]').textContent=ctx.pendingPlayback?'Sincronizando…':'';root.querySelector('.cabina-player').setAttribute('aria-busy',String(!!ctx.pendingPlayback));
  root.querySelectorAll('[data-player-device],[data-player-output]').forEach(el=>el.textContent=data.device?.name||'Elegir salida');
  const volume=root.querySelector('[data-cabina-volume]');if(volume&&document.activeElement!==volume)volume.value=data.device?.volume??50;
  root.querySelectorAll('[data-track-index]').forEach(row=>{const t=ctx.playlist?.tracks[Number(row.dataset.trackIndex)];if(!t)return;row.classList.toggle('current',isCurrent(ctx,t));const play=row.querySelector('[data-cabina-row-play]');if(play)play.innerHTML=rowPlay(ctx,t)});
 };
 window.tocaCabinaUpdateButtons=ctx=>{
  const root=ctx.root,locked=ctx.busy||ctx.operation||sessionStorage.getItem('toca-music-edit:'+ctx.id);
  root.toggleAttribute('data-cabina-reorder-enabled',!state.demo&&!!ctx.settings.playlistWriteEnabled&&!locked);
  const add=root.querySelector('[data-cabina-open="add"]');if(add)add.disabled=state.demo||!!locked;
  root.querySelectorAll('[data-cabina-mutation]').forEach(el=>el.disabled=state.demo||!ctx.settings.playlistWriteEnabled||!!locked||(!ctx.playlist&&el.hasAttribute('data-cabina-mutation')));
  root.querySelectorAll('[data-cabina-selection],[data-cabina-track]').forEach(el=>el.disabled=state.demo||!!locked);
  root.querySelectorAll('[data-player-shuffle],[data-player-repeat],[data-playback-apply]').forEach(el=>el.disabled=state.demo||!ctx.settings.controlEnabled||!!ctx.controlling);
  root.querySelector('[data-playback-apply]').textContent=ctx.savingPlaybackSettings?'Aplicando…':'Aplicar cambios';
  root.querySelectorAll('[data-cabina-start]').forEach(el=>el.disabled=state.demo||!!locked||!ctx.playlist?.tracks.length);
  root.querySelectorAll('[data-player-start]').forEach(el=>el.disabled=state.demo||!ctx.settings.controlEnabled||!ctx.playlist?.tracks.length);
  root.querySelectorAll('[data-player-toggle],[data-player-command],[data-play-position]').forEach(el=>el.disabled=state.demo||!ctx.settings.controlEnabled||!!ctx.controlling);
  root.querySelectorAll('[data-cabina-row-play]').forEach(el=>el.disabled=state.demo||ctx.controlling||!ctx.playlist?.tracks[Number(el.dataset.cabinaRowPlay)]?.id);
  root.querySelectorAll('[data-cabina-drag]').forEach(el=>{el.disabled=state.demo||!ctx.settings.playlistWriteEnabled||!!locked;el.title=el.disabled?'La edición no está disponible':'Arrastrar para cambiar el orden'});
  root.querySelectorAll('[data-studio-edit="add"]').forEach(el=>{const added=ctx.feedback?.action==='add'&&ctx.feedback.trackId===el.dataset.track&&ctx.feedback.until>performance.now();const adding=ctx.busy&&ctx.editAction?.action==='add'&&ctx.editAction.trackId===el.dataset.track;el.textContent=added?'Agregado ✓':adding?'Agregando…':'Agregar';el.classList.toggle('cabina-added-button',!!added);if(added)el.disabled=true});
  root.querySelectorAll('[data-cabina-create-open]').forEach(el=>el.disabled=state.demo||!ctx.settings.playlistWriteEnabled||!!locked);
 };
 window.tocaCabinaEditFeedback=ctx=>{
  const root=ctx.root,feedback=ctx.feedback,added=feedback?.action==='add'&&feedback.until>performance.now();
  const box=root.querySelector('[data-cabina-add-feedback]');
  if(box){box.hidden=!added;box.innerHTML=added?`${art(feedback.track)}<div><strong>${esc(feedback.track?.title||'Canción agregada')}</strong><p>Se agregó a ${esc(ctx.playlist?.name||'la playlist')}.</p></div>${button('Ver en playlist','data-cabina-view-added','check','small')}`:'';}
  root.querySelectorAll('[data-track-index]').forEach(row=>{const match=added&&Number(row.dataset.trackIndex)===feedback.position&&row.dataset.trackId===feedback.trackId;row.classList.toggle('cabina-added-row',!!match);const badge=row.querySelector('[data-cabina-added-badge]');if(badge)badge.hidden=!match;});
 };
 window.tocaCabinaNotify=(ctx,message)=>ctx.root.querySelectorAll('dialog[open] [data-cabina-dialog-status]').forEach(el=>el.textContent=message);
 window.tocaCabinaActivityUpdated=(ctx,rows)=>{
  ctx.root.querySelector('[data-cabina-recent-activity]').innerHTML=activity(rows);
  ctx.root.querySelector('[data-cabina-all-activity]').innerHTML=activity(rows,true);
 };
 // Dialogs keep their place during a rule update or session rerender, but never across routes/accounts.
 window.addEventListener('hashchange',()=>{document.querySelectorAll('.toca-cabina dialog[open]').forEach(el=>el.close());window.tocaCabinaReset();});
 document.addEventListener('cancel',event=>{if(event.target.matches('.toca-cabina dialog'))panelState=null;},true);
 document.addEventListener('click',async event=>{
  const b=event.target.closest('.toca-cabina button');if(!b||b.disabled)return;
  const root=b.closest('[data-admin-studio]');
  if(b.hasAttribute('data-cabina-close'))return close(root);
  if(b.hasAttribute('data-cabina-view-added')){close(root);root.querySelector('.cabina-added-row')?.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
  if(b.hasAttribute('data-cabina-open')){
   show(root,b.dataset.cabinaOpen,b);
   if(b.dataset.cabinaOpen==='select-playlist')root.dispatchEvent(new CustomEvent('cabina-playlists',{bubbles:true}));
   if(b.dataset.cabinaOpen==='playback')root.dispatchEvent(new CustomEvent('cabina-playback-open',{bubbles:true}));
  }
  if(b.hasAttribute('data-cabina-name-mode')){
   const creating=b.dataset.cabinaNameMode==='create';
   root.querySelector('[data-cabina-dialog="name"] h2').textContent=creating?'Una playlist nueva.':'Nombre de la playlist.';
   root.querySelector('[data-cabina-name-copy]').textContent=creating?'Se creará vacía y quedará seleccionada para el bar. La reproducción actual sigue igual.':'El cambio se guarda en tu playlist de Spotify.';
   root.querySelector('[data-studio-name]').value=creating?'':root.querySelector('[data-studio-playlist-name]').textContent;
   root.querySelector('[data-studio-create]').hidden=!creating;root.querySelector('[data-studio-create]').type=creating?'submit':'button';root.querySelector('[data-studio-rename]').hidden=creating;root.querySelector('[data-studio-rename]').type=creating?'button':'submit';
   show(root,'name',b);root.querySelector('[data-studio-name]').focus();
  }
  if(b.hasAttribute('data-cabina-start'))show(root,root.querySelector('[data-player-start]')?.disabled?'connection':'start',b);
  if(b.hasAttribute('data-cabina-disconnect'))show(root,'disconnect',b);
 });
 // The editor handles form validation and the existing command buttons.
 document.addEventListener('submit',event=>{if(event.target.matches('[data-cabina-name-form]'))event.preventDefault();});
 window.tocaCabinaOpenTrack=(ctx,index)=>{
  const t=ctx.playlist?.tracks[index];if(!t)return;
  const disabled=ctx.settings.controlEnabled?'':'disabled';
  ctx.root.querySelector('[data-cabina-dialog="track"] h2').textContent=t.title;
  ctx.root.querySelector('[data-cabina-track-menu]').innerHTML=`<p class="dialog-copy">${esc(t.artist)}</p>${!ctx.settings.playlistWriteEnabled?'<p class="cabina-notice">La edición está deshabilitada en el servidor.</p>':''}${button('Reproducir esta canción',`data-play-position="${index}" ${t.id?disabled:'disabled'}`,'play')}${index>0?button('Subir en la playlist',`data-studio-edit="move" data-from="${index}" data-to="${index-1}"`,'up'):''}${index<ctx.playlist.tracks.length-1?button('Bajar en la playlist',`data-studio-edit="move" data-from="${index}" data-to="${index+1}"`,'down'):''}${t.id?button('Quitar de esta playlist',`data-studio-edit="remove" data-position="${index}"`,'trash'):''}`;
  show(ctx.root,'track',ctx.root.querySelector(`[data-cabina-track="${index}"]`));
 };
 window.tocaCabinaShowConnection=ctx=>show(ctx.root,'connection');
 window.tocaCabinaRequireAuthorization=ctx=>{
  if(!ctx?.root.isConnected)return;
  show(ctx.root,'connection');
  ctx.root.querySelector('[data-browser-authorization]').hidden=false;
  ctx.root.querySelector('[data-cabina-dialog="connection"] [data-action="connect-spotify"]').focus();
 };
 window.tocaCabinaClose=ctx=>close(ctx.root);
})();
