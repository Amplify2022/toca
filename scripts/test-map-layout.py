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
 if not cache.exists():
  cache.parent.mkdir(parents=True,exist_ok=True);cache.write_bytes(urllib.request.urlopen(CDN+path,timeout=30).read())
 assets[CDN+path]=cache.read_bytes()
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for width in [320,390,1440]:
   context=browser.new_context(viewport={'width':width,'height':900},service_workers='block');page=context.new_page();styles=[]
   def handle(route):
    url=route.request.url
    if url.startswith(base):route.continue_();return
    if url.startswith('http://localhost:8080/api/venues/') and '/photos/' in url:
     if url.endswith('/broken'):route.fulfill(status=404,body='Not found');return
     route.fulfill(body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes(),content_type='image/webp');return
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
   # Rebuild one real Leaflet marker using the same photo URL format as the API.
   page.evaluate("""()=>{const v=state.venues.find(v=>v.genre.includes('Rock'));Object.assign(v,{name:'Bluzz Bar',genre:'Rock, Cumbia',instagramHandle:'bluzzbar',coverPhotoUrl:'/api/venues/demo-2/photos/cover'});const d=db();d.venues=d.venues.map(x=>x.id===v.id?{...x,...v}:x);saveDemo(d);} """)
   page.locator('.chip[data-value="Rock"]').click()
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility === '' && document.querySelectorAll('#leaflet-map .leaflet-marker-icon').length===1")
   pin=page.locator('#leaflet-map .leaflet-marker-icon');pin.click()
   card=page.locator('.toca-venue-popup .toca-popup-card');card.wait_for()
   page.wait_for_function("document.querySelector('.toca-popup-cover')?.naturalWidth>0")
   assert card.locator('.toca-popup-name').inner_text()=='Bluzz Bar'
   assert card.locator('.toca-popup-meta').inner_text()=='Rock · Cumbia'
   assert card.locator('.toca-popup-status').inner_text()=='Música activa'
   assert card.locator('.toca-popup-open').inner_text()=='Ver bar'
   assert card.locator('.toca-popup-open').get_attribute('href')=='#/venue/demo-2'
   ig=card.get_by_role('link',name='Instagram de Bluzz Bar (se abre en otra pestaña)',exact=True)
   assert ig.get_attribute('href')=='https://www.instagram.com/bluzzbar/'
   assert ig.get_attribute('target')=='_blank' and 'noopener' in ig.get_attribute('rel')
   assert 'Pocitos' not in card.inner_text() and 'Montevideo' not in card.inner_text()
   assert '→' not in card.inner_text() and '↗' not in card.inner_text()
   page.wait_for_function("""()=>{const c=document.querySelector('.toca-popup-card').getBoundingClientRect(),m=document.getElementById('leaflet-map').getBoundingClientRect();return c.left>=m.left+14&&c.right<=m.right-14&&c.top>=m.top+14&&c.bottom<=m.bottom-14;}""")
   layout=page.evaluate("""()=>{const box=s=>document.querySelector(s).getBoundingClientRect(),c=box('.toca-popup-card'),p=box('.leaflet-marker-icon'),t=box('.leaflet-popup-tip'),w=getComputedStyle(document.querySelector('.leaflet-popup-content-wrapper'));return {alignment:Math.abs(c.x+c.width/2-p.x-p.width/2),gap:p.top-t.bottom,background:w.backgroundColor,border:w.borderTopWidth,fit:getComputedStyle(document.querySelector('.toca-popup-cover')).objectFit,bar:box('.toca-popup-links').height,ig:box('.toca-popup-instagram').width,tip:getComputedStyle(document.querySelector('.leaflet-popup-tip')).clipPath}}""")
   assert layout['alignment']<=2 and 5<=layout['gap']<=11,layout
   assert layout['background']=='rgba(0, 0, 0, 0)' and layout['border']=='0px',layout
   assert layout['fit']=='cover' and layout['bar']>=44 and layout['ig']>=44,layout
   assert layout['tip'].startswith('polygon('),layout
   alignment=ig.evaluate("""el=>{const a=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return Math.abs(a.y+a.height/2-s.y-s.height/2)}""")
   assert alignment<=1,alignment
   close=page.get_by_role('button',name='Cerrar ficha del bar').bounding_box();zoom=page.locator('.leaflet-control-zoom').bounding_box()
   assert close['y']+close['height']<zoom['y'] or close['x']+close['width']<zoom['x']
   page.locator('#leaflet-map').screenshot(path=f'/tmp/toca-ios-map-card-{width}.png')
   # Keyboard navigation and the native close control retain their behavior.
   card.locator('.toca-popup-open').focus();page.keyboard.press('Tab');assert ig.evaluate('el=>el===document.activeElement')
   page.keyboard.press('Tab')
   assert page.get_by_role('button',name='Cerrar ficha del bar').evaluate('el=>el===document.activeElement')
   page.keyboard.press('Enter')
   page.locator('.toca-venue-popup').wait_for(state='detached')
   # Missing/invalid data stays readable, escaped and free of empty controls.
   page.evaluate("""()=>{const marker=Object.values(state.map._layers).find(x=>x.getPopup?.());marker.setPopupContent(tocaVenuePopup({id:'demo-2',name:'Bar <b>con nombre muy largo para probar que no desborde</b>',genre:'Jazz, Soul, Rock, Música electrónica y todos los géneros',active:false,instagramHandle:'javascript:bad'}));marker.openPopup();}""")
   card.wait_for();assert card.locator('.toca-popup-status').inner_text()=='Música inactiva'
   assert card.locator('.toca-popup-name b').count()==0 and '<b>' in card.locator('.toca-popup-name').inner_text()
   assert card.locator('.toca-popup-instagram').count()==0
   # Simulate a real failed upload URL; fallback must avoid a broken-image icon.
   page.evaluate("""()=>{const marker=Object.values(state.map._layers).find(x=>x.getPopup?.());marker.setPopupContent(tocaVenuePopup({id:'demo-2',name:'Bar sin foto',active:false,coverPhotoUrl:'/api/venues/demo-2/photos/broken'}));marker.openPopup();}""")
   page.wait_for_function("!document.querySelector('.toca-popup-cover')&&document.querySelector('.toca-popup-media.no-photo')")
   assert card.locator('.toca-popup-placeholder').is_visible()
   card.locator('.toca-popup-open').click();page.wait_for_url('**/#/venue/demo-2')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   context.close();print('PASS real SDK map, responsive photo popup, pin alignment, actions, keyboard close, inactive/missing data and photo fallback:',width,flush=True)
  browser.close()
finally:server.shutdown()
