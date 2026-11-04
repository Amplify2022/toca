/* Shared lazy SDK loader. CSS must be ready before measuring a Leaflet map. */
(() => {
 const cdn='https://cdn.jsdelivr.net/npm/';
 let pending;
 function css(id,path){return new Promise((resolve,reject)=>{
  const old=document.getElementById(id);if(old?.sheet){resolve();return}
  const el=old||document.createElement('link');el.id=id;el.rel='stylesheet';el.href=cdn+path;
  el.onload=resolve;el.onerror=()=>{el.remove();reject(Error('No se pudo cargar el estilo del mapa'))};
  if(!old)document.head.append(el);
 })}
 function script(id,path,ready){if(ready())return Promise.resolve();return new Promise((resolve,reject)=>{
  const old=document.getElementById(id),el=old||document.createElement('script');el.id=id;el.src=cdn+path;
  const timer=setTimeout(()=>{el.remove();reject(Error('El mapa demoró demasiado'))},15000);
  el.addEventListener('load',()=>{clearTimeout(timer);ready()?resolve():reject(Error('SDK cartográfico incompleto'))},{once:true});
  el.addEventListener('error',()=>{clearTimeout(timer);el.remove();reject(Error('No se pudo cargar el mapa'))},{once:true});
  if(!old)document.head.append(el);
 })}
 window.tocaLoadMaps=()=>pending ||= (async()=>{
  await Promise.all([css('toca-leaflet-css','leaflet@1.9.4/dist/leaflet.css'),css('toca-maplibre-css','maplibre-gl@5.24.0/dist/maplibre-gl.css')]);
  await script('toca-leaflet-script','leaflet@1.9.4/dist/leaflet.js',()=>!!window.L);
  await script('toca-maplibre-script','maplibre-gl@5.24.0/dist/maplibre-gl.js',()=>!!window.maplibregl);
  await script('toca-maplibre-leaflet-script','@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js',()=>typeof window.L?.maplibreGL==='function');
 })().catch(error=>{pending=null;throw error});
 window.tocaMapLayer=()=>L.maplibreGL({
  style:'https://tiles.versatiles.org/assets/styles/gray-dark/style.json',
  attribution:'© <a href="https://versatiles.org/">VersaTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
 });
})();
