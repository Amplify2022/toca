"""Real selection UI with controlled API reads; no music mutations or accounts."""
import functools,json,os,threading
from pathlib import Path
from urllib.parse import urlsplit
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
ASSETS=Path(os.environ.get('TOCA_MAP_TEST_ASSETS','/tmp/toca-map-assets'))
if not all((ASSETS/name).exists() for name in ['leaflet.js','leaflet.css','maplibre.js','maplibre.css','bridge.js']):
 raise SystemExit('Run scripts/test-map-layout.py first to populate pinned map SDK assets')
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
CDN='https://cdn.jsdelivr.net/npm/'
sdk={CDN+path:ASSETS/name for path,name in [('leaflet@1.9.4/dist/leaflet.js','leaflet.js'),('leaflet@1.9.4/dist/leaflet.css','leaflet.css'),('maplibre-gl@5.24.0/dist/maplibre-gl.js','maplibre.js'),('maplibre-gl@5.24.0/dist/maplibre-gl.css','maplibre.css'),('@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js','bridge.js')]}
ONE='77777777-7777-4777-8777-777777777777';TWO='88888888-8888-4888-8888-888888888888'
venues=[dict(id=id,name=name,city='Montevideo',address='Test 123',description='Descripción real del endpoint.',genre='Rock',latitude=-34.9,longitude=lon,active=True,coverPhotoUrl=f'/api/venues/{id}/photos/cover',photos=[dict(url=f'/api/venues/{id}/photos/cover')],instagramHandle='bluzzbar') for id,name,lon in [(ONE,'Bar Uno',-56.17),(TWO,'Bar Dos',-56.167)]]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for width in [390,1440]:
   context=browser.new_context(viewport=dict(width=width,height=950),service_workers='block')
   context.add_init_script("localStorage.setItem('amplify-mode','live')")
   page=context.new_page();held=[];errors=[];calls=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   model={'hold':True,'fail':False}
   def reply(route,data,status=200):route.fulfill(status=status,body=json.dumps(data),content_type='application/json',headers={'Access-Control-Allow-Origin':'*'})
   def intercept(route):
    url=route.request.url;path=urlsplit(url).path
    if url.startswith(base):return route.continue_()
    if url in sdk:return route.fulfill(body=sdk[url].read_bytes(),content_type='text/css' if url.endswith('.css') else 'text/javascript')
    if url.startswith('https://tiles.versatiles.org/'):
     return reply(route,dict(version=8,sources={},layers=[dict(id='bg',type='background',paint={'background-color':'#10191b'})]))
    if not url.startswith('http://localhost:8080'):return route.abort()
    calls.append((route.request.method,path))
    if '/photos/' in path:return route.fulfill(body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes(),content_type='image/webp')
    if path=='/api/venues':return reply(route,venues)
    if path.endswith('/music-status'):
     if model['fail']:return reply(route,dict(message='Provider unavailable'),503)
     if ONE in path and model['hold']:model['hold']=False;held.append(route);return
     return reply(route,dict(active=True,isPlaying=False,now=dict(title='Canción del segundo bar',artist='Artista del segundo bar')))
    if path in ['/api/venues/'+ONE,'/api/venues/'+TWO]:return reply(route,next(v for v in venues if v['id']==path.split('/')[-1]))
    return reply(route,[])
   page.route('**/*',intercept);page.goto(base+'/#/explore')
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility==='' && !!state.map")
   page.get_by_role('button',name='Ver detalles de Bar Uno',exact=True).click()
   panel=page.locator('.toca-place-panel');expect(panel.locator('#toca-place-name')).to_have_text('Bar Uno')
   expect(panel.locator('.place-music')).to_contain_text('Consultando')
   page.wait_for_function("!!document.querySelector('.toca-place-map')")
   # Select the second marker even if a small viewport requires panning to it.
   page.evaluate("()=>Object.values(state.map._layers).find(l=>l instanceof L.Marker&&l.options.title==='Bar Dos').fire('click')")
   expect(panel.locator('#toca-place-name')).to_have_text('Bar Dos')
   expect(panel.locator('.place-music')).to_contain_text('Canción del segundo bar')
   expect(panel.locator('.place-music')).to_contain_text('REPRODUCCIÓN PAUSADA')
   assert panel.locator('.place-equalizer').count()==0
   assert held
   reply(held.pop(),dict(active=True,isPlaying=True,now=dict(title='Canción del primer bar',artist='Otro artista')))
   page.wait_for_load_state('networkidle')
   assert 'Canción del primer bar' not in panel.inner_text()
   model['fail']=True
   page.evaluate("()=>Object.values(state.map._layers).find(l=>l instanceof L.Marker&&l.options.title==='Bar Uno').fire('click')")
   expect(panel.locator('.place-music')).to_contain_text('No pudimos consultar')
   assert panel.locator('.place-primary').get_attribute('href')=='#/venue/'+ONE
   expect(panel.locator('.place-photos img')).to_be_visible()
   # Route departure cancels the selected bar's lifecycle and restores scrolling.
   panel.locator('.place-primary').click();page.wait_for_url('**/#/venue/'+ONE)
   expect(panel).to_have_count(0)
   page.wait_for_function("!document.body.classList.contains('toca-place-map-open')")
   assert not errors,errors
   assert all(method=='GET' for method,path in calls),calls
   assert not any('/requests' in path for method,path in calls if method!='GET')
   context.close();print('PASS live map panel:',width,'API venue/photos, stale playback isolation, paused status, provider failure, profile navigation and read-only requests',flush=True)
  browser.close()
finally:server.shutdown()
