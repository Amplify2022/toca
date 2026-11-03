/* TOCÁ 1.8.14: complemento específico para "Qué está sonando".
 * La identidad de la canción se obtiene del estado musical o de un match exacto
 * título+artista con la playlist: nunca se asigna arte adivinado por título.
 */
(() => {
  'use strict';
  const TRACK_ID = /^[A-Za-z0-9]{22}$/;
  const knownCover = new Map();
  const venueCache = new Map();
  let scheduled = false;
  let lastVenue = '';
  let currentGeneration = 0;
  let pendingRequest = null;
  const normalize = value => String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const safeUrl = value => {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === 'i.scdn.co' ||
        url.hostname === 'mosaic.scdn.co' || url.hostname.endsWith('.spotifycdn.com')) ? url.href : '';
    } catch (_) { return ''; }
  };
  const idFrom = track => {
    if (!track || typeof track !== 'object') return '';
    const data = track.item && typeof track.item === 'object' ? track.item : track;
    for (const item of [data.id, data.trackId, data.spotifyId, data.uri,
      data.spotifyUri, data.spotifyUrl, data.external_urls?.spotify]) {
      if (typeof item !== 'string') continue;
      if (TRACK_ID.test(item)) return item;
      const match = item.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)/);
      if (match) return match[1];
    }
    return '';
  };
  const imageFrom = track => {
    if (!track || typeof track !== 'object') return '';
    const data = track.item && typeof track.item === 'object' ? track.item : track;
    const images = [data.imageUrl, data.albumImageUrl, data.thumbnailUrl,
      data.coverUrl, data.coverArtUrl, data.artworkUrl, data.image?.url,
      data.images?.[0]?.url, data.album?.images?.[0]?.url,
      data.album?.imageUrl, data.album?.image?.url, data.album?.coverUrl];
    return images.map(safeUrl).find(Boolean) || '';
  };
  const titleOf = track => String(track?.title || track?.name || track?.item?.name || '').trim();
  const artistOf = track => {
    const raw = track?.artist || track?.item?.artist;
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(track?.artists)) return track.artists.map(x => x.name || '').join(', ');
    if (Array.isArray(track?.item?.artists)) return track.item.artists.map(x => x.name || '').join(', ');
    return '';
  };
  const identityMatch = (a, b) => !!normalize(titleOf(a)) &&
    normalize(titleOf(a)) === normalize(titleOf(b)) &&
    !!normalize(artistOf(a)) && normalize(artistOf(a)) === normalize(artistOf(b));

  const venueId = () => {
    const s = typeof state !== 'undefined' ? state : null;
    let id = s?.detail?.id || s?.venueId || '';
    const hash = location.hash || '';
    const parsed = hash.match(/^#\/venue\/([^/?]+)/);
    if (parsed) id = decodeURIComponent(parsed[1]);
    return /^[0-9a-fA-F-]{36}$/.test(String(id)) ? String(id) : '';
  };
  const nowHost = () => document.querySelector('.toca-detail-playing #toca-live-music');
  const heading = () => document.querySelector('.toca-detail-playing .toca-section-title');
  const clearDot = () => {
    const header = heading();
    if (!header) return;
    // Algunos temas agregan la viñeta como nodo de texto o span, otros con CSS.
    const title = header.querySelector('h2');
    if (title) {
      for (const node of Array.from(title.childNodes)) {
        if (node.nodeType === 3 && /^[\s·•●∙◦⦁]+/.test(node.textContent || ''))
          node.textContent = node.textContent.replace(/^[\s·•●∙◦⦁]+/, '');
      }
    }
    for (const node of Array.from(header.children)) {
      if (node === title) continue;
      if (/^[\s·•●∙◦⦁]*$/.test(node.textContent || '') &&
          /^(SPAN|I|B|EM|SMALL)$/.test(node.tagName)) node.remove();
    }
  };

  async function resolveCover(track) {
    const id = idFrom(track);
    if (!id) return null;
    const direct = imageFrom(track);
    if (direct) return {id, image:direct};
    if (!knownCover.has(id)) {
      knownCover.set(id, (async () => {
        const url = `https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/'+id)}`;
        const response = await fetch(url,{credentials:'omit',mode:'cors'});
        if (!response.ok) throw new Error('Spotify oEmbed HTTP '+response.status);
        return safeUrl((await response.json()).thumbnail_url);
      })().catch(() => ''));
    }
    const image = await knownCover.get(id);
    return image ? {id,image} : null;
  }
  function currentTrack(host) {
    const row = host.querySelector('.toca-playing,.now,.toca-now-playing,.toca-live-playing');
    const candidate = row?.classList?.contains('now') ? (row.querySelector('.now-song') || row) : (row || host.firstElementChild);
    const title = candidate?.querySelector('h3,.now-title,[data-now-title],.track-title')?.textContent?.trim() || '';
    const artist = candidate?.querySelector('p,.now-artist,[data-now-artist],.track-artist')?.textContent?.trim() || '';
    if (!title || !artist) return null;
    return {row:candidate,title,artist};
  }
  function candidates(status, s) {
    const tracks = [];
    const append = t => { if (t && typeof t === 'object' && !Array.isArray(t)) tracks.push(t); };
    const list = v => { if (Array.isArray(v)) v.forEach(append); };
    append(status?.now);append(status?.current);append(status?.currentTrack);
    append(status?.currentlyPlaying);append(status?.item);
    append(s?.detail?.now);
    list(status?.playlist);list(status?.queue);list(s?.playlist);
    const cached = venueCache.get(venueId());
    list(cached?.playlist);
    return tracks;
  }
  function chooseTrack(display, status, s) {
    const target = {title:display.title,artist:display.artist};
    const tracks = candidates(status,s).filter(t => idFrom(t) && identityMatch(target,t));
    const ids = [...new Set(tracks.map(idFrom))];
    // Títulos repetidos con grabaciones diferentes: nunca elegir al azar.
    if (ids.length !== 1) return null;
    return tracks.find(t => imageFrom(t)) || tracks[0];
  }
  async function getStatus(id) {
    if (typeof api !== 'function') return null;
    const cache = venueCache.get(id);
    if (cache && Date.now()-cache.started < 12000) return cache;
    if (pendingRequest?.id === id) return pendingRequest.promise;
    const promise = (async()=>{
      let status = null, playlist = [];
      try { status = await api(`/api/venues/${encodeURIComponent(id)}/music-status`); }
      catch (_) { /* Se prueba con el estado público existente. */ }
      if (Array.isArray(status?.playlist)) playlist = status.playlist;
      if (!playlist.length) {
        const s = typeof state !== 'undefined' ? state : null;
        if (Array.isArray(s?.playlist)) playlist = s.playlist;
      }
      // Si el status carece de ID, la playlist pública puede aportar identidad.
      if (!playlist.some(idFrom)) {
        try { const rows=await api(`/api/venues/${encodeURIComponent(id)}/playlist`);
          if (Array.isArray(rows)) playlist=rows;
        } catch (_) { /* No ocultamos la canción por este error. */ }
      }
      const record = {status,playlist,started:Date.now()};
      venueCache.set(id,record);
      return record;
    })();
    pendingRequest={id,promise};
    try {return await promise;} finally {if(pendingRequest?.promise===promise)pendingRequest=null;}
  }
  function removeStaleCover(host, expectedId) {
    const existing = host.querySelector('.toca-now-v1814');
    if (existing && existing.dataset.spotifyTrackId !== expectedId) existing.remove();
  }
  function paint(host, display, cover) {
    if (!host.isConnected || !display.row.isConnected || !host.contains(display.row)) return;
    const still = currentTrack(host);
    if (!still || normalize(still.title) !== normalize(display.title) ||
        normalize(still.artist) !== normalize(display.artist)) return;
    if (host.querySelector('.toca-now-artwork .toca-spotify-cover-link')) return; // v1.8.13 lo resolvió.
    removeStaleCover(host,cover.id);
    if (host.querySelector('.toca-now-v1814')) return;
    const link = document.createElement('a');
    link.className='toca-now-v1814 toca-spotify-cover-link';
    link.dataset.spotifyTrackId=cover.id;
    link.href=`https://open.spotify.com/track/${cover.id}`;
    link.target='_blank';link.rel='noopener noreferrer';
    link.setAttribute('aria-label','Abrir canción en Spotify');
    const img=document.createElement('img');
    img.src=cover.image;img.alt='Carátula de la canción en Spotify';
    img.decoding='async';
    img.addEventListener('error',()=>{link.remove();display.row.classList.remove('toca-now-with-cover-v1814')},{once:true});
    link.append(img);
    display.row.insertBefore(link,display.row.firstChild);
    display.row.classList.add('toca-now-with-cover-v1814');
  }
  async function update() {
    const host = nowHost();
    if (!host) return;
    clearDot();
    const display = currentTrack(host);
    if (!display) return;
    const id=venueId();
    if (!id) return;
    if (lastVenue !== id) {lastVenue=id;currentGeneration++;}
    const generation=++currentGeneration;
    const s=typeof state !== 'undefined' ? state : null;
    const cached = venueCache.get(id);
    const immediate = chooseTrack(display,cached?.status,s);
    const record=immediate ? {status:cached?.status,playlist:cached?.playlist} : await getStatus(id);
    if (generation !== currentGeneration || !host.isConnected) return;
    const track = chooseTrack(display,record?.status,s);
    if (!track) return;
    const artwork = await resolveCover(track);
    if (generation !== currentGeneration || !artwork) return;
    paint(host,display,artwork);
  }
  function schedule() {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;void update().catch(()=>{});});
  }
  function init() {
    const app=document.getElementById('app');
    if (!app) return;
    const observer=new MutationObserver(records=>{
      const meaningful = records.some(r=>{
        const target = r.target?.nodeType === 1 ? r.target : r.target?.parentElement;
        if (target?.closest?.('#toca-live-music')) return Array.from(r.addedNodes).some(node =>
          node.nodeType === 1 && !node.classList?.contains('toca-now-v1814') &&
          !node.classList?.contains('toca-spotify-cover-link') &&
          !node.classList?.contains('toca-spotify-credit'));
        return Array.from(r.addedNodes).some(node => node.nodeType === 1 &&
          (node.matches?.('.toca-detail-playing,#toca-live-music') ||
            node.querySelector?.('.toca-detail-playing #toca-live-music')));
      });
      if (meaningful) schedule();
    });
    observer.observe(app,{subtree:true,childList:true});
    window.addEventListener('hashchange',()=>{currentGeneration++;schedule();});
    schedule();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
