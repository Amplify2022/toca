/* Public TOCÁ site with screenshots of the current app. */
(() => {
 'use strict';
 const sections=['inicio','la-app','para-bares','preguntas','contacto'];
 const stagePlayers=new WeakMap();let stopWalkthrough=()=>{};
 const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
 const settings=()=>window.TOCA_CONFIG?.marketing||{};
 const storeLinks=()=>({ios:storeUrl(settings().appStoreUrl,['apps.apple.com','itunes.apple.com']),android:storeUrl(settings().playStoreUrl,['play.google.com'])});
 function storeUrl(value,hosts){const url=safeUrl(value);return url&&hosts.includes(new URL(url).hostname)?url:'';}
 // X and TikTok brand glyphs: Simple Icons (CC0).
 const socialIcons={instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',facebook:'<path d="M14 21v-8h3l.5-4H14V7c0-1 .3-2 2-2h2V2h-3c-3 0-5 2-5 5v2H7v4h3v8"/>',tiktok:'<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="currentColor" stroke="none"/>',x:'<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" fill="currentColor" stroke="none"/>',linkedin:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 10v7m0-10v.1M11 17v-7m0 3c0-4 6-4 6 0v4"/>'};
 const svg=(path,size=24)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const apple=svg('<path d="M17.6 13.1c0-2 1.6-3 1.7-3.1-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.6 0-3.1.9-3.9 2.2-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.6 2.2 2.8 2.1 1.1 0 1.6-.7 3-.7s1.9.7 3.1.7 2-1.1 2.7-2.1c.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.2-.9-2.2-3.2ZM15.4 6.7c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.7-1.2Z" fill="currentColor" stroke="none"/>',29);
 const play=svg('<path d="m5 3 15 9-15 9V3Z"/><path d="m5 3 10 13m-10 5 10-13"/>',29);
 function badges(){const links=storeLinks();return `<div class="landing-store-badges">${[['ios','App Store',apple],['android','Google Play',play]].map(([os,label,ic])=>links[os]?`<a class="landing-store" href="${esc(links[os])}" target="_blank" rel="noopener noreferrer" aria-label="Descargar TOCÁ en ${label}">${ic}<span><small>Descargala en</small><strong>${label}</strong></span></a>`:`<span class="landing-store is-upcoming" aria-label="${label}, próximamente">${ic}<span><small>Próximamente en</small><strong>${label}</strong></span></span>`).join('')}</div>`;}
 function socials(){
  const links={instagram:'https://www.instagram.com/tocamusicapp/',facebook:'https://www.facebook.com/1465919206597325',...settings().socials};
  const labels={instagram:'Instagram',facebook:'Facebook',x:'X',tiktok:'TikTok',linkedin:'LinkedIn'};
  return ['instagram','facebook','x','tiktok','linkedin'].map(name=>{
   const url=safeUrl(links[name]),label=`TOCÁ en ${labels[name]}`;
   if(url)return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${svg(socialIcons[name],22)}</a>`;
   return ['x','tiktok'].includes(name)?`<span class="is-upcoming" role="img" aria-label="${label} · Próximamente" title="${labels[name]} · Próximamente">${svg(socialIcons[name],22)}</span>`:'';
  }).join('');
 }
 const anchor=(id,label)=>`<a href="#/?section=${id}" data-home-anchor="${id}">${label}</a>`;
 const downloadButton=(extra='')=>`<button type="button" class="toca-btn ${extra}" data-download-open>Descargá la app ${svg('<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',18)}</button>`;
 const stages=[
  ['Elegí dónde suena tu noche','Explorá el mapa, descubrí bares y mirá qué está sonando antes de entrar.','explore.png'],
  ['Encontrá ese tema que tenés en mente','Buscá una canción o un artista desde el bar que elegiste.','search.png'],
  ['Recargá tus tokens si lo necesitás','Cada canción agregada usa 1 token. Las recargas de esta etapa son de prueba, sin cobros.','tokens.png'],
  ['Listo. Tu tema está en la playlist','Tu pedido se agrega automáticamente. Si el bar lo requiere, validamos que estés a 100 metros.','success.png']
 ];
 function walkthrough(){return `
  <div class="landing-walkthrough">
   <div class="landing-section-heading landing-walkthrough-heading"><div><h3>Tu próxima canción, en cuatro pasos.</h3><p>De encontrar el bar a sumar tu tema. Así se ve TOCÁ por dentro.</p></div></div>
   <div class="landing-how-grid">
    <div class="landing-stages" role="tablist" aria-label="Cómo funciona TOCÁ" aria-orientation="vertical">${stages.map(([title,copy],i)=>`<button type="button" role="tab" id="landing-stage-${i}" aria-controls="landing-screen-${i}" aria-selected="${i===0}" tabindex="${i===0?'0':'-1'}" data-landing-stage="${i}"><span class="landing-stage-number">0${i+1}</span><span><strong>${title}</strong><small>${copy}</small></span></button>`).join('')}</div>
    <div class="landing-screen-area">
     <div class="landing-screen-phone" aria-describedby="landing-screen-caption">${stages.map(([title,,file],i)=>`<figure id="landing-screen-${i}" class="landing-screen-panel${i===0?' is-active':''}" role="tabpanel" aria-labelledby="landing-stage-${i}" aria-hidden="${i!==0}" ${i?'inert':''}><img src="/assets/landing/${file}" width="390" height="780" loading="lazy" alt="Pantalla de TOCÁ: ${esc(title)}"></figure>`).join('')}</div>
     <p id="landing-screen-caption" class="landing-screen-caption">Interfaz de TOCÁ · Datos de ejemplo</p>
    </div>
   </div>
  </div>`;}
 const previousLanding=tocaLanding;
 tocaLanding=function(){
  previousLanding();const root=document.querySelector('.toca-landing');if(!root)return;
  root.id='inicio';root.classList.add('landing-expanded');
  const phone=root.querySelector('.toca-hero-phone');phone.classList.add('toca-hero-phone-app');
  phone.innerHTML='<img src="/assets/landing/explore.png" width="390" height="780" alt="Pantalla de TOCÁ: mapa de bares con la ficha del local y la canción que está sonando" loading="eager" decoding="async" fetchpriority="high">';
  root.querySelector('.toca-landing-header').innerHTML=`${brand()}<div class="landing-header-actions"><nav id="landing-main-navigation" aria-label="Secciones de inicio">${anchor('la-app','La app')}${anchor('para-bares','Para tu bar')}${anchor('contacto','Contacto')}</nav><button type="button" class="landing-menu-toggle" aria-controls="landing-main-navigation" aria-expanded="false" aria-label="Abrir menú">${svg('<path d="M4 6h16M4 12h16M4 18h16"/>',20)}</button>${downloadButton()}</div>`;
  const logo=root.querySelector('.toca-landing-header .toca-brand');logo.href='#/?section=inicio';logo.dataset.homeAnchor='inicio';logo.setAttribute('aria-label','TOCÁ · Inicio');
  root.querySelector('.toca-landing-hero').setAttribute('aria-label','Descubrí TOCÁ');
  root.querySelector('.toca-landing-features').outerHTML=`<section id="la-app" class="landing-section landing-intro"><div class="landing-section-heading"><span class="eyebrow">MÁS QUE ELEGIR UN LUGAR</span><h2>Elegí cómo querés<br>que suene tu noche.</h2></div>${walkthrough()}</section>`;
  root.querySelector('.toca-footer').remove();
  root.insertAdjacentHTML('beforeend',`
   <section id="para-bares" class="landing-section landing-owners"><div><span class="eyebrow">QUE SUENE TU BAR</span><h2>Tu lugar tiene identidad.<br>Que también se escuche.</h2><p>Gestioná la experiencia musical desde un solo lugar y dejá que tus clientes participen.</p><ul><li>${iconSvg('check',18)} Administrá tu playlist y los controles de reproducción.</li><li>${iconSvg('check',18)} Elegí quién puede pedir y qué canciones permitís.</li><li>${iconSvg('check',18)} Conocé la actividad y los pedidos de tu bar.</li></ul><div class="landing-owner-actions"><a href="${tocaPortalDestination()}" class="toca-btn"><span>${state.token?'Ir a mi portal':'Entrar al portal de bares'}</span>${iconSvg('arrow',18)}</a><a class="landing-text-link" href="#/register"><span>Registrar mi bar</span></a></div></div><figure><img src="/assets/landing/admin-music.png?v=covers-2" width="1100" height="840" loading="lazy" alt="Panel de música de TOCÁ para administrar la playlist del bar"><figcaption>Tu música y tus reglas, en la misma cabina. Vista de ejemplo.</figcaption></figure></section>
   <section id="preguntas" class="landing-section landing-faq"><div class="landing-section-heading"><span class="eyebrow">ANTES DEL PRIMER TEMA</span><h2>Lo que querés saber.</h2><p>Si te queda alguna duda, escribinos al final de esta página.</p></div><div>${[
    ['¿Necesito una cuenta?','Podés explorar bares sin registrarte. Para pedir canciones y guardar tu actividad, iniciá sesión como cliente.'],
    ['¿Qué son los tokens?','Cada canción que se agrega correctamente a la playlist usa 1 token. Si no tenés saldo, podés recargar y continuar con el tema que elegiste. Por ahora las recargas son simuladas y no se cobra dinero.'],
    ['¿Tengo que estar en el bar?','Depende de la configuración del local. Algunos bares requieren que estés a 100 metros; otros permiten pedidos desde cualquier lugar.'],
    ['¿Puedo pedir el mismo tema otra vez?','Sí. Cada pedido nuevo agrega otra copia a la playlist y usa 1 token cuando se confirma.'],
    ['¿Cuándo suena mi canción?','Se suma a la playlist del bar en el orden de los pedidos. La reproducción depende de la configuración musical del lugar.'],
    ['¿Y si no puedo pedir en un bar?','Es posible que la música esté pausada, que los pedidos estén deshabilitados o que el tema no esté permitido por el local. Podés seguir explorando otros lugares.']
   ].map(([title,copy])=>`<details><summary>${title}<span aria-hidden="true">+</span></summary><p>${copy}</p></details>`).join('')}</div></section>
   <section id="contacto" class="landing-section landing-contact"><div><span class="eyebrow">TE ESCUCHAMOS</span><h2>Las buenas ideas<br>también se comparten.</h2><p>¿Una sugerencia, una duda o algo que no está funcionando? Contanos y ayudanos a mejorar TOCÁ.</p><div class="landing-contact-note">${iconSvg('heart',21)} Hecha para compartir la música. Mejor con vos.</div></div><form id="landing-contact-form"><div class="landing-form-row"><label>Tu nombre<input class="input" name="name" required minlength="2" maxlength="120" autocomplete="name" placeholder="Cómo te llamás"></label><label>Tu correo<input class="input" name="email" type="email" required maxlength="200" autocomplete="email" placeholder="vos@ejemplo.com"></label></div><label>¿Sobre qué querés escribirnos?<select class="input" name="kind"><option value="suggestion">Tengo una sugerencia</option><option value="problem">Encontré un problema</option><option value="other">Quiero hacer una consulta</option></select></label><label>Tu mensaje<textarea class="input" name="message" required minlength="10" maxlength="4000" rows="5" placeholder="Contanos un poco más…"></textarea></label><div class="landing-form-trap" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="landing-form-status" role="status" aria-live="polite" hidden></p><div class="landing-form-end"><small>Usamos tu correo para responder a tu consulta.</small><button type="submit" class="toca-btn">Enviar mensaje ${iconSvg('arrow',18)}</button></div></form></section>
   <footer class="landing-footer"><div class="landing-footer-top"><div>${brand()}<p>La noche suena con vos.</p></div><nav aria-label="Enlaces del sitio">${anchor('la-app','La app')}${anchor('para-bares','Para tu bar')}${anchor('preguntas','Preguntas frecuentes')}${anchor('contacto','Contacto')}</nav></div><div class="landing-footer-bottom"><div class="landing-socials" aria-label="Redes sociales">${socials()}</div>${badges()}</div><div class="landing-footer-legal"><span>© ${new Date().getFullYear()} TOCÁ</span><span>Descubrí bares. Compartí música.</span></div></footer>`);
  const main=document.createElement('main');main.className='landing-main';root.querySelector('.toca-landing-header').after(main);root.querySelectorAll(':scope > section').forEach(section=>main.append(section));
  const footerLogo=root.querySelector('.landing-footer .toca-brand');footerLogo.href='#/?section=inicio';footerLogo.dataset.homeAnchor='inicio';
  stopWalkthrough();stopWalkthrough=startWalkthrough(root.querySelector('.landing-walkthrough'));
  requestAnimationFrame(()=>scrollSection(route().params.get('section'),false));
 };
 function scrollSection(id,smooth=true){if(id==='como-funciona')id='la-app';if(!sections.includes(id))return;const target=document.getElementById(id);if(!target)return;target.scrollIntoView({behavior:smooth&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'instant',block:'start'});}
 function activateStage(root,index){root.querySelectorAll('[data-landing-stage]').forEach(button=>{const selected=Number(button.dataset.landingStage)===index;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});root.querySelectorAll('[role="tabpanel"]').forEach((panel,i)=>{const selected=i===index;panel.classList.toggle('is-active',selected);panel.setAttribute('aria-hidden',String(!selected));panel.inert=!selected;});stagePlayers.get(root)?.select(index);}
 function startWalkthrough(root){
  const grid=root.querySelector('.landing-how-grid');
  const motion=matchMedia('(prefers-reduced-motion:reduce)'),duration=5000;
  let index=0,timer=null,visible=false,disposed=false;
  const running=()=>!disposed&&root.isConnected&&visible&&!document.hidden&&!motion.matches;
  function cancel(){if(timer!==null)clearTimeout(timer);timer=null;}
  function schedule(reset=false){
   if(reset||!running())cancel();
   if(running()&&timer===null)timer=setTimeout(()=>{timer=null;if(running())activateStage(grid,(index+1)%stages.length);},duration);
  }
  stagePlayers.set(grid,{select(next){index=next;schedule(true);}});
  const observer=new IntersectionObserver(entries=>{
   visible=entries.some(entry=>entry.isIntersecting);
   if(visible)root.querySelectorAll('img[loading="lazy"]').forEach(image=>image.loading='eager');
   schedule();
  },{threshold:0,rootMargin:'-90px 0px 0px 0px'});
  observer.observe(root);
  const visibility=()=>schedule(true),preference=()=>schedule(true);
  document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',preference);
  return ()=>{disposed=true;cancel();observer.disconnect();stagePlayers.delete(grid);
   document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',preference);
  };
 }
 function closeMenu(){const header=document.querySelector('.toca-landing-header');header?.classList.remove('is-menu-open');const toggle=header?.querySelector('.landing-menu-toggle');if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menú');}}
 document.addEventListener('click',event=>{
  const menu=event.target.closest('.landing-menu-toggle');if(menu){const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');menu.closest('.toca-landing-header').classList.toggle('is-menu-open',open);}
  if(!event.target.closest('.toca-landing-header'))closeMenu();
  const anchorLink=event.target.closest('[data-home-anchor]');
  if(anchorLink&&document.querySelector('.landing-expanded')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();const id=anchorLink.dataset.homeAnchor;if(!sections.includes(id))return;const hash=`#/?section=${id}`;if(location.hash!==hash)history.pushState(null,'',hash);closeMenu();scrollSection(id);}
  const stage=event.target.closest('[data-landing-stage]');if(stage)activateStage(stage.closest('.landing-how-grid'),Number(stage.dataset.landingStage));
  if(event.target.closest('[data-download-open]'))void showDownload();
  if(event.target.closest('[data-download-close]'))document.getElementById('landing-download-dialog')?.close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.landing-menu-toggle[aria-expanded="true"]')){closeMenu();document.querySelector('.landing-menu-toggle')?.focus();}const tab=event.target.closest('[data-landing-stage]');if(!tab||!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const current=Number(tab.dataset.landingStage),next=event.key==='Home'?0:event.key==='End'?stages.length-1:(current+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+stages.length)%stages.length;const root=tab.closest('.landing-how-grid');activateStage(root,next);root.querySelector(`[data-landing-stage="${next}"]`).focus();});
 window.addEventListener('popstate',()=>{if(document.querySelector('.landing-expanded'))requestAnimationFrame(()=>scrollSection(route().params.get('section')||'inicio',false));});
 function downloadUrl(){try{const u=new URL(settings().publicUrl||location.href);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();u.search='';u.hash='/download';return u.href;}catch{return location.href.split('#')[0]+'#/download';}}
 function qrCanvas(url){const code=new window.AmplifyQR(-1,1);code.addData(url);code.make();const count=code.getModuleCount(),quiet=4,scale=6,canvas=document.createElement('canvas');canvas.width=canvas.height=(count+quiet*2)*scale;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#071411';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(code.isDark(y,x))ctx.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Código QR para abrir TOCÁ en el celular');return canvas;}
 async function showDownload(){
  let dialog=document.getElementById('landing-download-dialog');if(dialog?.open)return;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='landing-download-dialog';dialog.className='landing-download-dialog';document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});}
  const links=storeLinks(),available=!!(links.ios||links.android);
  dialog.innerHTML=`<button type="button" class="landing-dialog-close" data-download-close aria-label="Cerrar">${svg('<path d="m6 6 12 12M6 18 18 6"/>')}</button><span class="eyebrow">TU PRÓXIMA CANCIÓN TE ESPERA</span><h2 id="landing-download-title">TOCÁ, en tu celular.</h2><p>Escaneá el QR con la cámara de tu celular.</p><div class="landing-qr"></div><p class="landing-download-hint">${available?'Te llevamos a la tienda de tu dispositivo.':'Mientras llegan las versiones de las tiendas, podés usar TOCÁ desde la web.'}</p>${badges()}<a href="#/explore" class="landing-text-link">Abrir versión web ${iconSvg('arrow',16)}</a>${['localhost','127.0.0.1'].includes(new URL(downloadUrl()).hostname)?'<small class="landing-local-note">Vista previa local: el QR se comparte desde el dominio público de TOCÁ.</small>':''}`;
  dialog.setAttribute('aria-labelledby','landing-download-title');dialog.querySelector('.landing-qr').append(qrCanvas(downloadUrl()));dialog.showModal();
 }
 const previousRender=render;
 render=async function(){
  if(!['/','/home'].includes(route().path)){stopWalkthrough();stopWalkthrough=()=>{};}
  if(['/','/home'].includes(route().path)&&document.querySelector('.landing-expanded')){scrollSection(route().params.get('section')||'inicio',false);return;}
  if(route().path!=='/download')return previousRender();
  const links=storeLinks(),ua=navigator.userAgent,ios=/iPhone|iPad|iPod/i.test(ua)||/Mac/i.test(ua)&&navigator.maxTouchPoints>1;
  const target=ios?links.ios:/Android/i.test(ua)?links.android:'';
  if(target){location.replace(target);return;}
  mount(`<section class="landing-download-page"><img src="/assets/icon.svg" alt="" width="76" height="76"><span class="eyebrow">LA NOCHE SUENA CON VOS</span><h1>Tu música va con vos.</h1><p>${links.ios||links.android?'Elegí la tienda de tu dispositivo para descargar TOCÁ.':'Estamos preparando TOCÁ para las tiendas. Mientras tanto, podés descubrir bares y pedir tus canciones desde la web.'}</p>${badges()}<a class="toca-btn" href="#/explore">Abrir TOCÁ ${iconSvg('arrow',17)}</a><a href="#/" class="landing-text-link">Volver al inicio</a></section>`,'auth');
 };
 window.addEventListener('hashchange',()=>document.getElementById('landing-download-dialog')?.close());
 document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='landing-contact-form')return;event.preventDefault();if(form.dataset.busy)return;form.dataset.busy='true';
  const payload=Object.fromEntries(new FormData(form)),status=form.querySelector('.landing-form-status'),button=form.querySelector('button[type="submit"]');
  form.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=true);button.textContent='Enviando…';status.hidden=true;
  try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));const fingerprint=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
   let pending;try{pending=JSON.parse(sessionStorage.getItem('toca:contact:pending')||'null')}catch{}
   const operation=pending?.fingerprint===fingerprint?pending:{id:crypto.randomUUID(),fingerprint};sessionStorage.setItem('toca:contact:pending',JSON.stringify(operation));
   const response=await fetch(API_URL+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({...payload,id:operation.id})});const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result._embedded?.errors?.[0]?.message||result.message||'No pudimos enviar tu mensaje. Volvé a intentarlo.');
   if(!result.accepted)throw Error('No pudimos confirmar tu mensaje. Volvé a intentarlo.');
   sessionStorage.removeItem('toca:contact:pending');if(!form.isConnected)return;form.reset();status.hidden=false;status.classList.remove('is-error');status.textContent='¡Gracias por escribirnos! Recibimos tu mensaje.';
  }catch(error){if(form.isConnected){status.hidden=false;status.classList.add('is-error');status.textContent=error.message==='Failed to fetch'?'No pudimos confirmar el envío. Podés volver a intentarlo sin duplicar tu mensaje.':error.message;}}
  finally{delete form.dataset.busy;if(form.isConnected){form.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=false);button.innerHTML=`Enviar mensaje ${iconSvg('arrow',18)}`;}}
 });
})();
