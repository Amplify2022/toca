/* Shared account controls. Each account keeps its own authentication and session. */
(() => {
 const base=render;let generation=0;
 const field=(label,name,type,autocomplete,extra='')=>`<label class="toca-account-field">${label}<input class="input" name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}></label>`;
 const password=(label,name,existing=false)=>field(label,name,'password',existing?'current-password':'new-password',`${existing?'':'minlength="10" '}maxlength="128"`);
 const email=value=>field('Correo electrónico','email','email','email',`maxlength="200" value="${esc(value||'')}"`);
 const submit=text=>`<button type="submit" class="btn primary toca-account-submit">${text}</button>`;
 const card=(title,copy,body,extra='')=>`<section class="toca-account-section ${extra}"><header><h2>${title}</h2><p>${copy}</p></header>${body}</section>`;
 render=async function(){
  const call=++generation;if(route().path!=='/account')return base();
  const hash=location.hash,params=route().params,kind=params.get('kind')==='admin'?'admin':'customer';
  const token=params.get('token')||'',verify=params.get('purpose')==='verify';
  if(kind==='customer')await window.tocaCustomerEnsure?.();
  if(call!==generation||location.hash!==hash)return;
  const signed=kind==='admin'?!!state.token:!!window.tocaCustomerBearer?.();
  const user=kind==='admin'?state.user:window.tocaCustomerUser?.();
  const login=kind==='admin'?'#/login':'#/customer/login';
  const back=signed?(kind==='admin'?'#/admin/account':'#/profile'):login;
  let content,title,lead;
  if(token){
   title=verify?'Verificá tu correo':'Elegí una nueva contraseña';
   lead=verify?'Confirmá tu correo para completar la verificación de tu cuenta.':'Usá al menos 10 caracteres para proteger tu cuenta.';
   content=`<form data-account-action="consume" class="toca-account-form">${verify?'':password('Nueva contraseña','password')+password('Repetí la contraseña','passwordConfirmation')}${submit(verify?'Verificar mi correo':'Guardar nueva contraseña')}</form>`;
  }else if(!signed){
   title='Recuperá tu acceso';lead='Ingresá el correo de tu cuenta y te enviaremos un enlace para restablecer tu contraseña.';
   content=`<form data-account-action="recover" class="toca-account-form">${email('')}${submit('Enviar enlace de recuperación')}</form><details class="toca-account-details"><summary>¿Necesitás verificar tu correo?</summary><p>Solicitá un nuevo enlace de verificación.</p><form data-account-action="verify-request" class="toca-account-form">${email('')}${submit('Enviar verificación')}</form></details>`;
  }else{
   title='Acceso y seguridad';lead='Administrá tu contraseña, el correo de tu cuenta y tus sesiones.';
   content=`<div class="toca-account-grid"><div class="toca-account-column">${card('Cambiar contraseña','Al cambiarla, se cerrarán las sesiones de esta cuenta.',`<form data-account-action="password" class="toca-account-form">${password('Contraseña actual','currentPassword',true)}${password('Nueva contraseña','newPassword')}${password('Repetí la contraseña','passwordConfirmation')}<small>Usá al menos 10 caracteres.</small>${submit('Actualizar contraseña')}</form><details class="toca-account-details"><summary>¿No tenés o no recordás tu contraseña?</summary><p>Podés crear una nueva mediante un enlace enviado a tu correo.</p><form data-account-action="recover" class="toca-account-form">${email(user?.email)}${submit('Enviar enlace de recuperación')}</form></details>`)}${card('Verificar correo','Te enviaremos un enlace para confirmar tu dirección.',`<form data-account-action="verify-request" class="toca-account-form">${email(user?.email)}${submit('Enviar verificación')}</form>`)}</div><div class="toca-account-column">${card('Tus sesiones','Cerrá las sesiones de esta cuenta en todos tus dispositivos. Después podés volver a ingresar.',`<button type="button" class="btn ghost toca-account-submit" data-account-button="revoke">Cerrar todas las sesiones</button>`)}${card('Eliminar cuenta','Esta acción es permanente. Revisá los datos antes de continuar.',`<details class="toca-account-details"><summary>Quiero eliminar mi cuenta</summary><form data-account-action="delete" class="toca-account-form">${password('Tu contraseña','password',true)}${field('Escribí ELIMINAR para confirmar','confirmation','text','off','pattern="ELIMINAR" spellcheck="false"')}<button type="submit" class="btn toca-account-danger">Eliminar mi cuenta</button></form></details>`,'toca-account-danger-zone')}</div></div>`;
  }
  const compact=!!token||!signed;
  mount(`<section class="toca-account-page ${compact?'toca-account-compact':''}" data-account-kind="${kind}"><div class="${compact?'toca-customer-card toca-account-card':'toca-account-body'}"><header class="toca-account-heading"><span class="eyebrow">${kind==='admin'?'PORTAL DE BARES':'TU CUENTA EN TOCÁ'}</span><h1>${title}</h1><p>${lead}</p></header><p id="account-status" class="toca-account-status" role="status" aria-live="polite" hidden></p>${content}<footer class="toca-account-footer"><a href="${back}">${iconSvg('back',16)} ${signed?'Volver a mi cuenta':'Volver a iniciar sesión'}</a></footer></div></section>`,compact?'auth':kind==='admin'?'admin':'profile');
  const root=document.querySelector('.toca-account-page');if(!root)return;
  root.querySelectorAll('[data-account-action]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();await send(form.dataset.accountAction,Object.fromEntries(new FormData(form)),form.querySelector('button'))}));
  root.querySelector('[data-account-button]')?.addEventListener('click',event=>send('revoke',{},event.currentTarget));
  let busy=false;
  async function send(action,body,button){
   if(busy)return;busy=true;
   const box=root.querySelector('#account-status'),label=button.textContent;let completed=false;
   const auth=kind==='admin'?(state.token?`Bearer ${state.token}`:''):window.tocaCustomerBearer?.()||'';
   root.querySelectorAll('button').forEach(node=>node.disabled=true);button.textContent='Procesando…';box.hidden=true;
   try{
    if(action==='password')confirmNewPassword(body,'newPassword');
    if(action==='consume'&&!verify)confirmNewPassword(body);
    await api(`/api/accounts/${kind}/${action}`,{method:'POST',headers:{Authorization:auth},body:{...body,...(token?{token}:{})}});
    if(!root.isConnected||call!==generation)return;
    box.hidden=false;box.classList.remove('is-error');
    box.textContent=['recover','verify-request'].includes(action)?'Si hay una cuenta asociada a ese correo, vas a recibir un enlace. Revisá también la carpeta de spam.':action==='consume'?(verify?'Tu correo quedó verificado.':'Tu contraseña se actualizó. Ya podés iniciar sesión.'):action==='password'?'Tu contraseña se actualizó. Volvé a iniciar sesión.':action==='revoke'?'Se cerraron las sesiones de esta cuenta.': 'Tu cuenta fue eliminada.';
    completed=['consume','password','revoke','delete'].includes(action);
    if(['password','revoke','delete'].includes(action)||action==='consume'&&!verify){
     // Changing a customer account must preserve the independent bar-admin session.
     if(kind==='admin'&&auth===(state.token?`Bearer ${state.token}`:'')){
      window.tocaMusicDisconnect?.();state.token='';state.user=null;
      sessionStorage.removeItem('amplify-token');sessionStorage.removeItem('amplify-user');
     }else if(kind==='customer'&&auth===(window.tocaCustomerBearer?.()||'')){
      window.tocaCustomerForgetSession?.();sessionStorage.removeItem('toca:customer:session');
     }
     history.replaceState(null,'',`#/account?kind=${kind}`);
     setTimeout(()=>{if(root.isConnected){navigate(login);void render();}},1400);
    }
    box.scrollIntoView({block:'nearest',behavior:'smooth'});
   }catch(error){if(root.isConnected){box.hidden=false;box.textContent=error.message;box.classList.add('is-error');}}
   finally{busy=false;if(root.isConnected){if(!completed)root.querySelectorAll('button').forEach(node=>node.disabled=false);button.textContent=label;}}
  }
 };
})();
