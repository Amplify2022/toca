"""The shipped app always uses HTTP, even with old demo preferences/configuration."""
import functools,json,threading
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
ID='77777777-7777-4777-8777-777777777777'
VENUE=dict(id=ID,name='API venue',city='Montevideo',address='Real API 123',latitude=-34.9,longitude=-56.17,active=False,photos=[],requestAccessMode='ANYWHERE')
requests=[];unavailable=[False]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlsplit(self.path).path
  if not path.startswith('/api/'):return super().do_GET()
  requests.append(path)
  status=503 if path=='/api/venues' and unavailable[0] else 200
  if status==503:data=dict(message='API no disponible para esta prueba')
  elif path=='/api/venues':data=[VENUE]
  elif path=='/api/venues/'+ID:data=VENUE
  elif path.endswith('/google/config'):data=dict(enabled=False)
  else:data=[]
  body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
  for legacy in [False,True]:
   context=browser.new_context(viewport=dict(width=1440,height=1000),service_workers='block');page=context.new_page();page.set_default_timeout(6000);errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   setup="window.TOCA_CONFIG={apiUrl:"+json.dumps(BASE)+"};"
   if legacy:setup+="window.TOCA_CONFIG.mode='demo';window.TOCA_CONFIG.development=true;localStorage.setItem('amplify-mode','demo');localStorage.setItem('amplify-demo',JSON.stringify({venues:[{id:'demo-1',name:'Old fictitious bar'}],requests:[],blocks:[],allows:[]}));"
   page.add_init_script(setup)
   page.goto(BASE+'/#/explore');expect(page.locator('.toca-explore')).to_be_visible()
   assert page.evaluate('state.venues.map(v=>v.name)')==['API venue']
   assert '/api/venues' in requests
   assert page.evaluate('localStorage.getItem("amplify-demo")') is None
   assert page.evaluate('localStorage.getItem("amplify-mode")') is None
   assert page.evaluate('typeof state.demo')=='undefined'
   # Old settings URLs expose account preferences, never environment switches.
   page.evaluate("location.hash='/settings'");expect(page.locator('h1')).to_have_text('Preferencias')
   assert not page.locator('[data-action=switch-demo],[data-action=switch-live],[data-action=reset-demo],#api-url').count()
   assert 'demo' not in page.locator('#app').inner_text().lower()
   # Connection failures must not fall back to fictional venues, and can be retried.
   unavailable[0]=True;page.evaluate("location.hash='/explore'")
   expect(page.locator('#app')).to_contain_text('API no disponible para esta prueba')
   expect(page.locator('#app')).not_to_contain_text('Old fictitious bar')
   retry=page.get_by_role('button',name='Volver a intentar');expect(retry).to_be_visible()
   unavailable[0]=False;before=requests.count('/api/venues');retry.click()
   expect(page.locator('.toca-explore')).to_be_visible()
   assert requests.count('/api/venues')>before
   # Registration header has no duplicate login CTA; registration remains accessible.
   page.evaluate("location.hash='/register'");expect(page.locator('.toca-onboarding')).to_be_visible()
   assert not page.locator('.toca-onboarding header.rule a[href="#/login"]').count()
   assert 'Ya tengo cuenta' not in page.locator('.toca-onboarding header.rule').inner_text()
   expect(page.locator('#onboard-account')).to_be_visible()
   assert not errors,errors
   context.close();print('PASS API-only startup, settings, HTTP errors/retry and registration header; legacy config:',legacy,flush=True)
  # No API override or mode flag: localhost still connects to the real default endpoint.
  context=browser.new_context(service_workers='block');page=context.new_page();called=[]
  page.route('https://**/*',lambda r:r.abort())
  def default_api(r):
   called.append(r.request.url);r.fulfill(content_type='application/json',body=json.dumps([VENUE]) if '/api/venues?' in r.request.url else '[]',headers={'Access-Control-Allow-Origin':'*'})
  page.route('http://localhost:8080/**',default_api)
  page.goto(BASE+'/#/explore');expect(page.locator('.toca-explore')).to_be_visible()
  assert any('/api/venues?' in url for url in called)
  assert page.evaluate('state.venues[0].name')=='API venue'
  context.close();browser.close();print('PASS localhost connects to port 8080 without mode configuration',flush=True)
finally:server.shutdown()
