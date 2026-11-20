/* Google Identity Services with separate customer and bar-admin endpoints. */
(() => {
  'use strict';
  const googleSrc = 'https://accounts.google.com/gsi/client';
  let configPromise, sdkPromise, initialized = false;
  let busy = false, buttonSequence = 0;
  const returnKey = 'toca:customer:after-login';
  const root = document.getElementById('app') || document.body;

  const config = () => configPromise ||= fetch(`${API_URL}/api/customers/google/config`, {
    cache: 'no-store'
  }).then(async response => {
    if (!response.ok) throw Error('No se pudo consultar la configuración de Google.');
    return response.json();
  });

  function sdk() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = googleSrc;
      element.async = true;
      element.onload = () => window.google?.accounts?.id
        ? resolve(window.google) : reject(Error('Google Identity Services no se inició.'));
      element.onerror = () => reject(Error('No se pudo conectar con Google.'));
      document.head.appendChild(element);
    });
    return sdkPromise;
  }

  function feedback(message, error = false, slot) {
    const auth = document.querySelector('.toca-google-feedback') || document.querySelector('#toca-customer-auth-error');
    const link = document.querySelector('#toca-google-link-message');
    const destination = slot?.parentElement.querySelector('.toca-google-feedback') ||
      (location.hash.startsWith('#/customer/') ? auth : link);
    if (destination) {
      destination.hidden = false;
      destination.textContent = message;
      destination.classList.toggle('is-error', error);
    } else if (error) {
      typeof toast === 'function' ? toast(message) : console.error(message);
    }
  }

  async function complete(response) {
    if (busy || typeof response?.credential !== 'string') return;
    const slot = [...root.querySelectorAll('[data-google-state]')].find(node => node.dataset.googleState === response.state);
    if (!slot) return;
    busy = true;
    const flow = slot.dataset.googleFlow, linking = flow === 'link', admin = flow.startsWith('admin-');
    try {
      const authorization = linking ? window.tocaCustomerBearer?.() : '';
      if (linking && !authorization) throw Error('Iniciá sesión como cliente para vincular Google.');
      const url = admin ? `/api/auth/google/${flow==='admin-register'?'register':'login'}` :
        linking ? '/api/customers/me/google/link' : '/api/customers/google';
      const result = await fetch(`${API_URL}${url}`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify({ credential: response.credential })
      });
      const json = await result.json().catch(() => ({}));
      if (!slot.isConnected) return;
      if (!result.ok) {
        const reason = json._embedded?.errors?.[0]?.message || json.message || 'No se pudo iniciar sesión con Google.';
        // Never hide a 409 from users with a pre-existing password account.
        throw Error(!admin && result.status === 409 ? `${reason} Iniciá sesión con contraseña y vinculá Google desde tu perfil.` : reason);
      }
      if (admin) {
        if (!json.token || !json.user?.id) throw Error('La API no devolvió una sesión del portal válida.');
        state.token = json.token;
        state.user = json.user;
        sessionStorage.setItem('amplify-token', json.token);
        sessionStorage.setItem('amplify-user', JSON.stringify(json.user));
        navigate(ADMIN_HOME);
      } else if (linking) {
        feedback('¡Google quedó vinculado a tu cuenta TOCÁ!');
        typeof toast === 'function' && toast('Google vinculado correctamente');
      } else {
        if (!json.token || !json.user?.id) throw Error('La API no devolvió una sesión de cliente válida.');
        // Do NOT reload: the original customer-auth module holds its session in a closure.
        // Storing the token alone leaves it unauthenticated until the next full page load,
        // and the SPA router may send the user back to /customer/login in the meantime.
        if (typeof window.tocaCustomerAcceptGoogleSession !== 'function')
          throw Error('Actualizá la página de TOCÁ para activar la sesión de Google.');
        await window.tocaCustomerAcceptGoogleSession(json.token, json.user.id);
        const pending = sessionStorage.getItem(returnKey);
        let destination = '#/profile';
        if (pending && /^#\/request\/[A-Za-z0-9%-]{1,120}(?:\?join=[A-Za-z0-9_-]{1,150})?$/.test(pending)) {
          destination = pending;
        }
        sessionStorage.removeItem(returnKey);
        if (typeof navigate === 'function') {
          navigate(destination);
          if (typeof render === 'function') render();
        } else {
          location.hash = destination;
        }
      }
    } catch (error) {
      if (slot.isConnected) feedback(error.message || 'No se pudo validar Google.', true, slot);
    } finally { busy = false; }
  }

  async function mountGoogle(slot, flow) {
    if (!slot.isConnected || slot.dataset.googleReady) return;
    slot.dataset.googleReady = 'loading';
    try {
      const settings = await config();
      if (!settings.enabled || !settings.clientId) {
        slot.innerHTML = '<small class="toca-google-unavailable">Google todavía no está configurado para TOCÁ.</small>';
        return;
      }
      await sdk();
      if (!initialized) {
        google.accounts.id.initialize({
          client_id: settings.clientId,
          callback: complete,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initialized = true;
      }
      if (!slot.isConnected) return;
      slot.textContent = '';
      slot.dataset.googleFlow = flow;
      slot.dataset.googleState = String(++buttonSequence);
      google.accounts.id.renderButton(slot, {
        type: 'standard', theme: 'filled_black', size: 'large',
        shape: 'rectangular', text: flow==='admin-register'?'signup_with':'continue_with', logo_alignment: 'left',
        width: Math.min(400, slot.clientWidth || 330), state: slot.dataset.googleState,
        locale: 'es'
      });
      slot.dataset.googleReady = 'yes';
    } catch (error) {
      if (slot.isConnected) slot.innerHTML = `<small class="toca-google-unavailable">${escapeMessage(error.message)}</small>`;
      slot.dataset.googleReady = 'error';
    }
  }

  function escapeMessage(raw) {
    return String(raw || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function render() {
    const authForm = root.querySelector('#toca-customer-auth-form, #onboard-account, #login-form');
    if (authForm && !authForm.nextElementSibling?.classList.contains('toca-google-container')) {
      const container = document.createElement('div');
      container.className = 'toca-google-container';
      container.innerHTML = '<div class="toca-google-divider"><span>O continuá con</span></div><div class="toca-google-slot"></div><div class="toca-google-feedback" role="alert" aria-live="polite" hidden></div>';
      authForm.insertAdjacentElement('afterend', container);
      const flow = authForm.id==='onboard-account'?'admin-register':authForm.id==='login-form'?'admin-login':'customer';
      mountGoogle(container.querySelector('.toca-google-slot'), flow);
    }
    const customerProfile = root.querySelector('.toca-profile-v1841');
    const customer = window.tocaCustomerUser?.();
    const admin = typeof state !== 'undefined' && !!state.token;
    if (customerProfile && customer && !admin && !customerProfile.querySelector('.toca-google-link-container')) {
      const destination = customerProfile.querySelector('.toca-profile-shortcuts') || customerProfile.querySelector('.toca-profile-hero');
      if (!destination) return;
      const wrap = document.createElement('div');
      wrap.className = 'toca-google-link-container';
      wrap.innerHTML = `<div class="toca-google-link-title">Vincular cuenta de Google</div>
        <p>Usá el mismo correo que tu cuenta de TOCÁ para iniciar sesión con Google.</p>
        <div class="toca-google-slot"></div><div id="toca-google-link-message" role="status" hidden></div>`;
      destination.appendChild(wrap);
      mountGoogle(wrap.querySelector('.toca-google-slot'), 'link');
    }
  }

  const observer = new MutationObserver(render);
  observer.observe(root, {childList: true, subtree: true});
  render();
})();
