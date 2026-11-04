/* TOCÁ v1.8.29 — Montar selector de acceso en la vista REAL de Mi bar.
 * v1.8.27 lo agregaba a tocaAdminDashboard(), pero #/admin/profile
 * usa el renderizado anterior (oldRender -> admin()).
 */
(() => {
  'use strict';
  let scheduled = false;
  function isAdminProfile() {
    return /^#\/admin\/profile(?:[?]|$)/.test(location.hash);
  }
  async function mount() {
    if (!isAdminProfile() || typeof state === 'undefined' || state.demo) return;
    const form = document.getElementById('venue-update');
    if (!form || document.querySelector('.toca-access-settings')) return;
    const venueId = String(state.detail?.id || state.venueId || '');
    if (!/^[0-9a-f-]{36}$/i.test(venueId)) return;
    const panel = document.createElement('section');
    panel.className = 'toca-access-settings';
    panel.dataset.venueId = venueId;
    panel.innerHTML = `
      <h3>Quién puede pedir canciones</h3>
      <p>Todos los clientes deben iniciar sesión. Elegí si deben estar cerca del bar.</p>
      <label><input type="radio" name="toca-access-mode" value="NEARBY" checked>
        <span><strong>Solo clientes a 100 metros del bar</strong>
        <small>Se consulta la ubicación al pedir una canción. No se necesita QR.</small></span></label>
      <label><input type="radio" name="toca-access-mode" value="ANYWHERE">
        <span><strong>Permitir pedidos desde cualquier ubicación</strong>
        <small>Usuarios registrados, sin necesidad de verificar GPS.</small></span></label>
      <div class="toca-editor-actions toca-access-save-actions">
        <button type="button" class="btn" data-toca-access-save>Guardar configuración</button>
        <span data-toca-access-status role="status"></span>
      </div>`;
    // Mi bar renders the photo gallery after the main form. The access options
    // belong after Fotos, not between the form and gallery.
    const card = form.closest('.toca-venue-editor-card') || form.parentElement;
    card.appendChild(panel);
    // Fuente real de verdad: política persistida en PostgreSQL, no estado UI.
    try {
      const response = await fetch(`${API_URL}/api/venues/${encodeURIComponent(venueId)}/request-access`, {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!panel.isConnected || !isAdminProfile()) return;
      if (data.mode === 'ANYWHERE') panel.querySelector('input[value="ANYWHERE"]').checked = true;
      else panel.querySelector('input[value="NEARBY"]').checked = true;
    } catch (error) {
      const status = panel.querySelector('[data-toca-access-status]');
      if (status) status.textContent = 'No pudimos consultar la configuración. Revisá que v1.8.27 esté instalada en la API.';
      console.warn('TOCÁ: no se pudo consultar la política de solicitudes:', error);
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; void mount(); });
  }
  const start = () => {
    const app = document.getElementById('app');
    if (app) new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.addEventListener('hashchange',schedule);
})();
