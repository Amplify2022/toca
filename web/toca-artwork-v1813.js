/* TOCÁ 1.8.13 – Portadas reales de Spotify, sin depender de un nuevo scope OAuth.
 * Usa la imagen provista por la API si existe o Spotify oEmbed para un ID real.
 * No adivina portadas por título: si falta la identidad exacta, conserva el icono.
 */
(() => {
  'use strict';
  const trackIdRegex = /^[A-Za-z0-9]{22}$/;
  const images = new Map();
  const playlistCache = new Map();
  const queue = [];
  const queued = new Set();
  const MAX_PARALLEL = 3;
  let running = 0;
  let scheduled = false;
  let appObserver = null;

  const safeImage = value => {
    try {
      if (typeof value !== 'string' || !value) return '';
      const u = new URL(value);
      return u.protocol === 'https:' && (u.hostname === 'i.scdn.co' || u.hostname === 'mosaic.scdn.co' ||
        u.hostname.endsWith('.spotifycdn.com')) ? u.href : '';
    } catch (_) { return ''; }
  };
  const directImage = track => {
    if (!track || typeof track !== 'object') return '';
    const album = track.album || {};
    const fields = [track.imageUrl, track.albumImageUrl, track.coverUrl,
      track.coverArtUrl, track.thumbnailUrl, track.artworkUrl,
      track.image?.url, track.images?.[0]?.url, album.imageUrl, album.images?.[0]?.url];
    return fields.map(safeImage).find(Boolean) || '';
  };
  const spotifyId = track => {
    if (!track) return '';
    for (const candidate of [track.id, track.trackId, track.spotifyId, track.uri, track.spotifyUrl, track.external_urls?.spotify]) {
      if (typeof candidate !== 'string') continue;
      if (trackIdRegex.test(candidate)) return candidate;
      const found = candidate.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)/);
      if (found) return found[1];
    }
    return '';
  };
  const clean = value => String(value || '').toLocaleLowerCase('es').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const spotifyLink = id => `https://open.spotify.com/track/${id}`;

  async function coverOf(track) {
    const inline = directImage(track);
    const id = spotifyId(track);
    if (!id) return null; // La portada debe enlazar a la canción original.
    if (inline) return { image: inline, id };
    if (!images.has(id)) {
      images.set(id, (async () => {
        const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyLink(id))}`;
        const response = await fetch(endpoint, { method:'GET', mode:'cors', credentials:'omit' });
        if (!response.ok) throw new Error(`Spotify oEmbed HTTP ${response.status}`);
        const json = await response.json();
        return safeImage(json.thumbnail_url);
      })().catch(err => {
        console.debug('TOCÁ: carátula Spotify no disponible', id, err.message);
        return '';
      }));
    }
    const image = await images.get(id);
    return image ? {image, id} : null;
  }

  function enqueue(work) {
    queue.push(work);
    pump();
  }
  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      running++;
      Promise.resolve().then(queue.shift()).catch(() => {}).finally(() => {
        running--;
        pump();
      });
    }
  }

  function spotifyLogo() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('width','13');
    svg.setAttribute('height','13');
    svg.setAttribute('aria-hidden','true');
    svg.innerHTML = '<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M5.3 9.2c4.6-1.5 9.7-1.1 13.6 1.2M6.2 12.8c3.9-1.2 8.2-.8 11.6 1.3M7.1 16.1c3.3-.9 6.8-.5 9.7 1.1" fill="none" stroke="#141b19" stroke-width="1.6" stroke-linecap="round"/>';
    return svg;
  }

  function decorateCover(node, cover) {
    if (!node.isConnected || node.querySelector('.toca-spotify-cover-link')) return;
    const link = document.createElement('a');
    link.className = 'toca-spotify-cover-link';
    link.href = spotifyLink(cover.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Abrir canción en Spotify';
    link.setAttribute('aria-label','Ver la canción en Spotify');
    const img = document.createElement('img');
    img.src = cover.image;
    img.alt = 'Portada del álbum en Spotify';
    img.loading = node.classList.contains('toca-now-artwork') ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (node.classList.contains('toca-now-artwork')) {
        node.closest('.toca-playing')?.classList.remove('toca-playing-with-cover');
        node.remove(); // Recuperar el ecualizador si la imagen falló.
      } else {
        link.remove();
        node.classList.remove('toca-has-artwork');
      }
    }, { once:true });
    link.append(img);
    node.append(link);
    node.classList.add('toca-has-artwork');
  }

  function addAttribution(row, id) {
    if (!id || row.querySelector('.toca-spotify-credit')) return;
    const meta = row.querySelector('.toca-song-meta,.trackmeta,.toca-playing > div:not(.toca-equalizer):not(.toca-now-artwork),.toca-success-song > div');
    if (!meta) return;
    const link = document.createElement('a');
    link.className = 'toca-spotify-credit';
    link.href = spotifyLink(id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Abrir en Spotify';
    link.append(spotifyLogo(), document.createTextNode('Spotify'));
    meta.append(link);
  }

  function rows() {
    return document.querySelectorAll('.toca-song-row,.toca-request-track,.track,.toca-success-song,.toca-playing');
  }
  const findText = (row, selector) => row.querySelector(selector)?.textContent?.trim() || '';
  function rowDescriptor(row) {
    const now = row.classList.contains('toca-playing');
    return {title: findText(row, now?'h3':'.toca-song-meta strong,.trackmeta strong,.toca-success-song strong'),
      artist: findText(row, now?'.toca-playing p':'.toca-song-meta small,.trackmeta small,.toca-success-song small').split(' · ')[0]};
  }

  function candidates() {
    const result = [];
    const s = typeof state !== 'undefined' ? state : null;
    for (const value of [s?.catalog, s?.playlist, s?.requests, s?.detail?.now ? [s.detail.now] : null]) {
      if (Array.isArray(value)) result.push(...value);
    }
    const venueId = s?.detail?.id || s?.venueId || '';
    if (venueId && playlistCache.has(venueId)) {
      const cached = playlistCache.get(venueId);
      if (Array.isArray(cached.items)) result.push(...cached.items);
    }
    return result.filter(t => t && typeof t === 'object');
  }
  function matchTrack(row, known) {
    const { title, artist } = rowDescriptor(row);
    if (!title) return null;
    if (row.classList.contains('toca-playing')) {
      const now = typeof state !== 'undefined' ? state.detail?.now : null;
      if (now && clean(now.title || now.name) === clean(title) && (spotifyId(now) || directImage(now))) return now;
    }
    const titleKey = clean(title), artistKey = clean(artist);
    const options = known.filter(t => clean(t.title || t.name) === titleKey && (spotifyId(t) || directImage(t)));
    if (!options.length) return null;
    return options.find(t => artistKey && (clean(t.artist || (t.artists||[]).map(x=>x.name).join(', ')).includes(artistKey)
      || artistKey.includes(clean(t.artist || (t.artists||[]).map(x=>x.name).join(', '))))) ||
      (options.length === 1 ? options[0] : null);
  }

  function shouldLookUpPlaylist() {
    const s = typeof state !== 'undefined' ? state : null;
    if (!s || s.demo) return;
    const venueId = s.detail?.id || s.venueId;
    if (!venueId || !/^[a-fA-F0-9-]{36}$/.test(venueId)) return;
    const cached = playlistCache.get(venueId);
    if (cached && Date.now() - cached.started < 60000) return;
    const record = {started:Date.now(),items:[]};
    playlistCache.set(venueId,record);
    if (typeof api !== 'function') return;
    Promise.resolve().then(() => api(`/api/venues/${encodeURIComponent(venueId)}/playlist`))
      .then(list => {if(Array.isArray(list)) record.items = list; schedule();})
      .catch(() => {});
  }

  function attach(row, track) {
    const coverBox = row.classList.contains('toca-playing') ? null : row.querySelector('.toca-track-art,.album');
    const id = spotifyId(track);
    if (!id) return;
    const key = `${id || 'direct'}:${directImage(track)}`;
    if (queued.has(row) || row.dataset.tocaSpotifyCover === key) return;
    queued.add(row);
    enqueue(async () => {
      try {
        const cover = await coverOf(track);
        if (!cover || !row.isConnected) return;
        if (row.classList.contains('toca-playing')) {
          if (row.querySelector('.toca-now-artwork')) return;
          const wrap = document.createElement('div');
          wrap.className = 'toca-now-artwork';
          decorateCover(wrap, cover);
          row.insertBefore(wrap,row.firstChild);
          row.classList.add('toca-playing-with-cover');
        } else if (coverBox) decorateCover(coverBox,cover);
        addAttribution(row,cover.id);
        row.dataset.tocaSpotifyCover = key;
      } finally {queued.delete(row);}
    });
  }

  function scan() {
    scheduled = false;
    const known = candidates();
    for (const row of rows()) {
      if (row.querySelector('.toca-spotify-cover-link')) continue;
      const track = matchTrack(row,known);
      if (track) attach(row,track);
    }
    shouldLookUpPlaylist();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(scan);
  }
  function init() {
    const app = document.getElementById('app');
    if (!app) return;
    if (appObserver) appObserver.disconnect();
    appObserver = new MutationObserver(records => {
      // Artwork insertion itself should not cause a new scan.
      if (records.some(r => Array.from(r.addedNodes).some(n => n.nodeType === 1 &&
        !(n.classList?.contains('toca-spotify-cover-link') || n.classList?.contains('toca-spotify-credit') || n.classList?.contains('toca-now-artwork'))))) schedule();
    });
    appObserver.observe(app,{subtree:true,childList:true});
    schedule();
    window.addEventListener('hashchange',schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
