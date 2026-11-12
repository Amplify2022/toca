/* Keep an edit attached to the selected occurrence while refreshing Spotify snapshots. */
(() => {
 'use strict';
 const ids=playlist=>playlist?.tracks.map(t=>t.id||null)||[];
 const same=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
 const count=(list,id)=>list.filter(value=>value===id).length;
 const changed=()=>{throw Error('La playlist cambió y la selección ya no es inequívoca. Se actualizó la lista; revisá el tema antes de volver a editar.');};
 function capture(playlist,body){return {playlistId:playlist?.id,ids:ids(playlist),body:{...body}};}
 function resolve(intent,playlist){
  const body={...intent.body};
  if(body.action==='create')return body;
  if(!playlist||playlist.id!==intent.playlistId)return changed();
  const before=intent.ids,after=ids(playlist);
  if(['remove','move'].includes(body.action)&&!same(before,after)){
   const from=body.action==='remove'?body.position:body.from,id=before[from];
   if(body.action==='remove'&&id&&count(after,id)===0)return null;
   if(!id||count(before,id)!==1||count(after,id)!==1)return changed();
   const nextFrom=after.indexOf(id);
   if(body.action==='remove')body.position=nextFrom;
   else{
    const anchor=before[body.to];
    if(!anchor||count(before,anchor)!==1||count(after,anchor)!==1)return changed();
    const anchorIndex=after.indexOf(anchor),afterAnchor=body.to>body.from;
    body.from=nextFrom;
    body.to=anchorIndex+(afterAnchor?1:0)-(nextFrom<anchorIndex?1:0);
    if(body.from===body.to)return null;
   }
  }
  return {...body,snapshot:playlist.snapshot};
 }
 window.tocaMusicEditIntent={capture,resolve};
})();
