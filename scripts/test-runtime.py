"""PWA offline shell stays available; private API data is never cached or replaced by demo data."""
import functools,json,threading
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlsplit(self.path).path
  if not path.startswith('/api/'):return super().do_GET()
  data=[dict(id='77777777-7777-4777-8777-777777777777',name='API runtime bar',active=False,city='Montevideo',latitude=-34.9,longitude=-56.17)] if path=='/api/venues' else []
  body=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);c=b.new_context();page=c.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda r:r.abort())
  page.add_init_script('window.TOCA_CONFIG={apiUrl:'+json.dumps(BASE)+'}')
  page.goto(BASE+'/#/explore');expect(page.locator('.toca-explore')).to_be_visible()
  assert page.evaluate('state.venues[0].name')=='API runtime bar'
  page.wait_for_function('!!navigator.serviceWorker.controller')
  keys=page.evaluate('async()=>{const keys=[];for(const name of await caches.keys()){const cache=await caches.open(name);keys.push(...(await cache.keys()).map(r=>new URL(r.url).pathname))}return keys}')
  assert '/index.html' in keys and '/app.js' in keys
  assert not any(path.startswith('/api/') for path in keys)
  c.set_offline(True);page.reload();expect(page.get_by_role('button',name='Volver a intentar')).to_be_visible()
  assert not page.locator('#app').get_by_text('API runtime bar',exact=True).count()
  assert page.evaluate('state.venues.length')==0
  c.set_offline(False);page.get_by_role('button',name='Volver a intentar').click()
  expect(page.locator('.toca-explore')).to_be_visible()
  assert page.evaluate('state.venues[0].name')=='API runtime bar'
  assert not errors,errors
  b.close();print('PASS installed shell offline reload, uncached API errors and online retry')
finally:server.shutdown()
