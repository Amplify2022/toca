/* TOCÁ v1.8.47 — Google Identity Services for customer accounts only.
 * Google issues an ID token; the Micronaut API verifies it and issues the
 * existing TOCÁ customer session. Admin sessions remain separate.
 */
(() => {
  'use strict';
  const googleSrc = 'https://accounts.google.com/gsi/client';
  let configPromise, sdkPromise, initialized = false;
  let busy = false;
  const customerKey = 'toca:customer:session';
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

  function feedback(message, error = false) {
    const auth = document.querySelector('#toca-customer-auth-error');
    const link = document.querySelector('#toca-google-link-message');
    const destination = location.hash.startsWith('#/customer/') ? auth : link;
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
    busy = true;
    const linking = location.hash.startsWith('#/profile');
    try {
      const authorization = linking ? window.tocaCustomerBearer?.() : '';
      if (linking && !authorization) throw Error('Iniciá sesión como cliente para vincular Google.');
      const url = linking ? '/api/customers/me/google/link' : '/api/customers/google';
      const result = await fetch(`${API_URL}${url}`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify({ credential: response.credential })
      });
      const json = await result.json().catch(() => ({}));
      if (!result.ok) throw Error(json._embedded?.errors?.[0]?.message || json.message || 'No se pudo iniciar sesión con Google.');
      if (linking) {
        feedback('¡Google quedó vinculado a tu cuenta TOCÁ!');
        typeof toast === 'function' && toast('Google vinculado correctamente');
      } else {
        if (!json.token || !json.user?.id) throw Error('La API no devolvió una sesión de cliente válida.');
        // Same tab-scoped session storage and lifecycle as the existing email login.
        sessionStorage.setItem(customerKey, json.token);
        location.hash = '#/profile';
        location.reload(); // Reinitialize original auth module with the verified token.
      }
    } catch (error) {
      feedback(error.message || 'No se pudo validar Google.', true);
    } finally { busy = false; }
  }

  async function mountGoogle(slot) {
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
      google.accounts.id.renderButton(slot, {
        type: 'standard', theme: 'filled_black', size: 'large',
        shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: 330,
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
    // Customer login & registration only. Never insert in /login or /admin.
    const authForm = root.querySelector('#toca-customer-auth-form');
    if (authForm && !authForm.closest('.toca-customer-card')?.querySelector('.toca-google-container')) {
      const container = document.createElement('div');
      container.className = 'toca-google-container';
      container.innerHTML = '<div class="toca-google-divider"><span>O continuá con</span></div><div class="toca-google-slot"></div>';
      authForm.insertAdjacentElement('afterend', container);
      mountGoogle(container.querySelector('.toca-google-slot'));
    }
    const customerProfile = root.querySelector('.toca-profile-v1841');
    const customer = window.tocaCustomerUser?.();
    const admin = typeof state !== 'undefined' && !state.demo && !!state.token;
    if (customerProfile && customer && !admin && !customerProfile.querySelector('.toca-google-link-container')) {
      const destination = customerProfile.querySelector('.toca-profile-shortcuts') || customerProfile.querySelector('.toca-profile-hero');
      if (!destination) return;
      const wrap = document.createElement('div');
      wrap.className = 'toca-google-link-container';
      wrap.innerHTML = `<div class="toca-google-link-title">Vincular cuenta de Google</div>
        <p>Usá el mismo correo que tu cuenta de TOCÁ para iniciar sesión con Google.</p>
        <div class="toca-google-slot"></div><div id="toca-google-link-message" role="status" hidden></div>`;
      destination.appendChild(wrap);
      mountGoogle(wrap.querySelector('.toca-google-slot'));
    }
  }

  const observer = new MutationObserver(render);
  observer.observe(root, {childList: true, subtree: true});
  render();
})();
