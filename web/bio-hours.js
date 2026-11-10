/* Conservative Spanish weekly-hours extraction. No network calls or inferred closing times. */
(function(root,factory){
  const extract=factory();
  if(typeof module==='object'&&module.exports)module.exports=extract;
  else root.tocaExtractBioHours=extract;
})(typeof window==='undefined'?globalThis:window,()=>{
  'use strict';
  const dayToken=/\b(lunes|lun|martes|mar|miercoles|mier|mie|jueves|jue|viernes|vie|sabados?|sab|domingos?|dom)\b/g;
  const dayIndex={lunes:0,lun:0,martes:1,mar:1,miercoles:2,mier:2,mie:2,jueves:3,jue:3,viernes:4,vie:4,sabado:5,sabados:5,sab:5,domingo:6,domingos:6,dom:6};
  const names=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const token='\\d{1,2}(?:[:.]\\d{2})?\\s*(?:(?:[ap]\\.?\\s*m\\.?|horas?\\b|hs?\\b\\.?))?';
  const rangePattern=new RegExp('(?<![\\d:.])('+token+')\\s*(?:[-–—]|\\b(?:a|hasta)\\b)\\s*(?:las\\s+)?('+token+')(?![\\d:.a-z])','g');
  const singlePattern=new RegExp('(?<![\\d:.])('+token+')(?![\\d:.a-z])','g');
  const openingCue=/\b(?:horarios?|abrimos|abiert[oa]s?|atencion|apertura)\b/;
  const eventCue=/\b(?:jazz|dj|show|shows|recital|recitales|concierto|conciertos|evento|eventos|entradas|festival|reservas)\b/;
  const calendarCue=/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;

  function clock(raw,closing=false){
    const value=normalize(raw).replace(/\s/g,'').replace(/(\d)\.(\d{2})/g,'$1:$2').replace(/\./g,'');
    const match=/^(\d{1,2})(?::(\d{2}))?(am|pm|h|hs|hora|horas)?$/.exec(value);
    if(!match)return null;
    let hour=Number(match[1]);const minute=Number(match[2]||0),meridiem=match[3]==='am'||match[3]==='pm'?match[3]:null;
    if(minute>59)return null;
    if(meridiem){if(hour<1||hour>12)return null;hour=hour%12+(meridiem==='pm'?12:0)}
    else if(hour===24&&closing&&minute===0)hour=0;
    else if(hour>23)return null;
    return {time:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),meridiem,hour};
  }
  function daysIn(text){
    const matches=[...text.matchAll(dayToken)],all=/\b(?:todos?\s+los\s+dias|a\s+diario|cada\s+dia)\b/.test(text);
    const exception=/\b(?:excepto|salvo|menos)\b/.exec(text);
    const main=exception?matches.filter(m=>m.index<exception.index):matches;
    const selected=new Set(all?[0,1,2,3,4,5,6]:[]);
    let ambiguous=false;
    if(!all){
      for(let i=0;i<main.length;i++){
        const current=main[i],next=main[i+1],start=dayIndex[current[1]];
        selected.add(start);
        if(next){
          const connector=text.slice(current.index+current[0].length,next.index).trim().replace(/^\./,'').trim();
          if(/^(?:a|al|hasta|[-–—])$/.test(connector)){
            if(main[i+2]&&/^\s*[-–—]\s*$/.test(text.slice(next.index+next[0].length,main[i+2].index)))ambiguous=true;
            const end=dayIndex[next[1]];
            if(start!==end)for(let d=(start+1)%7;d!==end;d=(d+1)%7)selected.add(d);
            selected.add(end);i++;
          }
        }
      }
    }
    if(exception){for(const match of matches.filter(m=>m.index>exception.index))selected.delete(dayIndex[match[1]])}
    return {days:ambiguous?[]:[...selected].sort((a,b)=>a-b),ambiguous,mentioned:matches.length>0||all};
  }
  function isDayHeader(text){
    return daysIn(text).mentioned&&!eventCue.test(text)&&text.replace(dayToken,'').replace(/\b(?:todos?|los|las|dias|dia|cada|diario|y|a|al|hasta|de|del|horarios?|atencion)\b/g,'').replace(/[\s,.&/–—-]/g,'')==='';
  }
  function eventsIn(text){
    const events=[];
    for(const match of text.matchAll(rangePattern))events.push({start:match.index,end:match.index+match[0].length,kind:'range',from:match[1],to:match[2]});
    for(const match of text.matchAll(singlePattern)){
      if(events.some(e=>match.index>=e.start&&match.index<e.end))continue;
      const raw=match[1].trim(),prefix=text.slice(0,match.index);
      const closes=/\b(?:hasta(?:\s+las)?|cierre(?:\s+a(?:\s+las)?)?|cierr[ae]n?(?:\s+a(?:\s+las)?)?)\s*$/.test(prefix);
      const opens=/\b(?:desde(?:\s+las)?|a\s+partir\s+de(?:\s+las)?|abrimos(?:\s+a(?:\s+las)?)?|apertura(?:\s+a(?:\s+las)?)?)\s*$/.test(prefix);
      if(/[:.]\d{2}|[ap]\.?\s*m\.?|(?:hs?|horas?)\.?$/.test(raw)||closes||opens)
        events.push({start:match.index,end:match.index+match[0].length,kind:closes?'closing':'opening',from:raw});
    }
    for(const match of text.matchAll(/\bcerrad[oa]s?\b/g))events.push({start:match.index,end:match.index+match[0].length,kind:'closed'});
    return events.sort((a,b)=>a.start-b.start);
  }
  return function extract(input){
    const proposals=new Map(),conflicts=new Set(),notes=new Set();
    const lines=String(input||'').slice(0,2000).split(/\r?\n|[;|•]|\.(?=\s+(?:lunes|lun\b|martes|mar\b|mi[eé]rcoles|mi[eé]\b|jueves|jue\b|viernes|vie\b|s[aá]bados?|sab\b|domingos?|dom\b|cerrad[oa]s?))/i).map(s=>s.trim()).filter(Boolean);
    let pending=null;
    function offer(days,value,source){
      for(const day of days){
        if(conflicts.has(day))continue;
        const proposal={day,...value,source};const old=proposals.get(day);
        if(!old){proposals.set(day,proposal);continue}
        if(old.closed===proposal.closed&&old.open===proposal.open&&old.close===proposal.close)continue;
        // Only explicitly complementary opening/closing statements can merge.
        if(!old.closed&&!proposal.closed&&old.open===null&&proposal.close===null&&old.close!==null&&proposal.open!==null){proposals.set(day,{...proposal,close:old.close,source:old.source+'\n'+source});continue}
        if(!old.closed&&!proposal.closed&&old.close===null&&proposal.open===null&&old.open!==null&&proposal.close!==null){proposals.set(day,{...old,close:proposal.close,source:old.source+'\n'+source});continue}
        proposals.delete(day);conflicts.add(day);
        notes.add(`Hay varios horarios para ${names[day]}. Revisá ese día manualmente: el editor admite un intervalo diario.`);
      }
    }
    for(const original of lines){
      const text=normalize(original),mentioned=daysIn(text);
      if(calendarCue.test(text)||/\b(?:no\s+(?:abrimos|abiert[oa]s?|atendemos)|primer[oa]?|segund[oa]|tercer[oa]?|ultim[oa])\b/.test(text)||/https?:\/\/|www\.|📍|\b(?:telefono|whatsapp|celular)\b/.test(text)){
        if(mentioned.mentioned)notes.add(`No se tomó como horario semanal: «${original}».`);
        pending=null;continue;
      }
      if(eventCue.test(text)&&!openingCue.test(text)){
        if(mentioned.mentioned)notes.add(`La mención «${original}» puede ser un evento. Completá su horario de atención si corresponde.`);
        pending=null;continue;
      }
      const events=eventsIn(text);
      if(!events.length){
        if(isDayHeader(text))pending={...mentioned,source:original};
        else {if(mentioned.mentioned)notes.add(`Se mencionan días sin un horario claro: «${original}».`);pending=null}
        continue;
      }
      if(events[0]?.kind==='closed'&&!daysIn(text.slice(0,events[0].start)).mentioned&&events.length>1){
        notes.add(`Revisá cómo se distribuyen los días cerrados y abiertos en «${original}».`);pending=null;continue;
      }
      let previousEnd=0,lastDays=null;
      for(const event of events){
        const prefix=text.slice(previousEnd,event.start),parsed=daysIn(prefix);
        let days=parsed.days,source=original;
        if(event.kind==='closed'&&!parsed.mentioned&&events.length===1)days=daysIn(text.slice(event.end)).days;
        if(parsed.ambiguous){notes.add(`Revisá la lista de días en «${original}».`);lastDays=null;previousEnd=event.end;continue}
        if(!days.length&&!parsed.mentioned){
          if(lastDays)days=lastDays;
          else if(pending){days=pending.days;source=pending.source+'\n'+original}
        }
        previousEnd=event.end;
        if(!days.length)continue;
        lastDays=days;
        if(event.kind==='closed'){offer(days,{open:null,close:null,closed:true},source);continue}
        const from=clock(event.from,event.kind==='closing');
        const to=event.kind==='range'?clock(event.to,true):null;
        if(!from||(event.kind==='range'&&(!to||from.time===to.time))){notes.add(`No se pudo interpretar con seguridad la hora en «${original}».`);continue}
        if(event.kind==='range'){
          const mixed=!!from.meridiem!==!!to.meridiem;
          if(mixed&&((!from.meridiem&&from.hour<=12)||(!to.meridiem&&to.hour<=12))){notes.add(`El rango «${original}» mezcla horas con y sin AM/PM. Confirmalo manualmente.`);continue}
          const explicit=/[:.]\d{2}|(?:hs?|horas?)\.?$|[ap]\.?\s*m\.?/.test(event.from+' '+event.to);
          if(!explicit&&from.hour<=12&&to.hour<=12&&!openingCue.test(text)){notes.add(`Confirmá si «${original}» es un horario de atención.`);continue}
          offer(days,{open:from.time,close:to.time,closed:false},source);
        }else offer(days,{open:event.kind==='opening'?from.time:null,close:event.kind==='closing'?from.time:null,closed:false},source);
      }
      pending=null;
    }
    // Reject merging opening/closing fragments into an invalid zero-length day.
    for(const [day,value] of proposals){if(!value.closed&&value.open!==null&&value.open===value.close){proposals.delete(day);notes.add(`Revisá el horario de ${names[day]}: apertura y cierre coinciden.`)}}
    const days=[...proposals.values()].sort((a,b)=>a.day-b.day);
    return {days,notes:[...notes].slice(0,6),complete:days.length>0&&days.every(day=>day.closed||(day.open!==null&&day.close!==null))};
  };
});
