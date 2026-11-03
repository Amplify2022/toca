/* TOCÁ v1.8.30: No QR as a UI requirement, whitelist browsing, delete bar last. */
(() => {
  'use strict';

  const allowedByVenue = new Map();
  const isAdminProfile = () => /^#\/admin\/profile(?:\?|$)/.test(location.hash);
  const isRequestPage = () => /^#\/request\//.test(location.hash);
  const escapeHtml = value => typeof esc === 'function'
    ? esc(value)
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function cleanupQr() {
    // QR is no longer an admin feature. Do not delete unrelated Spotify QR links.
    document.querySelectorAll('a[href="#/admin/qr"],a[href$="#/admin/qr"]').forEach(a => a.remove());
    if (location.hash === '#/admin/qr') {
      location.replace('#/admin/profile');
    }
    // Older TOCÁ releases can still render the obsolete note in the request view.
    const requestPage = document.querySelector('.toca-request-page');
    requestPage?.querySelectorAll('.toca-demo-note').forEach(el => {
      if (/para solicitar canciones escane[aá] el qr/i.test(el.textContent || '')) el.remove();
    });
    // Customer auth templates on older releases may still have QR instructions.
    document.querySelectorAll('.toca-customer-note').forEach(el => {
      if (/acceso por qr/i.test(el.textContent || '')) {
        el.textContent = 'Algunos bares piden estar a 100 metros para solicitar canciones.';
      }
    });
  }

  function moveDeleteBarToEnd() {
    if (!isAdminProfile()) return;
    const card = document.querySelector('.toca-venue-editor-card');
    if (!card) return;
    let section = card.querySelector('.toca-delete-venue');
    if (!section) {
      // The existing app.js handles data-action="open-delete-venue" with the
      // name-confirmation modal and DELETE endpoint; reuse that implementation.
      section = document.createElement('section');
      section.className = 'toca-delete-venue';
      section.setAttribute('aria-labelledby','toca-delete-title');
      section.innerHTML = `<h3 id="toca-delete-title">¿Querés dejar TOCÁ?</h3>
        <p>Si ya no querés que tu bar aparezca en TOCÁ, podés eliminarlo cuando quieras.</p>
        <button type="button" class="btn toca-delete-trigger" data-action="open-delete-venue">Eliminar mi bar</button>`;
    }
    if (card.lastElementChild !== section) card.appendChild(section);
  }

  function allowedRow(track, index) {
    // Reuse the existing request action, ensuring its authoritative catalog
    // contains the exact IDs returned by PostgreSQL.
    if (typeof trackRow === 'function') return trackRow(track,index+1,'search');
    return `<div class="toca-request-track"><div class="toca-song-meta">
      <strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></div>
      <button type="button" class="toca-btn" data-action="request" data-track="${escapeHtml(track.id)}">Pedir</button></div>`;
  }

  function paintAllowed(page, tracks) {
    if (!page.isConnected || !isRequestPage() || !page.dataset.tocaWhitelistVenue) return;
    const input=page.querySelector('#song-search');
    if (input?.value.trim()) return; // Don't overwrite a live search.
    const area=page.querySelector('#song-results');
    if (!area) return;
    if (typeof state !== 'undefined') state.catalog=tracks;
    area.innerHTML=tracks.length
      ? tracks.map(allowedRow).join('')
      : '<p class="toca-muted">El bar todavía no agregó canciones a su lista de permitidas.</p>';
  }

  async function prepareRequest() {
    if (!isRequestPage()) return;
    const page=document.querySelector('.toca-request-page');
    if (!page || page.dataset.tocaV1830) return;
    const header=page.querySelector('.toca-request-head');
    const area=page.querySelector('#song-results');
    const venue = typeof state !== 'undefined' ? state.detail : null;
    const whitelist = venue?.curatedOnly === true;
    page.dataset.tocaV1830='yes';
    if (!whitelist) {
      header?.remove(); // Keep the search box; remove only the redundant section.
      if (area) area.replaceChildren(); // No filler text before typing.
      return;
    }
    const id=String(venue?.id || (typeof state !== 'undefined' ? state.venueId : '') || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    page.dataset.tocaWhitelistVenue=id;
    if (header) {
      const title=header.querySelector('h2');
      const caption=header.querySelector('span');
      if (title) title.textContent='Canciones permitidas';
      if (caption) caption.textContent='Solo los temas habilitados por este bar';
    }
    if (area) area.innerHTML='<p class="toca-muted">Cargando canciones permitidas...</p>';
    try {
      let tracks=allowedByVenue.get(id);
      if (!tracks) {
        const response=await fetch(`${API_URL}/api/venues/${encodeURIComponent(id)}/allowed-tracks`,{cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data=await response.json();
        if (!Array.isArray(data)) throw new Error('Respuesta inesperada del servidor');
        tracks=data.filter(t=>/^[A-Za-z0-9]{22}$/.test(String(t.id||''))).map(t=>({
          id:String(t.id), title:String(t.title||''), artist:String(t.artist||'')
        }));
        allowedByVenue.set(id,tracks);
      }
      if (page.isConnected) paintAllowed(page,tracks);
    } catch (error) {
      if (page.isConnected && area) {
        area.innerHTML=`<p class="toca-muted">No se pudo cargar la lista de permitidas (${escapeHtml(error.message)}).</p>`;
      }
      console.warn('TOCÁ: lista blanca pública:',error);
    }
  }

  // app.js already owns the song search. When the user clears it, restore the
  // public whitelist (without calling Spotify or requiring admin credentials).
  document.addEventListener('input',event=>{
    if (event.target.id!=='song-search') return;
    const page=event.target.closest('.toca-request-page');
    const id=page?.dataset.tocaWhitelistVenue;
    if (!id || event.target.value.trim()) return;
    setTimeout(()=>{
      if (page?.isConnected && !event.target.value.trim())
        paintAllowed(page,allowedByVenue.get(id)||[]);
    },480);
  },true);

  let scheduled=false;
  function schedule() {
    if (scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      cleanupQr();
      moveDeleteBarToEnd();
      void prepareRequest();
    });
  }
  function start() {
    const app=document.getElementById('app');
    if (app) new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    schedule();
    window.addEventListener('hashchange',schedule);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
