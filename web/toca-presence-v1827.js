/* Distance-based access, selected by the bar owner: NEARBY or ANYWHERE. */
(() => {
  'use strict';
  const customerHeader = () => window.tocaCustomerBearer?.() || '';
  const venueApi = async (venueId, suffix, method = 'GET', body) => {
    const token = customerHeader();
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
  const currentPosition = () => new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(new Error('La ubicación requiere HTTPS o localhost y un navegador compatible.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      err => reject(new Error(err.code === 1
        ? 'Para pedir canciones en este bar debés permitir el acceso a tu ubicación.'
        : 'No se pudo obtener una ubicación precisa. Activá ubicación precisa y volvé a intentar.')),
      {enableHighAccuracy: true, maximumAge: 0, timeout: 18000}
    );
  });
  // Called on an explicit request button click. The backend, not this code,
  // decides whether the current account may submit a request to this venue.
  window.tocaPresenceEnsure = async venueId => {
    try {
      if (!window.tocaCustomerVerified?.() || !customerHeader()) {
        await window.tocaCustomerRequireForRequest(location.hash);
        return false;
      }
      const existing = await venueApi(venueId,'presence');
      if (existing.mode === 'ANYWHERE') return true;
      const position = await currentPosition();
      const result = await venueApi(venueId,'presence','POST',position);
      if (result.allowed) {
        toast('Ubicación comprobada: estás dentro de los 100 metros del bar.');
        return true;
      }
      return false;
    } catch (error) {
      if (error.status === 401) {
        await window.tocaCustomerRequireForRequest(location.hash);
      } else {
        toast(error.message);
      }
      console.warn('TOCÁ: acceso al bar no autorizado:',error.message);
      return false;
    }
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
