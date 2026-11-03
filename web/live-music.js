/* TOCÁ v1.2 — public playback snapshot. No player commands, no secrets.
 * A playlist order is not a guarantee of Spotify Connect's preloaded queue.
 */
function renderLiveNow(music) {
  if (!music || !music.active) return '<p class="toca-muted">El bar no tiene sesión musical activa.</p>';
  if (!music.now) return '<p class="toca-muted">Spotify todavía no informó qué canción está sonando.</p>';
  return `<div class="toca-live-song"><span class="toca-live-icon">♫</span><div>
    <span class="toca-live-kicker">${music.isPlaying?'● SONANDO AHORA':'Ⅱ REPRODUCCIÓN PAUSADA'}</span>
    <strong>${esc(music.now.title)}</strong><small>${esc(music.now.artist)}</small></div></div>`;
}
function renderLiveNext(music) {
  if (!music || !music.active) return '<p class="toca-muted">Abrí la sesión musical para ver el orden de Spotify.</p>';
  if (!music.next) return `<p class="toca-muted">${esc(music.note || 'La próxima canción no se puede determinar.')}</p>`;
  return `<div class="toca-live-song"><span class="toca-live-icon muted">→</span><div>
    <span class="toca-live-kicker">SIGUIENTE PREVISTA EN LA PLAYLIST</span>
    <strong>${esc(music.next.title)}</strong><small>${esc(music.next.artist)}</small></div></div>
    <p class="toca-live-disclaimer"></p>`;
}
function renderLivePlaylist(music, isAdmin=false) {
  if (!music || !music.active) return '<p class="toca-muted">No hay sesión musical activa.</p>';
  const rows = Array.isArray(music.playlist) ? music.playlist : [];
  if (!rows.length) return '<p class="toca-muted">La playlist está vacía o Spotify no devolvió canciones.</p>';
  return rows.slice(0, isAdmin ? 10 : 6).map((track,i)=>`<div class="toca-song-row">
    <span class="toca-number">${i+1}</span>
    <div class="toca-track-art variant-${i%5}">♫</div>
    <div class="toca-song-meta"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></div>
    ${music.next && music.next.id===track.id && music.samePlaylist ? '<span class="toca-status-label">Prevista</span>':''}
  </div>`).join('');
}
(function enableMusicPolling() {
  const previousRender=render;
  let interval=null;
  let generation=0;
  let busy=false;
  function stop() {if(interval) clearInterval(interval);interval=null;generation++;busy=false;}
  function currentVenue() {
    if(state.demo) return null;
    const p=route().path;
    if(p.startsWith('/venue/')) return decodeURIComponent(p.split('/')[2]);
    if(p==='/admin'||p==='/admin/general') return state.venueId;
    return null;
  }
  async function refresh(myGeneration,id) {
    if(busy || document.visibilityState==='hidden' || !document.getElementById('toca-live-music')) return;
    busy=true;
    try {
      const snapshot=await api(`/api/venues/${encodeURIComponent(id)}/music-status`);
      if(myGeneration!==generation || currentVenue()!==id) return;
      const now=document.getElementById('toca-live-music');
      const next=document.getElementById('toca-live-next');
      const list=document.getElementById('toca-live-order');
      const updated=document.getElementById('toca-live-updated');
      if(now) now.innerHTML=renderLiveNow(snapshot);
      if(next) next.innerHTML=renderLiveNext(snapshot);
      if(list) list.innerHTML=renderLivePlaylist(snapshot,route().path.startsWith('/admin'));
      if(updated) updated.textContent='Actualizado '+new Date().toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    } catch(err) {
      if(myGeneration===generation){
        const now=document.getElementById('toca-live-music');
        if(now && now.textContent.includes('Consultando')) now.innerHTML='<p class="toca-muted">Estado de Spotify no disponible temporalmente.</p>';
        const next=document.getElementById('toca-live-next');
        if(next && next.textContent.includes('Consultando')) next.innerHTML='<p class="toca-muted">No pudimos consultar la siguiente canción.</p>';
        const updated=document.getElementById('toca-live-updated');
        if(updated) updated.textContent='No se pudo actualizar Spotify';
        // Keep last known content rather than falsely claiming playback changed.
        console.warn('Estado Spotify temporalmente no disponible:',err.message);
      }
    } finally {if(myGeneration===generation)busy=false;}
  }
  render=async function() {
    stop();
    await previousRender();
    const id=currentVenue();
    if(!id || !document.getElementById('toca-live-music'))return;
    const turn=generation;
    void refresh(turn,id);
    interval=setInterval(()=>void refresh(turn,id),20000);
  };
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    const id=currentVenue();if(id)void refresh(generation,id);
  });
})();
