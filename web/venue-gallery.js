/* The public venue's photos live together in its header. No automatic slides. */
(() => {
  'use strict';

  window.tocaVenueGallery = venue => {
    const paths = [venue.coverPhotoUrl, ...(Array.isArray(venue.photos) ? venue.photos.map(p => p?.url) : [])];
    const photos = [...new Set(paths.filter(p => typeof p === 'string' && p.startsWith('/api/venues/')).map(mediaUrl))];
    const actions = `<a href="#/explore" class="toca-back" aria-label="Volver">${iconSvg('back',20)}</a>${favButton(venue)}`;
    if (!photos.length) return `<div class="toca-detail-cover">${photo({...venue,coverPhotoUrl:null},0)}${actions}</div>`;
    return `<div class="toca-detail-cover toca-venue-gallery" data-venue-gallery data-gallery-index="0" role="region" aria-roledescription="carrusel" aria-label="Fotos de ${esc(venue.name || 'este bar')}">
      <div class="toca-gallery-track" data-gallery-track ${photos.length > 1 ? 'tabindex="0" aria-label="Fotos del bar. Usá las flechas del teclado para recorrerlas."' : ''}>
        ${photos.map((url,index) => `<figure class="toca-gallery-slide" role="group" aria-roledescription="diapositiva" aria-label="Foto ${index+1} de ${photos.length}"><img src="${esc(url)}" alt="Foto ${index+1} de ${esc(venue.name || 'este bar')}" loading="${index ? 'lazy' : 'eager'}" decoding="async" draggable="false"></figure>`).join('')}
      </div>
      ${actions}
      ${photos.length > 1 ? `<button type="button" class="toca-gallery-arrow toca-gallery-prev" data-gallery-step="-1" aria-label="Foto anterior" disabled>${iconSvg('back',20)}</button><button type="button" class="toca-gallery-arrow toca-gallery-next" data-gallery-step="1" aria-label="Foto siguiente">${iconSvg('back',20)}</button><span class="toca-gallery-counter" data-gallery-counter role="status" aria-label="Foto 1 de ${photos.length}">1 / ${photos.length}</span>` : ''}
    </div>`;
  };

  function update(track) {
    const gallery = track.closest('[data-venue-gallery]');
    if (!gallery || !track.clientWidth) return;
    const count = track.children.length;
    const index = Math.max(0,Math.min(count-1,Math.round(track.scrollLeft/track.clientWidth)));
    if (gallery.dataset.galleryIndex === String(index)) return;
    gallery.dataset.galleryIndex = String(index);
    const previous = gallery.querySelector('[data-gallery-step="-1"]');
    const next = gallery.querySelector('[data-gallery-step="1"]');
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === count-1;
    const counter = gallery.querySelector('[data-gallery-counter]');
    if (counter) {
      counter.textContent = `${index+1} / ${count}`;
      counter.setAttribute('aria-label',`Foto ${index+1} de ${count}`);
    }
  }

  function show(gallery,index,smooth=true) {
    const track = gallery.querySelector('[data-gallery-track]');
    if (!track) return;
    const target = Math.max(0,Math.min(track.children.length-1,index));
    const animate = smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({left:target*track.clientWidth,behavior:animate ? 'smooth' : 'auto'});
  }

  document.addEventListener('click',event => {
    const button = event.target.closest('[data-gallery-step]');
    if (!button || button.disabled) return;
    const gallery = button.closest('[data-venue-gallery]');
    if (gallery) show(gallery,Number(gallery.dataset.galleryIndex)+Number(button.dataset.galleryStep));
  });

  document.addEventListener('keydown',event => {
    if (!event.target.matches('[data-gallery-track]')) return;
    const gallery = event.target.closest('[data-venue-gallery]');
    const index = Number(gallery.dataset.galleryIndex);
    const target = {ArrowLeft:index-1,ArrowRight:index+1,Home:0,End:event.target.children.length-1}[event.key];
    if (target === undefined) return;
    event.preventDefault();
    show(gallery,target);
  });

  document.addEventListener('scroll',event => {
    if (event.target.matches?.('[data-gallery-track]')) update(event.target);
  },true);

  window.addEventListener('resize',() => {
    document.querySelectorAll('[data-venue-gallery]').forEach(gallery => {
      const index = Number(gallery.dataset.galleryIndex);
      requestAnimationFrame(() => { if (gallery.isConnected) show(gallery,index,false); });
    });
  });
})();
