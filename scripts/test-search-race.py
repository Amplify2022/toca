from playwright.sync_api import sync_playwright
MOCK=r'''localStorage.setItem('amplify-mode','live');sessionStorage.setItem('toca:customer:session','1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdef');
window.__auditCalls=[];
window.__venue={id:'77777777-7777-4777-8777-777777777777',name:'Audit Venue',city:'Montevideo',address:'Audit address',latitude:-34.9,longitude:-56.18,genre:'Rock',active:true,now:null,photos:[]};
window.fetch=async (url,options={})=>{
 const path=String(url).replace(/^https?:\/\/[^/]+/,'');window.__auditCalls.push(path);
 let data=[];
 if(path==='/api/customers/me')data={id:'customer',name:'Audit customer',email:'audit@example.com'};
 else if((path==='/api/venues'||path.startsWith('/api/venues?')))data=[{...window.__venue}];
 else if(path==='/api/venues/'+window.__venue.id)data={...window.__venue};
 else if(path.includes('/tracks?q=')){
 const query=new URL('http://api'+path).searchParams.get('q');
 if(query==='old')await new Promise(r=>setTimeout(r,1600));
 data=[{id:query==='old'?'1111111111111111111111':'2222222222222222222222',title:query==='old'?'OLD QUERY TRACK':'NEW QUERY TRACK',artist:'Artist'}];
 }
 else if(path.endsWith('/music-status'))data={active:true,isPlaying:false,now:null,playlist:[]};
 else if(path.endsWith('/google/config'))data={enabled:false,clientId:''};
 return {ok:true,status:200,json:async()=>data};
};'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=browser.new_context(service_workers='block');page=ctx.new_page()
 page.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1:5173') else route.abort())
 page.add_init_script(MOCK)
 page.goto('http://127.0.0.1:5173/#/request/77777777-7777-4777-8777-777777777777',wait_until='domcontentloaded')
 page.locator('#song-search').wait_for()
 page.locator('#song-search').fill('old');page.wait_for_timeout(450)
 page.locator('#song-search').fill('new');page.wait_for_timeout(500)
 print('SEARCH_FAST_RESPONSE',page.locator('#song-results').inner_text())
 page.wait_for_timeout(1500)
 print('SEARCH_LATE_RESPONSE',page.locator('#song-search').input_value(),page.locator('#song-results').inner_text())
 assert page.locator('#song-results').inner_text().find('NEW QUERY TRACK')>=0
 assert 'OLD QUERY TRACK' not in page.locator('#song-results').inner_text()
 browser.close()
