"""Main admin route with deterministic analytics; no prototype or provider calls."""
import copy,functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]/'web'
ID='77777777-7777-4777-8777-777777777777';OTHER='88888888-8888-4888-8888-888888888888'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'
def report(period,empty=False):
    counts=([0,0,0,0,1,2] if period=='week' else [0]*12+[3,4])
    if empty:counts=[0]*len(counts)
    first=9 if period=='week' else 1;total=sum(counts)
    return dict(period=period,timeZone='America/Montevideo',from_=f'2026-11-{first:02}',to='2026-11-14',updatedAt='2026-11-15T01:00:00Z',users=0 if empty else 2 if period=='week' else 4,requests=total,returningUsers=0 if empty else 1,previousUsers=0 if empty else 1,previousRequests=0 if empty else 2,days=[dict(date=f'2026-11-{first+i:02}',requests=n) for i,n in enumerate(counts)],topSongs=[] if empty else [dict(trackId='A'*22,title='Track A',artist='Test artist',requests=total)],income=dict(status='NOT_CONFIGURED',currency='UYU'))
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in (390,1440):
   context=browser.new_context(viewport=dict(width=width,height=1050),service_workers='block')
   context.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
   page=context.new_page();errors=[];calls=[];held=[];model=dict(hold=False,error=False)
   page.on('pageerror',lambda e:errors.append(str(e)))
   venues=[dict(id=identity,name=name,published=True,active=False,photos=[]) for identity,name in [(ID,'Bluzz Bar'),(OTHER,'Other Bar')]]
   def reply(route,data,status=200):
    if isinstance(data,dict) and 'from_' in data:data={('from' if k=='from_' else k):v for k,v in data.items()}
    route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
   def api(route):
    request=route.request;url=urlsplit(request.url);calls.append(url.path);data=[]
    if url.path=='/api/auth/me':data=dict(id='owner',name='Owner')
    elif url.path=='/api/admin/venues':data=venues
    elif url.path.endswith('/analytics'):
     period=parse_qs(url.query).get('period',['week'])[0]
     assert request.headers.get('authorization')=='Bearer synthetic-owner'
     if model['error']:return reply(route,dict(message='Unavailable'),503)
     data=report(period,OTHER in url.path)
     if model['hold'] and period=='month':model['hold']=False;held.append((route,copy.deepcopy(data)));return
    return reply(route,data)
   page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda route:route.abort())
   page.goto(BASE+'/#/admin/general');root=page.locator('[data-venue-analytics]')
   expect(root.locator('.ba-value').first).to_have_text('2');expect(root.locator('.ba-value').nth(1)).to_have_text('3')
   assert root.locator('.ba-kpi').count()==4 and root.get_by_text('Por definir',exact=True).count()==2
   assert root.locator('[data-chart-metric="income"]').is_disabled()
   assert page.locator('.toca-ad-dashboard,#toca-live-music,#toca-request-commands,.ba-hours').count()==0
   for text in ('Bienvenido a TOCÁ','Reproducción Spotify','Solicitudes recientes','Horarios con más pedidos'):
    assert text not in root.inner_text()
   model['hold']=True;root.locator('[data-period="month"]').click()
   expect(root.locator('.ba-value').first).to_have_text('—')
   root.locator('[data-period="week"]').click();expect(root.locator('.ba-value').nth(1)).to_have_text('3')
   assert held;route,data=held.pop();reply(route,data);page.wait_for_load_state('networkidle')
   expect(root.locator('.ba-value').nth(1)).to_have_text('3')
   model['error']=True;root.locator('[data-period="month"]').click()
   expect(root.locator('[data-dashboard-error]')).to_be_visible();expect(root.locator('.ba-value').first).to_have_text('—')
   model['error']=False;root.get_by_role('button',name='Reintentar').click();expect(root.locator('.ba-value').nth(1)).to_have_text('7')
   page.locator('#admin-venue-selector').select_option(OTHER)
   expect(root.locator('.ba-value').first).to_have_text('0');expect(root.locator('.ba-value').nth(1)).to_have_text('0')
   assert 'Todavía no hay pedidos confirmados' in root.inner_text()
   page.locator('#admin-venue-selector').select_option(ID);expect(root.locator('.ba-value').nth(1)).to_have_text('3')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not any(any(part in path for part in ('/spotify','/music-status','/requests','/request-commands')) for path in calls),calls
   assert not errors,errors
   page.screenshot(path=f'/tmp/toca-live-dashboard-{width}.png',full_page=True)
   context.close();print('PASS main dashboard: real route, metrics, no legacy content, empty/error states, retry, stale-period response and venue switching:',width,flush=True)
  browser.close()
finally:server.shutdown()
