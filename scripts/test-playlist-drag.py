"""Real mouse/touch gestures over a long playlist; simulated Spotify writes only."""
import functools,json,threading
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
   mobile=width<760
   context=browser.new_context(viewport=dict(width=width,height=720),is_mobile=mobile,has_touch=mobile,service_workers='block');page=context.new_page();page.set_default_timeout(12000)
   page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
   venue=dict(id=ID,name='Drag Bar',address='Test street',city='Montevideo',active=True,published=True)
   tracks=[dict(id=str(i).zfill(22),title='Song '+str(i),artist='Test band',durationMs=180000,imageUrl='/assets/venues/bar-1.webp') for i in range(40)]
   playlist=dict(id='P'*22,name='Long playlist',snapshot='s1',tracks=tracks)
   edits=[];controls=[];errors=[];version=[1]
   page.on('pageerror',lambda e:errors.append(str(e)))
   def reply(route,data):route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
   def api(route):
    req=route.request;path=urlsplit(req.url).path;body=req.post_data_json if req.method in ['POST','PUT'] else None;data=[]
    if req.method=='OPTIONS':return reply(route,{})
    if path=='/api/auth/me':data=dict(id='owner',name='Owner')
    elif path=='/api/admin/venues':data=[venue]
    elif path==f'/api/venues/{ID}':data=venue
    elif path.endswith('/spotify/status'):data=dict(connected=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'])
    elif path.endswith('/music/playlist'):data=dict(playlist=playlist,operation=None)
    elif path.endswith('/music/player'):
     if req.method=='POST':controls.append(body);data=dict(accepted=True)
     else:data=dict(now=None,isPlaying=False,device=None,shuffle=False,repeat='off')
    elif '/music/edits/' in path:
     assert body['action']=='move' and body['snapshot']==playlist['snapshot'],body
     edits.append(body);tracks.insert(body['to'],tracks.pop(body['from']));version[0]+=1;playlist['snapshot']='s'+str(version[0])
     data=dict(status='COMPLETED',playlist=playlist,result=dict(playlistId=playlist['id'],snapshot=playlist['snapshot']))
    reply(route,data)
   page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
   page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-track-index="39"]').wait_for()
   # Start at the end, with the list's top above the viewport and player below.
   page.evaluate("document.querySelector('[data-studio-tracks]').scrollTop=100000;window.scrollTo(0,100000)")
   source=root.locator('[data-cabina-drag="39"]' if mobile else '[data-track-index="39"] .cabina-song-meta strong').bounding_box()
   assert source and source['y']>0
   x=source['x']+min(source['width']/2,60);y=source['y']+source['height']/2
   destination=page.evaluate("()=>{const r=document.querySelector('[data-studio-tracks]').getBoundingClientRect();return {x:r.left+65,y:Math.max(8,r.top)+12}}")
   cdp=context.new_cdp_session(page)
   def touch(kind,x=None,y=None):
    points=[] if x is None else [dict(x=x,y=y,id=1,radiusX=5,radiusY=5,force=1)]
    cdp.send('Input.dispatchTouchEvent',dict(type=kind,touchPoints=points))
   if mobile:touch('touchStart',x,y);touch('touchMove',destination['x'],destination['y'])
   else:page.mouse.move(x,y);page.mouse.down();page.mouse.move(destination['x'],destination['y'],steps=10)
   root.locator('.cabina-drag-preview').wait_for()
   page.wait_for_function("()=>{const row=document.querySelector('[data-track-index=\"0\"]').getBoundingClientRect(),list=document.querySelector('[data-studio-tracks]');return list.scrollTop<1&&row.top>=0&&row.top<24}")
   page.screenshot(path=f'/tmp/toca-playlist-drag-{width}.png')
   if mobile:touch('touchEnd')
   else:page.mouse.up()
   page.wait_for_function("document.querySelector('[data-track-index=\"0\"] strong').textContent==='Song 39'")
   page.wait_for_function("!document.querySelector('[data-cabina-drag=\"0\"]').disabled")
   assert len(edits)==1 and edits[0]['from']==39 and edits[0]['to']==0,edits
   assert root.locator('.cabina-drag-preview').count()==0 and not controls
   assert page.evaluate("()=>{const row=document.querySelector('[data-track-index=\"0\"]').getBoundingClientRect();return row.top>=0&&row.bottom<document.querySelector('.cabina-player').getBoundingClientRect().top}"), 'Reordering must keep the moved song visible'
   # Cancellation never writes, and leaves no pointer capture or floating card.
   page.evaluate("document.querySelector('[data-studio-tracks]').scrollTop=0;window.scrollBy(0,document.querySelector('[data-studio-tracks]').getBoundingClientRect().top-20)")
   source=root.locator('[data-cabina-drag="0"]').bounding_box();x=source['x']+18;y=source['y']+22
   if mobile:touch('touchStart',x,y);touch('touchMove',x,y+100);touch('touchCancel')
   else:page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+100,steps=5);page.keyboard.press('Escape');page.mouse.up()
   assert len(edits)==1 and root.locator('.cabina-drag-preview').count()==0
   assert root.get_attribute('data-cabina-dragging') is None
   if not mobile:
    # The album artwork is also a real drag target, without native image dragging.
    page.evaluate("window.scrollBy(0,document.querySelector('[data-studio-tracks]').getBoundingClientRect().top-20)")
    source=root.locator('[data-track-index="0"] .cabina-art img').bounding_box();destination=root.locator('[data-track-index="4"]').bounding_box()
    page.mouse.move(source['x']+15,source['y']+15);page.mouse.down();page.mouse.move(destination['x']+85,destination['y']+destination['height']-3,steps=10);page.mouse.up()
    page.wait_for_function("document.querySelector('[data-track-index=\"4\"] strong').textContent==='Song 39'")
    assert len(edits)==2 and edits[-1]['from']==0 and edits[-1]['to']==4,edits
   else:
    # Swiping over a song still scrolls normally; only the handle captures touch.
    source=root.locator('[data-track-index="3"] .cabina-song').bounding_box()
    touch('touchStart',source['x']+60,source['y']+15);touch('touchMove',source['x']+60,source['y']-85);touch('touchEnd')
    assert len(edits)==1 and root.get_attribute('data-cabina-dragging') is None
   assert not errors,errors
   context.close();print('PASS real mouse/touch, last-to-first autoscroll, one write, cancel and normal scrolling:',width,flush=True)
  browser.close()
finally:server.shutdown()
