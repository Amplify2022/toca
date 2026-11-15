"""Real Leaflet/MapLibre SDK geometry with deterministic style and no provider account.
Uses official pinned SDK downloads or TOCA_MAP_TEST_ASSETS cache. Tiles/style contents
are simulated; this does not validate the remote tile provider's availability.
"""
import os,threading,urllib.request,json,functools
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
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
   page.evaluate("""()=>{const v=state.venues.find(v=>v.genre.includes('Rock'));Object.assign(v,{name:'Bluzz Bar',genre:'Rock, Cumbia',instagramHandle:'bluzzbar',coverPhotoUrl:'/api/venues/demo-2/photos/cover',photos:[{url:'/api/venues/demo-2/photos/cover'},{url:'/api/venues/demo-2/photos/second'}]});const d=db();d.venues=d.venues.map(x=>x.id===v.id?{...x,...v}:x);saveDemo(d);} """)
   page.locator('.chip[data-value="Rock"]').click()
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility === '' && document.querySelectorAll('#leaflet-map .leaflet-marker-icon').length===1")
   pin=page.locator('#leaflet-map .leaflet-marker-icon');pin.click()
   panel=page.locator('.toca-place-panel');expect(panel).to_be_visible()
   expect(panel.locator('#toca-place-name')).to_have_text('Bluzz Bar')
   assert panel.locator('.place-heading p').inner_text()=='Rock · Cumbia'
   assert panel.locator('.place-status').inner_text()=='Música activa · Demo'
   assert panel.locator('.place-primary').get_attribute('href')=='#/request/demo-2'
   expect(panel.locator('.place-primary')).to_have_text('Pedir una canción')
   expect(panel.locator('.place-request-help')).to_have_text('Elegí tu tema y sumalo a la playlist del bar.')
   assert panel.locator('.place-actions>a').count()==1
   assert panel.locator('.place-primary').bounding_box()['height']==34
   assert panel.locator('.place-primary').bounding_box()['width']<180
   assert panel.locator('.place-music').bounding_box()['y']<panel.locator('.place-primary').bounding_box()['y']<panel.locator('.place-photos').bounding_box()['y']
   ig=panel.get_by_role('link',name='Instagram de Bluzz Bar (se abre en otra pestaña)',exact=True)
   assert ig.get_attribute('href')=='https://www.instagram.com/bluzzbar/'
   assert ig.get_attribute('target')=='_blank' and 'noopener' in ig.get_attribute('rel')
   assert ig.inner_text()=='@bluzzbar'
   assert ig.bounding_box()['y']>=panel.locator('.place-address').bounding_box()['y']+panel.locator('.place-address').bounding_box()['height']-1
   assert panel.locator('.place-photos>button').count()==2
   assert all(src.startswith('http://localhost:8080/api/venues/') for src in panel.locator('.place-photos img').evaluate_all('(imgs)=>imgs.map(i=>i.src)'))
   assert page.locator('.leaflet-popup').count()==0
   page.wait_for_function("!!document.querySelector('.toca-place-selected') && state.map.getSize().y===document.getElementById('leaflet-map').clientHeight")
   box=panel.bounding_box();selected=page.locator('.toca-place-selected').bounding_box()
   if width<=760:
    assert box['width']==width and 900*.45<box['height']<900*.58,box
    assert selected['y']+selected['height']<box['y'],(selected,box)
    handle=panel.locator('[data-place-expand]')
    drag=handle.bounding_box();page.mouse.move(drag['x']+drag['width']/2,drag['y']+drag['height']/2);page.mouse.down();page.mouse.move(drag['x']+drag['width']/2,drag['y']-85,steps=7);page.mouse.up()
    expect(handle).to_have_attribute('aria-expanded','true')
    panel.get_by_role('button',name='Reducir ficha del bar',exact=True).click()
    expect(handle).to_have_attribute('aria-expanded','false')
    page.wait_for_function("height=>Math.abs(document.querySelector('.toca-place-panel').getBoundingClientRect().height-height)<1",arg=box['height'])
   else:
    assert box['x']<30 and box['width']==366 and selected['x']>box['x']+box['width'],(box,selected)
   assert panel.locator('.place-close svg,.place-primary svg,.place-social-handle svg').evaluate_all("icons=>icons.every(icon=>{const i=icon.getBoundingClientRect(),b=icon.parentElement.getBoundingClientRect();return i.x>=b.x&&i.y>=b.y&&i.right<=b.right&&i.bottom<=b.bottom})")
   page.locator('.toca-map-art').screenshot(path=f'/tmp/toca-map-panel-{width}.png')
   panel.get_by_role('button',name='Abrir foto 1 de Bluzz Bar',exact=True).click()
   expect(panel.locator('dialog')).to_be_visible()
   panel.get_by_role('button',name='Cerrar foto',exact=True).click()
   panel.get_by_role('button',name='Cerrar ficha del bar',exact=True).click()
   expect(panel).to_have_count(0)
   assert not page.evaluate("document.body.classList.contains('toca-place-map-open')")
   page.wait_for_function("state.map.getSize().y===document.getElementById('leaflet-map').clientHeight")
   pin.focus();page.keyboard.press('Enter');expect(panel).to_be_visible();page.keyboard.press('Escape');expect(panel).to_have_count(0)
   # Escaped text, invalid Instagram and failed uploads keep a usable real panel.
   page.evaluate("""()=>{const marker=Object.values(state.map._layers).find(x=>x instanceof L.Marker);tocaOpenMapVenue({...state.venues.find(v=>v.genre.includes('Rock')),name:'Bar <b>con nombre muy largo para probar</b>',active:false,instagramHandle:'javascript:bad',coverPhotoUrl:'/api/venues/demo-2/photos/broken',photos:[]},marker,state.map)}""")
   expect(panel).to_be_visible()
   assert panel.locator('.place-heading b').count()==0 and '<b>' in panel.locator('#toca-place-name').inner_text()
   assert panel.locator('.place-social-handle').count()==0
   expect(panel.locator('.place-no-photo')).to_be_visible()
   assert panel.locator('.place-photos img').count()==0
   expect(panel.locator('.place-music')).to_have_text('Por el momento no podés pedir canciones en este bar.')
   expect(panel.locator('.place-primary')).to_have_count(0)
   expect(panel.locator('.place-request-help')).to_have_count(0)
   panel.get_by_role('button',name='Cerrar ficha del bar',exact=True).click()
   expect(panel).to_have_count(0)
   pin.click()
   expect(panel.locator('.place-primary')).to_be_visible()
   panel.locator('.place-primary').click();page.wait_for_url('**/#/request/demo-2')
   expect(page.locator('#song-search')).to_be_visible()
   page.wait_for_function("!document.body.classList.contains('toca-place-map-open')")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   context.close();print('PASS real SDK map and place panel: compact request action, song first, Instagram handle, mobile/desktop layout, photos, close, keyboard, drag, missing data and song-search navigation:',width,flush=True)
  browser.close()
finally:server.shutdown()
