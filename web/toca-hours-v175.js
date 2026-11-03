/* TOCÁ v1.7.5 · Horarios semanales sin cambios de DB.
   Se guardan en opening_hours (VARCHAR 180) como:
   W2|18:00-02:00|-|-|18:00-02:00|... (Lun..Dom)
*/
(() => {
  'use strict';

  const DAYS = [
    ['Lun', 'Lunes'], ['Mar', 'Martes'], ['Mié', 'Miércoles'],
    ['Jue', 'Jueves'], ['Vie', 'Viernes'],
    ['Sáb', 'Sábado'], ['Dom', 'Domingo']
  ];
  const RANGE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

  function parse(value) {
    const raw = String(value || '').trim();
    if (!raw.startsWith('W2|')) return null;
    const chunks = raw.slice(3).split('|');
    if (chunks.length !== 7 || !chunks.every(x => x === '-' || RANGE.test(x))) return null;
    return chunks;
  }

  function showRange(value) {
    if (value === '-') return 'Cerrado';
    return value.replace('-', '–');
  }

  function editorMarkup(rawValue) {
    const raw = String(rawValue || '').trim();
    const parsed = parse(raw);
    const legacy = raw && !parsed ? raw : '';

    return `<fieldset class="toca-hours-editor" data-legacy="${escapeText(legacy)}">
      <legend>Horarios de atención <span class="toca-optional">(opcional)</span></legend>
      <p class="toca-hours-hint">Seleccioná los días que abre el bar. Los horarios pueden terminar después de medianoche.</p>
      <div class="toca-hours-head" aria-hidden="true">
        <span>Día</span><span>Abre</span><span>Cierra</span>
      </div>
      <div class="toca-hours-days">
        ${DAYS.map(([short, day], i) => {
          const entry = parsed?.[i] || '-';
          const enabled = entry !== '-';
          const times = enabled ? entry.split('-') : ['18:00', '02:00'];
          return `<div class="toca-hours-row" data-day="${i}">
            <label class="toca-hours-day">
              <input type="checkbox" class="toca-hours-open" ${enabled ? 'checked' : ''} />
              <span>${day}</span>
            </label>
            <input type="time" class="input toca-hours-from" value="${times[0]}"
              aria-label="${day}: abre" ${enabled ? '' : 'disabled'} />
            <input type="time" class="input toca-hours-to" value="${times[1]}"
              aria-label="${day}: cierra" ${enabled ? '' : 'disabled'} />
          </div>`;
        }).join('')}
      </div>
      ${legacy ? `<p class="toca-hours-legacy">Horario anterior: <strong>${escapeText(legacy)}</strong>.
        Se conservará hasta que configures días o lo elimines.</p>` : ''}
      <div class="toca-hours-actions">
        <button type="button" class="btn ghost small" data-action="toca-hours-copy">
          Copiar lunes a todos los días
        </button>
        <button type="button" class="btn ghost small" data-action="toca-hours-clear">
          Quitar horarios
        </button>
      </div>
      <input type="hidden" name="openingHours" value="${escapeText(raw)}" />
    </fieldset>`;
  }

  function serialize(form) {
    const editor = form.querySelector('.toca-hours-editor');
    if (!editor) return String(form.elements.namedItem('openingHours')?.value || '');
    const rows = [...editor.querySelectorAll('.toca-hours-row')];
    if (rows.length !== 7) throw new Error('No se pudo leer el horario semanal.');

    let openCount = 0;
    const parts = rows.map((row, index) => {
      const checked = row.querySelector('.toca-hours-open').checked;
      if (!checked) return '-';
      const from = row.querySelector('.toca-hours-from').value;
      const to = row.querySelector('.toca-hours-to').value;
      if (!RANGE.test(`${from}-${to}`) || from === to) {
        throw new Error(`Revisá el horario de ${DAYS[index][1]}: apertura y cierre deben ser distintos.`);
      }
      openCount++;
      return `${from}-${to}`;
    });

    if (!openCount) {
      return editor.dataset.cleared === 'yes' ? '' : editor.dataset.legacy || '';
    }
    return `W2|${parts.join('|')}`;
  }

  function summary(raw) {
    const parsed = parse(raw);
    if (!parsed) return String(raw || '');
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let weekday;
    try {
      weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'short', timeZone: 'America/Montevideo'
      }).format(new Date());
    } catch (_) {
      weekday = dayNames[new Date().getDay()];
    }
    const dayIndex = ({Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6})[weekday];
    const value = parsed[dayIndex ?? 0];
    return `Hoy · ${showRange(value)}`;
  }

  function detailMarkup(raw) {
    if (!raw) return '';
    const parsed = parse(raw);
    if (!parsed) {
      return `<p class="toca-detail-hours">
        <span aria-hidden="true">◷</span><span>${escapeText(raw)}</span>
      </p>`;
    }
    return `<section class="toca-hours-public" aria-label="Horarios del bar">
      <h3>Horarios</h3>
      <div class="toca-hours-public-grid">
        ${DAYS.map(([_, day], i) => `
          <div class="toca-hours-public-row">
            <span>${day}</span>
            <span class="${parsed[i] === '-' ? 'toca-day-closed' : ''}">${showRange(parsed[i])}</span>
          </div>`).join('')}
      </div>
    </section>`;
  }

  document.addEventListener('change', e => {
    if (!e.target.classList.contains('toca-hours-open')) return;
    const row = e.target.closest('.toca-hours-row');
    if (!row) return;
    row.querySelectorAll('input[type="time"]').forEach(el => {
      el.disabled = !e.target.checked;
    });
  });

  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action="toca-hours-copy"],[data-action="toca-hours-clear"]');
    if (!button) return;
    const editor = button.closest('.toca-hours-editor');
    if (!editor) return;

    const rows = [...editor.querySelectorAll('.toca-hours-row')];
    if (button.dataset.action === 'toca-hours-clear') {
      editor.dataset.cleared = 'yes';
      editor.dataset.legacy = '';
      editor.querySelector('.toca-hours-legacy')?.remove();
      rows.forEach(row => {
        row.querySelector('.toca-hours-open').checked = false;
        row.querySelectorAll('input[type="time"]').forEach(el => el.disabled = true);
      });
    } else {
      const monday = rows[0];
      const start = monday.querySelector('.toca-hours-from').value;
      const end = monday.querySelector('.toca-hours-to').value;
      if (!monday.querySelector('.toca-hours-open').checked) {
        if (typeof toast === 'function') toast('Activá el lunes e indicá sus horas para copiarlas.');
        return;
      }
      rows.forEach(row => {
        row.querySelector('.toca-hours-open').checked = true;
        const startEl = row.querySelector('.toca-hours-from');
        const endEl = row.querySelector('.toca-hours-to');
        startEl.disabled = false;
        endEl.disabled = false;
        startEl.value = start;
        endEl.value = end;
      });
    }
  });

  window.tocaHoursEditorMarkup = editorMarkup;
  window.tocaSerializeHours = serialize;
  window.tocaHoursSummary = summary;
  window.tocaHoursDetailMarkup = detailMarkup;
})();
