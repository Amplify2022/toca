/* TOCÁ v1.8.32 · Mi bar, unified location and information: independent editing cards.
 * Repositions EXISTING nodes. Never recreates fields, maps, upload controls,
 * delete modals or request-access actions. The original form remains intact.
 */
(() => {
  'use strict';
  const PROFILE = /^#\/admin\/profile(?:\?|$)/;
  const svg = paths => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icons = {
    venue: svg('<path d="M3 9 5 4h14l2 5v2a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0V9Z"/><path d="M5 13v7h14v-7M10 20v-5h4v5"/>'),
    pin: svg('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),
    music: svg('<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>'),
    text: svg('<path d="M4 6h16M4 11h16M4 16h11M4 21h7"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m4 18 6-6 4 4 2-2 4 4"/>'),
    users: svg('<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>'),
    social: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>')
  };
  const isProfile = () => PROFILE.test(location.hash);

  function makeDetails(title, description, icon, bodyNodes, extraClass='', initiallyOpen=false) {
    const detail=document.createElement('details');
    detail.className='toca-v1831-card '+extraClass;
    detail.open=initiallyOpen;
    const summary=document.createElement('summary');
    summary.className='toca-v1831-summary';
    summary.innerHTML=`<span class="toca-v1831-icon">${icons[icon]}</span><span class="toca-v1831-summary-copy"><strong></strong><small></small></span><span class="toca-v1831-chevron" aria-hidden="true"></span>`;
    summary.querySelector('strong').textContent=title;
    summary.querySelector('small').textContent=description;
    const body=document.createElement('div');
    body.className='toca-v1831-card-body';
    bodyNodes.filter(Boolean).forEach(node=>body.appendChild(node));
    detail.append(summary,body);
    detail.addEventListener('toggle',()=>{
      if(detail.open) setTimeout(()=>window.dispatchEvent(new Event('resize')),80);
    });
    return detail;
  }
  function makeStatic(title, description, icon, node, klass) {
    const section=document.createElement('section');
    section.className='toca-v1831-card toca-v1831-static '+klass;
    const heading=document.createElement('div');
    heading.className='toca-v1831-summary';
    heading.innerHTML=`<span class="toca-v1831-icon">${icons[icon]}</span><span class="toca-v1831-summary-copy"><strong></strong><small></small></span>`;
    heading.querySelector('strong').textContent=title;
    heading.querySelector('small').textContent=description;
    const body=document.createElement('div');body.className='toca-v1831-card-body';
    if(node) body.appendChild(node);
    section.append(heading,body);
    return section;
  }

  function manageCity(form) {
    // Older TOCÁ variants still rendered a City field; it remains a hidden
    // backend field, preserving its current value, without asking it again.
    const city=form.querySelector('[name="city"]');
    if(!city) return;
    if(city.tagName==='INPUT' && city.type!=='hidden') {
      const saved=city.value;
      city.type='hidden';
      city.value=saved;
    }
    const field=city.closest('.field');
    if(field) field.classList.add('toca-v1831-city-hidden');
  }
  function firstField(form, name) {
    const control=form.querySelector(`[name="${name}"]`);
    return control?.closest('.field') || null;
  }
  function makeHero(card, form) {
    const hero=document.createElement('header');
    hero.className='toca-v1831-hero';
    const bg=document.createElement('div');bg.className='toca-v1831-hero-photo';
    const venue=typeof state!=='undefined'?state.detail:null;
    const cover=String(venue?.coverPhotoUrl||'');
    if(cover && (/^https?:\/\//i.test(cover) || cover.startsWith('/'))) {
      const image=document.createElement('img');
      image.alt='';image.loading='lazy';
      image.src=(typeof mediaUrl==='function'?mediaUrl(cover):cover);
      bg.appendChild(image);
    }
    const copy=document.createElement('div');copy.className='toca-v1831-hero-copy';
    const eyebrow=document.createElement('span');eyebrow.className='toca-v1831-kicker';eyebrow.textContent='PORTAL DE BARES · TOCÁ';
    const heading=document.createElement('h2');heading.textContent='Mi bar';
    const desc=document.createElement('p');desc.textContent='Configurá tu espacio, su ubicación y cómo participan tus clientes.';
    const tag=document.createElement('span');tag.className='toca-v1831-hero-name';
    tag.textContent=form.querySelector('[name="name"]')?.value || venue?.name || 'Tu establecimiento';
    copy.append(eyebrow,heading,desc,tag);hero.append(bg,copy);
    const name=form.querySelector('[name="name"]');
    name?.addEventListener('input',()=>tag.textContent=name.value||'Tu establecimiento');
    card.insertBefore(hero,card.firstChild);
  }
  function galleryElement(card) {
    const panel=card.querySelector('.toca-photos-panel');
    if(panel){
      // This is the photo uploader itself, not a parent containing other cards.
      return panel;
    }
    return [...card.children].find(el => /toca-photo|gallery/i.test(el.className||'')) || null;
  }
  function moveLateSections(card) {
    const bottom=card.querySelector(':scope > .toca-v1831-bottom');
    if(!bottom)return;
    let photo=card.querySelector('.toca-photos-panel');
    const photoCard=bottom.querySelector('.toca-v1831-photos');
    if(photo && photoCard && !photoCard.contains(photo)) {
      // Append original uploader inside dedicated photo card, keeping handlers.
      photoCard.querySelector('.toca-v1831-card-body')?.appendChild(photo);
    }
    const access=card.querySelector('.toca-access-settings');
    if(access && !access.closest('.toca-v1831-access')) {
      let accessCard=bottom.querySelector('.toca-v1831-access');
      if(!accessCard) {
        accessCard=makeStatic('Quién puede pedir canciones','Radio de 100 metros o pedidos desde cualquier lugar','users',null,'toca-v1831-access');
        const actions=bottom.querySelector('.toca-v1831-save');
        bottom.insertBefore(accessCard,actions||null);
      }
      accessCard.querySelector('.toca-v1831-card-body')?.appendChild(access);
    }
    // Keep the deletion panel *outside* bottom, as the last child of the card:
    // v1.8.30 itself deliberately enforces this order.
  }
  function mount() {
    if(!isProfile())return;
    const card=document.querySelector('.toca-venue-editor-card');
    const form=card?.querySelector('#venue-update');
    if(!card || !form) return;
    if(card.dataset.tocaV1831==='yes') { moveLateSections(card);return; }
    const info=form.querySelector('.toca-editor-fields');
    const location=form.querySelector('.toca-location-widget');
    if(!info || !location) {console.warn('TOCÁ Mi bar: no encontramos los campos o el mapa; no se aplicó el rediseño.');return;}
    card.dataset.tocaV1831='yes';
    card.classList.add('toca-v1831-enabled');
    form.classList.add('toca-v1831-form');
    manageCity(form);

    makeHero(card,form);
    const originalHeader=card.querySelector(':scope > .toca-editor-heading');
    originalHeader?.remove();

    const genre=form.querySelector('.toca-genre-widget');
    const hours=form.querySelector('.toca-hours-editor');
    const description=firstField(form,'description');
    const instagram=firstField(form,'instagramHandle');
    const taken=new Set([info,location,genre,hours,description,instagram].filter(Boolean));
    const additional=[...form.children].filter(el=>!taken.has(el));
    // Location and the venue fields belong to ONE full-width editor card.
    // Move the original Leaflet widget, do not clone or reinitialize its handlers.
    const infoLayout=document.createElement('div');
    infoLayout.className='toca-v1832-info-layout';
    const infoBlock=document.createElement('div');
    infoBlock.className='toca-v1832-info-fields';
    const mapBlock=document.createElement('div');
    mapBlock.className='toca-v1832-info-map';
    infoBlock.appendChild(info);
    mapBlock.appendChild(location);
    infoLayout.append(infoBlock,mapBlock);
    const cards=[
      makeDetails('Información y ubicación del bar','Editá los datos y confirmá el pin en el mismo lugar','venue',[infoLayout],'toca-v1831-info',true),
      genre?makeDetails('Géneros musicales','Elegí el estilo musical del bar','music',[genre],'toca-v1831-genres',false):null,
      description?makeDetails('Descripción','Contá qué hace especial a tu bar','text',[description],'toca-v1831-description',false):null,
      hours?makeDetails('Horarios de atención','Días y horarios de apertura y cierre','clock',[hours],'toca-v1831-hours',false):null,
      instagram?makeDetails('Instagram','Vinculá tu perfil social','social',[instagram],'toca-v1831-social',false):null,
      ...additional.map((el,i)=>makeDetails('Otros datos','Configuración adicional del bar','venue',[el],'toca-v1831-extra',false))
    ].filter(Boolean);
    cards.forEach(c=>form.appendChild(c));

    const bottom=document.createElement('div');bottom.className='toca-v1831-bottom';
    const note=card.querySelector(':scope > .toca-fields-note');
    const coverWarning=card.querySelector(':scope > .toca-cover-required');
    const photos=galleryElement(card);
    const galleryBody=document.createElement('div');
    if(note)galleryBody.appendChild(note);
    if(coverWarning)galleryBody.appendChild(coverWarning);
    if(photos)galleryBody.appendChild(photos);
    bottom.appendChild(makeStatic('Fotos del bar','Subí imágenes reales y elegí una portada','image',galleryBody,'toca-v1831-photos'));
    const save=document.createElement('div');save.className='toca-v1831-save';
    const saveControl=card.querySelector(':scope > .toca-profile-save');
    if(saveControl) save.appendChild(saveControl);
    else {
      const button=document.createElement('button');button.type='submit';button.setAttribute('form','venue-update');
      button.className='btn';button.textContent='Guardar cambios del bar';save.appendChild(button);
    }
    bottom.appendChild(save);
    const deletion=card.querySelector(':scope > .toca-delete-venue');
    if(deletion)card.insertBefore(bottom,deletion);
    else card.appendChild(bottom);
    moveLateSections(card);
    // Leaflet listens for window resize; moving its container must not leave a
    // blank map, including when the map initialized before this module ran.
    setTimeout(()=>window.dispatchEvent(new Event('resize')),140);
  }

  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    queueMicrotask(()=>{queued=false;mount()});
  }
  const start=()=>{
    const app=document.getElementById('app');
    if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    // A hidden, required field can prevent the browser from focusing it during
    // native validation. Open its card so the browser can show the error.
    document.addEventListener('invalid',event=>{
      const details=event.target.closest?.('.toca-v1831-card');
      if(details?.tagName==='DETAILS')details.open=true;
    },true);
    schedule();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
