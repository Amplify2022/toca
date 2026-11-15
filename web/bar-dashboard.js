/* Owner-only analytics. Real confirmed commands; no fabricated revenue. */
(() => {
  'use strict';
  let current=null;
  const onDashboard=()=>['/admin','/admin/general'].includes(route().path);
  const alive=ctx=>ctx===current&&ctx.root.isConnected&&ctx.session===state.token&&ctx.id===state.venueId&&onDashboard();
  const q=(ctx,selector)=>ctx.root.querySelector(selector);
  const integer=n=>new Intl.NumberFormat('es-UY').format(n);
  const decimal=n=>new Intl.NumberFormat('es-UY',{maximumFractionDigits:1,minimumFractionDigits:1}).format(n);
  const paths={
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    wallet:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M17 6V3L5 6m16 6h-6v4h6"/><circle cx="17" cy="14" r=".5"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>'
  };
  const icon=name=>paths[name]?`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`:iconSvg(name,20);
  const date=value=>new Date(value+'T12:00:00Z');
  const dayLabel=value=>new Intl.DateTimeFormat('es-UY',{day:'numeric',month:'short',timeZone:'America/Montevideo'}).format(date(value));
  const empty=message=>`<div class="ba-empty">${icon('music')}<p>${message}</p></div>`;
  function dispose(){if(current){clearTimeout(current.timer);current=null;}}

  function valid(data,period){
    const count=n=>Number.isSafeInteger(n)&&n>=0;
    if(!data||data.period!==period||!['users','requests','returningUsers','previousUsers','previousRequests'].every(key=>count(data[key]))||
      data.returningUsers>data.users||!/^\d{4}-\d{2}-\d{2}$/.test(data.from)||!/^\d{4}-\d{2}-\d{2}$/.test(data.to)||
      !Number.isFinite(Date.parse(data.updatedAt))||!Array.isArray(data.days)||!data.days.length||
      !data.days.every(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&count(d.requests))||
      data.days.reduce((n,d)=>n+d.requests,0)!==data.requests||!Array.isArray(data.topSongs)||
      !data.topSongs.every(s=>s&&typeof s.title==='string'&&typeof s.artist==='string'&&count(s.requests)))
      throw Error('Las métricas no están disponibles en este momento.');
    return data;
  }
  function trend(value,previous){
    if(!previous)return value?'<span class="ba-growth">Sin período comparable</span>':'';
    const change=(value/previous-1)*100;
    return `<span class="ba-growth ${change<0?'negative':''}" title="Comparado con el mismo tramo del período anterior">${change<0?'↓':'↑'} ${decimal(Math.abs(change))}%</span>`;
  }
  function renderKpis(ctx,data){
    const cards=[
      {label:'Usuarios que pidieron',value:data?integer(data.users):'—',icon:'users',detail:'Usuarios únicos en el período',trend:data?trend(data.users,data.previousUsers):''},
      {label:'Canciones pedidas',value:data?integer(data.requests):'—',icon:'music',detail:'Agregadas a la playlist',trend:data?trend(data.requests,data.previousRequests):''},
      {label:'Generado esta semana',value:'—',icon:'wallet',detail:'Comisión del bar pendiente',pending:true},
      {label:'Generado este mes',value:'—',icon:'calendar',detail:'Comisión del bar pendiente',pending:true}
    ];
    q(ctx,'#kpis').innerHTML=cards.map((c,i)=>`<article class="ba-kpi ${i===2?'ba-kpi-highlight':''}"><div class="ba-kpi-top"><h2>${c.label}</h2><span>${icon(c.icon)}</span></div><strong class="ba-value ${c.pending?'ba-pending':''}">${c.value}</strong><div class="ba-kpi-detail">${c.pending?'<span class="ba-simulated">Por definir</span>':c.trend}<span>${c.detail}</span></div></article>`).join('');
  }
  function renderChart(ctx,data){
    if(!data.requests){q(ctx,'#activity-chart').innerHTML=empty('Todavía no hay pedidos confirmados en este período.');q(ctx,'[data-chart-insight]').textContent='Los pedidos aparecerán aquí cuando se confirme que se agregaron a la playlist.';return;}
    const high=Math.max(...data.days.map(d=>d.requests)),ceiling=Math.max(4,Math.ceil(high/4)*4);
    q(ctx,'#activity-chart').innerHTML=`<div class="ba-y-axis">${[1,.75,.5,.25,0].map(f=>`<span>${integer(ceiling*f)}</span>`).join('')}</div><div class="ba-chart-content"><div class="ba-plot" style="--days:${data.days.length}">${data.days.map((d,i)=>`<div class="ba-bar-column"><button type="button" class="ba-bar ${d.requests===high?'ba-bar-peak':''}" style="--height:${d.requests?d.requests/ceiling*100:0}%;${d.requests?'':'height:0'}" data-day-index="${i}" ${d.requests?'':'disabled'} aria-label="${esc(dayLabel(d.date))}: ${integer(d.requests)} pedidos"></button></div>`).join('')}<div class="ba-tooltip" id="chart-tooltip" role="tooltip" hidden></div></div><div class="ba-x-axis" style="--days:${data.days.length}">${data.days.map(d=>`<span>${ctx.period==='week'?esc(new Intl.DateTimeFormat('es-UY',{weekday:'short',timeZone:'America/Montevideo'}).format(date(d.date))):Number(d.date.slice(-2))}${ctx.period==='week'?`<small>${Number(d.date.slice(-2))}</small>`:''}</span>`).join('')}</div></div>`;
    const peak=data.days.find(d=>d.requests===high);
    q(ctx,'[data-chart-insight]').innerHTML=`<strong>El ${esc(dayLabel(peak.date))} concentró más pedidos:</strong> ${integer(high)} canciones agregadas a la playlist.`;
  }
  function renderSongs(ctx,data){
    q(ctx,'#top-songs').innerHTML=data.topSongs.length?data.topSongs.map((song,i)=>`<div class="ba-song-row"><span class="ba-rank">${i+1}</span><div class="ba-song-info"><div class="ba-record ba-record-${i}" aria-hidden="true">${icon('music')}</div><div><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></div></div><strong class="ba-song-count">${integer(song.requests)}</strong></div>`).join(''):empty('Las canciones más pedidas aparecerán aquí.');
  }
  function renderAudience(ctx,data){
    const percentage=data.users?Math.round(data.returningUsers/data.users*100):0,first=data.users-data.returningUsers;
    q(ctx,'#audience').innerHTML=`<div class="ba-audience-main"><div class="ba-donut" style="--percentage:${percentage}%" role="img" aria-label="${percentage}% de usuarios recurrentes"><div><strong>${percentage}<small>%</small></strong><span>recurrentes</span></div></div><div class="ba-audience-legend"><div><i></i><span>Nuevos en el bar</span><strong>${integer(first)}</strong></div><div><i class="returning"></i><span>Recurrentes</span><strong>${integer(data.returningUsers)}</strong></div><p>${data.users?`${integer(data.returningUsers)} de ${integer(data.users)} usuarios ya habían pedido en tu bar.`:'Todavía no hay usuarios con pedidos confirmados en este período.'}</p></div></div><div class="ba-average"><div><span>Pedidos por usuario</span><small>Promedio del período</small></div><strong>${decimal(data.users?data.requests/data.users:0)}</strong></div>`;
  }
  function render(ctx){
    const data=ctx.data;renderKpis(ctx,data);
    if(!data){q(ctx,'[data-date-range]').textContent='Consultando período…';q(ctx,'[data-updated]').textContent='Actualizando…';q(ctx,'#activity-chart').innerHTML=empty('Consultando las métricas del bar…');q(ctx,'#top-songs').innerHTML='';q(ctx,'#audience').innerHTML='';return;}
    q(ctx,'[data-date-range]').textContent=`${dayLabel(data.from)} – ${dayLabel(data.to)} ${data.to.slice(0,4)}`;
    q(ctx,'[data-updated]').textContent='Actualizado '+new Intl.DateTimeFormat('es-UY',{hour:'2-digit',minute:'2-digit',timeZone:data.timeZone}).format(new Date(data.updatedAt));
    renderChart(ctx,data);renderSongs(ctx,data);renderAudience(ctx,data);
  }
  function schedule(ctx){clearTimeout(ctx.timer);if(alive(ctx))ctx.timer=setTimeout(()=>{if(document.hidden)schedule(ctx);else void load(ctx);},30000);}
  async function load(ctx){
    if(!alive(ctx))return;
    clearTimeout(ctx.timer);const generation=++ctx.generation,period=ctx.period;
    ctx.root.setAttribute('aria-busy','true');q(ctx,'[data-dashboard-error]').hidden=true;
    try{
      const data=await api(`/api/admin/venues/${encodeURIComponent(ctx.id)}/analytics?period=${period}`,{cache:'no-store'});
      if(!alive(ctx)||generation!==ctx.generation)return;
      ctx.data=valid(data,period);render(ctx);
    }catch(error){
      if(!alive(ctx)||generation!==ctx.generation||error.name==='AbortError')return;
      if(error.status===401){clearAdminSession();navigate('#/login');return;}
      if(error.status===403){ctx.data=null;render(ctx);}
      const box=q(ctx,'[data-dashboard-error]');box.hidden=false;
      box.innerHTML='<span>No pudimos cargar las métricas del bar. Volvé a intentarlo.</span><button type="button" data-dashboard-retry>Reintentar</button>';
      if(!ctx.data){q(ctx,'#activity-chart').innerHTML=empty('Las métricas no están disponibles en este momento.');q(ctx,'[data-updated]').textContent='Sin datos disponibles';}
    }finally{if(alive(ctx)&&generation===ctx.generation){ctx.root.setAttribute('aria-busy','false');schedule(ctx);}}
  }

  function markup(venues,venue){
    const selector=venues.length>1?`<select id="admin-venue-selector" class="ba-venue-select" aria-label="Seleccionar bar">${venues.map(v=>`<option value="${esc(v.id)}" ${v.id===venue.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select>`:'';
    return `<div class="ba-page" data-venue-analytics>
          <div class="ba-heading">
            <div><div class="ba-eyebrow">EL PULSO DE TU BAR</div><h1>Dashboard</h1><p>La música de tu bar, en números.</p></div>
            <div class="ba-heading-tools">${selector}<div class="ba-period" role="group" aria-label="Período de actividad"><button type="button" data-period="week" aria-pressed="true">Esta semana</button><button type="button" data-period="month" aria-pressed="false">Este mes</button></div></div>
          </div>
          <div class="ba-context"><span><span data-icon="calendar"></span><span data-date-range></span></span><span data-updated>Consultando métricas…</span></div>
          <div class="ba-error" data-dashboard-error hidden></div><section class="ba-kpis" aria-label="Métricas principales" id="kpis"></section>
          <div class="ba-main-grid">
            <section class="ba-panel ba-activity" aria-labelledby="activity-title">
              <header class="ba-panel-heading"><div><h2 id="activity-title">Actividad musical</h2><p data-chart-subtitle>Pedidos confirmados por día</p></div><div class="ba-metric-switch" role="group" aria-label="Métrica del gráfico"><button type="button" data-chart-metric="requests" aria-pressed="true">Pedidos</button><button type="button" data-chart-metric="income" aria-pressed="false" disabled title="La comisión del bar está pendiente de definir">Ingresos</button></div></header>
              <div class="ba-chart" id="activity-chart" aria-label="Evolución diaria"></div>
              <div class="ba-chart-insight"><span data-icon="trend"></span><p data-chart-insight></p></div>
            </section>
          </div>
          <div class="ba-bottom-grid">
            <section class="ba-panel" aria-labelledby="songs-title"><header class="ba-panel-heading"><div><h2 id="songs-title">Las canciones más pedidas</h2><p>La selección favorita de tus usuarios.</p></div><span class="ba-tag">Top 5</span></header><div class="ba-song-table"><div class="ba-song-table-head"><span>#</span><span>Canción</span><span>Pedidos</span></div><div id="top-songs"></div></div></section>
            <section class="ba-panel ba-audience" aria-labelledby="audience-title"><header class="ba-panel-heading"><div><h2 id="audience-title">Usuarios recurrentes</h2><p>Los que vuelven a elegir la música.</p></div><span class="ba-panel-icon" data-icon="users"></span></header><div id="audience"></div></section>
          </div>
          <footer class="ba-note"><span data-icon="info"></span><p>Las métricas incluyen pedidos confirmados. La comisión del bar y los ingresos están pendientes de definir.</p></footer>
        </div>`;
  }
  window.tocaVenueDashboard=async()=>{
    const session=state.token;
    if(state.demo||!session){navigate('#/login');return;}
    const venues=await getMyVenues();
    if(session!==state.token||!onDashboard())return;
    if(!venues.length)return oldAdmin();
    if(!venues.some(v=>v.id===state.venueId))state.venueId=venues[0].id;
    const venue=venues.find(v=>v.id===state.venueId);state.venues=venues;state.detail=venue;
    dispose();mount((window.tocaVenuePublicationBanner?.(venue)||'')+markup(venues,venue),'admin');
    const ctx={id:venue.id,session,root:document.querySelector('[data-venue-analytics]'),period:'week',data:null,generation:0};current=ctx;
    ctx.root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});render(ctx);await load(ctx);
  };
  document.addEventListener('click',event=>{
    const ctx=current;if(!ctx||!alive(ctx)||!event.target.closest('[data-venue-analytics]'))return;
    const period=event.target.closest('[data-period]');
    if(period&&['week','month'].includes(period.dataset.period)&&period.dataset.period!==ctx.period){ctx.period=period.dataset.period;ctx.data=null;ctx.root.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b===period)));render(ctx);void load(ctx);}
    else if(event.target.closest('[data-dashboard-retry]'))void load(ctx);
  });
  function tooltip(button){
    const ctx=current;if(!ctx||!alive(ctx)||!ctx.data)return;
    const day=ctx.data.days[Number(button.dataset.dayIndex)],tip=q(ctx,'#chart-tooltip'),plot=button.closest('.ba-plot');if(!day||!tip)return;
    tip.innerHTML=`<strong>${esc(dayLabel(day.date))}</strong><span>${integer(day.requests)} pedidos</span>`;tip.hidden=false;
    const box=button.getBoundingClientRect(),bounds=plot.getBoundingClientRect();tip.style.left=Math.max(tip.offsetWidth/2+6,Math.min(bounds.width-tip.offsetWidth/2-6,box.left-bounds.left+box.width/2))+'px';tip.style.bottom=Math.min(bounds.height-35,box.height+10)+'px';
  }
  document.addEventListener('pointerover',event=>{const b=event.target.closest('[data-venue-analytics] [data-day-index]');if(b)tooltip(b);});
  document.addEventListener('focusin',event=>{const b=event.target.closest('[data-venue-analytics] [data-day-index]');if(b)tooltip(b);});
  for(const type of ['pointerout','focusout'])document.addEventListener(type,event=>{if(event.target.matches('[data-venue-analytics] [data-day-index]')){const tip=current&&q(current,'#chart-tooltip');if(tip)tip.hidden=true;}});
  window.addEventListener('hashchange',()=>{if(!onDashboard())dispose();});
  window.addEventListener('pagehide',dispose);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current&&alive(current))void load(current);});
})();
