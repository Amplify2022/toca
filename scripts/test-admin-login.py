"""Real login/navigation with controlled statistics responses; no external accounts."""
import functools,json,threading
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ID='77777777-7777-4777-8777-777777777777'
TOKEN='synthetic-admin-session'
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
today=datetime.now(ZoneInfo('America/Montevideo')).strftime('%Y-%m-%d')
CASES=[
 ('omitted daily list',dict(tracks=0,repeats=0,synced=0),200,True),
 ('empty daily list',dict(tracks=0,repeats=0,synced=0,days=[]),200,True),
 ('null daily list',dict(tracks=0,repeats=0,synced=0,days=None),200,True),
 ('populated statistics',dict(tracks=3,repeats=2,synced=2,days=[dict(day=today,total=7)]),200,True),
 ('invalid daily list',dict(tracks=3,repeats=2,synced=2,days={}),200,False),
 ('invalid daily entries',dict(tracks=3,repeats=2,synced=2,days=[None]),200,False),
 ('unavailable statistics',dict(message='Stats unavailable'),503,False),
 ('invalid statistics body',[],200,False),
]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390]:
   for name,stats,status,chart in CASES:
    context=browser.new_context(viewport={'width':width,'height':1000},timezone_id='America/Montevideo',service_workers='block')
    page=context.new_page();errors=[];logins=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_init_script("localStorage.setItem('amplify-mode','live')")
    venue=dict(id=ID,name='Login Test Bar',address='Test street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=False,photos=[],coverPhotoUrl=None,requestAccessMode='NEARBY')
    def api(route):
     path=route.request.url.split('8080',1)[1].split('?',1)[0];result=[];code=200
     if route.request.method=='OPTIONS':result={}
     elif path=='/api/auth/login':
      logins.append(route.request.post_data_json);result=dict(token=TOKEN,user=dict(id='owner',name='Owner',email='owner@example.test'))
     elif path=='/api/auth/me':result=dict(id='owner',name='Owner',email='owner@example.test')
     elif path=='/api/admin/venues':result=[venue]
     elif path==f'/api/venues/{ID}':result=venue
     elif path.endswith('/stats'):result=stats;code=status
     elif path.endswith('/music-status'):result=dict(active=False,isPlaying=False,now=None,playlist=[])
     elif path.endswith('/spotify/status'):result=dict(connected=False,premium=False)
     elif path.endswith('/request-access'):result=dict(mode='NEARBY',radiusMeters=100,requiresQr=False)
     elif path.endswith('/google/config'):result=dict(enabled=False,clientId='')
     route.fulfill(status=code,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'})
    page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda route:route.abort())
    page.goto(base+'/#/login')
    page.locator('#login-form [name="email"]').fill('owner@example.test')
    page.locator('#login-form [name="password"]').fill('Synthetic-test-password')
    page.locator('#login-form button[type="submit"],#login-form button:not([type])').last.click()
    page.wait_for_function("!!document.querySelector('.toca-ad-dashboard')||!!document.querySelector('.toca-error')")
    assert page.locator('.toca-ad-dashboard').count()==1,(name,page.locator('#app').inner_text()[:250])
    assert len(logins)==1 and page.evaluate("sessionStorage.getItem('amplify-token')")==TOKEN
    assert page.locator('.toca-error').count()==0 and not errors,(name,errors)
    assert page.locator('.toca-ad-chart-col').count()==(7 if chart else 0),name
    if name=='populated statistics':assert page.locator('.toca-ad-chart-col b[title="7 solicitudes"]').count()==1
    if name in ['unavailable statistics','invalid statistics body']:
     assert page.locator('.toca-ad-metric strong').all_text_contents()[:3]==['—','—','—']
    if name=='omitted daily list':
     assert page.locator('.toca-ad-metric strong').all_text_contents()[:3]==['0','0','0']
     page.screenshot(path=f'/tmp/toca-dashboard-after-login-{width}.png',full_page=True)
     page.goto(base+'/#/admin/profile');page.locator('[data-venue-profile] .identity').wait_for()
    context.close();print('PASS real login -> dashboard:',width,name)
  browser.close()
finally:server.shutdown()
