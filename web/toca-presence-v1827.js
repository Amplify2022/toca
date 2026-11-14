/* Distance-based access, selected by the bar owner: NEARBY or ANYWHERE. */
(() => {
  'use strict';
  const inFlight = new Map();
  const customerHeader = () => window.tocaCustomerBearer?.() || '';
  const venueApi = async (venueId, suffix, method = 'GET', body, token = customerHeader()) => {
    if (!token) throw new Error('Iniciá sesión como cliente antes de pedir canciones.');
    const response = await fetch(`${API_URL}/api/venues/${encodeURIComponent(venueId)}/${suffix}`, {
      method, cache: 'no-store',
      headers: {'X-TOCA-Customer': token,
        ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data._embedded?.errors?.[0]?.message || data.message || `Error HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  };
  const locationError = code => Object.assign(new Error(code === 1
    ? 'Para pedir canciones en este bar debés permitir el acceso a tu ubicación.'
    : code === 4
      ? 'La ubicación recibida no tiene suficiente precisión. Activá ubicación precisa y volvé a intentar.'
      : 'No pudimos obtener tu ubicación. Verificá que esté activada y volvé a intentar.'), {locationCode: code});
  const readPosition = highAccuracy => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(pos => {
      const {latitude, longitude, accuracy} = pos.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || accuracy > 100) {
        reject(locationError(4));
        return;
      }
      resolve({latitude, longitude, accuracy});
    }, err => reject(locationError(err.code)),
    {enableHighAccuracy: highAccuracy, maximumAge: 30000, timeout: 8000});
  });
  const currentPosition = async () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      throw new Error('La ubicación requiere HTTPS o localhost y un navegador compatible.');
    }
    try { return await readPosition(true); }
    catch (error) {
      if (error.locationCode === 1) throw error;
      // Some desktop/mobile providers fail in high-accuracy mode. A second
      // reading may use network positioning, with the same precision limit.
      return readPosition(false);
    }
  };
  const allowed = result => result.mode === 'ANYWHERE' || result.allowed === true;
  const ensure = async (venueId, token) => {
    const sameCustomer = () => customerHeader() === token;
    try {
      const existing = await venueApi(venueId,'presence','GET',undefined,token);
      if (!sameCustomer()) return false;
      if (allowed(existing)) return true;
      let position;
      try { position = await currentPosition(); }
      catch (error) {
        if (!sameCustomer()) return false;
        if (error.locationCode && error.locationCode !== 1) {
          // Another tab/check-in may have completed while the provider was
          // timing out. Only the server can confirm that grant is still valid.
          const latest = await venueApi(venueId,'presence','GET',undefined,token);
          if (!sameCustomer()) return false;
          if (allowed(latest)) return true;
        }
        throw error;
      }
      if (!sameCustomer()) return false;
      const result = await venueApi(venueId,'presence','POST',position,token);
      if (!sameCustomer()) return false;
      if (result.allowed) {
        toast('Ubicación comprobada: estás dentro de los 100 metros del bar.');
        return true;
      }
      return false;
    } catch (error) {
      if (!sameCustomer()) return false;
      if (error.status === 401) {
        await window.tocaCustomerRequireForRequest(location.hash);
      } else {
        toast(error.message);
      }
      console.warn('TOCÁ: acceso al bar no autorizado:',error.message);
      return false;
    }
  };

  // Share an ongoing check for this customer/bar. No client-side grant can
  // bypass server authorization; each later request reads the current status.
  window.tocaPresenceEnsure = async venueId => {
    const token = customerHeader();
    if (!window.tocaCustomerVerified?.() || !token) {
      await window.tocaCustomerRequireForRequest(location.hash);
      return false;
    }
    const key = JSON.stringify([token,venueId]);
    if (!inFlight.has(key)) inFlight.set(key,ensure(venueId,token).finally(() => inFlight.delete(key)));
    return inFlight.get(key);
  };

  document.addEventListener('click',async event => {
    const button = event.target.closest('[data-toca-access-save]');
    if (!button) return;
    event.preventDefault();
    if (button.disabled) return;
    const group = button.closest('.toca-access-settings');
    const mode = group?.querySelector('input[name="toca-access-mode"]:checked')?.value;
    const venueId = group?.dataset.venueId;
    if (!venueId || !['NEARBY','ANYWHERE'].includes(mode)) return;
    button.disabled = true;
    try {
      const response = await api(`/api/admin/venues/${encodeURIComponent(venueId)}/request-access`,{
        method:'PUT',body:{mode}
      });
      if (state.detail?.id === venueId) state.detail.requestAccessMode = response.mode;
      const status = group.querySelector('[data-toca-access-status]');
      if (status) status.textContent = 'Configuración guardada.';
      toast('Configuración de solicitudes actualizada.');
    } catch (error) {
      toast('No se pudo guardar: ' + error.message);
    } finally { button.disabled = false; }
  });
})();
