/* Standalone design preview. No API requests, payments or production sessions. */
(() => {
  'use strict';
  const paths = {
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    music:'<path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
    bar:'<path d="M3 10V5h18v5M4 10v11h16V10M9 21v-7h6v7"/><path d="M3 5l2-3h14l2 3M3 10c1 3 4 3 6 0 2 3 4 3 6 0 2 3 5 3 6 0"/>',
    pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    wallet:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M17 6V3L5 6m16 6h-6v4h6"/><circle cx="17" cy="14" r=".5"/>',
    trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.music}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon);});
  const integer = n => new Intl.NumberFormat('es-UY').format(n);
  const decimal = n => new Intl.NumberFormat('es-UY',{maximumFractionDigits:1,minimumFractionDigits:1}).format(n);
  const money = n => 'UYU '+integer(n);
  const week = [18,20,28,42,96,126];
  const month = [8,11,11,17,22,62,84,12,...week];
  const fixtures = {
    week:{users:86,previousUsers:72,previousRequests:274,returning:34,range:'9–14 nov 2026',days:week.map((requests,i)=>({day:9+i,label:['Lun','Mar','Mié','Jue','Vie','Sáb'][i],requests})),hours:[33,92,152,53],songs:[18,14,12,11,9]},
    month:{users:154,previousUsers:132,previousRequests:486,returning:64,range:'1–14 nov 2026',days:month.map((requests,i)=>({day:i+1,label:String(i+1),requests})),hours:[61,167,234,95],songs:[37,29,24,21,18]}
  };
  const tracks = [['Original Prankster','The Offspring'],['Persiana Americana','Soda Stereo'],['Lamento Boliviano','Enanitos Verdes'],['De Música Ligera','Soda Stereo'],['El Sensei','Las Pastillas del Abuelo']];
  const state = {period:'week',metric:'requests'};
  const total = data => data.days.reduce((sum,day)=>sum+day.requests,0);
  const change = (current,previous) => `${decimal((current/previous-1)*100)}%`;
  const currencyValue = amount => `<small>UYU</small>${integer(amount)}`;

  function renderKpis(data) {
    const requests=total(data);
    const cards=[
      {label:'Usuarios que pidieron',value:integer(data.users),icon:'users',detail:'Usuarios únicos en el período',trend:change(data.users,data.previousUsers)},
      {label:'Canciones pedidas',value:integer(requests),icon:'music',detail:'Agregadas a la playlist',trend:change(requests,data.previousRequests)},
      {label:'Generado esta semana',value:currencyValue(1650),icon:'wallet',detail:'9–14 de noviembre',money:true},
      {label:'Generado este mes',value:currencyValue(2785),icon:'calendar',detail:'Acumulado de noviembre',money:true}
    ];
    document.getElementById('kpis').innerHTML=cards.map((card,i)=>`<article class="ba-kpi ${i===2?'ba-kpi-highlight':''}"><div class="ba-kpi-top"><h2>${card.label}</h2><span>${icon(card.icon)}</span></div><strong class="ba-value">${card.value}</strong><div class="ba-kpi-detail">${card.trend?`<span class="ba-growth">↑ ${card.trend}</span>`:'<span class="ba-simulated">Simulado</span>'}<span>${card.detail}</span></div></article>`).join('');
  }

  function renderChart(data) {
    const income=state.metric==='income';
    const maxValue=Math.max(...data.days.map(day=>day.requests*(income?5:1)));
    const ceiling=Math.ceil(maxValue/(income?200:40))*(income?200:40);
    document.querySelector('[data-chart-subtitle]').textContent=income?'Ingresos simulados por día · UYU':'Pedidos confirmados por día';
    document.querySelectorAll('[data-chart-metric]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chartMetric===state.metric)));
    document.getElementById('activity-chart').innerHTML=`<div class="ba-y-axis">${[1,.75,.5,.25,0].map(f=>`<span>${integer(ceiling*f)}</span>`).join('')}</div><div class="ba-chart-content"><div class="ba-plot" style="--days:${data.days.length}">${data.days.map((day,i)=>{const value=day.requests*(income?5:1);return `<div class="ba-bar-column"><button type="button" class="ba-bar ${day.requests===Math.max(...data.days.map(x=>x.requests))?'ba-bar-peak':''}" style="--height:${value/ceiling*100}%" data-day-index="${i}" aria-label="${day.day} de noviembre: ${income?money(value)+' simulados':integer(value)+' pedidos'}"></button></div>`;}).join('')}<div class="ba-tooltip" id="chart-tooltip" role="tooltip" hidden></div></div><div class="ba-x-axis" style="--days:${data.days.length}">${data.days.map(day=>`<span>${day.label}${state.period==='week'?`<small>${day.day}</small>`:''}</span>`).join('')}</div></div>`;
    document.querySelector('[data-chart-insight]').innerHTML=state.period==='week'?'<strong>El 67% de los pedidos llega el viernes y sábado.</strong> Son los días de mayor participación.':'<strong>La segunda semana concentró más pedidos.</strong> El sábado 14 fue el día con mayor actividad.';
  }

  function renderHours(data) {
    const sum=total(data);
    document.getElementById('hours').innerHTML=data.hours.map((count,i)=>`<div class="ba-hour"><div><span>${['18:00 – 20:00','20:00 – 22:00','22:00 – 00:00','00:00 – 02:00'][i]}</span><strong>${Math.round(count/sum*100)}<small>%</small></strong></div><div class="ba-hour-track"><span class="${i===2?'peak':''}" style="width:${count/Math.max(...data.hours)*100}%"></span></div></div>`).join('');
  }

  function renderSongs(data) {
    document.getElementById('top-songs').innerHTML=tracks.map(([title,artist],i)=>`<div class="ba-song-row"><span class="ba-rank">${i+1}</span><div class="ba-song-info"><div class="ba-record ba-record-${i}" aria-hidden="true">${icon('music')}</div><div><strong>${title}</strong><small>${artist}</small></div></div><strong class="ba-song-count">${data.songs[i]}</strong></div>`).join('');
  }

  function renderAudience(data) {
    const percentage=Math.round(data.returning/data.users*100),first=data.users-data.returning;
    document.getElementById('audience').innerHTML=`<div class="ba-audience-main"><div class="ba-donut" style="--percentage:${percentage}%" role="img" aria-label="${percentage}% de los usuarios ya había pedido antes"><div><strong>${percentage}<small>%</small></strong><span>recurrentes</span></div></div><div class="ba-audience-legend"><div><i></i><span>Nuevos en el bar</span><strong>${first}</strong></div><div><i class="returning"></i><span>Recurrentes</span><strong>${data.returning}</strong></div><p>${data.returning} de ${data.users} usuarios ya habían pedido en tu bar.</p></div></div><div class="ba-average"><div><span>Pedidos por usuario</span><small>Promedio del período</small></div><strong>${decimal(total(data)/data.users)}</strong></div>`;
  }

  function render() {
    const data=fixtures[state.period];
    document.querySelector('[data-date-range]').textContent=data.range;
    document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===state.period)));
    renderKpis(data);renderChart(data);renderHours(data);renderSongs(data);renderAudience(data);
  }
  document.addEventListener('click',event=>{
    const period=event.target.closest('[data-period]');
    const metric=event.target.closest('[data-chart-metric]');
    if(period){state.period=period.dataset.period;render();}
    else if(metric){state.metric=metric.dataset.chartMetric;renderChart(fixtures[state.period]);}
  });
  function tooltip(button) {
    const day=fixtures[state.period].days[Number(button.dataset.dayIndex)],tip=document.getElementById('chart-tooltip'),plot=button.closest('.ba-plot');
    tip.innerHTML=`<strong>${day.day} de noviembre</strong><span>${integer(day.requests)} pedidos</span>${state.metric==='income'?`<span>${money(day.requests*5)} simulados</span>`:''}`;
    tip.hidden=false;
    const box=button.getBoundingClientRect(),bounds=plot.getBoundingClientRect();
    tip.style.left=Math.max(tip.offsetWidth/2+6,Math.min(bounds.width-tip.offsetWidth/2-6,box.left-bounds.left+box.width/2))+'px';
    tip.style.bottom=Math.min(bounds.height-35,box.height+10)+'px';
  }
  document.addEventListener('pointerover',event=>{const button=event.target.closest('[data-day-index]');if(button)tooltip(button);});
  document.addEventListener('focusin',event=>{const button=event.target.closest('[data-day-index]');if(button)tooltip(button);});
  document.addEventListener('pointerout',event=>{if(event.target.matches('[data-day-index]'))document.getElementById('chart-tooltip').hidden=true;});
  document.addEventListener('focusout',event=>{if(event.target.matches('[data-day-index]'))document.getElementById('chart-tooltip').hidden=true;});
  render();
})();
