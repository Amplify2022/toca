/* Provider data is an editable draft. Applying it never saves the venue. */
(() => {
 const labels={name:'Nombre',address:'Dirección',city:'Ciudad',description:'Descripción',openingHours:'Horarios',instagramHandle:'Instagram'};
 window.tocaVenueImportMarkup=()=>`<section class="card toca-import" data-venue-import><span class="eyebrow">COMPLETÁ MÁS RÁPIDO</span><h3>Traé los datos de tu bar</h3><p>Buscá en Google Maps o ingresá el perfil profesional de Instagram. Revisá los datos antes de aplicarlos.</p><div class="toca-tool-row"><label>Origen<select class="input" data-import-source><option value="google">Google Maps</option><option value="instagram">Instagram</option></select></label><label class="toca-grow">Nombre y ciudad, o perfil de Instagram<input class="input" data-import-query placeholder="Ej.: La Ronda, Montevideo" maxlength="180" /></label><button type="button" class="btn ghost" data-import-search>Buscar datos</button></div><div data-import-results aria-live="polite"></div></section>`;
 const safeLink=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:''}catch{return ''}};
 const formFor=box=>box.closest('section.toca-profile-editor')?.querySelector('form') || document.getElementById('create-venue');
 function preview(box,draft){
  box._draft=draft;const form=formFor(box),fields=draft.fields||{};
  const rows=Object.entries(labels).filter(([key])=>fields[key]!=null).map(([key,label])=>{
   const value=key==='openingHours'?window.tocaHoursSummary(fields[key]):fields[key];
   const existing=form?.querySelector(`[name="${key}"]`)?.value || (key==='openingHours'?window.tocaSerializeHours?.(form):'');
   return `<label class="toca-import-field"><input type="checkbox" data-import-field="${key}" ${existing?'':'checked'} /><span><strong>${label}${existing?' · reemplazar dato actual':''}</strong><span>${esc(value)}</span></span></label>`;
  });
  if(Number.isFinite(fields.latitude)&&Number.isFinite(fields.longitude))rows.push('<label class="toca-import-field"><input type="checkbox" data-import-field="location" checked /><span><strong>Ubicación del local</strong><span>Se mostrará el pin para que lo confirmes en el mapa.</span></span></label>');
  const details=draft.details||{},url=safeLink(draft.sourceUrl);
  box.querySelector('[data-import-results]').innerHTML=`<div class="toca-import-preview"><h4>Datos de ${esc(draft.source)}</h4>${rows.join('')}${(draft.warnings||[]).map(w=>`<p class="notice">${esc(w)}</p>`).join('')}<p>${details.phone?`Teléfono: ${esc(details.phone)}<br>`:''}${details.website?`Web: ${esc(details.website)}<br>`:''}${Array.isArray(details.hours)?details.hours.map(esc).join('<br>'):''}</p>${url?`<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver fuente ↗</a>`:''}<p class="toca-muted">${esc((draft.attributions||[]).join(' · '))}</p><button type="button" class="btn" data-import-apply>Aplicar campos seleccionados</button><p>Después revisá el formulario y guardá los cambios.</p></div>`;
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-import-search],[data-import-place],[data-import-apply]');if(!button)return;
  const box=button.closest('[data-venue-import]');if(!box || button.disabled)return;
  const output=box.querySelector('[data-import-results]');button.disabled=true;
  try {
   if(button.hasAttribute('data-import-apply')){
    const form=formFor(box);if(!form)throw Error('No se encontró el formulario del bar');
    const fields=box._draft?.fields||{};
    const checked=new Set([...box.querySelectorAll('[data-import-field]:checked')].map(x=>x.dataset.importField));
    for(const key of checked){
     if(key==='location')continue;
     if(key==='openingHours'){
      const old=form.querySelector('.toca-hours-editor');if(old)old.outerHTML=window.tocaHoursEditorMarkup(fields.openingHours);
      continue;
     }
     let input=form.querySelector(`[name="${key}"]`);
     // New bar onboarding also retains imported optional data on creation.
     if(!input){input=document.createElement('input');input.type='hidden';input.name=key;form.append(input)}
     input.value=fields[key];input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(checked.has('location'))window.tocaApplyImportedLocation(form,fields.latitude,fields.longitude);
    output.innerHTML='<p role="status">Datos aplicados al borrador. Revisá el pin y guardá los cambios del bar para publicarlos.</p>';toast('Borrador actualizado; falta guardar');return;
   }
   const source=box.querySelector('[data-import-source]').value,query=box.querySelector('[data-import-query]').value.trim();
   if(button.hasAttribute('data-import-place')){
    preview(box,await api('/api/admin/venue-import/google/preview?placeId='+encodeURIComponent(button.dataset.importPlace)));return;
   }
   if(!query)throw Error('Ingresá el nombre y la ciudad, o un perfil de Instagram');
   if(source==='instagram')preview(box,await api('/api/admin/venue-import/instagram/preview?profile='+encodeURIComponent(query)));
   else{
    const places=await api('/api/admin/venue-import/google/search?q='+encodeURIComponent(query));
    if(!box.isConnected)return;
    output.innerHTML=places.length?`<p>Resultados de Google Maps. Elegí tu bar:</p>${places.map(p=>`<button type="button" class="toca-import-result" data-import-place="${esc(p.id)}"><strong>${esc(p.name)}</strong><span>${esc(p.address)}</span></button>`).join('')}`:'<p>No encontramos coincidencias. Probá agregando la ciudad.</p>';
   }
  }catch(error){if(box.isConnected){output.textContent=error.message;output.setAttribute('role','status')}}
  finally{if(button.isConnected)button.disabled=false}
 });
})();
