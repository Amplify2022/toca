/* TOCÁ v1.8.15 — Reproducción actual: identidad e imagen verificadas.
 * No adivinar la portada de una canción por el título solamente.
 */
(() => {
  'use strict';
  const idPattern = /^[A-Za-z0-9]{22}$/;
  const coverCache = new Map();
  const statusCache = new Map();
  let inFlight = null;
  let latestRun = 0;
  let lastWarning = '';

  function normalize(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function safeImage(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (
        url.hostname === 'i.scdn.co' || url.hostname === 'mosaic.scdn.co' ||
        url.hostname.endsWith('.spotifycdn.com')
      ) ? url.href : '';
    } catch (_) {return '';}
  }
  function nested(track) {
    if (!track || typeof track !== 'object' || Array.isArray(track)) return [];
    const items = [track];
    for (const prop of ['item','track','song','currentTrack','currentlyPlaying']) {
      const sub=track[prop];
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) items.push(sub);
    }
    return items;
  }
  function idOf(track) {
    for (const item of nested(track)) {
      for (const candidate of [item.id,item.trackId,item.spotifyTrackId,item.spotifyId,
        item.uri,item.spotifyUri,item.spotifyUrl,item.external_urls?.spotify,item.href]) {
        if (typeof candidate !== 'string') continue;
        if (idPattern.test(candidate)) return candidate;
        const match=candidate.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)/);
        if (match) return match[1];
      }
    }
    return '';
  }
  function imageOf(track) {
    for (const item of nested(track)) {
      for (const candidate of [item.imageUrl,item.albumImageUrl,item.thumbnailUrl,item.coverUrl,
        item.coverArtUrl,item.artworkUrl,item.image?.url,item.image,item.images?.[0]?.url,
        item.album?.images?.[0]?.url,item.album?.imageUrl,item.album?.image?.url,item.album?.coverUrl]) {
        const safe=safeImage(candidate);
        if (safe) return safe;
      }
    }
    return '';
  }
  function nameOf(track) {
    return nested(track).map(t=>String(t.title||t.name||'')).find(Boolean)||'';
  }
  function artistOf(track) {
    for (const item of nested(track)) {
      if (typeof item.artist === 'string' && item.artist.trim()) return item.artist;
      if (Array.isArray(item.artists)) return item.artists.map(x=>x.name||'').filter(Boolean).join(', ');
    }
    return '';
  }
  function sameTrack(a,b) {
    const aName=normalize(a.title),bName=normalize(nameOf(b));
    const aArtist=normalize(a.artist),bArtist=normalize(artistOf(b));
    if (!aName || aName!==bName || !aArtist || !bArtist) return false;
    return aArtist===bArtist || aArtist.split(' ').every(word=>bArtist.split(' ').includes(word));
  }
  function venueId() {
    const match=(location.hash||'').match(/^#\/venue\/([^/?]+)/);
    if (!match) return '';
    try {return decodeURIComponent(match[1]);} catch (_) {return '';}
  }
  function visibleTrack() {
    const host=document.querySelector('.toca-detail-playing #toca-live-music');
    if (!host) return null;
    const row=host.querySelector('.toca-playing,.toca-now-playing,.toca-live-playing,.now-song,.now');
    if (!row) return null;
    const actual=row.matches('.now') ? (row.querySelector('.now-song')||row) : row;
    const title=actual.querySelector('h3,.now-title,[data-now-title],.track-title')?.textContent?.trim();
    const artist=actual.querySelector('p,.now-artist,[data-now-artist],.track-artist')?.textContent?.trim();
    if (!title || !artist) return null;
    return {host,row:actual,title,artist};
  }
  function candidates(record) {
    const s=typeof state==='undefined' ? null : state;
    const sources=[s?.detail?.now,record?.status?.now,record?.status?.current,
      record?.status?.currentlyPlaying,record?.status?.currentTrack,
      record?.status?.item,record?.status?.track,record?.status?.playback?.item,
      record?.status?.playback?.track];
    for(const collection of [record?.playlist,record?.status?.playlist, s?.playlist]) {
      if(Array.isArray(collection)) sources.push(...collection);
    }
    return sources.filter(x=>x && typeof x==='object');
  }
  function resolveCurrent(display,record) {
    const matching=candidates(record).filter(t=>sameTrack(display,t));
    const ids=[...new Set(matching.map(idOf).filter(Boolean))];
    if(ids.length!==1) return null;
    const track=matching.find(t=>idOf(t)===ids[0] && imageOf(t)) || matching.find(t=>idOf(t)===ids[0]);
    return {id:ids[0],direct:imageOf(track)};
  }
  async function coverFor(track) {
    if(track.direct) return track.direct;
    const cached=coverCache.get(track.id);
    if(cached && (Date.now()-cached.created)<60000) return cached.promise;
    const promise=(async()=>{
      const endpoint=`https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/'+track.id)}`;
      const response=await fetch(endpoint,{mode:'cors',credentials:'omit'});
      if(!response.ok) throw Error(`Spotify oEmbed HTTP ${response.status}`);
      return safeImage((await response.json()).thumbnail_url);
    })().catch(error=>{
      console.debug('TOCÁ: no se pudo obtener carátula Spotify',error.message);
      return '';
    });
    coverCache.set(track.id,{created:Date.now(),promise});
    return promise;
  }
  async function loadStatus(id, display) {
    const key=normalize(display.title)+'|'+normalize(display.artist);
    const cached=statusCache.get(id);
    if(cached && cached.key===key && Date.now()-cached.created<14000) return cached.data;
    if(inFlight?.id===id) return inFlight.promise;
    const promise=(async()=>{
      const data={status:null,playlist:[]};
      if(typeof api!=='function') return data;
      try {data.status=await api(`/api/venues/${encodeURIComponent(id)}/music-status`);} catch(err){console.debug('TOCÁ: music-status',err.message);}
      if(Array.isArray(data.status?.playlist)) data.playlist=data.status.playlist;
      const s=typeof state==='undefined'?null:state;
      if(!data.playlist.length && Array.isArray(s?.playlist)) data.playlist=s.playlist;
      if(!data.playlist.some(x=>idOf(x))) {
        try {const playlist=await api(`/api/venues/${encodeURIComponent(id)}/playlist`);
          if(Array.isArray(playlist))data.playlist=playlist;
        } catch(err){console.debug('TOCÁ: playlist',err.message);}
      }
      statusCache.set(id,{created:Date.now(),key,data});
      return data;
    })();
    inFlight={id,promise};
    try{return await promise;}finally{if(inFlight?.promise===promise)inFlight=null;}
  }
  function paint(display,track,url) {
    const current=visibleTrack();
    if(!current || current.row!==display.row || normalize(current.title)!==normalize(display.title)
      || normalize(current.artist)!==normalize(display.artist)) return;
    // También pueden cargar las carátulas v1.8.13. Evitar fotos duplicadas.
    const old=current.row.querySelector('.toca-now-artwork,.toca-now-v1814,.toca-now-v1815');
    if(old && old.dataset.spotifyTrackId===track.id && old.querySelector('img')) return;
    if(old) old.remove();
    const already=current.row.querySelector('.toca-spotify-cover-link');
    if(already && !already.closest('.toca-now-v1815')) return;
    const a=document.createElement('a');
    a.className='toca-now-v1815 toca-spotify-cover-link';
    a.dataset.spotifyTrackId=track.id;
    a.dataset.tocaNowKey=normalize(display.title)+'|'+normalize(display.artist);
    a.href=`https://open.spotify.com/track/${track.id}`;
    a.rel='noopener noreferrer';a.target='_blank';
    a.setAttribute('aria-label','Escuchar en Spotify');
    const image=document.createElement('img');
    image.src=url;image.alt=`Carátula de ${display.title}`;
    image.decoding='async';
    image.addEventListener('error',()=>{a.remove();current.row.classList.remove('toca-now-has-cover-v1815');},{once:true});
    a.append(image);
    current.row.insertBefore(a,current.row.firstChild);
    current.row.classList.add('toca-now-has-cover-v1815');
  }
  async function sync() {
    const display=visibleTrack();
    if(!display) return;
    const id=venueId();
    if(!id) return;
    const run=++latestRun;
    const currentKey=normalize(display.title)+'|'+normalize(display.artist);
    for(const old of display.row.querySelectorAll('.toca-now-v1815,.toca-now-v1814')) {
      if(old.dataset.tocaNowKey!==currentKey){old.remove();display.row.classList.remove('toca-now-has-cover-v1815');}
    }
    const s=typeof state==='undefined'?null:state;
    const fast=resolveCurrent(display,{status:{now:s?.detail?.now},playlist:s?.playlist||[]});
    const record=fast?null:await loadStatus(id,display);
    if(run!==latestRun) return;
    const track=fast||resolveCurrent(display,record);
    if(!track) {
      const key=id+'|'+normalize(display.title)+'|'+normalize(display.artist);
      if(lastWarning!==key){
        lastWarning=key;
        console.info('TOCÁ: «Sonando ahora» no incluye un ID de Spotify inequívoco. Para mostrar su carátula, la API debe devolver now.trackId (o now.id) y/o now.imageUrl.',{venueId:id,title:display.title,nowFields:Object.keys(record?.status?.now||s?.detail?.now||{})});
      }
      return;
    }
    const url=await coverFor(track);
    if(run!==latestRun||!url)return;
    paint(display,track,url);
  }
  let scheduled=false;
  function schedule() {
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;sync().catch(e=>console.debug('TOCÁ: imagen actual',e.message));});
  }
  function init() {
    const app=document.getElementById('app');if(!app)return;
    const observer=new MutationObserver(records=>{
      if(records.some(r=>{
        const node=r.target?.nodeType===1?r.target:r.target?.parentElement;
        if(node?.closest?.('.toca-now-v1815'))return false;
        if(node?.closest?.('.toca-detail-playing #toca-live-music'))return true;
        return Array.from(r.addedNodes).some(n=>n.nodeType===1 &&
          (n.matches?.('.toca-detail-playing')||n.querySelector?.('.toca-detail-playing')));
      }))schedule();
    });
    observer.observe(app,{childList:true,subtree:true,characterData:true});
    window.addEventListener('hashchange',schedule);
    // Reconciliar también si la reproducción refresca el texto sin reemplazar elementos.
    setInterval(()=>{if(venueId())schedule();},4000);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
