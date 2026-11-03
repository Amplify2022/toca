/* TOCÁ 1.8.41 — Customer profile and account-owned avatar.
 * Customer auth remains separate from bar-admin authorization by design. */
(() => {
  'use strict';
  let avatarCache = null;
  let currentProfileCall = 0;
  const avatarEndpoint = () => API_URL + '/api/customers/me/avatar';
  const authHeader = () => window.tocaCustomerBearer?.() || '';
  const guestFavorites = () => { try { return myFavorites(); } catch (_) { return []; } };
  const initials = name => String(name || 'T').trim().slice(0, 1).toUpperCase();
  const avatarHTML = (name, image) => image
    ? `<img src="${esc(image)}" alt="Foto de perfil de ${esc(name)}" />`
    : `<span aria-hidden="true">${esc(initials(name))}</span>`;

  async function customerFetch(path, options = {}) {
    const token = authHeader();
    if (!token) throw new Error('Iniciá sesión como cliente.');
    const response = await fetch(API_URL + '/api/customers' + path, {
      cache: 'no-store', ...options,
      headers: { Authorization: token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result._embedded?.errors?.[0]?.message || result.message || 'No se pudo actualizar el perfil.');
    return result;
  }

  function paintHeaderAvatar() {
    const link = document.querySelector('.toca-user-button');
    if (!link || !avatarCache || !authHeader() || link.querySelector('img')) return;
    link.innerHTML = `<img src="${esc(avatarCache)}" alt="" />`;
    link.classList.add('toca-user-has-photo');
  }
  // Keep the header photo when the SPA replaces the public header on navigation.
  const app = document.getElementById('app');
  if (app) new MutationObserver(paintHeaderAvatar).observe(app, { childList: true, subtree: false });

  function profileMarkup(user, favorites, venues, history, avatar, historyUnavailable = false) {
    const loggedIn = !!user;
    const name = loggedIn ? user.name : 'Tu perfil';
    const cardList = venues.filter(v => favorites.includes(v.id));
    const content = !loggedIn
      ? '<div class="toca-profile-empty">Iniciá sesión como cliente para ver tus bares favoritos.</div>'
      : cardList.length
        ? cardList.map((v, i) => tocaVenueCard(v, i)).join('')
        : '<div class="toca-profile-empty">Todavía no tenés bares favoritos. Tocá el corazón en un bar para guardarlo acá.</div>';
    return `<section class="toca-profile-v1841">
      <div class="toca-profile-hero">
        <span class="eyebrow">TU ESPACIO EN TOCÁ</span>
        <div class="toca-profile-identity">
          <div class="toca-profile-photo-area">
            <div class="toca-profile-photo" data-toca-avatar-view>${avatarHTML(name, avatar)}</div>
            ${loggedIn ? `<label class="toca-profile-photo-edit" for="toca-avatar-input" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">${iconSvg('plus', 19)}
              <input id="toca-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Elegir foto de perfil" /></label>` : ''}
          </div>
          <div class="toca-profile-hero-text"><span class="toca-profile-kicker">${loggedIn ? 'CUENTA DE CLIENTE' : 'DESCUBRÍ TU MÚSICA'}</span>
            <h1>${loggedIn ? '¡Hola, ' + esc(name) + '!' : 'Tu noche, tu música.'}</h1>
            <p>${loggedIn ? esc(user.email) : 'Iniciá sesión para guardar tus pedidos y personalizar tu perfil.'}</p>
            ${loggedIn ? `<div class="toca-profile-image-actions"><span>Foto de perfil · JPG, PNG o WebP</span>${avatar ? '<button type="button" data-toca-avatar-delete>Quitar foto</button>' : ''}</div>` : `<div class="toca-profile-guest-actions"><a class="toca-btn" href="#/customer/login">Iniciar sesión</a><a href="#/customer/register">Crear cuenta</a></div>`}
          </div>
        </div>
        <div class="toca-profile-feedback" role="status" aria-live="polite" hidden></div>
      </div>
      <div class="toca-profile-stat-grid">
        <a class="toca-profile-stat" href="#/my-requests"><span>Mis canciones</span><strong>${loggedIn ? (historyUnavailable ? '—' : history.length) : '—'}</strong><small>Pedidos registrados</small></a>
        <a class="toca-profile-stat" href="#/explore"><span>Bares guardados</span><strong>${loggedIn ? favorites.length : '—'}</strong><small>Tus favoritos</small></a>
      </div>
      <div class="toca-profile-bottom-grid">
        <section class="toca-profile-section"><div class="toca-profile-section-heading"><div><span class="eyebrow">TUS LUGARES</span><h2>Bares favoritos</h2></div><a href="#/explore">Explorar bares ${iconSvg('arrow', 16)}</a></div>
          <div class="toca-profile-favorite-grid">${content}</div></section>
        <aside class="toca-profile-section toca-profile-shortcuts"><span class="eyebrow">ACCESOS RÁPIDOS</span><h2>Tu actividad</h2>
          <a href="#/my-requests">${iconSvg('music', 19)}<span>Mis canciones</span>${iconSvg('arrow', 16)}</a>
          <a href="#/explore">${iconSvg('pin', 19)}<span>Descubrir bares</span>${iconSvg('arrow', 16)}</a>
          ${loggedIn ? `<button type="button" class="toca-profile-logout" data-customer-logout>${iconSvg('logout', 18)}<span>Cerrar sesión de cliente</span></button>` : ''}
        </aside>
      </div>
    </section>`;
  }

  // Override the legacy demo/guest-only customer profile. Navigation and API
  // guards are still owned by the existing auth and router modules.
  tocaProfile = async function () {
    const call = ++currentProfileCall;
    let user = null;
    try {
      await window.tocaCustomerEnsure?.();
      user = window.tocaCustomerUser?.() || null;
    } catch (error) { console.warn('Perfil: no se pudo verificar la sesión', error); }
    const favorites = user ? guestFavorites() : [];
    const venues = state.demo ? db().venues : (state.venues || []);
    let history = [], avatar = null, historyUnavailable = false;
    if (user) {
      const responses = await Promise.allSettled([customerFetch('/me/requests'), customerFetch('/me/avatar')]);
      if (responses[0].status === 'fulfilled' && Array.isArray(responses[0].value)) history = responses[0].value;
      else historyUnavailable = true;
      if (responses[1].status === 'fulfilled') avatar = responses[1].value?.avatar || null;
    }
    if (call !== currentProfileCall || route().path !== '/profile') return;
    avatarCache = avatar;
    mount(profileMarkup(user, favorites, venues, history, avatar, historyUnavailable), 'profile');
    paintHeaderAvatar();
  };

  async function resizeImage(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una foto JPG, PNG o WebP.');
    if (file.size > 6 * 1024 * 1024) throw new Error('La imagen original no puede superar los 6 MB.');
    const objectURL = URL.createObjectURL(file);
    let img;
    try {
      img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo abrir la imagen. Probá con otra foto.'));
        el.src = objectURL;
      });
      const size = 360, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx || img.naturalWidth < 1 || img.naturalHeight < 1 || img.naturalWidth * img.naturalHeight > 60_000_000)
        throw new Error('Dimensiones de imagen no permitidas.');
      const edge = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - edge) / 2, (img.naturalHeight - edge) / 2, edge, edge, 0, 0, size, size);
      for (const quality of [0.82, 0.70, 0.56]) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length < 210_000) return result;
      }
      throw new Error('La imagen es demasiado grande incluso después de optimizarla.');
    } finally { URL.revokeObjectURL(objectURL); }
  }

  function feedback(message, error = false) {
    const el = document.querySelector('.toca-profile-feedback');
    if (el) { el.hidden = false; el.textContent = message; el.classList.toggle('is-error', error); }
  }
  document.addEventListener('change', async event => {
    if (event.target?.id !== 'toca-avatar-input') return;
    const file = event.target.files?.[0];
    if (!file) return;
    const input = event.target;
    input.disabled = true;
    feedback('Guardando tu foto de perfil...');
    try {
      const image = await resizeImage(file);
      await customerFetch('/me/avatar', { method: 'PUT', body: JSON.stringify({ image }) });
      avatarCache = image;
      feedback('Foto de perfil actualizada.');
      await tocaProfile();
    } catch (error) {
      feedback(error.message || 'No se pudo guardar la foto.', true);
    } finally { if (input.isConnected) { input.disabled = false; input.value = ''; } }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-toca-avatar-delete]');
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    feedback('Quitando tu foto...');
    try {
      await customerFetch('/me/avatar', { method: 'DELETE' });
      avatarCache = null;
      await tocaProfile();
    } catch (error) {
      feedback(error.message || 'No se pudo quitar la foto.', true);
      if (button.isConnected) button.disabled = false;
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-customer-logout]')) avatarCache = null;
  });
  // Display the stored avatar in the public header as soon as an existing
  // customer session has been verified, even before visiting the profile.
  window.tocaCustomerEnsure?.().then(async () => {
    if (!authHeader()) return;
    const response = await customerFetch('/me/avatar');
    avatarCache = response.avatar || null;
    paintHeaderAvatar();
  }).catch(error => console.info('Foto de perfil no disponible:', error.message));
})();
