"""Automatic playlist refresh, cross-tab signals and edit/drag races. Spotify is simulated."""
import copy,functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390]:
   context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block')
   # Two visible windows can receive each other's changes. Timers are controlled below.
   context.add_init_script("Object.defineProperty(document,'hidden',{get:()=>false});localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
   page=context.new_page();page.clock.install();page.set_default_timeout(9000)
   venue=dict(id=ID,name='Sync Bar',address='Test street',city='Montevideo',active=True,published=True)
   playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=[dict(id=str(i).zfill(22),title='Song '+str(i),artist='Test band',durationMs=167000+i) for i in range(30)])
   added=dict(id='C'*22,title='Added elsewhere',artist='Test band',durationMs=180000)
   revisions=[];full_reads=[];writes=[];held=[];hold=[False];failure=[0];errors=[];version=[1]
   def bump():version[0]+=1;playlist['snapshot']='s'+str(version[0])
   def reply(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
   def api(route):
    req=route.request;path=urlsplit(req.url).path;body=req.post_data_json if req.method in ['POST','PUT'] else None;data=[]
    if req.method=='OPTIONS':return reply(route,{})
    if path=='/api/auth/me':data=dict(id='owner',name='Owner')
    elif path=='/api/admin/venues':data=[venue]
    elif path==f'/api/venues/{ID}':data=venue
    elif path.endswith('/spotify/status'):data=dict(connected=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'])
    elif path.endswith('/music/player'):data=dict(now=None,isPlaying=False,device=None,shuffle=False,repeat='off')
    elif path.endswith('/music/playlist/revision'):
     revisions.append(path)
     if failure[0]:return reply(route,dict(message='Temporary provider error'),failure[0])
     data=dict(playlist={k:playlist[k] for k in ['id','name','snapshot']},operation=None)
    elif path.endswith('/music/playlist'):
     full_reads.append(path);data=dict(playlist=copy.deepcopy(playlist),operation=None)
     if hold[0]:hold[0]=False;held.append((route,data));page.evaluate('window.__playlistHeld=true');return
    elif path.endswith('/tracks'):data=[added]
    elif '/music/edits/' in path:
     writes.append(body);assert body['action']=='add' and body['snapshot']==playlist['snapshot'],body
     playlist['tracks'].append(added.copy());bump();data=dict(status='COMPLETED',playlist=playlist,result=dict(playlistId=playlist['id'],name=playlist['name']))
    reply(route,data)
   context.route('http://localhost:8080/**',api);context.route('https://**/*',lambda r:r.abort())
   page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-track-index="29"]').wait_for()
   assert root.locator('[data-studio-refresh]').count()==0
   centers=page.evaluate("""()=>{const h=document.querySelector('.cabina-duration-head').getBoundingClientRect(),r=document.querySelector('.cabina-duration').getBoundingClientRect();return [h.x+h.width/2,r.x+r.width/2]}""")
   assert abs(centers[0]-centers[1])<1,centers
   # Unchanged revisions do not download/repaint the full list or reset its scroll.
   root.locator('[data-studio-tracks]').evaluate('e=>{e.scrollTop=150;e.firstElementChild.__kept=true}')
   before=len(full_reads)
   with page.expect_response(lambda r:r.url.endswith('/playlist/revision')):page.clock.fast_forward(7100)
   page.wait_for_timeout(50)
   assert len(full_reads)==before
   assert root.locator('[data-studio-tracks]').evaluate('e=>e.scrollTop===150&&e.firstElementChild.__kept===true')
   # External changes are found even though the client activity remains empty.
   playlist['tracks'].append(added.copy());bump();page.clock.fast_forward(7100)
   root.locator('[data-track-index="30"]').wait_for();assert len(writes)==0
   assert root.locator('[data-studio-tracks]').evaluate('e=>e.scrollTop')==150
   playlist['name']='Renamed in Spotify';page.evaluate("window.dispatchEvent(new Event('focus'))")
   page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent==='Renamed in Spotify'")
   # An in-flight refresh must never replace the rows during a drag.
   hold[0]=True;playlist['tracks'].pop(0);bump();page.evaluate("window.dispatchEvent(new Event('focus'))")
   page.wait_for_function('window.__playlistHeld===true');assert held
   handle=root.locator('[data-cabina-drag="0"]');handle.focus();handle.press('Space')
   route,data=held.pop();reply(route,data);page.wait_for_timeout(50)
   assert root.get_attribute('data-cabina-dragging')=='keyboard'
   assert root.locator('[data-track-index="0"] strong').inner_text()=='Song 0'
   handle.press('Escape');page.evaluate("window.dispatchEvent(new Event('focus'))")
   page.wait_for_function("document.querySelector('[data-track-index=\"0\"] strong').textContent==='Song 1'")
   # A draft survives background checks; canceling catches up automatically.
   root.locator('.cabina-playlist-selector').click();root.locator('[data-cabina-name-mode=rename]').click();root.locator('[data-studio-name]').fill('Unsaved draft')
   playlist['name']='Another external name';page.clock.fast_forward(7100)
   assert root.locator('[data-studio-name]').input_value()=='Unsaved draft'
   root.locator('dialog[open] [data-cabina-close]').first.click()
   page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent==='Another external name'")
   # Provider errors retry with a delay; reconnecting starts a fresh check.
   failure[0]=429;page.evaluate("window.dispatchEvent(new Event('focus'))")
   page.wait_for_function("document.querySelector('[data-playlist-sync]').textContent.includes('pendiente')")
   attempts=len(revisions);page.clock.fast_forward(21000);page.wait_for_timeout(50);assert len(revisions)==attempts
   failure[0]=0;page.evaluate("window.dispatchEvent(new Event('online'))")
   page.wait_for_function("document.querySelector('[data-playlist-sync]').textContent==='Se actualiza automáticamente'")
   # A completed TOCÁ edit signals another visible tab without waiting seven seconds.
   other=context.new_page();other.clock.install();other.on('pageerror',lambda e:errors.append(str(e)));other.goto(BASE+'/#/admin/music');other.locator('[data-track-index="29"]').wait_for()
   before=len(playlist['tracks']);root.locator('[data-cabina-open=add]').click();root.locator('[data-studio-search]').fill('Added');root.locator('[data-studio-edit=add]').click()
   other.wait_for_function('n=>document.querySelectorAll("[data-track-index]").length===n',arg=before+1)
   assert len(writes)==1 and writes[0]['action']=='add'
   assert not errors,errors
   context.close();print('PASS duration alignment, external edits, lightweight polls, scroll, deferred refresh, retry and cross-tab updates:',width,flush=True)
  browser.close()
finally:server.shutdown()
