"""Real Leaflet/MapLibre SDK geometry with deterministic style and no provider account.
Uses official pinned SDK downloads or TOCA_MAP_TEST_ASSETS cache. Tiles/style contents
are simulated; this does not validate the remote tile provider's availability.
"""
import os,threading,urllib.request,json,functools
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CDN='https://cdn.jsdelivr.net/npm/'
FILES={'leaflet@1.9.4/dist/leaflet.js':'leaflet.js','leaflet@1.9.4/dist/leaflet.css':'leaflet.css','maplibre-gl@5.24.0/dist/maplibre-gl.js':'maplibre.js','maplibre-gl@5.24.0/dist/maplibre-gl.css':'maplibre.css','@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js':'bridge.js'}
assets={}
for path,name in FILES.items():
 cache=Path(os.environ.get('TOCA_MAP_TEST_ASSETS','/tmp/toca-map-assets'))/name
 assets[CDN+path]=cache.read_bytes() if cache.exists() else urllib.request.urlopen(CDN+path,timeout=30).read()
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for width in [390,1440]:
   context=browser.new_context(viewport={'width':width,'height':900},service_workers='block');page=context.new_page();styles=[]
   def handle(route):
    url=route.request.url
    if url.startswith(base):route.continue_();return
    if url in assets:
     route.fulfill(body=assets[url],content_type='text/css' if url.endswith('.css') else 'application/javascript');return
    if url.startswith('https://tiles.versatiles.org/'):
     styles.append(url);route.fulfill(content_type='application/json',body=json.dumps({'version':8,'sources':{},'layers':[{'id':'background','type':'background','paint':{'background-color':'#10191b'}}]}));return
    route.abort()
   page.route('**/*',handle)
   page.goto(base+'/#/explore')
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility === '' && !!document.querySelector('#leaflet-map .maplibregl-canvas')",timeout=20000)
   assert styles and 'gray-dark' in styles[0]
   dimensions=page.evaluate("""()=>{const el=document.getElementById('leaflet-map'),size=state.map.getSize();return {width:el.clientWidth,height:el.clientHeight,x:size.x,y:size.y}}""")
   assert dimensions['width']>200 and dimensions['height']>200,dimensions
   assert abs(dimensions['x']-dimensions['width'])<=1 and abs(dimensions['y']-dimensions['height'])<=1,dimensions
   assert page.locator('#leaflet-map .leaflet-marker-icon').count()==6
   page.locator('#leaflet-map').screenshot(path=f'/tmp/toca-fixed-map-{width}.png')
   page.locator('.chip[data-value="Rock"]').click()
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility === '' && document.querySelectorAll('#leaflet-map .leaflet-marker-icon').length===1")
   context.close();print('PASS real SDK map sizing, dark style, markers and filter reload:',width)
  browser.close()
finally:server.shutdown()
