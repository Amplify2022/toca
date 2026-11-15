/* Account-owned credits. The API alone decides balances, reservations and costs. */
(() => {
  'use strict';
  let dialog, panelWallet, topupBusy=false, opening=false, activeOwner='', requestFlow=null;
  const owner = () => String(window.tocaCustomerUser?.()?.id || '');
  const key = part => `toca:wallet:${part}:${owner()}`;
  const read = name => {try{return JSON.parse(sessionStorage.getItem(name)||'null');}catch{return null;}};
  const save = (name,value) => {try{value===null?sessionStorage.removeItem(name):sessionStorage.setItem(name,JSON.stringify(value));}catch{}};
  const count = n => `${n} token${n===1?'':'s'}`;
  const validBalance = data => data && Number.isSafeInteger(data.balance) && data.balance>=0 && Array.isArray(data.packs) && Array.isArray(data.movements);
  async function walletApi(path='',options={}) {
    const bearer=window.tocaCustomerBearer?.();
    if(!bearer)throw Error('Iniciá sesión como cliente para ver tus tokens.');
    const response=await fetch(API_URL+'/api/customers/me/wallet'+path,{
      ...options,cache:'no-store',headers:{Authorization:bearer,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error(data._embedded?.errors?.[0]?.message||data.message||'No pudimos consultar tus tokens.');error.status=response.status;error.code=data.code||data._embedded?.errors?.[0]?.code;throw error;}
    // Micronaut omits empty collections from map responses. An account with
    // no movements still has a valid, server-confirmed zero balance.
    if(data.movements==null)data.movements=[];
    if(!validBalance(data))throw Error('No pudimos consultar tu saldo. Volvé a intentarlo.');
    return data;
  }
  window.tocaWalletRead=()=>walletApi();
  function selection() {
    const item=read(key('song'));
    return item && /^[a-f0-9-]{36}$/i.test(item.venueId) && /^[A-Za-z0-9]{22}$/.test(item.track?.id||'') ? item : null;
  }
  window.tocaWalletNeedsTopup=(venueId,track)=>{
    save(key('song'),{intentId:crypto.randomUUID(),autoResume:true,venueId,venueName:String(state.detail?.id===venueId?state.detail.name:'Tu bar'),track:{id:track.id,title:String(track.title||'Tu canción').slice(0,300),artist:String(track.artist||'').slice(0,300)}});
    navigate('#/profile/tokens?recharge=1');
  };
  window.tocaWalletHandleInsufficient=(error,venueId,track)=>{
    const code=error?.code||error?.errorCode;
    const message=String(error?.message||'');
    // Support the structured response and retained responses from older APIs.
    const noFunds=Number(error?.status)===402 || code==='INSUFFICIENT_TOKENS' || /no ten[eé]s (?:tokens|cr[eé]ditos) suficientes/i.test(message);
    if(!noFunds)return false;
    window.tocaWalletNeedsTopup(venueId,track);return true;
  };
  window.tocaWalletCanRequest=async(venueId,track)=>{
    const currentOwner=owner();
    const wallet=await walletApi();
    if(owner()!==currentOwner)return false;
    if(wallet.balance>=wallet.requestCost)return true;
    window.tocaWalletNeedsTopup(venueId,track);return false;
  };
  window.tocaWalletRequested=(venueId,trackId)=>{
    const item=selection();if(item?.venueId===venueId&&item.track.id===trackId)save(key('song'),null);
    window.dispatchEvent(new Event('toca:wallet-changed'));
  };
  window.tocaWalletCard=(wallet,unavailable=false)=>`<section class="toca-wallet toca-wallet-widget" aria-label="Tus tokens">
    <div class="tw-heading"><h2>Tus tokens</h2><a href="#/profile/tokens">Ver movimientos ${iconSvg('arrow',16)}</a></div>
    <div class="tw-balance"><span class="tw-ticket" aria-hidden="true">${iconSvg('music',28)}</span><div><small>Saldo disponible</small><strong data-wallet-balance>${wallet?count(wallet.balance):'Saldo no disponible'}</strong></div>
    <a class="tw-button" href="#/profile/tokens?recharge=1">${iconSvg('plus',14)} Recargar</a></div>
    <p class="tw-help">${unavailable?'No pudimos consultar tu saldo. Abrí tus movimientos para volver a intentarlo.':'Cada canción agregada usa 1 token.'}</p></section>`;
  function movements(wallet) {
    if(!wallet.movements.length)return '<p class="tw-empty">Todavía no tenés movimientos.<br>Tu primera recarga aparecerá acá.</p>';
    return wallet.movements.map(entry=>{
      const title=entry.kind==='TOPUP'?'Recarga simulada':'Canción agregada';
      const detail=entry.kind==='TOPUP'?'Sin cobro de dinero':entry.title?`${entry.title}${entry.venueName?' · '+entry.venueName:''}`:'';
      const date=new Date(entry.createdAt),today=Number.isFinite(date.getTime())?date.toLocaleDateString('es-UY',{day:'numeric',month:'short'}):'';
      return `<article class="tw-movement"><span class="tw-movement-icon">${iconSvg(entry.kind==='TOPUP'?'plus':entry.kind==='RELEASE'?'back':'music',20)}</span><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><time>${esc(today)}</time><b class="${entry.amount>0?'tw-credit':''}">${entry.amount>0?'+':'−'}${count(Math.abs(entry.amount))}</b></article>`;
    }).join('');
  }
  function songCard(wallet) {
    const item=selection();if(!item)return '';
    const busy=requestFlow?.owner===owner()&&requestFlow.intentId===item.intentId;
    return `<section class="tw-chosen"><span class="tw-art">${iconSvg('music',27)}</span><div><small>Tu canción elegida</small><strong>${esc(item.track.title)}</strong><span>${esc(item.track.artist)} · ${esc(item.venueName)}</span></div>
      ${busy||item.autoResume&&wallet.balance>=wallet.requestCost?'<p class="tw-request-status" role="status">Agregando tu canción…</p>':item.requestError?`<p class="tw-request-status tw-error" role="status">${esc(item.requestError)}</p>`:item.autoResume?'<p class="tw-request-status">Al recargar, agregaremos esta canción automáticamente.</p>':''}
      ${!busy&&!item.autoResume&&(wallet.balance>=wallet.requestCost||window.tocaRequestSongPending?.(item.venueId,item.track.id))?'<button type="button" class="tw-button" data-wallet-request>Reintentar pedido</button>':''}
      <a href="#/venue/${encodeURIComponent(item.venueId)}" class="tw-back-playlist">Volver a la playlist ${iconSvg('arrow',16)}</a></section>`;
  }
  async function resumeChosen(wallet,item=selection(),manual=false){
    const currentOwner=owner(),bearer=window.tocaCustomerBearer?.();
    if(!item||!currentOwner||!bearer||route().path!=='/profile/tokens'||requestFlow?.owner===currentOwner||(!manual&&!item.autoResume))return false;
    if(selection()?.intentId!==item.intentId||!manual&&!selection()?.autoResume)return false;
    if(wallet.balance<wallet.requestCost&&!window.tocaRequestSongPending?.(item.venueId,item.track.id))return false;
    const flow={owner:currentOwner,bearer,intentId:item.intentId||crypto.randomUUID(),cancelled:false};requestFlow=flow;
    const current=()=>requestFlow===flow&&!flow.cancelled&&owner()===currentOwner&&window.tocaCustomerBearer?.()===bearer&&route().path==='/profile/tokens'&&(!selection()||selection().intentId===flow.intentId);
    save(key('song'),{...item,intentId:flow.intentId,autoResume:true,requestError:null});
    const card=document.querySelector('.tw-chosen');if(card)card.outerHTML=songCard(wallet);
    let errorMessage;
    try{
      const request=()=>window.tocaRequestSong(item.venueId,item.track,{confirmation:'center',isCurrent:current});
      let result;
      try{result=await request();}catch(error){
        if(!current()||!window.tocaRequestSongPending?.(item.venueId,item.track.id)||(error.status&&error.status<500))throw error;
        // A lost response retains its durable key. Query that same operation once.
        await new Promise(resolve=>setTimeout(resolve,350));
        if(!current())return false;
        result=await request();
      }
      if(result?.status==='DISPATCHED')return true;
      errorMessage=result?.status==='FAILED'?result.message:'Tu recarga está lista. No pudimos completar el pedido; podés volver a intentarlo.';
    }catch(error){errorMessage=error.message;}
    finally{
      if(current()&&selection()?.intentId===flow.intentId)save(key('song'),{...selection(),autoResume:false,requestError:errorMessage||'Consultá el resultado de tu pedido para continuar.'});
      if(requestFlow===flow)requestFlow=null;
    }
    return false;
  }
  window.tocaWalletPage=async(options={})=>{
    await window.tocaCustomerEnsure();
    if(!window.tocaCustomerVerified()){navigate('#/customer/login');return;}
    const user=window.tocaCustomerUser(),currentOwner=owner();
    let wallet;
    try{wallet=await walletApi();}catch(error){
      if(route().path!=='/profile/tokens')return;
      if(error.status===401){await window.tocaCustomerRequireForRequest();return;}
      mount(`<section class="toca-wallet tw-page"><a class="tw-back" href="#/profile">${iconSvg('back',18)} Mi perfil</a><h1>Tus tokens</h1><p class="tw-help" role="alert">${esc(error.message)}</p><button class="tw-button" data-wallet-retry>Volver a intentar</button></section>`,'profile');return;
    }
    if(owner()!==currentOwner||route().path!=='/profile/tokens')return;
    mount(`<section class="toca-wallet tw-page"><a class="tw-back" href="#/profile">${iconSvg('back',18)} Mi perfil</a>
      <div class="tw-identity"><span>${esc(Array.from(user.name||'T')[0])}</span><div><strong>${esc(user.name)}</strong><small>Tu perfil</small></div></div>
      <h1>Tus tokens</h1>${window.tocaWalletCard(wallet)}
      ${songCard(wallet)}<section class="tw-movements"><h2>Movimientos</h2>${movements(wallet)}</section>
      <p class="tw-help">Las recargas son simuladas. No se cobra dinero.</p></section>`,'profile');
    if(route().params.get('recharge')==='1'){
      if(topupBusy)return; // Keep the query so the finished top-up can reopen it.
      history.replaceState(null,'','#/profile/tokens');
      await openRecharge(wallet);
    }else if(options.resume!==false&&!topupBusy&&!read(key('topup'))&&selection()?.autoResume){
      await resumeChosen(wallet);
      if(owner()===currentOwner&&route().path==='/profile/tokens'&&!requestFlow&&selection()?.requestError)await window.tocaWalletPage({resume:false});
    }
  };
  function cancelAutomaticRequest(){
    const item=selection();if(item?.autoResume)save(key('song'),window.tocaRequestSongPending?.(item.venueId,item.track.id)?{...item,autoResume:false}:null);
    if(requestFlow?.owner===owner())requestFlow.cancelled=true;
  }
  function closeRecharge(cancel=false){if(cancel)cancelAutomaticRequest();if(dialog?.open)dialog.close();}
  function ensureDialog() {
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='toca-token-recharge';dialog.className='toca-wallet tw-dialog';dialog.setAttribute('aria-labelledby','tw-recharge-title');document.body.append(dialog);
    dialog.addEventListener('cancel',event=>{if(topupBusy)event.preventDefault();else cancelAutomaticRequest();});
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();
      if(!topupBusy&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))closeRecharge(true);
    });
    dialog.addEventListener('change',event=>{
      if(!event.target.matches('[name="token-pack"]'))return;
      const pack=panelWallet.packs.find(p=>p.id===event.target.value);if(!pack)return;
      dialog.querySelector('[data-topup-credit]').textContent='+'+count(pack.tokens);
      dialog.querySelector('[data-topup-total]').textContent=count(panelWallet.balance+pack.tokens);
    });
  }
  async function openRecharge(knownWallet) {
    if(opening||topupBusy||requestFlow?.owner===owner())return;opening=true;
    const currentOwner=owner();
    try{
      const wallet=knownWallet||await walletApi();
      if(currentOwner!==owner()||route().path!=='/profile/tokens')return;
      ensureDialog();panelWallet=wallet;activeOwner=currentOwner;
      const pending=read(key('topup'));
      const selected=wallet.packs.find(p=>p.id===pending?.packId)||wallet.packs.find(p=>p.id==='12')||wallet.packs[0];
      dialog.innerHTML=`<div class="tw-handle" aria-hidden="true"></div><header><h2 id="tw-recharge-title" tabindex="-1">Recargar tokens</h2><button type="button" data-wallet-close aria-label="Cerrar panel">${iconSvg('plus',21)}</button></header>
        <p class="tw-help">${selection()&&wallet.balance<1?'Necesitás 1 token para pedir tu canción. Elegí un paquete.':'Elegí un paquete.'}</p>
        <fieldset class="tw-packs"><legend class="tw-sr-only">Paquete de tokens</legend>${wallet.packs.map(pack=>`<label><input type="radio" name="token-pack" value="${esc(pack.id)}" ${pack.id===selected?.id?'checked':''} ${pending&&pending.packId!==pack.id?'disabled':''}/><strong>${count(pack.tokens)}</strong><small>UYU ${pack.price}</small></label>`).join('')}</fieldset>
        <dl class="tw-receipt"><div><dt>Saldo actual</dt><dd>${count(wallet.balance)}</dd></div><div><dt>Recarga</dt><dd class="tw-credit" data-topup-credit>+${count(selected?.tokens||0)}</dd></div><div><dt>Nuevo saldo</dt><dd data-topup-total>${count(wallet.balance+(selected?.tokens||0))}</dd></div></dl>
        <p class="tw-simulation">${iconSvg('info',17)}<span>Es una simulación. No se cobrará dinero.<br>Precios de ejemplo en UYU.</span></p>
        <p class="tw-error" role="alert" data-topup-error ${pending?'':'hidden'}>${pending?'Tenés una recarga por confirmar. Volvé a confirmarla para consultar el mismo movimiento.':''}</p>
        <button type="button" class="tw-button tw-full" data-wallet-topup ${wallet.simulationEnabled?'':'disabled'}>${wallet.simulationEnabled?'Simular recarga':'Recargas no disponibles'}</button><button type="button" class="tw-cancel" data-wallet-close>Cancelar</button>`;
      if(!dialog.open)dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});
    }catch(error){toast(error.message);}finally{opening=false;}
  }
  async function topup() {
    if(topupBusy||owner()!==activeOwner)return;
    const packId=dialog.querySelector('[name="token-pack"]:checked')?.value;if(!packId)return;
    const currentOwner=owner(),bearer=window.tocaCustomerBearer?.(),chosen=selection();
    const storageKey=key('topup'),previous=read(storageKey),operation=previous||{packId,key:crypto.randomUUID()};
    if(operation.packId!==packId)return;
    save(storageKey,operation);topupBusy=true;
    dialog.querySelectorAll('button,input').forEach(button=>button.disabled=true);
    dialog.setAttribute('aria-busy','true');dialog.querySelector('[data-wallet-topup]').textContent='Confirmando recarga…';
    try{
      const wallet=await walletApi('/topups',{method:'POST',headers:{'Idempotency-Key':operation.key},body:JSON.stringify({packId})});
      save(storageKey,null);
      if(owner()!==currentOwner||window.tocaCustomerBearer?.()!==bearer)return;
      closeRecharge();
      const shouldResume=chosen?.autoResume&&selection()?.intentId===chosen.intentId&&selection()?.autoResume&&route().path==='/profile/tokens';
      if(route().path==='/profile/tokens')await window.tocaWalletPage({resume:false});
      if(shouldResume){
        await resumeChosen(wallet,chosen);
        if(owner()===currentOwner&&route().path==='/profile/tokens')await window.tocaWalletPage({resume:false});
      }else if(owner()===currentOwner)toast(`Recarga lista · +${count(wallet.creditedTokens)}`,5000);
    }catch(error){
      if([400,401,403,409,503].includes(error.status))save(storageKey,null);
      if(owner()!==currentOwner||window.tocaCustomerBearer?.()!==bearer)return;
      const box=dialog.querySelector('[data-topup-error]');box.hidden=false;box.textContent=error.message;
    }finally{
      topupBusy=false;dialog.removeAttribute('aria-busy');
      dialog.querySelectorAll('button').forEach(button=>button.disabled=false);
      const pending=read(storageKey);
      dialog.querySelectorAll('input').forEach(input=>input.disabled=!!pending&&input.value!==pending.packId);
      const button=dialog.querySelector('[data-wallet-topup]');if(button)button.textContent='Simular recarga';
      if(owner()===currentOwner&&route().path==='/profile/tokens'&&route().params.get('recharge')==='1')void window.tocaWalletPage();
    }
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-wallet-close],[data-wallet-topup],[data-wallet-open],[data-wallet-request],[data-wallet-retry]');if(!button||button.disabled)return;
    if(button.hasAttribute('data-wallet-close')){closeRecharge(true);await window.tocaWalletPage({resume:false});return;}
    if(button.hasAttribute('data-wallet-topup')){await topup();return;}
    if(button.hasAttribute('data-wallet-retry')){await window.tocaWalletPage();return;}
    if(button.hasAttribute('data-wallet-open')){await openRecharge();return;}
    const item=selection();if(!item)return;
    button.disabled=true;button.textContent='Agregando…';
    try{await resumeChosen(await walletApi(),item,true);if(route().path==='/profile/tokens')await window.tocaWalletPage({resume:false});}catch(error){toast(error.message);}finally{if(button.isConnected){button.disabled=false;button.textContent='Reintentar pedido';}}
  });
  window.addEventListener('hashchange',()=>{closeRecharge();if(route().path!=='/profile/tokens')cancelAutomaticRequest();});

  // Success is shown only after the existing durable request confirms dispatch.
  window.tocaWalletConfirmSong=(track,isCurrent)=>new Promise(resolve=>{
    if(!isCurrent()){resolve(false);return;}
    const confirmation=document.createElement('dialog');confirmation.className='toca-wallet tw-confirmation';confirmation.id='toca-song-added';confirmation.setAttribute('aria-labelledby','tw-added-title');
    confirmation.innerHTML=`<div class="tw-confirmation-check" aria-hidden="true">${iconSvg('check',32)}</div><h2 id="tw-added-title" tabindex="-1">¡Tema agregado!</h2><p>${esc(track.title)}</p><small>Volviendo a la playlist…</small>`;
    document.body.append(confirmation);
    let done=false,timer;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('hashchange',finish);const valid=isCurrent();confirmation.close();confirmation.remove();resolve(valid);};
    confirmation.addEventListener('cancel',event=>{event.preventDefault();finish();});window.addEventListener('hashchange',finish);
    confirmation.showModal();confirmation.querySelector('h2').focus({preventScroll:true});timer=setTimeout(finish,1500);
  });
})();
