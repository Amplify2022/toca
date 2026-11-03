/* TOCÁ — Créditos cartográficos compactos (sin remover la atribución legal) */
(() => {
  const convert = (attribution) => {
    if (attribution.dataset.tocaCompactCredits === '1') return;
    // Leaflet mantiene aquí los créditos de cada capa; conservar íntegramente el HTML.
    const original = attribution.innerHTML.trim();
    if (!original) return;
    attribution.dataset.tocaCompactCredits = '1';
    attribution.classList.add('toca-map-attribution');
    const visibleCredit = document.createElement('a');
    visibleCredit.textContent = '© OpenStreetMap';
    visibleCredit.href = 'https://www.openstreetmap.org/copyright';
    visibleCredit.target = '_blank';
    visibleCredit.rel = 'noopener noreferrer';
    const details = document.createElement('details');
    details.className = 'toca-map-credits';
    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'Ver todos los créditos del mapa');
    summary.title = 'Créditos del mapa';
    summary.textContent = 'i';
    const content = document.createElement('div');
    content.className = 'toca-map-credits-full';
    content.innerHTML = original;
    details.append(summary, content);
    attribution.replaceChildren(visibleCredit, details);
    // Evitar que clics sobre los créditos se interpreten como navegación/zoom del mapa.
    if (window.L) { window.L.DomEvent.disableClickPropagation(attribution); window.L.DomEvent.disableScrollPropagation(attribution); }
  };
  const scan = () => document.querySelectorAll('.leaflet-control-attribution:not([data-toca-compact-credits])').forEach(convert);
  let pending = false;
  const notify = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; scan(); });
  };
  const start = () => {
    scan();
    new MutationObserver(notify).observe(document.body, {childList:true,subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
