/* TOCÁ v1.8.33 — approved Mi bar editor. Presentation only.
 * Move existing controls, don't recreate them: Leaflet pin, geocoding, uploads,
 * hours, venue save, access settings and deletion remain owned by their modules.
 */
(() => {
  'use strict';
  const PROFILE=/^#\/admin\/profile(?:\?|$)/;
  const svg=path=>`<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons={
    pin:svg('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),
    clock:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'),
    image:svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m4 18 6-6 4 4 2-2 4 4"/>'),
    music:svg('<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>'),
    rules:svg('<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>'),
    users:svg('<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>'),
    spotify:svg('<circle cx="12" cy="12" r="10"/><path d="M5 9c5-2 10-1.5 14 1M6 13c4-1.4 9-1 12 1M7 17c3-1 7-.5 10 1"/>')
  };
  const create=(tag,klass)=>{const el=document.createElement(tag);el.className=klass;return el;};
  const venue=()=>typeof state!=='undefined' ? state.detail||{} : {};
  function field(form,name){return form.querySelector(`[name="${name}"]`)?.closest('.field')||null;}
  function createCard(className,title,sub,icon){
    const card=create('section',`toca-v1833-card ${className}`);
    const head=create('div','toca-v1833-heading');
    const ico=create('span','toca-v1833-icon');ico.innerHTML=icons[icon];
    const copy=create('div','toca-v1833-heading-copy');
    const h=create('h3');h.textContent=title;
    const p=create('p');p.textContent=sub;
    copy.append(h,p);head.append(ico,copy);
    const body=create('div','toca-v1833-body');card.append(head,body);
    return {card,body};
  }
  function stripDuplicate(card){
    // Earlier views could render the old heading as well as the visual hero.
    card.querySelectorAll('.toca-editor-heading').forEach(header=>header.remove());
    const profile=card.closest('.toca-profile-editor');
    if(profile){
      [...(profile.parentElement?.children||[])].forEach(el=>{
        if(el!==profile && el.matches?.('.toca-editor-heading') && /mi bar/i.test(el.textContent||''))el.remove();
      });
      [...profile.children].forEach(el=>{
        if(el===card || el.contains(card))return;
        if(el.matches?.('.toca-editor-heading'))el.remove();
      });
    }
  }
  function hideCity(form){
    const city=form.querySelector('[name="city"]');
    if(!city)return;
    const value=city.value;
    if(city.tagName==='INPUT')city.type='hidden';
    city.value=value;
    city.closest('.field')?.classList.add('toca-v1833-city-hidden');
  }
  function makeHero(card,form){
    const hero=create('header','toca-v1833-hero');
    const background=create('div','toca-v1833-hero-photo');
    const url=String(venue().coverPhotoUrl||'');
    if(url && (/^https?:\/\//i.test(url)||url.startsWith('/'))){
      const image=document.createElement('img');image.src=typeof mediaUrl==='function'?mediaUrl(url):url;
      image.alt='';image.loading='lazy';background.appendChild(image);
    }
    const inner=create('div','toca-v1833-hero-copy');
    const kicker=create('span','toca-v1833-kicker');kicker.textContent='PORTAL DE BARES · TOCÁ';
    const heading=document.createElement('h1');heading.textContent='Mi bar';
    const description=document.createElement('p');description.textContent='Configurá tu espacio, su ubicación y cómo participan tus clientes.';
    const name=create('span','toca-v1833-venue-name');name.textContent=form.querySelector('[name="name"]')?.value||venue().name||'Tu bar';
    form.querySelector('[name="name"]')?.addEventListener('input',event=>{name.textContent=event.target.value||'Tu bar';});
    inner.append(kicker,heading,description,name);hero.append(background,inner);
    card.insertBefore(hero,form);
  }
  function makePhotoPreview(){
    const wrap=create('div','toca-v1833-cover-photo');
    const url=String(venue().coverPhotoUrl||'');
    if(url && (/^https?:\/\//i.test(url)||url.startsWith('/'))){
      const img=document.createElement('img');img.alt='Portada del bar';img.src=typeof mediaUrl==='function'?mediaUrl(url):url;wrap.appendChild(img);
    } else {
      wrap.innerHTML=icons.image;
      const note=create('small','');note.textContent='Portada del bar';wrap.appendChild(note);
    }
    return wrap;
  }
  function makeQuickCard(type,title,bodyText,icon){
    const link=create('a',`toca-v1833-card toca-v1833-quick toca-v1833-${type}`);
    link.href='#/admin/music';link.dataset.tocaMusicTarget=type;
    const ico=create('span','toca-v1833-icon');ico.innerHTML=icons[icon];
    const content=create('span','toca-v1833-quick-copy');
    const heading=create('strong');heading.textContent=title;
    const message=create('small');message.textContent=bodyText;
    content.append(heading,message);
    const arrow=create('span','toca-v1833-chevron');arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
    link.append(ico,content,arrow);return link;
  }
  function refreshLate(card){
    const photoSlot=card.querySelector('.toca-v1833-photos .toca-v1833-body');
    const accessSlot=card.querySelector('.toca-v1833-access .toca-v1833-body');
    if(photoSlot){
      for(const selector of ['.toca-fields-note','.toca-cover-required','.toca-photos-panel']){
        const item=card.querySelector(selector);
        if(item && !photoSlot.contains(item))photoSlot.appendChild(item);
      }
    }
    if(accessSlot){
      const access=card.querySelector('.toca-access-settings');
      if(access && !accessSlot.contains(access))accessSlot.appendChild(access);
    }
    const deletion=card.querySelector('.toca-delete-venue');
    if(deletion && card.lastElementChild!==deletion)card.appendChild(deletion);
    stripDuplicate(card);
  }
  function mount(){
    if(!PROFILE.test(location.hash))return;
    const card=document.querySelector('.toca-venue-editor-card');
    const form=card?.querySelector('#venue-update');
    if(!card||!form)return;
    if(card.dataset.tocaV1833==='yes') {refreshLate(card);return;}
    const base=form.querySelector('.toca-editor-fields');
    const locationWidget=form.querySelector('.toca-location-widget');
    if(!base||!locationWidget){console.warn('TOCÁ Mi bar: mapa o campos no encontrados; se mantuvo el editor original.');return;}
    const hours=form.querySelector('.toca-hours-editor');
    const genre=form.querySelector('.toca-genre-widget');
    const desc=field(form,'description');
    const instagram=field(form,'instagramHandle');
    hideCity(form);
    stripDuplicate(card);
    card.dataset.tocaV1833='yes';card.classList.add('toca-v1833-enabled');
    form.classList.add('toca-v1833-grid');
    makeHero(card,form);

    const main=createCard('toca-v1833-main','Información y ubicación del bar','Editá los datos y confirmá el pin en el mismo lugar','pin');
    const mainLayout=create('div','toca-v1833-main-layout');
    const inputs=create('div','toca-v1833-main-fields');
    inputs.append(base);
    if(instagram)inputs.append(instagram);
    if(desc)inputs.append(desc);
    const map=create('div','toca-v1833-main-map');map.append(locationWidget);
    mainLayout.append(makePhotoPreview(),inputs,map);main.body.append(mainLayout);

    const photo=createCard('toca-v1833-photos','Fotos del bar','Subí fotos y seleccioná la portada del local','image');
    const policy=createCard('toca-v1833-access','Quién puede pedir canciones','100 metros del bar o desde cualquier lugar','users');
    const genreCard=genre?createCard('toca-v1833-genres','Géneros musicales','Los estilos que identifican a tu bar','music'):null;
    if(genreCard)genreCard.body.append(genre);
    const hoursCard=hours?createCard('toca-v1833-hours','Horarios','Definí los días y horarios de apertura','clock'):null;
    if(hoursCard)hoursCard.body.append(hours);

    const spotifyConnected=venue().spotifyConnected===true||venue().spotify_premium===true;
    const spotify=makeQuickCard('spotify','Spotify Premium',spotifyConnected?'Cuenta de Spotify conectada · Administrar':'Conectá o administrá la cuenta y playlist','spotify');
    const rules=makeQuickCard('rules','Música y reglas',venue().curatedOnly?'Whitelist habilitada · Moderar canciones':'Administrá blacklist, whitelist y solicitudes','rules');
    const originalSave=card.querySelector('.toca-profile-save')||form.querySelector('.toca-editor-actions');
    const save=create('div','toca-v1833-save');
    if(originalSave)save.append(originalSave);
    else {const btn=create('button','btn');btn.type='submit';btn.setAttribute('form','venue-update');btn.textContent='Guardar cambios';save.append(btn);}

    // Everything still belongs to the original venue-update form: no input
    // bindings, hidden fields, upload events or Leaflet marker state are lost.
    const mainChildren=new Set([base,locationWidget,genre,hours,desc,instagram].filter(Boolean));
    const extra=[...form.children].filter(item=>!mainChildren.has(item)&&item!==save&&item!==originalSave);
    form.append(main.card);
    if(hoursCard)form.append(hoursCard.card);
    form.append(photo.card,spotify);
    if(genreCard)form.append(genreCard.card);
    form.append(policy.card,rules);
    extra.forEach(item=>{
      if(item.classList?.contains('toca-editor-actions')){save.prepend(item);return;}
      const other=createCard('toca-v1833-extra','Configuración adicional','Otros datos del bar','music');other.body.append(item);form.append(other.card);
    });
    form.append(save);
    const del=card.querySelector('.toca-delete-venue');
    if(del){card.append(del);}
    refreshLate(card);
    setTimeout(()=>window.dispatchEvent(new Event('resize')),130);
  }
  // Keep navigation to the combined page, scrolling to the requested section.
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-toca-music-target]');
    if(link)sessionStorage.setItem('toca:music-focus',link.dataset.tocaMusicTarget);
  });
  function focusMusic(){
    if(!/^#\/admin\/music(?:\?|$)/.test(location.hash))return;
    const name=sessionStorage.getItem('toca:music-focus');if(!name)return;
    const target=document.querySelector(name==='spotify'?'.toca-v1832-spotify-combined':'.toca-rule-panel');
    if(target){sessionStorage.removeItem('toca:music-focus');setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),60);}
  }
  let queued=false;
  function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount();focusMusic();});}
  function start(){
    const app=document.getElementById('app');
    if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    document.addEventListener('invalid',event=>{
      const el=event.target;
      if(el.closest?.('.toca-v1833-card'))el.closest('.toca-v1833-card')?.scrollIntoView({behavior:'smooth',block:'center'});
    },true);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
