/* Smooth UI clock anchored to provider samples, with reversible command feedback. */
(() => {
 'use strict';
 const now=()=>performance.now();
 function position(ctx,at=now()){
  const data=ctx.playback||{},duration=Number(data.now?.durationMs)||0;
  const progress=Math.max(0,Number(data.progressMs)||0)+(data.isPlaying?Math.max(0,at-(ctx.playbackAt??at)):0);
  return duration?Math.min(duration,progress):progress;
 }
 function set(ctx,data){ctx.playback={...data,progressMs:Math.max(0,Number(data.progressMs)||0)};ctx.playbackAt=now();ctx.onPlayback?.();}
 function matches(pending,data){
  const wanted=pending.wanted;
  if(!!data.isPlaying!==!!wanted.isPlaying)return false;
  if(pending.action==='start')return data.now?.id===wanted.now?.id&&data.contextUri===wanted.contextUri&&Number(data.progressMs)<=2000+now()-pending.started;
  if(pending.action==='seek')return Math.abs(Number(data.progressMs)-(wanted.progressMs+(wanted.isPlaying?now()-pending.started:0)))<1500;
  return true;
 }
 function sample(ctx,data){
  const pending=ctx.pendingPlayback;
  if(pending){
   if(!matches(pending,data)&&(!pending.accepted||now()<pending.deadline))return false;
   ctx.pendingPlayback=null;
  }
  set(ctx,data);return true;
 }
 function begin(ctx,body){
  if(!['pause','resume','start','seek'].includes(body.action))return null;
  const previous={...(ctx.playback||{}),progressMs:position(ctx)},wanted={...previous};
  if(body.action==='pause')wanted.isPlaying=false;
  if(body.action==='resume')wanted.isPlaying=true;
  if(body.action==='seek')wanted.progressMs=body.positionMs;
  if(body.action==='start'){
   wanted.isPlaying=true;wanted.progressMs=0;wanted.now=ctx.playlist?.tracks[body.position];wanted.contextUri=`spotify:playlist:${ctx.playlist?.id}`;
  }
  const pending={action:body.action,previous,wanted,started:now(),accepted:false,deadline:Infinity};
  ctx.pendingPlayback=pending;set(ctx,wanted);return pending;
 }
 function accepted(ctx,pending){if(pending&&ctx.pendingPlayback===pending){pending.accepted=true;pending.deadline=now()+4000;}}
 function rejected(ctx,pending){
  if(!pending||ctx.pendingPlayback!==pending)return;
  ctx.pendingPlayback=null;set(ctx,{...pending.previous,progressMs:pending.previous.progressMs+(pending.previous.isPlaying?now()-pending.started:0)});
 }
 function sdk(ctx,state,device){
  if(!state)return false;
  const track=state.track_window?.current_track;
  const data={...ctx.playback,isPlaying:!state.paused,progressMs:state.position,
   contextUri:state.context?.uri||ctx.playback?.contextUri||'',
   now:track?{id:track.id,title:track.name,artist:(track.artists||[]).map(a=>a.name).join(', '),durationMs:state.duration||track.duration_ms,imageUrl:track.album?.images?.[0]?.url}:null,
   device:{...ctx.playback?.device,...device}};
  ctx.sdkSampledAt=now();return sample(ctx,data);
 }
 window.tocaMusicPlayback={position,sample,begin,accepted,rejected,sdk};
})();
