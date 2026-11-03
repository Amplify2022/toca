/* TOCÁ v1.8.16 — reproductor público estable.
 * No se modifica #toca-live-music: live-music.js lo puede reescribir en cada polling.
 * Esta vista independiente comparte la misma API y permanece visible entre refrescos.
 */
(() => {
  'use strict';
  const trackIdPattern = /^[A-Za-z0-9]{22}$/;
  const covers = new Map();
  const playlistByVenue = new Map();
  let currentVenue = '';
  let currentPanel = null;
  let revision = 0;
  let busy = false;
  let queued = false;

  const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
  const safeImage = value => {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === 'i.scdn.co' ||
        url.hostname === 'mosaic.scdn.co' || url.hostname.endsWith('.spotifycdn.com')) ? url.href : '';
    } catch (_) {return '';}
  };
  function trackId(track) {
    if (!track || typeof track !== 'object') return '';
    const t=track.item && typeof track.item === 'object' ? track.item : track;
    for (const field of [t.trackId,t.spotifyTrackId,t.id,t.spotifyId,t.uri,
      t.spotifyUri,t.spotifyUrl,t.external_urls?.spotify]) {
      if (typeof field !== 'string') continue;
      if (trackIdPattern.test(field)) return field;
      const match=field.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})(?=[^A-Za-z0-9]|$)/);
      if(match)return match[1];
    }
    return '';
  }
  function titleOf(track) {return String(track?.title || track?.name || track?.item?.title || track?.item?.name || '').trim();}
  function artistOf(track) {
    const t=track?.item && typeof track.item==='object'?track.item:track;
    if(typeof t?.artist==='string')return t.artist.trim();
    if(Array.isArray(t?.artists))return t.artists.map(a=>a?.name||'').filter(Boolean).join(', ');
    return '';
  }
  function imageOf(track) {
    const t=track?.item && typeof track.item==='object'?track.item:track;
    if(!t||typeof t!=='object')return '';
    for(const value of [t.imageUrl,t.albumImageUrl,t.coverUrl,t.coverArtUrl,
      t.thumbnailUrl,t.artworkUrl,t.image?.url,t.images?.[0]?.url,
      t.album?.images?.[0]?.url,t.album?.imageUrl]) {
      const url=safeImage(value);if(url)return url;
    }
    return '';
  }
  function sameTrack(a,b) {
    return norm(titleOf(a)) && norm(titleOf(a))===norm(titleOf(b)) &&
      norm(artistOf(a)) && norm(artistOf(a))===norm(artistOf(b));
  }
  function uniqueMatch(target,items) {
    const matches=(Array.isArray(items)?items:[]).filter(x=>sameTrack(target,x)&&trackId(x));
    const ids=[...new Set(matches.map(trackId))];
    return ids.length===1 ? (matches.find(x=>imageOf(x))||matches[0]) : null;
  }
  function routeVenue() {
    const result=(location.hash||'').match(/^#\/venue\/([^/?]+)/);
    if(!result)return '';
    try{return decodeURIComponent(result[1]);}catch(_){return '';}
  }
  function getState() {return typeof state==='undefined'?null:state;}
  function ensurePanel() {
    const id=routeVenue();
    const panel=id?document.querySelector('.toca-detail-playing'):null;
    const host=panel?.querySelector('#toca-live-music');
    if(!panel||!host) {currentPanel=null;currentVenue='';return null;}
    let view=panel.querySelector(':scope > .toca-now-v1816-view');
    if(!view) {
      view=document.createElement('div');view.className='toca-now-v1816-view';
      view.setAttribute('aria-live','polite');
      // El nodo nuevo queda FUERA de #toca-live-music, que live-music.js reescribe.
      host.before(view);
      view.innerHTML='<p class="toca-now-v1816-pending">Consultando reproducción Spotify…</p>';
    }
    panel.classList.add('toca-now-managed-v1816');
    const changed=panel!==currentPanel||id!==currentVenue;
    currentPanel=panel;currentVenue=id;
    if(changed) {revision++;scheduleUpdate();}
    return {view,panel,id};
  }
  function show(view,record) {
    if(!view?.isConnected)return;
    const title=String(record?.title||'').trim();
    const artist=String(record?.artist||'').trim();
    const cover=safeImage(record?.cover);
    const id=trackId(record);
    const key=JSON.stringify([title,artist,cover,id,record?.message||'']);
    if(view.dataset.key===key)return;
    view.dataset.key=key;
    if(!title) {
      view.innerHTML=`<p class="toca-now-v1816-muted">${escapeText(record?.message||'Spotify no informó qué canción está sonando.')}</p>`;
      return;
    }
    view.innerHTML=`<div class="toca-now-v1816-track">
      ${cover ? `<a class="toca-now-v1816-cover" ${id?`href="https://open.spotify.com/track/${id}" target="_blank" rel="noopener noreferrer"`:''} aria-label="Carátula de ${escapeText(title)}"><img src="${escapeText(cover)}" alt="Carátula de ${escapeText(title)}" /></a>`
        : '<div class="toca-now-v1816-cover toca-now-v1816-fallback" aria-hidden="true">♫</div>'}
      <div class="toca-now-v1816-meta"><span>SONANDO AHORA</span>
        <strong>${escapeText(title)}</strong><small>${escapeText(artist)}</small>
      </div></div>`;
    const img=view.querySelector('img');
    if(img) img.addEventListener('error',()=>{
      if(!img.isConnected)return;
      img.closest('.toca-now-v1816-cover').outerHTML='<div class="toca-now-v1816-cover toca-now-v1816-fallback" aria-hidden="true">♫</div>';
      view.dataset.key='';
    },{once:true});
  }
  async function artFor(id) {
    if(!trackIdPattern.test(id))return '';
    if(!covers.has(id)) covers.set(id,(async()=>{
      try {
        const response=await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/'+id)}`,{credentials:'omit'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        return safeImage((await response.json()).thumbnail_url);
      }catch(error){console.debug('TOCÁ: Spotify oEmbed no respondió',error.message);return '';}
    })());
    return await covers.get(id);
  }
  async function playlistFor(id, track) {
    const key=norm(titleOf(track))+'|'+norm(artistOf(track));
    const existing=playlistByVenue.get(id);
    if(existing&&existing.key===key&&Date.now()-existing.at<60000)return existing.rows;
    if(typeof api!=='function')return [];
    const rows=await api(`/api/venues/${encodeURIComponent(id)}/playlist`);
    const list=Array.isArray(rows)?rows:[];
    playlistByVenue.set(id,{at:Date.now(),rows:list,key});
    return list;
  }
  function visibleLegacyTrack() {
    const host=currentPanel?.querySelector('#toca-live-music');
    if(!host)return null;
    const song=host.querySelector('.toca-playing,.now-song,.toca-now-playing,.toca-live-playing,.now');
    if(!song)return null;
    const title=song.querySelector('h3,.now-title,[data-now-title],.track-title')?.textContent?.trim();
    const artist=song.querySelector('p,.now-artist,[data-now-artist],.track-artist')?.textContent?.trim();
    return title && artist ? {title,artist} : null;
  }
  async function currentMusic(id) {
    const s=getState();
    let status=null;
    try {if(typeof api==='function')status=await api(`/api/venues/${encodeURIComponent(id)}/music-status`);}
    catch(err){console.debug('TOCÁ: music-status no disponible',err.message);}
    const fallback=s?.detail?.id===id?s.detail.now:null;
    // La API puede responder sin `now` y el reproductor original seguir teniendo
    // el tema actual. Leer su DOM como último recurso, aunque esté oculto.
    const now=(status?.now||status?.current||status?.currentTrack||status?.currentlyPlaying||
      status?.item||status?.playback?.item||fallback||visibleLegacyTrack());
    const playing=status?.active===false ? false : !!now;
    if(!playing)return {message:status?.active===false?'La música está en pausa.':'Spotify no informó qué canción está sonando.'};
    const title=titleOf(now),artist=artistOf(now);
    if(!title)return {message:'Spotify no informó qué canción está sonando.'};
    let matched=trackId(now)?now:null;
    if(!matched) {
      const candidates=[...(Array.isArray(status?.playlist)?status.playlist:[]),
        ...(Array.isArray(s?.playlist)?s.playlist:[])];
      matched=uniqueMatch(now,candidates);
      if(!matched) {
        try {matched=uniqueMatch(now,await playlistFor(id,now));}
        catch(err){console.debug('TOCÁ: playlist no disponible',err.message);}
      }
    }
    if(!matched) {
      // Solo este endpoint de backend resuelve el caso de título/artista sin ID.
      // No inventamos una edición del álbum usando una coincidencia aproximada.
      try {
        const result=await api(`/api/venues/${encodeURIComponent(id)}/now-cover`);
        if(sameTrack(now,result) && trackId(result))matched=result;
      }catch(err){console.debug('TOCÁ: now-cover no disponible',err.message);}
    }
    const idOfMatch=trackId(matched);
    const direct=imageOf(matched)||imageOf(now);
    const cover=direct || (idOfMatch?await artFor(idOfMatch):'');
    if(!idOfMatch) console.info('TOCÁ: falta ID exacto en la reproducción actual; se mostrará el ícono hasta recibir metadatos completos.',{venueId:id,title});
    return {title,artist,trackId:idOfMatch,cover};
  }
  async function update() {
    const target=ensurePanel();
    if(!target||busy) {queued=!!target;return;}
    busy=true;
    const rev=revision;
    try {
      const record=await currentMusic(target.id);
      if(rev===revision && routeVenue()===target.id && target.view.isConnected)show(target.view,record);
    }catch(err){console.warn('TOCÁ: no se pudo actualizar Sonando ahora',err);}
    finally {
      busy=false;
      if(queued) {queued=false;scheduleUpdate();}
    }
  }
  let timer=null;
  function scheduleUpdate() {
    if(timer!==null)return;
    timer=setTimeout(()=>{timer=null;void update();},0);
  }
  function init() {
    const app=document.getElementById('app');if(!app)return;
    const observer=new MutationObserver(records=>{
      ensurePanel();
      // El reproductor antiguo acaba de actualizar el tema: sincronizar también
      // el nuestro sin esperar al intervalo y sin observar nuestras propias inserciones.
      if(records.some(record=>{
        const target=record.target?.nodeType===1?record.target:record.target?.parentElement;
        if(target?.closest?.('#toca-live-music'))return true;
        return [...record.addedNodes].some(node=>node.nodeType===1 &&
          (node.matches?.('#toca-live-music') || node.querySelector?.('#toca-live-music')));
      }))scheduleUpdate();
    });
    observer.observe(app,{subtree:true,childList:true});
    window.addEventListener('hashchange',()=>{revision++;ensurePanel();scheduleUpdate();});
    window.setInterval(()=>{if(routeVenue())scheduleUpdate();},20000);
    ensurePanel();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
