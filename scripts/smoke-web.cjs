// Shared adapter smoke: actual HTTP contract, auth headers and API errors; no demo engine.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
function store(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
const localStorage=store(),sessionStorage=store(),calls=[];
localStorage.setItem('amplify-mode','demo');localStorage.setItem('amplify-demo','{"venues":[]}');
const sandbox={window:null,document:{addEventListener(){},getElementById(){return null}},localStorage,sessionStorage,
 location:{hostname:'localhost',origin:'http://localhost:5173',hash:'#/explore'},navigator:{},console,URLSearchParams,crypto:require('crypto').webcrypto,
 setTimeout(){},clearTimeout(){},scrollTo(){},addEventListener(){},TOCA_CONFIG:{mode:'demo'},
 fetch:async(url,options)=>{
  calls.push({url,options});const request=new URL(url);let body=[];
  if(request.pathname==='/api/venues')body=Number(request.searchParams.get('offset'))===0?Array.from({length:50},(_,i)=>({id:'venue-'+i,name:'API '+i,sessionActive:true})):[{id:'last',name:'API last',sessionActive:false}];
  if(request.pathname==='/api/venues/last')body={id:'last',name:'API last',active:false};
  if(request.pathname.endsWith('/tracks'))body=[{id:'track',title:'API song'}];
  if(request.pathname==='/api/unavailable')return {ok:false,status:503,json:async()=>({message:'API unavailable',code:'UNAVAILABLE'})};
  return {ok:true,status:200,json:async()=>body};
 }};
sandbox.window=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),sandbox,{filename:'app.js'});
const run=code=>vm.runInContext(code,sandbox);
(async()=>{
 assert.equal(run('typeof state.demo'),'undefined');assert.equal(run('typeof demoRequest'),'undefined');
 assert.equal(localStorage.getItem('amplify-mode'),null);assert.equal(localStorage.getItem('amplify-demo'),null);
 const venues=await run('fetchVenues()');assert.equal(venues.length,51);assert.equal(venues[0].active,true);assert.equal(venues[50].active,false);
 assert.match(calls[1].url,/offset=50$/);assert.equal((await run('fetchDetail("last")')).name,'API last');
 assert.equal((await run('fetchCatalog("last","hello world")'))[0].title,'API song');assert.match(calls.at(-1).url,/q=hello%20world/);
 run("state.token='admin-session'");sandbox.tocaCustomerBearer=()=> 'Bearer customer-session';
 await run('api("/api/venues/last/requests",{method:"POST",body:{trackId:"track"}})');
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer admin-session');
 assert.equal(calls.at(-1).options.headers['X-TOCA-Customer'],'Bearer customer-session');
 assert.equal(calls.at(-1).options.body,'{"trackId":"track"}');
 await assert.rejects(run('api("/api/unavailable")'),error=>error.status===503&&error.code==='UNAVAILABLE'&&error.message==='API unavailable');
 console.log('PASS API-only startup, paginated venues, catalog, auth separation and errors');
})().catch(error=>{console.error(error);process.exitCode=1});
