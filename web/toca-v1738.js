
(() => {
  'use strict';

  const headings = {
    requests: [
      'ACTIVIDAD MUSICAL',
      'Solicitudes',
      'Consultá las canciones solicitadas y su estado.'
    ],
    spotify: [
      'CONEXIÓN MUSICAL',
      'Spotify Premium',
      'Administrá la cuenta y la playlist del establecimiento.'
    ],
    qr: [
      'ACCESO DE CLIENTES',
      'Invitaciones QR',
      'Compartí el acceso musical de tu establecimiento.'
    ]
  };

  function updateAdminHeading() {
    const match = location.hash.match(/^#\/admin\/([^/?]+)/);
    if (!match) return;

    const config = headings[match[1]];
    if (!config) return;

    const main = document.querySelector('.toca-admin-content');
    if (!main || main.querySelector('.toca-admin-section-heading')) {
      return;
    }

    const section = document.createElement('section');
    section.className = 'toca-admin-section-heading';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = config[0];

    const title = document.createElement('h2');
    title.textContent = config[1];

    const description = document.createElement('p');
    description.textContent = config[2];

    section.append(eyebrow, title, description);
    main.prepend(section);
  }

  function removeLinkArrows() {
    const links = document.querySelectorAll(
      '.leaflet-popup-content a, ' +
      '.toca-detail-intro a.toca-instagram-link'
    );

    links.forEach(link => {
      const label = (link.textContent || '').toLowerCase();

      if (!/ver bar|ver establecimiento|instagram/.test(label)) {
        return;
      }

      const walker = document.createTreeWalker(
        link,
        NodeFilter.SHOW_TEXT
      );

      let node;

      while ((node = walker.nextNode())) {
        const clean = node.nodeValue.replace(
          /[↗↖↘→➜➝➞➤]/g,
          ''
        );

        if (clean !== node.nodeValue) {
          node.nodeValue = clean;
        }
      }

      // Eliminar solo iconos marcados como flechas.
      link.querySelectorAll(
        'svg[class*="arrow"], ' +
        'svg[class*="external"], ' +
        '[class*="arrow-icon"], ' +
        '[class*="external-icon"]'
      ).forEach(icon => icon.remove());
    });
  }

  let pending = false;

  function update() {
    updateAdminHeading();
    removeLinkArrows();
  }

  function scheduleUpdate() {
    if (pending) return;
    pending = true;

    queueMicrotask(() => {
      pending = false;
      update();
    });
  }

  function init() {
    update();

    const root = document.getElementById('app');
    if (!root) return;

    new MutationObserver(scheduleUpdate).observe(root, {
      childList: true,
      subtree: true
    });

    window.addEventListener('hashchange', scheduleUpdate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }
})();
