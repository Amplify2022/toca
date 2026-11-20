"""Real login/navigation with controlled analytics responses; no external accounts."""
import functools,json,os,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
ID='77777777-7777-4777-8777-777777777777'
TOKEN='synthetic-admin-session'
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
EMPTY=dict(period='week',timeZone='America/Montevideo',**{'from':'2026-11-09','to':'2026-11-14'},updatedAt='2026-11-15T01:00:00Z',users=0,requests=0,returningUsers=0,previousUsers=0,previousRequests=0,days=[dict(date=f'2026-11-{day:02}',requests=0) for day in range(9,15)],topSongs=[],income=dict(status='NOT_CONFIGURED',currency='UYU'))
POPULATED={**EMPTY,'users':2,'requests':7,'returningUsers':1,'days':[{**day,'requests':7 if i==5 else 0} for i,day in enumerate(EMPTY['days'])],'topSongs':[dict(trackId='A'*22,title='Example song',artist='Example artist',requests=7)]}
CASES=[
 ('empty analytics',EMPTY,200,True),
 ('populated analytics',POPULATED,200,True),
 ('invalid daily list',{**EMPTY,'days':{}},200,False),
 ('invalid daily entries',{**EMPTY,'days':[None]},200,False),
 ('inconsistent totals',{**EMPTY,'requests':3},200,False),
 ('unavailable analytics',dict(message='Analytics unavailable'),503,False),
 ('invalid analytics body',[],200,False),
]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
  for width in [1440,390]:
   for name,stats,status,valid in CASES:
    context=browser.new_context(viewport={'width':width,'height':1000},timezone_id='America/Montevideo',service_workers='block')
    page=context.new_page();errors=[];logins=[];analytics=[];page.on('pageerror',lambda error:errors.append(str(error)))
    venue=dict(id=ID,name='Login Test Bar',address='Test street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=False,photos=[],coverPhotoUrl=None,requestAccessMode='NEARBY')
    def api(route):
     path=route.request.url.split('8080',1)[1].split('?',1)[0];result=[];code=200
     if route.request.method=='OPTIONS':result={}
     elif path=='/api/auth/login':
      logins.append(route.request.post_data_json);result=dict(token=TOKEN,user=dict(id='owner',name='Owner',email='owner@example.test'))
     elif path=='/api/auth/me':result=dict(id='owner',name='Owner',email='owner@example.test')
     elif path=='/api/admin/venues':result=[venue]
     elif path==f'/api/venues/{ID}':result=venue
     elif path.endswith('/analytics'):analytics.append(path);result=stats;code=status
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
    expect(page).to_have_url(base+'/#/admin/music')
    expect(page.locator('[data-admin-studio] h1')).to_have_text('Música')
    assert not analytics
    if name=='empty analytics':
     page.goto(base+'/#/')
     portal=page.get_by_role('link',name='Ir a mi portal',exact=True)
     expect(portal).to_have_attribute('href','#/admin/music')
     portal.click()
     expect(page).to_have_url(base+'/#/admin/music')
     expect(page.locator('[data-admin-studio] h1')).to_have_text('Música')
     page.goto(base+'/#/admin')
     expect(page).to_have_url(base+'/#/admin/music')
     expect(page.locator('[data-admin-studio] h1')).to_have_text('Música')
    nav='.toca-admin-menu' if width==1440 else '.toca-admin-mobile-nav'
    page.locator(nav).get_by_role('link',name='Dashboard',exact=True).click()
    expect(page).to_have_url(base+'/#/admin/general')
    root=page.locator('[data-venue-analytics]');expect(root).to_be_visible()
    expect(root).to_have_attribute('aria-busy','false')
    assert len(logins)==1 and page.evaluate("sessionStorage.getItem('amplify-token')")==TOKEN
    assert page.locator('.toca-error').count()==0 and not errors,(name,errors)
    assert not page.locator('.toca-ad-dashboard,#toca-live-music,#toca-request-commands').count()
    if valid:
     expect(root.locator('[data-dashboard-error]')).not_to_be_visible()
     expect(root.locator('.ba-value').first).to_have_text(str(stats['users']))
     expect(root.locator('.ba-value').nth(1)).to_have_text(str(stats['requests']))
    else:
     expect(root.locator('[data-dashboard-error]')).to_be_visible()
     assert root.locator('.ba-value').all_text_contents()==['—']*4
    if name=='populated analytics':
     expect(root.get_by_role('button',name='14 nov.: 7 pedidos',exact=True)).to_be_visible()
    if name=='empty analytics':
     assert 'Todavía no hay pedidos confirmados' in root.inner_text()
     page.screenshot(path=f'/tmp/toca-dashboard-after-login-{width}.png',full_page=True)
     page.goto(base+'/#/admin/profile');page.locator('[data-venue-profile] .identity').wait_for()
    context.close();print('PASS real login -> Música, explicit Dashboard:',width,name)
  browser.close()
finally:server.shutdown()
