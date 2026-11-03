// Tests isolated from network and frameworks: all primary demo routes and moderation state.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../web');
function store(){const data={};return {getItem(k){return data[k]||null},setItem(k,v){data[k]=String(v)},removeItem(k){delete data[k]}}}
const elements=new Map();const element=(id)=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',value:'',replaceChildren(x){this.children=[x]},style:{}});return elements.get(id)};
const events={};const sandbox={window:{},document:{head:{append(){}},getElementById:element,addEventListener:(name,fn)=>{(events[name]||=[]).push(fn)},createElement:tag=>({tag,style:{},getContext:()=>({fillRect(){}}),toDataURL:()=> 'data:image/png;base64,AA'})},localStorage:store(),sessionStorage:store(),location:{hash:'#/',protocol:'file:',origin:'http://localhost:5173',pathname:'/'},navigator:{},console,URLSearchParams,encodeURIComponent,decodeURIComponent,Math,Date,crypto:require('crypto').webcrypto,clearTimeout,setTimeout,scrollTo(){},confirm:()=>true,fetch:()=>Promise.reject(Error('Network is forbidden in smoke test'))};
sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.addEventListener=(type,fn)=>{(events[type]||=[]).push(fn)};vm.createContext(sandbox);
for(const f of ['assets/qr.js','app.js','toca-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox,{filename:f});
const run=(code)=>vm.runInContext(code,sandbox);
async function goto(route){sandbox.location.hash='#'+route;await run('render()');return element('app').innerHTML}
(async()=>{
 let page=await goto('/');assert.match(page,/TOCÁ/);assert.match(page,/Descubrí bares/);assert.match(page,/Portal de bares/);assert.match(page,/toca-home-map.svg/);assert.doesNotMatch(page,/toca-map-pin/,'hero map must be a static image');assert.doesNotMatch(page,/Prototipo de pruebas privadas/);
 page=await goto('/explore');assert.match(page,/La Ronda/);assert.match(page,/toca-map-art/);assert.doesNotMatch(page,/href="#\/map"/);assert.doesNotMatch(page,/Spotify solo está configurado/);
 page=await goto('/map');assert.equal(sandbox.location.hash,'#/explore','old map route redirects');assert.match(page,/Descubrí dónde/);
 page=await goto('/venue/demo-1');assert.match(page,/Pedí una canción/);assert.match(page,/toca-live-next/);assert.equal((page.match(/href="#\/request\/demo-1"/g)||[]).length,1,'one request CTA per venue detail');assert.doesNotMatch(page,/Spotify solo está configurado para pruebas privadas/);
 page=await goto('/request/demo-1');assert.match(page,/Canciones para elegir/);assert.match(page,/Get Lucky/);
 const r1=run('demoRequest("demo-1", demoCatalog.find(x=>x.id==="demo-track-3"))');
 assert.equal(r1.status,'DISPATCHED','demo must auto-dispatch, no manual approval');
 const r2=run('demoRequest("demo-1", demoCatalog.find(x=>x.id==="demo-track-3"))');
 assert.equal(r1.id,r2.id,'repeated track must reuse the request');
 assert.equal(r2.requestCount,2,'repeated track promoted');
 // QR access survives navigation and works repeatedly for the same venue.
 page=await goto('/venue/demo-1?join=test-qr-secret');
 assert.equal(run('rememberJoin("demo-1", "")'),'test-qr-secret');
 page=await goto('/request/demo-1');
 assert.equal(run('state.joinToken'),'test-qr-secret');
 page=await goto('/success/demo-1?track=demo-track-3');
 page=await goto('/request/demo-1');
 assert.equal(run('state.joinToken'),'test-qr-secret');
 // A token from one venue must never unlock a different venue.
 page=await goto('/request/demo-2');
 assert.equal(run('state.joinToken'),'');
 page=await goto('/venue/demo-1');
 assert.equal(run('state.joinToken'),'test-qr-secret');
 page=await goto('/success/demo-1?track=demo-track-3');assert.match(page,/Tu pedido fue enviado/);
 // Anonymous users never see admin navigation or admin content (including demo mode).
 page=await goto('/admin/general');
 assert.equal(sandbox.location.hash,'#/login');
 page=await goto('/login');assert.match(page,/Iniciar sesión/);assert.match(page,/toca-auth-frame/);assert.doesNotMatch(page,/toca-admin-frame/);
 page=await goto('/explore');assert.doesNotMatch(page,/href="#\/admin"/);
 // Login and admin UI in API mode use the authenticated backend, not demo data.
 run(`state.demo=false;state.token='${'A'*50}';state.user={name:'Admin',id:'u1'};state.venueId=null`);
 sandbox.fetch=async input=>{
   const pathname=new URL(input).pathname;
   const bar={id:'demo-1',name:'Admin Bar',city:'Montevideo',address:'Centro',genre:'Rock',active:true,spotifyConnected:true};
   let data;
   if(pathname==='/api/auth/me')data={id:'u1',name:'Admin',email:'admin@example.com'};
   else if(pathname==='/api/auth/logout')data={loggedOut:true};
   else if(pathname==='/api/admin/venues')data=[bar];
   else if(pathname==='/api/venues/demo-1')data=bar;
   else if(pathname==='/api/venues/demo-1/requests')data=[];
   else if(pathname==='/api/venues/demo-1/playlist')data=[];
   else if(pathname==='/api/admin/venues/demo-1/spotify/status')data={connected:true,premium:true};
   else if(pathname==='/api/venues/demo-1/music-status')data={active:true,now:null,next:null,playlist:[]};
   else data=[];
   return {ok:true,status:200,json:async()=>data};
 };
 page=await goto('/admin/general');assert.match(page,/Bienvenido a TOCÁ/);assert.match(page,/toca-live-music/);assert.match(page,/data-action="logout"/);
 page=await goto('/admin/requests');assert.match(page,/Solicitudes/);assert.match(page,/admin-header/);
 page=await goto('/admin/music');assert.match(page,/Lista negra/);
 page=await goto('/admin/spotify');assert.match(page,/Spotify Premium/);
 page=await goto('/admin/qr');assert.match(page,/qr-container/);
 // A logout revokes the token through the API and exits the admin portal.
 const click=events.click.find(fn=>String(fn).includes("action==='logout'"));
 assert(click,'logout event listener exists');
 await click({target:{closest:()=>({dataset:{action:'logout'},isConnected:false})}});
 assert.equal(run('state.token'),'');assert.equal(sandbox.location.hash,'#/login');
 page=await goto('/admin/music');assert.equal(sandbox.location.hash,'#/login');
 run('state.demo=true');
 page=await goto('/my-requests');assert.match(page,/Mis canciones/);
 page=await goto('/profile');assert.match(page,/Bares favoritos/);
 const q=run('(()=>{const q=new AmplifyQR(-1,1);q.addData("https://example.com/#/venue/demo-1?join=abc123");q.make();return q.getModuleCount()})()');assert(q>20);
 console.log('PASS: TOCÁ routes v1.4, static landing image, unified discovery, QR, admin login guard, logout, Spotify and favorites');
})().catch(e=>{console.error(e);process.exitCode=1});
