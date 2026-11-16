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
ART_ONE='https://i.scdn.co/image/toca-test-cover-one';ART_TWO='https://i.scdn.co/image/toca-test-cover-two';ART_BROKEN='https://i.scdn.co/image/toca-test-cover-broken'
UNAVAILABLE='Por el momento no podés pedir canciones en este bar.'
venues=[dict(id=id,name=name,city='Montevideo',address='Test 123',description='Descripción real del endpoint.',genre='Rock',latitude=-34.9,longitude=lon,active=True,coverPhotoUrl=f'/api/venues/{id}/photos/cover',photos=[dict(url=f'/api/venues/{id}/photos/cover')],instagramHandle='bluzzbar') for id,name,lon in [(ONE,'Bar Uno',-56.17),(TWO,'Bar Dos',-56.167)]]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for width in [390,1440]:
   context=browser.new_context(viewport=dict(width=width,height=950),service_workers='block')
   authenticated=width==1440
   if authenticated:context.add_init_script("sessionStorage.setItem('toca:customer:session','synthetic-map-customer-session-abcdefghijklmnopqrstuvwxyz')")
   page=context.new_page();page.clock.install();held=[];errors=[];calls=[];art_calls=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   model={'hold':True,'mode':'paused','image':ART_TWO,'title':'Canción del segundo bar'}
   def reply(route,data,status=200):route.fulfill(status=status,body=json.dumps(data),content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type,X-TOCA-Customer,X-TOCA-Join,Idempotency-Key','Access-Control-Allow-Methods':'GET,OPTIONS'})
   def intercept(route):
    url=route.request.url;path=urlsplit(url).path
    if url.startswith(base):return route.continue_()
    if url in sdk:return route.fulfill(body=sdk[url].read_bytes(),content_type='text/css' if url.endswith('.css') else 'text/javascript')
    if url.startswith('https://tiles.versatiles.org/'):
     return reply(route,dict(version=8,sources={},layers=[dict(id='bg',type='background',paint={'background-color':'#10191b'})]))
    if url in [ART_ONE,ART_TWO,ART_BROKEN]:
     art_calls.append(url)
     if url==ART_BROKEN:return route.fulfill(status=404,body='Not found')
     return route.fulfill(body=(ROOT/('web/assets/venues/bar-1.webp' if url==ART_ONE else 'web/assets/venues/bar-3.webp')).read_bytes(),content_type='image/webp')
    if not url.startswith('http://localhost:8080'):return route.abort()
    calls.append((route.request.method,path))
    if route.request.method=='OPTIONS':return reply(route,{})
    if path=='/api/customers/me':return reply(route,dict(id='test-customer',name='Test Customer',email='customer@example.test',roles=['CUSTOMER']) if authenticated else dict(message='Sesión requerida'),200 if authenticated else 401)
    if path=='/api/customers/me/wallet':return reply(route,dict(balance=0,reserved=0,requestCost=1,packs=[],movements=[],simulationEnabled=True))
    if '/photos/' in path:return route.fulfill(body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes(),content_type='image/webp')
    if path=='/api/venues':return reply(route,venues)
    if path.endswith('/playback'):
     if model['mode']=='fail':return reply(route,dict(message='Provider unavailable'),503)
     if ONE in path and model['hold']:model['hold']=False;held.append(route);return
     return reply(route,dict(active=model['mode']!='disabled',isPlaying=model['mode']!='paused',now=None if model['mode']=='empty' else dict(title=model['title'],artist='Artista del segundo bar',imageUrl=model['image'])))
    if path in ['/api/venues/'+ONE,'/api/venues/'+TWO]:return reply(route,next(v for v in venues if v['id']==path.split('/')[-1]))
    if path.endswith('/tracks'):return reply(route,[dict(id='A'*22,title='Canción de prueba para pedir',artist='Artista de prueba',durationMs=180000)])
    return reply(route,[])
   page.route('**/*',intercept);page.goto(base+'/#/explore')
   page.wait_for_function("document.getElementById('leaflet-map')?.style.visibility==='' && !!state.map")
   page.get_by_role('button',name='Ver detalles de Bar Uno',exact=True).click()
   panel=page.locator('.toca-place-panel');expect(panel.locator('#toca-place-name')).to_have_text('Bar Uno')
   expect(panel.locator('.place-music')).to_contain_text('Consultando')
   expect(panel.locator('.place-primary')).to_have_count(0)
   page.wait_for_function("!!document.querySelector('.toca-place-map')")
   # Select the second marker even if a small viewport requires panning to it.
   page.evaluate("()=>Object.values(state.map._layers).find(l=>l instanceof L.Marker&&l.options.title==='Bar Dos').fire('click')")
   expect(panel.locator('#toca-place-name')).to_have_text('Bar Dos')
   expect(panel.locator('.place-music')).to_have_text(UNAVAILABLE)
   expect(panel.locator('.place-primary')).to_have_count(0)
   assert panel.locator('.place-equalizer').count()==0
   assert held
   reply(held.pop(),dict(active=True,isPlaying=True,now=dict(title='Canción del primer bar',artist='Otro artista',imageUrl=ART_ONE)))
   page.wait_for_load_state('networkidle')
   assert 'Canción del primer bar' not in panel.inner_text()
   expect(panel.locator('.place-primary')).to_have_count(0)
   assert not art_calls,'A stale or paused song must not load artwork'
   def refresh(mode):
    model['mode']=mode
    with page.expect_response(lambda response:response.url.endswith('/playback')) as response:
     page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    response.value.body()
   cover=panel.locator('.place-song-cover img')
   refresh('playing')
   expect(panel.locator('.place-primary')).to_be_visible()
   expect(cover).to_have_attribute('src',ART_TWO)
   page.wait_for_function("document.querySelector('.place-song-cover img')?.naturalWidth>0")
   assert cover.evaluate("img=>Math.abs(img.getBoundingClientRect().width-img.parentElement.getBoundingClientRect().width)<=2")
   page.screenshot(path=f'/tmp/toca-map-current-cover-{width}.png')
   page.evaluate("window.__songNodes=[document.querySelector('.place-song-cover img'),document.querySelector('.place-equalizer'),document.querySelector('.place-primary')]")
   with page.expect_response(lambda response:response.url.endswith('/playback')):page.clock.run_for(1100)
   assert page.evaluate("window.__songNodes.every((node,i)=>node===document.querySelector(['.place-song-cover img','.place-equalizer','.place-primary'][i]))"),'Polling must not restart the artwork, animation or focused request link'
   model['image']=ART_ONE;model['title']='Nueva canción del bar seleccionado'
   # Regress the original delay: an ordinary track change is detected by the
   # next one-second sample, with no visibility event or manual refresh.
   with page.expect_response(lambda response:response.url.endswith('/playback')):page.clock.run_for(1100)
   expect(cover).to_have_attribute('src',ART_ONE)
   expect(panel.locator('.place-song-copy strong')).to_have_text(model['title'])
   page.wait_for_function("document.querySelector('.place-song-cover img')?.naturalWidth>0")
   model['image']=ART_BROKEN
   refresh('playing');expect(cover).to_have_count(0)
   expect(panel.locator('.place-song-cover svg')).to_be_visible()
   expect(panel.locator('.place-primary')).to_be_visible()
   model['image']='javascript:alert(1)'
   refresh('playing');expect(cover).to_have_count(0)
   model['image']=ART_TWO
   for mode in ['paused','disabled','empty','fail']:
    refresh('playing');expect(panel.locator('.place-primary')).to_be_visible()
    refresh(mode)
    expect(panel.locator('.place-music')).to_have_text(UNAVAILABLE)
    expect(panel.locator('.place-primary')).to_have_count(0)
    expect(panel.locator('.place-request-help')).to_have_count(0)
    expect(cover).to_have_count(0)
   assert 'javascript:alert(1)' not in art_calls
   model['mode']='playing'
   page.evaluate("()=>Object.values(state.map._layers).find(l=>l instanceof L.Marker&&l.options.title==='Bar Uno').fire('click')")
   expect(panel.locator('.place-primary')).to_be_visible()
   assert panel.locator('.place-primary').get_attribute('href')=='#/request/'+ONE
   expect(panel.locator('.place-photos img')).to_be_visible()
   assert not any(path.endswith('/music-status') or path.endswith('/playlist') for method,path in calls),calls
   # Route departure cancels the selected bar's lifecycle and restores scrolling.
   panel.get_by_role('link',name='Pedir una canción',exact=True).click()
   if authenticated:
    page.wait_for_url('**/#/request/'+ONE)
    expect(page.locator('#song-search')).to_be_visible()
    page.locator('#song-search').fill('Canción')
    expect(page.get_by_text('Canción de prueba para pedir',exact=True)).to_be_visible()
   else:
    page.wait_for_url('**/#/customer/login')
    expect(page.locator('#toca-customer-auth-form')).to_be_visible()
    assert page.evaluate("sessionStorage.getItem('toca:customer:after-login')")=='#/request/'+ONE
   expect(panel).to_have_count(0)
   page.wait_for_function("!document.body.classList.contains('toca-place-map-open')")
   assert not errors,errors
   assert all(method in ['GET','OPTIONS'] for method,path in calls),calls
   assert not any('/requests' in path for method,path in calls if method!='GET')
   context.close();print('PASS live map panel:',width,'one-second song/cover updates without manual refresh, stable animation/DOM, artwork fallback, availability, stale-state isolation, search/login and lightweight read-only requests',flush=True)
  browser.close()
finally:server.shutdown()
