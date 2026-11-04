from playwright.sync_api import sync_playwright
import json
MOCK=r'''localStorage.setItem('amplify-mode','live');
window.__auditCalls=[];window.__auditXss=false;window.__delayDetail=false;
window.__venue={id:'77777777-7777-4777-8777-777777777777',name:'Audit Venue',city:'Montevideo',address:'Audit address',latitude:-34.9,longitude:-56.18,genre:'Rock',active:true,now:null,photos:[]};
window.fetch=async (url,options={})=>{
 const path=String(url).replace(/^https?:\/\/[^/]+/,'');window.__auditCalls.push(path);
 let data=[];
 if((path==='/api/venues'||path.startsWith('/api/venues?')))data=[{...window.__venue}];
 else if(path==='/api/venues/'+window.__venue.id){if(window.__delayDetail)await new Promise(r=>setTimeout(r,1500));data={...window.__venue};}
 else if(path.endsWith('/music-status'))data={active:true,isPlaying:false,now:null,playlist:[]};
 else if(path.endsWith('/google/config'))data={enabled:false,clientId:''};
 return {ok:true,status:200,json:async()=>data};
};'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=browser.new_context(service_workers='block');page=ctx.new_page()
 page.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1:5173') else route.abort())
 page.add_init_script(MOCK)
 page.goto('http://127.0.0.1:5173/#/explore',wait_until='domcontentloaded');page.wait_for_timeout(500)
 page.evaluate("window.__venue.city='<img src=x onerror=window.__auditXss=true>';render()")
 page.wait_for_timeout(500)
 print('STORED_XSS',page.evaluate('window.__auditXss'))
 page.evaluate("window.__venue.city='Montevideo';window.__delayDetail=true;location.hash='#/venue/'+window.__venue.id")
 page.wait_for_timeout(100)
 page.evaluate("location.hash='#/about'")
 page.wait_for_timeout(300)
 print('ROUTE_BEFORE_DELAY',page.evaluate('location.hash'), page.locator('.toca-how').count())
 page.wait_for_timeout(1800)
 print('ROUTE_AFTER_DELAY',page.evaluate('location.hash'),page.locator('.toca-detail-layout').count())
 assert not page.evaluate('window.__auditXss')
 assert page.locator('.toca-detail-layout').count()==0
 assert page.locator('.toca-how').count()==1
 print('PASS safe text and navigation generation')
 browser.close()
