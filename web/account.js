/* Shared account management UI; all authorization and one-use tokens stay server-side. */
(() => {
 const base=render;
 render=async function(){
  if(route().path!=='/account')return base();
  const params=route().params,kind=params.get('kind')==='admin'?'admin':'customer';
  const token=params.get('token')||'',purpose=params.get('purpose');
  const signed=kind==='admin'?!!state.token:!!window.tocaCustomerBearer?.();
  mount(`<section class="toca-customer-card"><h1>Tu cuenta</h1><p id="account-status" role="status"></p>
   ${token?`<form data-account-action="consume"><h2>${purpose==='verify'?'Verificar correo':'Restablecer contraseña'}</h2>${purpose==='verify'?'':'<label>Nueva contraseña<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>'}<button class="btn">Confirmar</button></form>`:
   `<form data-account-action="recover"><h2>Recuperar acceso</h2><label>Correo<input name="email" type="email" required autocomplete="email"></label><button class="btn">Enviar enlace</button></form>
   <form data-account-action="verify-request"><h2>Verificar correo</h2><label>Correo<input name="email" type="email" required></label><button class="btn">Enviar verificación</button></form>
   ${signed?`<form data-account-action="password"><h2>Cambiar contraseña</h2><label>Contraseña actual<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="10" required autocomplete="new-password"></label><button class="btn">Cambiar y cerrar sesiones</button></form>
   <button class="btn ghost" data-account-button="revoke">Cerrar todas las sesiones</button>
   <form data-account-action="delete"><h2>Eliminar cuenta</h2><label>Contraseña<input name="password" type="password" required></label><label>Escribí ELIMINAR<input name="confirmation" required pattern="ELIMINAR"></label><button class="btn ghost">Eliminar mi cuenta</button></form>`:''}`}
  <a href="#/profile">Volver al perfil</a></section>`,'profile');
  document.querySelectorAll('[data-account-action]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();await send(form.dataset.accountAction,Object.fromEntries(new FormData(form)),form.querySelector('button'))}));
  document.querySelector('[data-account-button]')?.addEventListener('click',event=>send('revoke',{},event.target));
  async function send(action,body,button){button.disabled=true;const box=document.getElementById('account-status');try{
   const auth=kind==='admin'?`Bearer ${state.token}`:window.tocaCustomerBearer?.();
   await api(`/api/accounts/${kind}/${action}`,{method:'POST',headers:{Authorization:auth||''},body:{...body,...(token?{token}:{})}});
   box.textContent=['recover','verify-request'].includes(action)?'Si existe una cuenta, recibirás un enlace.':'Acción completada.';
   if(['consume','password','revoke','delete'].includes(action)){sessionStorage.removeItem('toca:customer:session');sessionStorage.removeItem('amplify-token');sessionStorage.removeItem('amplify-user');history.replaceState(null,'','#/account?kind='+kind);setTimeout(()=>location.reload(),1200)}
  }catch(error){box.textContent=error.message}finally{button.disabled=false}}
 };
})();
