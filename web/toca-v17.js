/* TOCÁ v1.7 — searchable Spotify moderation rules + real venue photo gallery. */
(() => {
  'use strict';
  const delayedSearches = new Map();
  const describe = (e) => typeof esc === 'function' ? esc(e) : String(e ?? '');
  const makeRules = (list, mode) => list.map((t) => `
    <button type="button" class="toca-rule-search-result" data-action="rule-select"
      data-track="${describe(t.id)}" data-mode="${mode}">
      <span class="toca-rule-result-art">♫</span>
      <span class="toca-song-meta"><strong>${describe(t.title)}</strong><small>${describe(t.artist)}</small></span>
      <span class="toca-rule-result-action">${mode==='BLOCK'?'Bloquear':'Permitir'} +</span>
    </button>`).join('');

  document.addEventListener('input', (e) => {
    const input=e.target.closest('input[id^="rule-search-"]');
    if(!input) return;
    const mode=input.id.endsWith('BLOCK')?'BLOCK':'ALLOW';
    const output=document.getElementById(`rule-results-${mode}`);
    if(!output) return;
    const search=input.value.trim();
    clearTimeout(delayedSearches.get(mode));
    if(search.length<2){output.innerHTML='<p class="toca-muted">Escribí al menos dos caracteres.</p>';return;}
    const venue=state.venueId;
    output.innerHTML='<p class="toca-muted">Buscando canciones en Spotify…</p>';
    const timer=setTimeout(async()=>{
      try{
        const found=state.demo ? demoCatalog.filter(t=>`${t.title} ${t.artist}`.toLowerCase().includes(search.toLowerCase())) :
          await api(`/api/admin/venues/${encodeURIComponent(venue)}/tracks?q=${encodeURIComponent(search)}`);
        if(!output.isConnected || input.value.trim()!==search || state.venueId!==venue)return;
        output.innerHTML=found.length?makeRules(found,mode):'<p class="toca-muted">No encontramos canciones con ese texto.</p>';
      }catch(err){if(output.isConnected)output.innerHTML=`<p class="toca-rule-error">${describe(err.message)}</p>`;}
    },350);
    delayedSearches.set(mode,timer);
  });

  // Clicking a search result creates the rule. No track ID is entered by the admin.
  document.addEventListener('click', async (e) => {
    const b=e.target.closest('[data-action="rule-select"]');
    if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(b.disabled)return;
    const trackId=b.dataset.track, mode=b.dataset.mode;
    if(!trackId || !['BLOCK','ALLOW'].includes(mode))return;
    b.disabled=true;
    try {
      if(state.demo){
        const demo=db(), field=mode==='BLOCK'?'blocks':'allows';
        if(!demo[field].some(x=>x.trackId===trackId&&x.venueId===state.venueId))
          demo[field].push({venueId:state.venueId,trackId,
            title:demoCatalog.find(t=>t.id===trackId)?.title||'',
            artist:demoCatalog.find(t=>t.id===trackId)?.artist||''});
        saveDemo(demo);
      } else {
        await api(`/api/admin/venues/${encodeURIComponent(state.venueId)}/${mode==='BLOCK'?'blocked':'allowed'}`,
          {method:'POST',body:{trackId}});
      }
      toast(mode==='BLOCK'?'Canción bloqueada':'Canción permitida');
      await render();
    }catch(err){b.disabled=false;toast('No pudimos guardar la regla: '+err.message);}
  },true);

  const filename=(name)=>String(name).replace(/[^\w.-]/g,'_').slice(0,80);
  const asBase64=(blob)=>new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(new Error('No pudimos leer la foto'));reader.readAsDataURL(blob);
  });
  async function prepareImage(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí un archivo JPG, PNG o WebP.');
    if(file.size>15_000_000)throw Error('La imagen original debe ser menor a 15 MB.');
    const bitmap=await createImageBitmap(file);
    try{
      for(const maxSide of [1600,1280,960,720]){
        const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
        if(blob&&blob.size<=2_500_000) return blob;
      }
      throw Error('La imagen es demasiado grande para procesarla.');
    }finally{bitmap.close?.();}
  }
  window.tocaPhotoGalleryMarkup = (venue) => {
    const images=Array.isArray(venue.photos)?venue.photos:[];
    return `<section class="toca-photos-panel" aria-label="Galería de fotos del bar">
      <div class="toca-section-title"><div><h3>Fotos del bar <span class="toca-field-required" aria-label="obligatorio">*</span></h3><p class="toca-muted">Necesitás al menos una foto para publicar tu bar. La primera será la portada.</p></div>
        <span class="toca-muted">${images.length}/8 fotos</span></div>
      <label class="toca-photo-upload" for="toca-photo-input">
        <span aria-hidden="true">＋</span><strong>Agregar fotos</strong><small>JPG, PNG o WebP · Hasta 8 fotos</small>
      </label>
      <input id="toca-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple ${images.length>=8?'disabled':''} />
      <div id="toca-photo-upload-status" class="toca-muted" role="status"></div>
      <div class="toca-photo-grid">${images.map((p,i)=>`<article class="toca-photo-item">
        <img src="${describe(mediaUrl(p.url))}" alt="Foto del bar ${i+1}" loading="lazy"/>
        <div class="toca-photo-item-actions"><span>${p.isPrimary?'★ Foto de portada':'Foto '+(i+1)}</span>
          ${p.isPrimary?'':`<button type="button" class="btn ghost small" data-action="photo-cover" data-photo="${describe(p.id)}">Usar de portada</button>`}
          ${images.length>1?`<button type="button" class="btn ghost small" data-action="photo-delete" data-photo="${describe(p.id)}">Eliminar</button>`:''}
        </div></article>`).join('')||'<p class="toca-muted">Todavía no agregaste fotos. La portada es necesaria para publicar tu bar.</p>'}</div>
    </section>`;
  };

  document.addEventListener('change',async e=>{
    const input=e.target.closest('#toca-photo-input');if(!input)return;
    const files=Array.from(input.files||[]);
    if(!files.length)return;
    const status=document.getElementById('toca-photo-upload-status');
    input.disabled=true;
    try{
      for(let i=0;i<files.length;i++){
        if(status)status.textContent=`Procesando foto ${i+1} de ${files.length}…`;
        const jpeg=await prepareImage(files[i]);
        await api(`/api/admin/venues/${encodeURIComponent(state.venueId)}/photos`,{
          method:'POST',body:{contentType:'image/jpeg',filename:filename(files[i].name),dataBase64:await asBase64(jpeg)}
        });
      }
      toast('Fotos guardadas');await render();
    }catch(err){toast('Error al subir fotos: '+err.message);if(status)status.textContent=err.message;}
    finally{if(input.isConnected){input.disabled=false;input.value='';}}
  });
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-action="photo-cover"],[data-action="photo-delete"]');
    if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    const photoId=b.dataset.photo;if(!photoId)return;
    const removing=b.dataset.action==='photo-delete';
    if(removing&&!confirm('¿Eliminar esta foto del bar?'))return;
    b.disabled=true;
    try{
      const path=`/api/admin/venues/${encodeURIComponent(state.venueId)}/photos/${encodeURIComponent(photoId)}`;
      await api(path+(removing?'':'/primary'),{method:removing?'DELETE':'PUT'});
      toast(removing?'Foto eliminada':'Portada actualizada');await render();
    }catch(err){b.disabled=false;toast('Error: '+err.message);}
  },true);
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-photo-preview]');if(!b)return;
    const main=document.querySelector('.toca-detail-cover img');
    if(main)main.src=b.dataset.photoPreview;
  });
})();
