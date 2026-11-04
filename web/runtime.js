/* One navigation coordinator, shared route lifecycle and optional map loader. */
(() => {
 const settings=settingsView;
 settingsView=function(){if(['localhost','127.0.0.1'].includes(location.hostname)||window.TOCA_CONFIG?.development)return settings();mount('<h1>Preferencias</h1><p>Tus favoritos se sincronizan con tu cuenta.</p><a href="#/account?kind=customer">Acceso y privacidad de la cuenta</a>','profile')};
 setTimeout(()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap';document.head.append(css)},0);
 let mapPromise;
 window.tocaLoadMaps=()=>mapPromise ||= new Promise((resolve,reject)=>{
  if(window.L){resolve();return}
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(css);
  const script=document.createElement('script');script.id='toca-leaflet-script';script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=resolve;script.onerror=()=>{script.remove();mapPromise=null;reject(Error('Mapa no disponible'))};document.head.append(script);
 });
 const originalEnsure=window.tocaCustomerEnsure;let favoritesUser=null;
 window.tocaCustomerEnsure=async()=>{
  const user=await originalEnsure();
  if(user&&!state.demo&&favoritesUser!==user.id){try{
   const key=favoriteKey(user),marker=key+':server-migrated';
   let ids=await api('/api/customers/me/favorites',{headers:{Authorization:window.tocaCustomerBearer()}});
   if(!localStorage.getItem(marker)){
    let local=[];try{local=JSON.parse(localStorage.getItem(key)||'[]')}catch(_){}
    if(Array.isArray(local))for(const id of local.filter(id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)))
     try{await api('/api/customers/me/favorites/'+encodeURIComponent(id),{method:'PUT',headers:{Authorization:window.tocaCustomerBearer()}})}catch(error){if(error.status!==404)throw error}
    ids=await api('/api/customers/me/favorites',{headers:{Authorization:window.tocaCustomerBearer()}});
    localStorage.setItem(marker,'true');
   }
   localStorage.setItem(key,JSON.stringify(ids));favoritesUser=user.id;
  }catch(_){/* Preserve the owned local cache and retry migration on the next visit. */}}
  return user;
 };
 const previous=render, originalMount=mount;let running=false,pending=false,activePath=null,lastCommitted=null,abort=null;window.tocaNavigationSignal=()=>abort?.signal;
 document.addEventListener('keydown',event=>{if(event.target.matches('.switch')&&!['BUTTON','INPUT'].includes(event.target.tagName)&&[' ','Enter'].includes(event.key)){event.preventDefault();event.target.click()}});
 function decorate(){
  const main=document.querySelector('main')||document.getElementById('app');
  if(route().path==='/profile'&&!main?.querySelector('[data-manage-account]')){const link=document.createElement('a');link.dataset.manageAccount='true';link.href='#/account?kind=customer';link.textContent='Administrar cuenta, acceso y privacidad';main?.append(link)}
  if(['/login','/customer/login'].includes(route().path)&&!main?.querySelector('[data-manage-account]')){const link=document.createElement('a');link.dataset.manageAccount='true';link.href='#/account?kind='+ (route().path==='/login'?'admin':'customer');link.textContent='¿Olvidaste tu contraseña?';main?.append(link)}
  const h=main?.querySelector('h1,h2');document.title=(h?.textContent||'TOCÁ')+' · TOCÁ';
  document.querySelectorAll('input,textarea,select').forEach((input,i)=>{
   if(input.labels?.length||input.hasAttribute('aria-label')||input.type==='hidden')return;
   const label=input.previousElementSibling;
   if(label?.tagName==='LABEL'){input.id ||= 'field-'+i;label.htmlFor=input.id;}
   else input.setAttribute('aria-label',input.placeholder||({name:'Nombre',address:'Dirección',city:'Ciudad',description:'Descripción',email:'Correo electrónico',password:'Contraseña',latitude:'Latitud',longitude:'Longitud'}[input.name])||input.name||'Campo');
  });
  document.querySelectorAll('a[href^="#/"]').forEach(a=>{if(a.getAttribute('href')===location.hash)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  document.querySelectorAll('button.chip').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));
  document.querySelectorAll('.switch').forEach(b=>{b.setAttribute('role','switch');b.setAttribute('aria-checked',String(b.classList.contains('on')));if(!['BUTTON','INPUT'].includes(b.tagName))b.tabIndex=0});
 }
 mount=function(...args){if(activePath!==null&&activePath!==route().path)return;originalMount(...args);decorate()};
 render=async function(){pending=true;if(running){abort?.abort();return;}running=true;let last;
  try{while(pending){pending=false;abort=new AbortController();activePath=route().path;last=activePath;await previous();}}
  finally{activePath=null;running=false;decorate();if(last===route().path&&last!==lastCommitted){lastCommitted=last;const h=document.querySelector('main h1,main h2,#app h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true})}}}
 };
})();
