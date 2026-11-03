/* TOCÁ v1.8.25 — independent customer login (not bar administration).
   The token is kept in tab-scoped sessionStorage, never in URLs or localStorage. */
(() => {
  'use strict';
  const KEY = 'toca:customer:session';
  const RETURN_KEY = 'toca:customer:after-login';
  const session = { token: sessionStorage.getItem(KEY) || '', user: null, checked: false, checking: null };
  const customerApi = async (path, method = 'GET', body) => {
    const response = await fetch(API_URL + '/api/customers' + path, {
      method,
      cache: 'no-store',
      headers: {
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data._embedded?.errors?.[0]?.message || data.message || `Error HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  };
  const clear = () => {
    sessionStorage.removeItem(KEY);
    session.token = '';
    session.user = null;
    session.checked = true;
  };
  async function ensure() {
    if (session.checked) return session.user;
    if (session.checking) return session.checking;
    session.checking = (async () => {
      if (!session.token) {
        session.checked = true;
        return null;
      }
      // An older /me check must never overwrite a newer Google session.
      const verifyingToken = session.token;
      try {
        const verifiedUser = await customerApi('/me');
        if (session.token === verifyingToken) session.user = verifiedUser;
      } catch (_) {
        if (session.token === verifyingToken) clear();
      }
      if (session.token === verifyingToken) session.checked = true;
      return session.user;
    })();
    try { return await session.checking; }
    finally { session.checking = null; }
  }
  function verified() { return session.checked && !!session.user; }
  function customerHeader() { return verified() && session.token ? `Bearer ${session.token}` : ''; }
  // Called by Google sign-in AFTER our API has issued a TOCÁ session.
  // Verify it via /me BEFORE touching the auth module's session closure.
  // This uses the same in-memory session as the password login, with no reload.
  window.tocaCustomerAcceptGoogleSession = async (googleToken, expectedId) => {
    if (typeof googleToken !== 'string' || !googleToken)
      throw Error('Google no devolvió una sesión de cliente válida.');
    const result = await fetch(API_URL + '/api/customers/me', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${googleToken}` }
    });
    const user = await result.json().catch(() => ({}));
    if (!result.ok || !user?.id)
      throw Error(user._embedded?.errors?.[0]?.message || user.message || 'La sesión de TOCÁ no se pudo verificar.');
    if (expectedId && String(user.id) !== String(expectedId))
      throw Error('Google devolvió una cuenta diferente a la sesión de TOCÁ.');
    sessionStorage.setItem(KEY, googleToken);
    session.token = googleToken;
    session.user = user;
    session.checked = true;
    session.checking = null;
    return user;
  };

  window.tocaCustomerVerified = verified;
  window.tocaCustomerEnsure = ensure;
  window.tocaCustomerBearer = customerHeader;
  window.tocaCustomerUser = () => verified() ? session.user : null;

  // Keep QR navigation local to this app; never accept external login redirects.
  const requestDestination = (hash) => {
    const value = String(hash || '');
    if (/^#\/request\/[A-Za-z0-9%-]{1,120}(?:\?join=[A-Za-z0-9_-]{1,150})?$/.test(value)) return value;
    const id = String(state.venueId || '');
    return /^[A-Za-z0-9-]{1,120}$/.test(id) ? '#/request/' + encodeURIComponent(id) : '#/explore';
  };
  const resumeRequest = (fallback) => {
    const stored = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return stored ? requestDestination(stored) : fallback;
  };
  // Called from BOTH the request route and the submit button; a cached session
  // is checked again with Micronaut to avoid treating an expired token as valid.
  window.tocaCustomerRequireForRequest = async (targetHash) => {
    await ensure();
    if (verified()) {
      try {
        session.user = await customerApi('/me');
        return true;
      } catch (error) {
        clear();
      }
    }
    sessionStorage.setItem(RETURN_KEY, requestDestination(targetHash));
    navigate('#/customer/login');
    return false;
  };

  const renderAuth = (register = false) => {
    if (verified()) { navigate(resumeRequest('#/profile')); return; }
    const title = register ? 'Creá tu cuenta' : 'Iniciá sesión';
    const requesting = !!sessionStorage.getItem(RETURN_KEY);
    const body = `<section class="toca-customer-page">
      <div class="toca-customer-card">
        <span class="eyebrow">TU CUENTA · TU MÚSICA</span>
        <h1>${title}</h1>
        <p class="toca-customer-lead">${requesting?'Para pedir una canción, primero iniciá sesión o creá una cuenta. Después volvés automáticamente al bar.':'Entrá a TOCÁ para pedir canciones y guardar tus pedidos. Tu cuenta es independiente del Portal de bares.'}</p>
        <form id="toca-customer-auth-form" data-register="${register?'yes':'no'}" class="toca-customer-form">
          ${register?`<label>Tu nombre<input class="input" name="name" autocomplete="name" minlength="2" maxlength="120" required /></label>`:''}
          <label>Correo electrónico<input class="input" name="email" type="email" autocomplete="email" maxlength="200" required /></label>
          <label>Contraseña<input class="input" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="10" maxlength="72" required /></label>
          ${register?'<small>Usá una contraseña de al menos 10 caracteres.</small>':''}
          <div id="toca-customer-auth-error" class="toca-customer-error" role="alert" hidden></div>
          <button class="toca-btn full" type="submit">${register?'Crear cuenta':'Entrar'} ${iconSvg('arrow',17)}</button>
        </form>
        <div class="toca-customer-switch">${register?'¿Ya tenés cuenta? <a href="#/customer/login">Iniciar sesión</a>':'¿Todavía no tenés cuenta? <a href="#/customer/register">Registrarte</a>'}</div>
        <p class="toca-customer-note">Algunos bares requieren que estés a 100 metros. Los tokens pagos todavía no están habilitados.</p>
      </div>
    </section>`;
    mount(body, 'auth');
  };

  window.tocaCustomerLoginPage = renderAuth;
  window.tocaCustomerLogout = async () => {
    if (session.token) {
      try { await customerApi('/logout', 'POST'); }
      catch (e) { console.warn('No se pudo revocar la sesión remota:', e.message); }
    }
    clear();
    toast('Sesión de cliente cerrada');
    navigate('#/profile');
    render();
  };

  window.tocaCustomerRequestsPage = async () => {
    await ensure();
    if (!verified()) { navigate('#/customer/login'); return; }
    let requests;
    try { requests = await customerApi('/me/requests'); }
    catch (e) {
      if (e.status === 401) { clear(); navigate('#/customer/login'); return; }
      throw e;
    }
    const rows = requests.map((x, i) => `<div class="toca-song-row toca-customer-request">
      <div class="toca-track-art variant-${i%5}">${iconSvg('music',20)}</div>
      <div class="toca-song-meta"><strong>${esc(x.title)}</strong>
        <small>${esc(x.artist)} · ${esc(x.venueName)} · ${esc(statusLabel(x.status))}</small>
        <small>${esc(fmt(x.createdAt))}</small>
      </div>
    </div>`).join('');
    mount(`<div class="toca-my-songs"><span class="eyebrow">TU ACTIVIDAD</span><h1>Mis canciones</h1>
      <p class="toca-muted">Pedidos realizados con tu cuenta. Los pedidos previos como invitado no se vinculan automáticamente.</p>
      <div class="toca-panel">${rows || '<p class="toca-muted">Aún no tenés pedidos asociados a tu cuenta.</p>'}</div>
      <a class="toca-btn full" href="#/explore">Explorar bares ${iconSvg('arrow',17)}</a>
    </div>`, 'my-requests');
  };

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'toca-customer-auth-form') return;
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button[type="submit"]');
    const errorBox = form.querySelector('#toca-customer-auth-error');
    const register = form.dataset.register === 'yes';
    const body = Object.fromEntries(new FormData(form));
    if (button) button.disabled = true;
    if (errorBox) errorBox.hidden = true;
    try {
      const result = await customerApi(register ? '/register' : '/login', 'POST', body);
      sessionStorage.setItem(KEY, result.token);
      session.token = result.token;
      session.user = await customerApi('/me'); // Trust only a server-verified session.
      session.checked = true;
      toast(register ? '¡Cuenta creada!' : '¡Bienvenido a TOCÁ!');
      navigate(resumeRequest('#/my-requests'));
      render();
    } catch (err) {
      if (errorBox) { errorBox.textContent = err.message; errorBox.hidden = false; }
      // Do not leave an unverified login token in storage after a failed /me.
      if (!session.user && session.token) clear();
    } finally { if (button && button.isConnected) button.disabled = false; }
  });

  document.addEventListener('click', e => {
    const logout = e.target.closest('[data-customer-logout]');
    if (!logout) return;
    e.preventDefault();
    window.tocaCustomerLogout();
  });

  // After the restored session is verified, refresh the public header/navigation.
  ensure().then(() => {
    const r = route().path;
    if (!r.startsWith('/admin') && !['/login', '/register'].includes(r)) render();
  }).catch(console.error);
})();
