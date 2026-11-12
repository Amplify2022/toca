/* One profile overview, focused editors and a separate provider update page. */
(() => {
  'use strict';
  const base='/admin/profile';
  const labels={data:'Datos y ubicación',photos:'Fotos',hours:'Horarios',access:'Quién puede pedir',import:'Actualizar desde un perfil'};
  const textKeys=['name','address','city','description','genre','instagramHandle','openingHours'];
  let ctx=null,pendingImport=null,leaveTo='';
  const root=()=>document.querySelector('[data-venue-profile]');
  async function ensureMap(c){
    if(c.mapPromise)return c.mapPromise;
    c.mapPromise=window.tocaInitVenueLocation().finally(()=>{c.mapPromise=null;});return c.mapPromise;
  }
  const icon=name=>{
    const p={instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>'};
    return p[name]?`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]}</svg>`:iconSvg(name,19);
  };
  const link=section=>'#'+base+(section?'/'+section:'');
  const value=(v,key)=>['latitude','longitude'].includes(key)?Number(v[key]):String(v[key]??'');
  const pill=text=>`<span class="pill">${icon('check')}${text}</span>`;
  const head=(title,copy,kicker='MI BAR / EDITAR')=>`<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${copy}</p></div></div>`;
  const back=title=>`<div class="breadcrumbs"><a href="${link()}">Mi Bar</a>${icon('arrow')}<span>${title}</span></div>`;
  const footer=label=>`<div class="page-footer"><small>Los cambios se aplican cuando guardás.</small><div class="actions"><a class="btn text" href="${link()}">Cancelar</a><button class="btn primary" type="submit" form="venue-profile-form">${label}${icon('check')}</button></div></div><div class="vp-error" role="alert" data-profile-error></div>`;
  function hoursSummary(raw){
    if(!raw)return 'Horarios pendientes';
    const parts=String(raw).split('|');if(parts.shift()!=='W2'||parts.length!==7)return esc(String(raw).slice(0,110));
    const days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],groups=[];
    for(let i=0;i<parts.length;i++){
      if(parts[i]==='-')continue;
      const start=i;while(i+1<parts.length&&parts[i+1]===parts[start])i++;
      const day=start===0&&i===6?'Todos los días':start===i?days[i]:days[start]+'–'+days[i];
      groups.push(`<span class="vp-hours-slot"><strong>${day}</strong><span>${esc(parts[start].replace('-','–'))}</span></span>`);
    }
    return groups.join('')||'Todos los días cerrados';
  }

  function card(ic,title,copy,status,label,section){return `<section class="manage-card ${section==='hours'?'vp-hours-card':''}"><div class="card-head"><span class="card-icon">${icon(ic)}</span><h3>${title}</h3></div><p class="${section==='hours'?'vp-hours-summary':''}">${copy}</p><div class="row-action"><span>${status}</span><a href="${link(section)}">${label}${icon('arrow')}</a></div></section>`;}
  function overview(v,owned){const photos=Array.isArray(v.photos)?v.photos:[],cover=!!v.coverPhotoUrl,published=v.published!==false;
    return (owned.length>1?`<label class="vp-select">Bar<select data-profile-venue aria-label="Bar que administrás">${owned.map(b=>`<option value="${esc(b.id)}" ${v.id===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`:'')+
      `<div class="page-heading"><div><div class="eyebrow">TU ESPACIO EN TOCÁ</div><h1>Mi Bar</h1><p>Revisá tu perfil y elegí qué querés actualizar.</p></div><div class="page-actions">${pill(published?'Publicado':'Borrador')}</div></div>`+
      (!published?`<div class="notice">${icon('info')}<div><strong>Tu bar ya está creado.</strong><br>Podés editar sus datos y continuar la preparación antes de publicarlo. <a href="#/admin/onboarding?step=ready&amp;venue=${encodeURIComponent(v.id)}">Ver próximos pasos</a></div></div>`:'')+
      `<section class="panel identity">${cover?`<img class="vp-cover" src="${esc(mediaUrl(v.coverPhotoUrl))}" alt="Portada de ${esc(v.name)}">`:`<div class="bar-art"><strong>${esc(String(v.name).slice(0,2).toUpperCase())}</strong></div>`}<div><h2>${esc(v.name)}</h2><p class="address">${icon('pin')}${esc(v.address)} · ${esc(v.city)}</p>${v.instagramHandle?`<p class="social">${icon('instagram')}@${esc(v.instagramHandle)}</p>`:''}</div><div class="identity-actions">${published?`<a class="btn" href="#/venue/${encodeURIComponent(v.id)}">Ver mi bar publicado${icon('arrow')}</a>`:`<a class="btn" href="#/admin/onboarding?step=ready&amp;venue=${encodeURIComponent(v.id)}">Revisar publicación${icon('arrow')}</a>`}</div></section>`+
      `<div class="section-title"><h2>¿Qué querés administrar?</h2></div><div class="card-grid">${card('pin','Datos y ubicación',esc(v.address)+'<br>'+esc(v.city),'Nombre, dirección y presentación','Editar datos','data')}${card('photo','Fotos del bar','Portada y galería para mostrar el ambiente de tu local.',cover?`${photos.length||1} ${(photos.length||1)===1?'foto':'fotos'}`:'Todavía sin portada',cover?'Administrar fotos':'Agregar foto','photos')}${card('clock','Horarios',hoursSummary(v.openingHours),'Horario semanal','Editar horarios','hours')}${card('users','Quién puede pedir',v.requestAccessMode==='ANYWHERE'?'Personas desde cualquier ubicación.':'Personas que están a menos de 100 metros del bar.','Todos deben iniciar sesión','Cambiar acceso','access')}</div>`+
      `<section class="secondary-import"><div><h3>¿Cambió algo en tus perfiles?</h3><p>Podés buscar datos nuevos y revisar cuáles querés actualizar.</p></div><a class="btn" href="${link('import')}">Actualizar desde Google o Instagram${icon('arrow')}</a></section><details class="vp-danger"><summary>Más opciones del bar</summary><button type="button" class="btn text" data-action="open-delete-venue">Eliminar mi bar</button></details>`;
  }
  function dataEditor(v,imported){const d={...v,...(imported?.fields||{})},pending=!!imported;
    return back(labels.data)+head('Datos del bar','Actualizá el nombre, la dirección y la presentación de tu local.')+
      (pending?'<div class="notice">Revisá los datos seleccionados y confirmá el pin antes de guardar la nueva ubicación.</div>':'')+
      `<div class="edit-layout"><div><form id="venue-profile-form" class="panel" data-profile-section="data"><div class="field"><label for="profile-name">Nombre del bar</label><input id="profile-name" name="name" required minlength="2" maxlength="160" value="${esc(d.name)}"></div><div class="fields-row"><div class="field"><label for="profile-address">Dirección</label><input id="profile-address" name="address" required minlength="4" maxlength="240" value="${esc(d.address)}"></div><div class="field"><label for="profile-city">Ciudad</label><input id="profile-city" name="city" required maxlength="120" value="${esc(d.city)}"></div></div><details class="vp-location" ${pending?'open':''}><summary><span><strong>${pending?'Confirmá la nueva ubicación':'Ubicación confirmada'}</strong><small>El pin debe coincidir con la entrada del bar.</small></span><span>Ajustar pin</span></summary>${window.tocaVenueLocationMarkup(pending?null:d)}</details><div class="field"><label for="profile-instagram">Instagram<small>Opcional</small></label><input id="profile-instagram" name="instagramHandle" maxlength="160" value="${esc(d.instagramHandle||'')}" placeholder="@tubar"></div><div class="field"><label for="profile-description">Descripción<small>Opcional</small></label><textarea id="profile-description" name="description" maxlength="2000">${esc(d.description||'')}</textarea></div><details class="vp-extras"><summary>Géneros musicales · Opcional</summary>${window.tocaGenreMarkup(d.genre||'')}</details>${imported?.fields.openingHours!==undefined?`<div class="vp-import-hours"><h3>Horarios seleccionados para actualizar</h3>${window.tocaHoursDetailMarkup(d.openingHours)}</div>`:''}</form>${footer('Guardar cambios')}</div><aside class="edit-side"><strong>Editá solo lo que cambió.</strong><p>Las fotos, los horarios y los permisos de pedidos tienen su propia sección en Mi Bar.</p><a href="${link('import')}">Traer datos desde tus perfiles${icon('arrow')}</a></aside></div>`;
  }
  function sectionPage(section,v){
    if(section==='data')return dataEditor(v,pendingImport?.id===v.id&&pendingImport.token===state.token?pendingImport:null);
    if(section==='photos')return back(labels.photos)+head('El ambiente de tu bar.','Elegí la portada y las imágenes que verán tus clientes.')+`<section class="panel narrow">${state.demo?'<p>Las fotos se administran con una cuenta real de bar.</p>':window.tocaPhotoGalleryMarkup(v)}<p class="vp-photo-note">Las fotos se guardan al subirlas. La portada no publica un bar que está en borrador.</p></section>`;
    if(section==='hours')return back(labels.hours)+head('¿Cuándo abre tu bar?','Editá los días y las horas de atención. El cierre puede ser después de medianoche.')+`<div class="narrow"><form id="venue-profile-form" class="panel" data-profile-section="hours">${window.tocaHoursEditorMarkup(v.openingHours||'')}</form>${footer('Guardar horarios')}</div>`;
    if(section==='access')return back(labels.access)+head('Elegí quién participa.','Podés cambiar esta configuración en cualquier momento.')+`<div class="narrow"><form id="venue-profile-form" data-profile-section="access">${[['NEARBY','Quienes están en el bar','Personas a menos de 100 metros del punto que confirmaste.'],['ANYWHERE','Cualquier persona','Personas desde cualquier ubicación, sin compartir su ubicación.']].map(([mode,title,copy])=>`<label class="access-choice"><input type="radio" name="mode" value="${mode}" ${(v.requestAccessMode||'NEARBY')===mode?'checked':''}><div><strong>${title}</strong><p>${copy}</p></div></label>`).join('')}<p class="intro">Todos los clientes deben iniciar sesión para pedir canciones.</p></form>${footer('Guardar configuración')}</div>`;
    return back(labels.import)+head('Traé datos nuevos.','Buscá tu perfil y revisá las diferencias antes de guardar.','MI BAR / ACTUALIZAR')+(state.demo?'<p>La búsqueda de perfiles está disponible con una cuenta real.</p>':window.tocaVenueImportMarkup()+`<div class="page-footer"><a class="btn text" href="${link('data')}">Editar datos manualmente</a><a class="btn text" href="${link()}">Volver a Mi Bar</a></div>`);
  }
  const discard=()=>`<dialog class="vp-discard" data-profile-discard><h2>Tenés cambios sin guardar</h2><p>Podés seguir editando o salir conservando los datos anteriores.</p><div class="actions"><button class="btn" type="button" data-profile-keep>Seguir editando</button><button class="btn primary" type="button" data-profile-discard-confirm>Descartar y salir</button></div></dialog>`;
  function fail(message){const box=root()?.querySelector('[data-profile-error]');if(box){box.textContent=message;box.scrollIntoView({block:'nearest',behavior:'smooth'});}else toast(message);}
  function comparisonModel(v){const form=document.createElement('form');for(const key of [...textKeys,'latitude','longitude']){if(key==='openingHours')continue;const input=document.createElement('input');input.name=key;input.value=value(v,key);form.append(input);}form.insertAdjacentHTML('beforeend',window.tocaHoursEditorMarkup(v.openingHours||''));return form;}
  function differences(v,fields){return Object.fromEntries(Object.entries(fields).filter(([key,val])=>['latitude','longitude'].includes(key)?Number(val)!==Number(v[key]):String(val??'')!==value(v,key)));}
  async function commit(c,fields,confirmed=false,expectOverride={}){
    const changes=differences(c.v,fields);if(!Object.keys(changes).length){return false;}
    if(state.demo){const data=db();data.venues=data.venues.map(v=>v.id===c.v.id?{...v,...changes}:v);saveDemo(data);return true;}
    const expected=Object.fromEntries(Object.keys(changes).map(key=>[key,Object.hasOwn(expectOverride,key)?expectOverride[key]:value(c.v,key)]));
    await api('/api/admin/venues/'+encodeURIComponent(c.v.id),{method:'PATCH',body:{changes,expected,locationConfirmed:confirmed}});return true;
  }
  async function applyImport(c,fields){
    if(ctx!==c||c.token!==state.token)return;
    const changes=differences(c.v,fields);
    if(Object.keys(changes).some(key=>['address','city','latitude','longitude'].includes(key))){
      pendingImport={id:c.v.id,token:state.token,fields:changes,expected:Object.fromEntries(Object.keys(changes).map(k=>[k,value(c.v,k)]))};
      c.dirty=false;navigate(link('data'));return;
    }
    const changed=await commit(c,changes);if(ctx===c&&c.token===state.token){toast(changed?'Datos actualizados.':'Los datos ya están actualizados.');navigate(link());}
  }
  window.tocaVenueProfile=async()=>{
    const path=route().path,section=path.slice(base.length).replace(/^\//,'');
    if(section&&!Object.hasOwn(labels,section)){navigate(link());return;}
    if(!state.demo&&!state.token){navigate('#/login');return;}
    state.adminTab='profile';
    const owned=await getMyVenues();if(route().path!==path)return;
    if(!owned.length){navigate('#/admin/onboarding');return;}
    const v=owned.find(v=>v.id===state.venueId)||owned[0];state.venueId=v.id;state.detail=v;state.venues=owned;
    if(pendingImport&&(pendingImport.token!==state.token||pendingImport.id!==v.id))pendingImport=null;
    const c={v,path,section,token:state.token,dirty:false,busy:false};ctx=c;
    mount(`<section class="venue-profile" data-venue-profile>${section?sectionPage(section,v):overview(v,owned)}${discard()}</section>`,'admin');
    c.element=root();
    if(section==='data'){
      const imported=pendingImport?.id===v.id?pendingImport:null;
      if(imported){const lat=Number(imported.fields.latitude??v.latitude),lon=Number(imported.fields.longitude??v.longitude);window.tocaApplyImportedLocation(root().querySelector('form'),lat,lon);c.dirty=true;}
      if(imported)await ensureMap(c);
    }
    if(section==='import'&&!state.demo){const box=root().querySelector('[data-venue-import]');box._comparisonModel=comparisonModel(v);box._commitSelection=fields=>applyImport(c,fields);}
  };
  async function save(form){const c=ctx;if(!c||c.busy)return;const button=root().querySelector('[form="venue-profile-form"]');let fields={},confirmed=false;
    try{
      const data=Object.fromEntries(new FormData(form));
      if(c.section==='data'){
        fields={...(pendingImport?.id===c.v.id?pendingImport.fields:{}),...Object.fromEntries(['name','address','city','description','genre','instagramHandle'].map(k=>[k,String(data[k]??'')]))};
        const lat=Number(data.latitude),lon=Number(data.longitude),widget=form.querySelector('.toca-location-widget');
        const geo=fields.address!==value(c.v,'address')||fields.city!==value(c.v,'city')||lat!==Number(c.v.latitude)||lon!==Number(c.v.longitude)||!!pendingImport;
        if(geo){if(widget.dataset.confirmed!=='true'||data.latitude===''||data.longitude===''||!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Confirmá el pin antes de guardar la ubicación.');fields.latitude=lat;fields.longitude=lon;confirmed=true;}
      }else if(c.section==='hours')fields={openingHours:window.tocaSerializeHours(form)};
      c.busy=true;button.disabled=true;
      if(c.section==='access'){
        if(state.demo){const d=db();d.venues=d.venues.map(v=>v.id===c.v.id?{...v,requestAccessMode:data.mode}:v);saveDemo(d);}
        else await api('/api/admin/venues/'+encodeURIComponent(c.v.id)+'/request-access',{method:'PUT',body:{mode:data.mode}});
      }else await commit(c,fields,confirmed,pendingImport?.expected||{});
      if(ctx===c&&c.token===state.token){c.dirty=false;pendingImport=null;toast('Cambios guardados.');if(c.element.isConnected)navigate(link());}
    }catch(error){if(ctx===c&&c.element.isConnected)fail(error.message);}
    finally{c.busy=false;if(button?.isConnected)button.disabled=false;}
  }
  document.addEventListener('submit',event=>{if(event.target.id!=='venue-profile-form')return;event.preventDefault();void save(event.target);});
  const dirty=event=>{if(event.target.closest?.('#venue-profile-form')&&ctx){ctx.dirty=true;root()?.querySelector('[data-profile-error]')?.replaceChildren();if(['address','city'].includes(event.target.name)){const location=root().querySelector('.vp-location');location.querySelector('strong').textContent='Confirmá la nueva ubicación';location.open=true;}}};
  document.addEventListener('input',dirty);document.addEventListener('change',dirty);
  document.addEventListener('toca-location-change',event=>{if(event.target.closest('[data-venue-profile]')&&ctx){ctx.dirty=true;const title=event.target.closest('.vp-location')?.querySelector('summary strong');if(title)title.textContent=event.target.dataset.confirmed==='true'?'Ubicación confirmada':'Confirmá la nueva ubicación';}});
  document.addEventListener('toggle',event=>{if(event.target.matches('.vp-location')&&event.target.open&&ctx?.element?.isConnected)void ensureMap(ctx);},true);
  document.addEventListener('change',event=>{if(event.target.matches('[data-profile-venue]')){state.venueId=event.target.value;pendingImport=null;void render();}});
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('a[href^="#/"]');
    if(anchor&&ctx?.element?.isConnected&&ctx.dirty&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();leaveTo=anchor.getAttribute('href');root().querySelector('[data-profile-discard]').showModal();}
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('#venue-profile-form [data-action]')&&ctx)ctx.dirty=true;
    if(event.target.closest('[data-profile-keep]'))root().querySelector('[data-profile-discard]').close();
    if(event.target.closest('[data-profile-discard-confirm]')){ctx.dirty=false;pendingImport=null;root().querySelector('[data-profile-discard]').close();navigate(leaveTo);}
  });
  window.addEventListener('beforeunload',event=>{if(ctx?.dirty&&ctx.element?.isConnected){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>{if(!route().path.startsWith(base+'/import')){document.querySelectorAll('[data-venue-import]').forEach(box=>box._request?.abort());}});
})();
