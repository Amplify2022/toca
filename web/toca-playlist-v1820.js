/* TOCÁ v1.8.20 — Full public playlist with playback markers.
 * Does not mutate Spotify or the TOCÁ song-request queue.
 * Lives OUTSIDE #toca-live-order, which legacy live-music.js redraws.
 */
(() => {
  'use strict';
  const marker = /^[a-zA-Z0-9]{22}$/;
  const routeVenue = () => {
    const match = (location.hash || '').match(/^#\/venue\/([^/?]+)/);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch (_) { return ''; }
  };
  const asArray = value => Array.isArray(value) ? value : [];
  const str = value => String(value ?? '');
  const trackId = t => str(t?.id || t?.trackId || '');
  const title = t => str(t?.title || t?.name || 'Canción');
  const artist = t => str(t?.artist || '');

  // A duplicate track ID is ambiguous: Spotify's playback state does not
  // identify which occurrence in the playlist is playing.
  function marks(rows, playback) {
    const output = { current: -1, next: -1, paused: false, shuffle: false };
    if (!playback || playback.active === false || playback.samePlaylist !== true) return output;
    const id = trackId(playback.now);
    if (!marker.test(id)) return output;
    const occurrences = [];
    rows.forEach((t, i) => { if (trackId(t) === id) occurrences.push(i); });
    if (occurrences.length !== 1) return output;
    output.current = occurrences[0];
    output.paused = playback.isPlaying === false;
    output.shuffle = playback.shuffle === true;
    // A shuffled playback queue may not follow the playlist order.
    if (output.shuffle || output.paused || rows.length < 2) return output;
    const successor = output.current + 1;
    if (successor < rows.length) output.next = successor;
    else if (playback.repeat === 'context') output.next = 0;
    return output;
  }

  let active = { venue:'', panel:null, token:0, fetching:false, lastRefresh:0 };
  let scheduled = false;
  function ensure() {
    const id = routeVenue();
    const legacy = id ? document.querySelector('.toca-detail-aside #toca-live-order') : null;
    const panel = legacy?.closest('.toca-panel');
    if (!id || !legacy || !panel) {
      if (active.venue || active.panel) active = { venue:'', panel:null, token:active.token+1, fetching:false, lastRefresh:0 };
      return;
    }
    const redundant = document.querySelector('.toca-detail-aside #toca-live-next')?.closest('.toca-panel');
    if (redundant) redundant.classList.add('toca-next-hidden-v1820');
    panel.classList.add('toca-full-playlist-v1820');
    let full = panel.querySelector(':scope > .toca-playlist-v1820-list');
    if (!full) {
      full = document.createElement('div');
      full.className = 'toca-playlist-v1820-list';
      full.setAttribute('aria-label', 'Playlist completa del bar');
      full.setAttribute('role', 'list');
      full.textContent = 'Cargando playlist…';
      legacy.before(full);
    }
    if (active.venue !== id || active.panel !== panel) {
      active = { venue:id, panel, token:active.token+1, fetching:false, lastRefresh:0 };
      schedule();
    }
  }
  function element(tag, css, content) {
    const el = document.createElement(tag);
    if (css) el.className = css;
    if (content !== undefined) el.textContent = str(content);
    return el;
  }
  function rowFor(track, i, flags) {
    const row = element('div', 'toca-song-row toca-playlist-v1820-row');
    row.setAttribute('role', 'listitem');
    const current = flags.current === i;
    const next = flags.next === i;
    if (current) row.classList.add('toca-playlist-v1820-current');
    if (next) row.classList.add('toca-playlist-v1820-next');
    row.append(element('span', 'toca-number', i + 1));
    // Artwork extension v1.8.13 decorates this element by matching
    // track title/artist against the refreshed state.playlist.
    row.append(element('div', `toca-track-art variant-${i % 5}`, '♫'));
    const metadata = element('div', 'toca-song-meta');
    metadata.append(element('strong', '', title(track)), element('small', '', artist(track)));
    row.append(metadata);
    if (current) row.append(element('span', 'toca-playlist-v1820-badge is-current', flags.paused ? 'En pausa' : 'Sonando ahora'));
    else if (next) row.append(element('span', 'toca-playlist-v1820-badge is-next', 'Siguiente en la lista'));
    return row;
  }
  function render(venue, panel, token, playlist, playback, error) {
    if (token !== active.token || routeVenue() !== venue || active.panel !== panel || !panel.isConnected) return;
    const view = panel.querySelector(':scope > .toca-playlist-v1820-list');
    if (!view) return;
    const tracks = asArray(playlist);
    const count = panel.querySelector('.toca-section-title > span');
    if (count) {
      const newCount = error ? 'No disponible' : `${tracks.length} ${tracks.length === 1 ? 'tema' : 'temas'}`;
      if (count.textContent !== newCount) count.textContent = newCount;
    }
    const children = document.createDocumentFragment();
    if (error) children.append(element('p', 'toca-playlist-v1820-muted', 'No se pudo cargar la playlist. Reintentando…'));
    else if (!tracks.length) children.append(element('p', 'toca-playlist-v1820-muted', 'Todavía no hay canciones en la playlist.'));
    else {
      const flags = marks(tracks, playback);
      tracks.forEach((t, i) => children.append(rowFor(t, i, flags)));
    }
    const previousScrollTop = view.scrollTop;
    view.replaceChildren(children);
    view.scrollTop = previousScrollTop;
    // Keep the existing Spotify-artwork component supplied in v1.8.13 working.
    if (!error && typeof state !== 'undefined' && state.detail?.id === venue) state.playlist = tracks;
  }
  async function refresh(force = false) {
    ensure();
    const { venue, panel, token } = active;
    if (!venue || !panel || active.fetching) return;
    if (!force && Date.now() - active.lastRefresh < 15000) return;
    active.fetching = true;
    active.lastRefresh = Date.now();
    try {
      if (typeof state !== 'undefined' && state.demo) {
        render(venue, panel, token, asArray(state.playlist), {active:true,samePlaylist:false}, false);
        return;
      }
      if (typeof api !== 'function') throw new Error('TOCÁ API no disponible');
      const [playlist, playback] = await Promise.all([
        api(`/api/venues/${encodeURIComponent(venue)}/playlist`),
        api(`/api/venues/${encodeURIComponent(venue)}/music-status`).catch(() => null)
      ]);
      render(venue, panel, token, playlist, playback, false);
    } catch (err) {
      console.warn('TOCÁ: error cargando playlist completa', err);
      render(venue, panel, token, [], null, true);
    } finally {
      if (token === active.token) active.fetching = false;
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; void refresh(); });
  }
  function init() {
    const app = document.getElementById('app');
    if (!app) return;
    const observer = new MutationObserver(records => {
      // Only refresh on a newly mounted profile, never because the old
      // #toca-live-order is redrawn by polling or artwork is inserted.
      const profileAdded = records.some(rec => [...rec.addedNodes].some(node => node.nodeType === 1 &&
        (node.matches?.('.toca-detail-aside,#toca-live-order') || node.querySelector?.('.toca-detail-aside #toca-live-order'))));
      if (profileAdded || (routeVenue() && !active.panel?.isConnected)) ensure();
    });
    observer.observe(app, { childList:true, subtree:true });
    window.addEventListener('hashchange', () => { ensure(); });
    window.setInterval(() => { if (routeVenue()) void refresh(true); }, 20000);
    ensure();
  }
  // Expose ONLY the pure marker rule for regression tests; no user data or API tokens.
  if (typeof window !== 'undefined') window.TocaPlaylistMarkersV1820 = marks;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
