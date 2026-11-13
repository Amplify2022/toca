/* Pointer/touch and keyboard reordering. The editor owns snapshots and durable writes. */
(() => {
 'use strict';
 let current=null,drag=null,frame=null;
 const alive=ctx=>ctx&&ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId;
 const clear=()=>{
  if(frame)cancelAnimationFrame(frame);frame=null;
  if(!drag)return;
  const {root,handle,pointer,preview}=drag;drag=null;
  preview?.remove();
  root.removeAttribute('data-cabina-dragging');
  root.querySelectorAll('.cabina-dragging,.cabina-drop-before,.cabina-drop-after').forEach(el=>el.classList.remove('cabina-dragging','cabina-drop-before','cabina-drop-after'));
  handle.setAttribute('aria-pressed','false');
  try{if(pointer!==null&&handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer)}catch{}
 };
 const announce=text=>{if(drag&&alive(drag.ctx))drag.root.querySelector('[data-studio-status]').textContent=text};
 function begin(handle,pointer){
  if(!alive(current)||handle.disabled||!current.playlist)return false;
  clear();
  const from=Number(handle.dataset.cabinaDrag),track=current.playlist.tracks[from];if(!track)return false;
  drag={ctx:current,root:current.root,handle,pointer,from,to:from,snapshot:current.playlist.snapshot,playlistId:current.playlist.id,moved:false,valid:false};
  drag.root.dataset.cabinaDragging='pending';
  return true;
 }
 function preview(){
  if(!drag||drag.pointer===null)return;
  if(!drag.preview){
   const box=document.createElement('div');box.className='cabina-drag-preview';box.setAttribute('aria-hidden','true');
   box.append(drag.handle.closest('[data-track-index]').querySelector('.cabina-song').cloneNode(true));
   drag.caption=document.createElement('small');box.append(drag.caption);drag.root.append(box);drag.preview=box;
  }
  drag.caption.textContent=drag.valid?`Soltá para mover a la posición ${drag.to+1}`:'Volvé a la lista para ubicar la canción';
  drag.preview.style.left=Math.max(8,Math.min(innerWidth-drag.preview.offsetWidth-8,drag.x+16))+'px';
  drag.preview.style.top=Math.max(8,Math.min(innerHeight-drag.preview.offsetHeight-8,drag.y+18))+'px';
 }
 function mark(to){
  if(!drag)return;
  drag.to=to;drag.root.dataset.cabinaDragging=drag.pointer===null?'keyboard':'pointer';
  drag.root.querySelectorAll('.cabina-drop-before,.cabina-drop-after').forEach(el=>el.classList.remove('cabina-drop-before','cabina-drop-after'));
  drag.handle.closest('[data-track-index]').classList.add('cabina-dragging');
  drag.handle.setAttribute('aria-pressed','true');
  if(to!==drag.from)drag.root.querySelector(`[data-track-index="${to}"]`)?.classList.add(to<drag.from?'cabina-drop-before':'cabina-drop-after');
  preview();
 }
 function bounds(){
  const list=drag.root.querySelector('[data-studio-tracks]'),rect=list.getBoundingClientRect();
  const player=drag.root.querySelector('.cabina-player')?.getBoundingClientRect();
  const bottom=Math.min(innerHeight-8,player?.height?player.top-5:innerHeight-8);
  return {list,rect,left:rect.left,right:rect.right,top:Math.max(8,rect.top),bottom:Math.min(bottom,rect.bottom)};
 }
 function target(){
  if(!drag||!drag.moved||!alive(drag.ctx))return;
  const {list,left,right,top,bottom}=bounds();
  drag.valid=drag.x>=left&&drag.x<=right&&drag.y>=top&&drag.y<=bottom;
  if(!drag.valid)return mark(drag.from);
  const row=document.elementFromPoint(drag.x,drag.y)?.closest('[data-track-index]');
  if(!row||!list.contains(row))return;
  const index=Number(row.dataset.trackIndex),box=row.getBoundingClientRect();
  const insertion=index+(drag.y>box.top+box.height/2?1:0);
  const to=Math.max(0,Math.min(drag.ctx.playlist.tracks.length-1,insertion>drag.from?insertion-1:insertion));
  mark(to);
 }
 function scroll(now){
  if(!drag||drag.pointer===null||!drag.moved||!alive(drag.ctx)){clear();return}
  const {list,rect,left,right,top,bottom}=bounds();
  const elapsed=drag.frameAt?Math.min(32,now-drag.frameAt):16;drag.frameAt=now;
  if(drag.x>=left&&drag.x<=right&&drag.y>=top-24&&drag.y<=bottom+24){
   const edge=Math.min(48,Math.max(20,(bottom-top)/3));
   const speed=drag.y<top+edge?-Math.min(1,(top+edge-drag.y)/edge):drag.y>bottom-edge?Math.min(1,(drag.y-bottom+edge)/edge):0;
   const delta=speed*elapsed*.85,previous=list.scrollTop;
   if(delta)list.scrollTop+=delta;
   // Once the list reaches its limit, reveal any part clipped by the page.
   if(delta&&Math.abs(list.scrollTop-previous)<.5&&((delta<0&&rect.top<top)||(delta>0&&rect.bottom>bottom)))
    document.scrollingElement.scrollTop+=delta;
   target();
  }
  frame=requestAnimationFrame(scroll);
 }
 function finish(commit){
  if(!drag)return;
  const d=drag,valid=commit&&d.moved&&d.valid&&alive(d.ctx)&&d.ctx.playlist.id===d.playlistId&&d.ctx.playlist.snapshot===d.snapshot;
  clear();
  if(valid&&d.to!==d.from)d.root.dispatchEvent(new CustomEvent('cabina-reorder',{bubbles:true,detail:{from:d.from,to:d.to,playlistId:d.playlistId,snapshot:d.snapshot}}));
  else if(d.moved&&alive(d.ctx))d.root.querySelector('[data-studio-status]').textContent='Movimiento cancelado. La playlist conserva su orden.';
 }
 window.tocaCabinaDragInit=ctx=>{clear();current=ctx};
 window.tocaCabinaDragCancel=clear;
 document.addEventListener('pointerdown',event=>{
  let handle=event.target.closest('[data-cabina-drag]');
  if(!handle&&event.pointerType!=='touch'&&!event.target.closest('button,a,input,select,textarea'))
   handle=event.target.closest('[data-track-index]')?.querySelector('[data-cabina-drag]');
  if(!handle||event.button!==0||event.isPrimary===false||!begin(handle,event.pointerId))return;
  event.preventDefault();handle.focus({preventScroll:true});drag.startX=drag.x=event.clientX;drag.startY=drag.y=event.clientY;
  try{handle.setPointerCapture(event.pointerId)}catch{}
 });
 document.addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId)return;
  drag.x=event.clientX;drag.y=event.clientY;
  if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;
  event.preventDefault();drag.moved=true;target();if(!frame)frame=requestAnimationFrame(scroll);
 },{passive:false});
 document.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish(true)});
 document.addEventListener('pointercancel',event=>{if(drag?.pointer===event.pointerId)finish(false)});
 document.addEventListener('lostpointercapture',event=>{if(drag?.pointer===event.pointerId)finish(false)});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();finish(false);return}
  const handle=event.target.closest('[data-cabina-drag]');if(!handle||handle.disabled)return;
  if([' ','Enter'].includes(event.key)){
   event.preventDefault();
   if(drag?.pointer===null){finish(true);return}
   if(begin(handle,null)){drag.moved=true;drag.valid=true;mark(drag.from);announce('Canción seleccionada para mover. Usá las flechas y confirmá con Enter.');}
  }else if(drag?.pointer===null&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
   event.preventDefault();
   const to=event.key==='Home'?0:event.key==='End'?drag.ctx.playlist.tracks.length-1:Math.max(0,Math.min(drag.ctx.playlist.tracks.length-1,drag.to+(event.key==='ArrowUp'?-1:1)));
   mark(to);announce(`Nueva posición: ${to+1}. Enter confirma; Escape cancela.`);
   drag.root.querySelector(`[data-track-index="${to}"]`)?.scrollIntoView({block:'nearest'});
  }
 });
 document.addEventListener('dragstart',event=>{if(event.target.closest('[data-track-index]')?.closest('[data-admin-studio]'))event.preventDefault()});
 window.addEventListener('blur',clear);window.addEventListener('hashchange',clear);window.addEventListener('pagehide',clear);
})();
