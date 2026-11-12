"""Retiring the admin requests page keeps request activity and recovery in the dashboard."""
import functools,json,threading
from pathlib import Path
from urllib.parse import urlsplit
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
  v=dict(id=ID,name='Navigation Bar',address='Test street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,active=False,published=True,requestAccessMode='NEARBY')
  def api(route):
   path=urlsplit(route.request.url).path;data=[]
   if path=='/api/auth/me':data=dict(id='owner',name='Owner')
   elif path=='/api/admin/venues':data=[v]
   elif path==f'/api/venues/{ID}':data=v
   elif path.endswith('/stats'):data=dict(tracks=8,repeats=0,synced=8,days=[])
   elif path.endswith('/requests'):data=[dict(id=str(i),title='Song '+str(i),artist='Test band',status='DISPATCHED',createdAt='2026-11-11T20:00:00Z') for i in range(8)]
   elif path.endswith('/music-status'):data=dict(active=False,isPlaying=False,playlist=[])
   route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
  page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
  page.goto(BASE+'/#/admin/requests');page.locator('.toca-ad-dashboard').wait_for()
  assert page.url.endswith('#/admin/general')
  assert page.locator('a[href="#/admin/requests"]').count()==0
  page.locator('.toca-request-history summary').click();assert 'Song 7' in page.locator('.toca-request-history').inner_text()
  page.locator('#toca-request-commands').wait_for();assert 'Estado de pedidos' in page.locator('#toca-request-commands').inner_text()
  page.locator('.toca-admin-menu a[href="#/admin/profile"]').click() if width==1440 else page.locator('.toca-admin-mobile-nav a[href="#/admin/profile"]').click()
  page.locator('[data-venue-profile] .identity').wait_for();assert not errors,errors
  context.close();print('PASS admin navigation, legacy redirect, request history/recovery and Mi Bar:',width,flush=True)
 browser.close()
server.shutdown()
