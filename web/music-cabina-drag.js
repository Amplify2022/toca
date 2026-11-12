/* Pointer/touch and keyboard reordering. The editor owns snapshots and durable writes. */
(() => {
 'use strict';
 let current=null,drag=null,frame=null;
 const alive=ctx=>ctx&&ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId;
 const clear=()=>{
  if(frame)cancelAnimationFrame(frame);frame=null;
  if(!drag)return;
  const {root,handle,pointer}=drag;
  root.removeAttribute('data-cabina-dragging');
  root.querySelectorAll('.cabina-dragging,.cabina-drop-before,.cabina-drop-after').forEach(el=>el.classList.remove('cabina-dragging','cabina-drop-before','cabina-drop-after'));
  handle.setAttribute('aria-pressed','false');
  try{if(pointer!==null&&handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer)}catch{}
  drag=null;
 };
 const announce=text=>{if(drag&&alive(drag.ctx))drag.root.querySelector('[data-studio-status]').textContent=text};
 function begin(handle,pointer){
  if(!alive(current)||handle.disabled||!current.playlist)return false;
  clear();
  const from=Number(handle.dataset.cabinaDrag),track=current.playlist.tracks[from];if(!track)return false;
  drag={ctx:current,root:current.root,handle,pointer,from,to:from,snapshot:current.playlist.snapshot,playlistId:current.playlist.id,moved:false,valid:false};
  return true;
 }
 function mark(to){
  if(!drag)return;
  drag.to=to;drag.root.dataset.cabinaDragging=drag.pointer===null?'keyboard':'pointer';
  drag.root.querySelectorAll('.cabina-drop-before,.cabina-drop-after').forEach(el=>el.classList.remove('cabina-drop-before','cabina-drop-after'));
  drag.handle.closest('[data-track-index]').classList.add('cabina-dragging');
  drag.handle.setAttribute('aria-pressed','true');
  if(to!==drag.from)drag.root.querySelector(`[data-track-index="${to}"]`)?.classList.add(to<drag.from?'cabina-drop-before':'cabina-drop-after');
 }
 function target(){
  if(!drag||!drag.moved||!alive(drag.ctx))return;
  const list=drag.root.querySelector('[data-studio-tracks]'),rect=list.getBoundingClientRect();
  drag.valid=drag.x>=rect.left&&drag.x<=rect.right&&drag.y>=rect.top&&drag.y<=rect.bottom;
  if(!drag.valid)return mark(drag.from);
  const row=document.elementFromPoint(drag.x,drag.y)?.closest('[data-track-index]');
  if(!row||!list.contains(row))return;
  const index=Number(row.dataset.trackIndex),box=row.getBoundingClientRect();
  const insertion=index+(drag.y>box.top+box.height/2?1:0);
  const to=Math.max(0,Math.min(drag.ctx.playlist.tracks.length-1,insertion>drag.from?insertion-1:insertion));
  mark(to);
 }
 function scroll(){
  if(!drag||drag.pointer===null||!drag.moved||!alive(drag.ctx)){clear();return}
  const list=drag.root.querySelector('[data-studio-tracks]'),rect=list.getBoundingClientRect();
  if(drag.valid){
   const delta=drag.y<rect.top+35?-10:drag.y>Math.min(rect.bottom,innerHeight)-35?10:0;
   if(delta)list.scrollTop+=delta;
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
  const handle=event.target.closest('[data-cabina-drag]');
  if(!handle||event.button!==0||event.isPrimary===false||!begin(handle,event.pointerId))return;
  event.preventDefault();handle.focus();drag.startX=drag.x=event.clientX;drag.startY=drag.y=event.clientY;
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
 document.addEventListener('dragstart',event=>{if(event.target.closest('[data-cabina-drag]'))event.preventDefault()});
 window.addEventListener('hashchange',clear);window.addEventListener('pagehide',clear);
})();
