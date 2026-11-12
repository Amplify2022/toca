/* Imported data remains an editable draft until the owner saves Mi Bar. */
(() => {
  'use strict';
  const labels = {name:'Nombre',address:'Dirección',city:'Ciudad',openingHours:'Horarios',instagramHandle:'Instagram',description:'Descripción'};
  const dayNames=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const shapes = {
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    google:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external:'<path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>'
  };
  const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.info}</svg>`;
  const safeLink = value => {try {const url=new URL(value);return url.protocol==='https:'?url.href:''} catch {return ''}};
  // A detached comparison model lets the update page reuse preview/selection
  // without mounting a second, hidden profile editor under the search form.
  const formFor = box => box._comparisonModel || box.closest('section.toca-profile-editor')?.querySelector('#venue-update') || document.getElementById('create-venue');
  const sourceFor = box => box.querySelector('[data-import-source]:checked')?.value || 'google';
  let serial = 0;

  window.tocaVenueImportMarkup = () => {
    const id = `toca-import-${++serial}`;
    return `<section class="toca-import toca-import-option-b" data-venue-import data-provider="google" aria-labelledby="${id}-title">
      <header class="toca-import-heading"><div><span class="toca-import-kicker">MI BAR / IMPORTAR DATOS</span><h3 id="${id}-title">Tu perfil, el punto de partida.</h3><p>Buscá tu local y revisá los datos antes de sumarlos a Mi Bar.</p></div><span class="toca-import-optional">Autocompletar</span></header>
      <form class="toca-import-search" data-import-form>
        <fieldset class="toca-import-sources"><legend class="toca-import-sr">Importar desde</legend>
          <label class="toca-import-source"><input type="radio" name="${id}-source" value="google" data-import-source checked /><span>${icon('google')}<span>Google Maps</span></span></label>
          <label class="toca-import-source"><input type="radio" name="${id}-source" value="instagram" data-import-source /><span>${icon('instagram')}<span>Instagram</span></span></label>
        </fieldset>
        <label class="toca-import-query-label" for="${id}-query" data-import-query-label>Nombre del bar y ciudad</label>
        <div class="toca-import-search-row"><div class="toca-import-query-wrap">${icon('search')}<input id="${id}-query" class="toca-import-query" data-import-query placeholder="Ej.: La Ronda, Montevideo" maxlength="180" autocomplete="off" required aria-describedby="${id}-hint" /></div><button type="submit" class="toca-import-search-button" data-import-search>${icon('search')}<span>Buscar datos</span></button></div>
        <p class="toca-import-hint" id="${id}-hint" data-import-hint>Buscá el local y seleccioná la dirección que corresponda.</p>
      </form>
      <div class="toca-import-results" data-import-results aria-live="polite"></div>
    </section>`;
  };

  function hoursText(value) {
    const parts=String(value).split('|');
    if(parts.shift()!=='W2'||parts.length!==7)return String(value);
    const days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],groups=[];
    parts.forEach((hours,index)=>{
      if(hours==='-')return;
      const last=groups[groups.length-1];
      if(last&&last.hours===hours&&last.end===index-1)last.end=index;
      else groups.push({start:index,end:index,hours});
    });
    return groups.map(g=>`${days[g.start]}${g.end===g.start?'':'–'+days[g.end]} · ${g.hours.replace('-','–')}`).join('\n') || 'Sin horarios de apertura';
  }
  const displayValue = (key,value) => key==='openingHours'?hoursText(value):key==='instagramHandle'?'@'+String(value).replace(/^@/,''):String(value);
  function currentValue(form,key) {
    if(key==='openingHours'&&form) {
      try {return window.tocaSerializeHours(form)} catch {return form.querySelector('[name="openingHours"]')?.value||'Horario pendiente de completar'}
    }
    return form?.querySelector(`[name="${key}"]`)?.value.trim()||'';
  }
  function bioHoursState(box) {
    const section=box.querySelector('[data-bio-hours]');if(!section)return {selected:false,valid:true,days:[],message:''};
    const selected=section.querySelector('[data-import-field="bioHours"]').checked,days=[],missing=[];
    for(const row of section.querySelectorAll('[data-bio-row]')) {
      const included=row.querySelector('[data-bio-day]').checked,day=Number(row.dataset.bioRow),closed=row.dataset.closed==='true';
      row.classList.toggle('is-disabled',!included);
      row.querySelectorAll('[data-bio-time]').forEach(input=>{input.disabled=!included;input.required=selected&&included});
      if(!included)continue;
      if(closed){days.push({day,closed:true});continue}
      const open=row.querySelector('[data-bio-open]').value,close=row.querySelector('[data-bio-close]').value;
      const valid=time=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
      row.querySelector('[data-bio-open]').classList.toggle('is-missing',!valid(open));
      row.querySelector('[data-bio-close]').classList.toggle('is-missing',!valid(close));
      if(!valid(open)||!valid(close))missing.push(`Completá ${!valid(open)&&!valid(close)?'apertura y cierre':!valid(open)?'la apertura':'el cierre'} de ${dayNames[day].toLowerCase()}.`);
      else if(open===close)missing.push(`Revisá ${dayNames[day].toLowerCase()}: apertura y cierre deben ser distintos.`);
      days.push({day,open,close,closed:false});
    }
    if(!days.length)missing.push('Marcá al menos un día para usar estos horarios.');
    else if(days.every(day=>day.closed)) {
      const changed=new Set(days.map(day=>day.day)),form=formFor(box);
      const otherOpen=[...(form?.querySelectorAll('.toca-hours-row')||[])].some(row=>!changed.has(Number(row.dataset.day))&&row.querySelector('.toca-hours-open').checked);
      if(!otherOpen)missing.push('Sólo se detectaron días cerrados. Completá los días de apertura en el formulario antes de usar esta sugerencia.');
    }
    return {selected,valid:missing.length===0,days,message:missing[0]||'Horarios listos para aplicar. Revisá también el resto de la semana.'};
  }
  function selectedSummary(box) {
    const selected=[...box.querySelectorAll('[data-import-field]:checked')];
    const count=box.querySelector('[data-import-count]');
    if(!count)return;
    count.textContent=`${selected.length} ${selected.length===1?'dato seleccionado':'datos seleccionados'}`;
    box.querySelector('[data-import-selection]').innerHTML=selected.length?selected.map(input=>`<li>${icon('check')}<span>${input.dataset.importField==='bioHours'?'Horarios sugeridos':labels[input.dataset.importField]||'Ubicación del local'}</span></li>`).join(''):'<li class="toca-import-no-selection">Marcá los datos que querés usar.</li>';
    const hours=bioHoursState(box);
    box.querySelector('[data-import-apply]').disabled=selected.length===0||(hours.selected&&!hours.valid);
    const feedback=box.querySelector('[data-bio-feedback]');
    if(feedback){feedback.textContent=hours.message;feedback.classList.toggle('is-incomplete',!hours.valid);box.querySelector('[data-bio-hours]').classList.toggle('is-selected',hours.selected)}
    box.querySelectorAll('.toca-import-field').forEach(card=>card.classList.toggle('is-selected',card.querySelector('input').checked));
  }
  function bioHoursMarkup(suggestion,form) {
    if(!suggestion?.days.length)return '';
    const sources=[...new Set(suggestion.days.map(day=>day.source))];
    const legacy=form?.querySelector('.toca-hours-editor')?.dataset.legacy;
    return `<section class="toca-import-bio-hours" data-bio-hours aria-label="Horarios sugeridos desde la biografía">
      <header><div><span class="toca-import-bio-kicker">DETECTADO EN LA BIOGRAFÍA</span><h4>Horarios sugeridos</h4></div><span class="toca-import-bio-badge">Revisar</span></header>
      <p class="toca-import-bio-intro">Confirmá las horas antes de usarlas. Los días que no marques conservan su configuración actual.</p>
      <blockquote>${sources.map(esc).join('<br>')}</blockquote>
      <div class="toca-import-bio-grid-heading" aria-hidden="true"><span>Día</span><span>Abre</span><span>Cierra</span></div>
      ${suggestion.days.map(day=>{
        const row=form?.querySelector(`.toca-hours-row[data-day="${day.day}"]`);
        const configured=currentValue(form,'openingHours').startsWith('W2|');
        const actual=configured&&row?(row.querySelector('.toca-hours-open').checked?row.querySelector('.toca-hours-from').value+'–'+row.querySelector('.toca-hours-to').value:'Cerrado'):'';
        return `<div class="toca-import-bio-row" data-bio-row="${day.day}" data-closed="${day.closed}"><label><input type="checkbox" data-bio-day checked aria-label="Incluir ${dayNames[day.day].toLowerCase()}" /><span>${dayNames[day.day]}${actual?`<small>Actual: ${esc(actual)}</small>`:''}</span></label>${day.closed?'<span class="toca-import-bio-closed">Cerrado</span>':`<input type="time" value="${day.open||''}" data-bio-time data-bio-open aria-label="${dayNames[day.day]}: apertura sugerida" /><input type="time" value="${day.close||''}" data-bio-time data-bio-close aria-label="${dayNames[day.day]}: cierre sugerido" />`}</div>`;
      }).join('')}
      <p class="toca-import-bio-feedback" data-bio-feedback aria-live="polite"></p>
      ${suggestion.notes?.length?`<details class="toca-import-bio-notes"><summary>También conviene revisar</summary><ul>${suggestion.notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul></details>`:''}
      ${legacy?'<p class="toca-import-bio-legacy">Tu horario actual está en texto. Si usás esta sugerencia, revisá toda la semana en el formulario antes de guardar.</p>':''}
      <label class="toca-import-bio-accept"><input type="checkbox" data-import-field="bioHours" aria-label="Usar horarios sugeridos" /><span>Usar estos horarios</span></label>
    </section>`;
  }
  function applyBioHours(form,days) {
    let editor=form.querySelector('.toca-hours-editor');
    if(!editor) {
      const existing=form.querySelector('[name="openingHours"]'),holder=document.createElement('div');
      holder.innerHTML=window.tocaHoursEditorMarkup(existing?.value||'');existing?.remove();editor=holder.firstElementChild;
      const submit=form.querySelector('button[type="submit"],button:not([type])');form.insertBefore(editor,submit);
    }
    for(const day of days) {
      const row=editor.querySelector(`[data-day="${day.day}"]`),checkbox=row.querySelector('.toca-hours-open');
      checkbox.checked=!day.closed;
      row.querySelectorAll('input[type="time"]').forEach(input=>input.disabled=day.closed);
      if(!day.closed){row.querySelector('.toca-hours-from').value=day.open;row.querySelector('.toca-hours-to').value=day.close}
    }
    editor.dataset.cleared='yes';editor.dataset.legacy='';editor.querySelector('.toca-hours-legacy')?.remove();
    const hidden=editor.querySelector('[name="openingHours"]');
    // Keep onboarding's FormData accurate too. The save handler validates again.
    try {hidden.value=window.tocaSerializeHours(form)} catch { /* Existing incomplete rows stay visible for owner review. */ }
  }
  function preview(box,draft) {
    if(!box.isConnected)return;
    box._draft=draft;
    const form=formFor(box),fields=draft.fields||{},instagram=draft.source==='Instagram';
    const bioSuggestion=instagram&&typeof window.tocaExtractBioHours==='function'?window.tocaExtractBioHours(fields.description):null;
    const id=`toca-import-fields-${++serial}`;
    const entries=Object.entries(labels).filter(([key])=>fields[key]!=null&&String(fields[key]).trim());
    const location=Number.isFinite(fields.latitude)&&Number.isFinite(fields.longitude);
    if(location){const descriptionIndex=entries.findIndex(([key])=>key==='description');entries.splice(descriptionIndex<0?entries.length:descriptionIndex,0,['location','Ubicación del local']);}
    const rows=entries.map(([key,label],index)=>{
      const coordinate=key==='location',existing=coordinate?'':currentValue(form,key),matches=!coordinate&&existing===String(fields[key]).trim();
      const value=coordinate?'Pin de Google Maps':displayValue(key,fields[key]);
      return `<tr class="toca-import-field ${key==='description'?'toca-import-field-wide':''}">
        <th scope="row"><label for="${id}-${index}">${label}</label>${matches?'<span class="toca-import-match">Coincide</span>':''}</th>
        <td class="toca-import-before"><span class="toca-import-cell-caption">Actual</span><span class="toca-import-current ${existing?'':'is-empty'}" title="${esc(existing?displayValue(key,existing):'')}">${existing?esc(displayValue(key,existing)):coordinate?'Revisar en el mapa':'Sin completar'}</span></td>
        <td class="toca-import-after"><span class="toca-import-cell-caption">Desde ${esc(draft.source)}</span><span class="toca-import-value">${esc(value)}</span>${coordinate?'<span class="toca-import-location-hint">Confirmá el pin antes de guardar.</span>':''}</td>
        <td class="toca-import-use"><label class="toca-import-check-target"><input id="${id}-${index}" type="checkbox" data-import-field="${key}" aria-label="${label}" ${!existing?'checked':''} /><span class="toca-import-sr">Usar ${label}</span></label></td>
      </tr>`;
    });
    const url=safeLink(draft.sourceUrl),details=draft.details||{};
    const title=fields.name||fields.instagramHandle||draft.source;
    const subtitle=instagram?(fields.instagramHandle?'@'+fields.instagramHandle:'Perfil profesional de Instagram'):(fields.address||'Datos del local en Google Maps');
    const warnings=(draft.warnings||[]).map(w=>{
      if(!instagram||!/^Instagram no publica direcci/.test(w))return w;
      return bioSuggestion?.days.length?'Revisá la dirección en Mi Bar y confirmá los horarios sugeridos de la biografía.':'Instagram no incluye dirección ni horarios. Podés completarlos en el formulario del bar.';
    });
    const website=safeLink(details.website);
    const initials=String(title).trim().split(/\s+/).map(part=>Array.from(part)[0]).slice(0,2).join('').toUpperCase();
    box.querySelector('[data-import-results]').innerHTML=`<section class="toca-import-preview" aria-label="Vista previa de los datos importados">
      <div class="toca-import-preview-layout">
        <aside class="toca-import-profile" aria-label="Perfil encontrado">
          <div class="toca-import-profile-identity"><div class="toca-import-avatar ${instagram?'is-instagram':''}"><span>${esc(initials)}</span><span class="toca-import-provider-mark">${icon(instagram?'instagram':'google')}</span></div><div class="toca-import-profile-copy"><span class="toca-import-found">${icon('check')} PERFIL ENCONTRADO</span><h4>${esc(title)}</h4><p>${esc(subtitle)}</p></div></div>
          ${url?`<a class="toca-import-source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver en ${esc(draft.source)} ${icon('external')}</a>`:''}
          ${warnings.map(w=>`<div class="toca-import-note">${icon('info')}<p>${esc(w)}</p></div>`).join('')}
        </aside>
        <div class="toca-import-fields-panel"><header class="toca-import-section-heading"><h4>Revisá los cambios</h4><p>Elegí los datos que querés usar. Los actuales quedan desmarcados.</p></header>
          <table class="toca-import-comparison"><caption class="toca-import-sr">Comparación de los datos actuales y los encontrados en ${esc(draft.source)}</caption><thead><tr><th scope="col">Dato</th><th scope="col">Actual</th><th scope="col">Desde ${esc(draft.source)}</th><th scope="col">Usar</th></tr></thead><tbody>${rows.join('')}</tbody></table>
          ${bioHoursMarkup(bioSuggestion,form)}
        </div>
      </div>
      ${details.phone||details.website||details.hours?.length?`<details class="toca-import-reference"><summary>Más información del local</summary><div>${details.phone?`<p><span>Teléfono</span>${esc(details.phone)}</p>`:''}${details.website?`<p><span>Sitio web</span>${website?`<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(details.website)} ${icon('external')}</a>`:esc(details.website)}</p>`:''}${details.hours?.length?`<p><span>Horarios de ${esc(draft.source)}</span>${details.hours.map(esc).join('<br>')}</p>`:''}</div></details>`:''}
      <footer class="toca-import-summary" aria-label="Resumen de la importación"><div class="toca-import-selection-copy"><p class="toca-import-count" data-import-count></p><ul data-import-selection></ul></div><div class="toca-import-action"><button type="button" class="toca-import-apply" data-import-apply>Aplicar selección ${icon('arrow')}</button><p class="toca-import-save-note">Después, guardá los cambios de Mi Bar.</p></div></footer>
      ${draft.attributions?.filter(Boolean).length?`<p class="toca-import-attribution">${esc(draft.attributions.filter(Boolean).join(' · '))}</p>`:''}
    </section>`;
    selectedSummary(box);
    if(box._commitSelection){
      box.querySelector('[data-import-apply]').innerHTML=`Guardar cambios seleccionados ${icon('check')}`;
      box.querySelector('.toca-import-save-note').textContent='Si cambia la ubicación, vas a confirmar el pin antes de guardar.';
    }
  }
  function setBusy(box,busy) {
    const button=box.querySelector('[data-import-search]');button.disabled=busy;
    button.innerHTML=busy?'<span class="toca-import-spinner" aria-hidden="true"></span><span>Buscando…</span>':`${icon('search')}<span>Buscar datos</span>`;
    box.querySelector('[data-import-results]').setAttribute('aria-busy',String(busy));
  }
  function cancel(box) {
    box._request?.abort();box._request=null;box._draft=null;
    setBusy(box,false);box.querySelector('[data-import-results]').replaceChildren();
  }
  async function search(box,placeId) {
    const query=box.querySelector('[data-import-query]').value.trim();
    if(!placeId&&(!query||box.querySelector('[data-import-search]').disabled))return;
    box._request?.abort();box._draft=null;
    const request=new AbortController();box._request=request;
    const source=sourceFor(box),output=box.querySelector('[data-import-results]');
    setBusy(box,true);
    output.innerHTML=`<div class="toca-import-loading" role="status"><span class="toca-import-spinner" aria-hidden="true"></span><span>${placeId?'Preparando la vista previa…':source==='instagram'?'Buscando el perfil de Instagram…':'Buscando tu bar en Google Maps…'}</span></div>`;
    try {
      const opts={signal:request.signal};
      if(placeId||source==='instagram') {
        const path=placeId?'/api/admin/venue-import/google/preview?placeId='+encodeURIComponent(placeId):'/api/admin/venue-import/instagram/preview?profile='+encodeURIComponent(query);
        const draft=await api(path,opts);
        if(box._request===request&&!request.signal.aborted)preview(box,draft);
      }
      else {
        const places=await api('/api/admin/venue-import/google/search?q='+encodeURIComponent(query),opts);
        if(!box.isConnected||box._request!==request)return;
        output.innerHTML=places.length?`<div class="toca-import-matches"><div class="toca-import-section-heading"><h4>Elegí tu bar</h4><span>${places.length} ${places.length===1?'resultado':'resultados'} en Google Maps</span></div>${places.map(p=>`<button type="button" class="toca-import-result" data-import-place="${esc(p.id)}"><span class="toca-import-result-icon">${icon('google')}</span><span><strong>${esc(p.name)}</strong><span>${esc(p.address)}</span></span>${icon('arrow')}</button>`).join('')}</div>`:`<div class="toca-import-message">${icon('search')}<div><h4>No encontramos ese bar</h4><p>Probá con otro nombre o agregá la ciudad.</p></div></div>`;
      }
    } catch(error) {
      if(request.signal.aborted||box._request!==request||!box.isConnected)return;
      output.innerHTML=`<div class="toca-import-message is-error" role="status">${icon('info')}<div><h4>No pudimos traer los datos</h4><p>${esc(error.message)}</p></div></div>`;
    } finally {if(box.isConnected&&box._request===request){box._request=null;setBusy(box,false)}}
  }
  document.addEventListener('submit',event=>{
    if(!event.target.matches('[data-import-form]'))return;
    event.preventDefault();void search(event.target.closest('[data-venue-import]'));
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('[data-import-query]'))cancel(event.target.closest('[data-venue-import]'));
    if(event.target.matches('[data-bio-time]'))selectedSummary(event.target.closest('[data-venue-import]'));
  });
  document.addEventListener('change',event=>{
    const box=event.target.closest('[data-venue-import]');if(!box)return;
    if(event.target.matches('[data-import-field],[data-bio-day],[data-bio-time]'))selectedSummary(box);
    if(event.target.matches('[data-import-source]')) {
      cancel(box);const instagram=sourceFor(box)==='instagram';box.dataset.provider=instagram?'instagram':'google';
      box.querySelector('[data-import-query-label]').textContent=instagram?'Perfil de Instagram':'Nombre del bar y ciudad';
      const input=box.querySelector('[data-import-query]');input.value='';input.placeholder=instagram?'@tubar o instagram.com/tubar':'Ej.: La Ronda, Montevideo';
      box.querySelector('[data-import-hint]').textContent=instagram?'Ingresá el usuario o el enlace de un perfil profesional público.':'Buscá el local y seleccioná la dirección que corresponda.';
    }
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-import-place],[data-import-apply]');if(!button||button.disabled)return;
    const box=button.closest('[data-venue-import]');if(!box)return;
    if(button.hasAttribute('data-import-place')){void search(box,button.dataset.importPlace);return}
    const output=box.querySelector('[data-import-results]'),form=formFor(box);
    if(!form||!box._draft)return;
    const fields=box._draft.fields||{},checked=new Set([...box.querySelectorAll('[data-import-field]:checked')].map(x=>x.dataset.importField));
    if(!checked.size)return;
    const hours=bioHoursState(box);if(hours.selected&&!hours.valid)return;
    if(box._commitSelection){
      const selected={};
      for(const key of checked){
        if(key==='location'){selected.latitude=fields.latitude;selected.longitude=fields.longitude;}
        else if(key==='bioHours'){applyBioHours(form,hours.days);selected.openingHours=window.tocaSerializeHours(form);}
        else if(Object.hasOwn(labels,key))selected[key]=fields[key];
      }
      button.disabled=true;
      try{await box._commitSelection(selected);}
      catch(error){if(box.isConnected){let message=box.querySelector('[data-import-save-error]');if(!message){message=document.createElement('p');message.dataset.importSaveError='true';message.setAttribute('role','alert');message.className='toca-import-reference';output.append(message);}message.textContent=error.message;}}
      finally{if(button.isConnected)selectedSummary(box);}
      return;
    }
    for(const key of checked) {
      if(key==='location')continue;
      if(key==='bioHours'){applyBioHours(form,hours.days);continue;}
      if(key==='openingHours') {
        const old=form.querySelector('.toca-hours-editor');
        if(old)old.outerHTML=window.tocaHoursEditorMarkup(fields.openingHours);
        else {let input=form.querySelector('[name="openingHours"]');if(!input){input=document.createElement('input');input.type='hidden';input.name='openingHours';form.append(input)}input.value=fields.openingHours}
        continue;
      }
      let input=form.querySelector(`[name="${key}"]`);
      if(!input){input=document.createElement('input');input.type='hidden';input.name=key;form.append(input)}
      input.value=fields[key];input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(checked.has('location'))window.tocaApplyImportedLocation(form,fields.latitude,fields.longitude);
    box._draft=null;
    output.innerHTML=`<div class="toca-import-message is-success" role="status"><span class="toca-import-success-icon">${icon('check')}</span><div><h4>Tu formulario ya tiene los datos</h4><p>${checked.size} ${checked.size===1?'dato aplicado':'datos aplicados'}. ${checked.has('location')?'Confirmá el pin y guardá los cambios de Mi Bar.':'Revisá el formulario y guardá los cambios de Mi Bar.'}</p></div><button type="button" class="toca-import-review" data-import-review>Revisar formulario ${icon('arrow')}</button></div>`;
    toast('Datos aplicados al formulario. Falta guardar.');
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-import-review]');if(!button)return;
    const form=formFor(button.closest('[data-venue-import]'));
    if(form){form.querySelector('[name="name"]')?.focus({preventScroll:true});form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}
  });
})();
