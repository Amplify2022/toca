(() => {
  'use strict';

  function init() {
    // Botón de referencia con el mismo estilo que
    // "Guardar cambios del bar".
    const holder = document.createElement('div');
    holder.className = 'toca-editor-actions toca-profile-save';
    holder.style.cssText =
      'position:absolute;left:-99999px;visibility:hidden';

    const reference = document.createElement('button');
    reference.type = 'button';
    reference.className = 'btn';
    reference.textContent = 'Guardar cambios del bar';

    holder.append(reference);
    document.body.append(holder);

    const computed = getComputedStyle(reference);

    const properties = [
      'background',
      'background-color',
      'background-image',
      'color',
      'border',
      'border-radius',
      'box-shadow',
      'font-family',
      'font-size',
      'font-weight',
      'letter-spacing',
      'line-height',
      'padding',
      'text-transform'
    ];

    const values = Object.fromEntries(
      properties.map(name => [
        name,
        computed.getPropertyValue(name)
      ])
    );

    const textColor = computed.color;
    holder.remove();

    function updatePopups() {
      const popups = document.querySelectorAll(
        '.leaflet-popup-content, .maplibregl-popup-content'
      );

      popups.forEach(popup => {
        popup.querySelectorAll('a').forEach(link => {
          if (!/instagram|establecimiento|ver bar/i.test(
            link.textContent || ''
          )) return;

          link.classList.add('btn');

          for (const [property, value] of Object.entries(values)) {
            if (value) {
              link.style.setProperty(
                property, value, 'important'
              );
            }
          }

          link.style.setProperty(
            '-webkit-text-fill-color',
            textColor,
            'important'
          );
          link.style.setProperty(
            'display', 'inline-flex', 'important'
          );
          link.style.setProperty(
            'align-items', 'center', 'important'
          );
          link.style.setProperty(
            'justify-content', 'center', 'important'
          );
          link.style.setProperty(
            'text-decoration', 'none', 'important'
          );
          link.style.setProperty(
            'margin', '0', 'important'
          );
          link.style.setProperty(
            'white-space', 'nowrap', 'important'
          );
          link.style.setProperty(
            'pointer-events', 'auto', 'important'
          );

          link.dataset.tocaPopupStyled = 'true';
        });
      });
    }

    updatePopups();

    // También aplicar estilos a los popups nuevos
    // que Leaflet agregue al hacer clic en el mapa.
    new MutationObserver(updatePopups).observe(
      document.body,
      {childList: true, subtree: true}
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded', init, {once: true}
    );
  } else {
    init();
  }
})();
