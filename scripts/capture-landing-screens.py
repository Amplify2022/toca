"""Capture current app screens with synthetic fixtures for the public site's walkthrough."""
import functools,json,math,threading
from pathlib import Path
from urllib.parse import urlsplit
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'web/assets/landing';OUT.mkdir(parents=True,exist_ok=True)
MAP=Path('/tmp/toca-map-assets');ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')));threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
CDN='https://cdn.jsdelivr.net/npm/'
sdk={CDN+p:MAP/n for p,n in [('leaflet@1.9.4/dist/leaflet.js','leaflet.js'),('leaflet@1.9.4/dist/leaflet.css','leaflet.css'),('maplibre-gl@5.24.0/dist/maplibre-gl.js','maplibre.js'),('maplibre-gl@5.24.0/dist/maplibre-gl.css','maplibre.css'),('@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js','bridge.js')]}
PHOTO=f'/api/venues/{ID}/photos/marketing-fixture'
venue=dict(id=ID,name='Bar Central',city='Montevideo',address='Avenida Principal 123',latitude=-34.9078,longitude=-56.2012,genre='Rock, Cumbia',description='Un lugar para encontrarse, compartir música y hacer de cada noche una buena historia.',instagramHandle='',active=True,published=True,spotifyConnected=True,requestAccessMode='ANYWHERE',coverPhotoUrl=PHOTO,photos=[dict(id='cover',url=PHOTO)])
venues=[venue,dict(venue,id='88888888-8888-4888-8888-888888888888',name='Bar del Parque',latitude=venue['latitude']+.010,longitude=venue['longitude']-.017),dict(venue,id='99999999-9999-4999-8999-999999999999',name='Bar de la Esquina',latitude=venue['latitude']+.014,longitude=venue['longitude']+.019)]
# Match the 850:520 background's aspect ratio in Web Mercator, not raw lat/lon.
# The map renderer then preserves street and text proportions at every zoom.
span=.16;center_y=math.log(math.tan(math.pi/4+math.radians(venue['latitude'])/2))
half_y=math.radians(span)*520/850/2
north=math.degrees(2*math.atan(math.exp(center_y+half_y))-math.pi/2)
south=math.degrees(2*math.atan(math.exp(center_y-half_y))-math.pi/2)
west,east=venue['longitude']-span/2,venue['longitude']+span/2
map_corners=[[west,north],[east,north],[east,south],[west,south]]
tracks=[dict(id=letter*22,title=title,artist=artist,durationMs=duration,imageUrl=BASE+'/assets/landing/track-cover.svg') for letter,title,artist,duration in [('A','Original Prankster','The Offspring, Redman',221000),('B','Get Lucky','Daft Punk, Pharrell Williams',369000),('C','Midnight City','M83',243000),('D','Like a Prayer','Madonna',345000)]]
model={'balance':0}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport=dict(width=390,height=780),device_scale_factor=1,service_workers='block')
 context.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('toca:customer:session','synthetic-marketing-customer-session-abcdefghijklmnopqrstuvwxyz')")
 page=context.new_page();errors=[];logs=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:logs.append(msg.text) if msg.type in ['warning','error'] else None)
 def reply(route,data):route.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
 def wallet():return dict(balance=model['balance'],requestCost=1,packs=[dict(id=str(n),tokens=n,price=v) for n,v in [(5,99),(12,199),(30,399)]],movements=[],simulationEnabled=True)
 def api(route):
  req=route.request;url=req.url;path=urlsplit(url).path
  if url in sdk:return route.fulfill(body=sdk[url].read_bytes(),content_type='text/css' if url.endswith('.css') else 'text/javascript')
  if path==PHOTO:return route.fulfill(body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes(),content_type='image/webp',headers={'Access-Control-Allow-Origin':'*'})
  if url.startswith('https://tiles.versatiles.org/'):
   return reply(route,dict(version=8,sources={'illustration':dict(type='image',url=BASE+'/assets/landing/map-demo.png',coordinates=map_corners)},layers=[dict(id='background',type='background',paint={'background-color':'#101d20'}),dict(id='map',type='raster',source='illustration')]))
  if url.startswith(BASE):return route.continue_()
  if not url.startswith('http://localhost:8080'):return route.abort()
  if req.method=='OPTIONS':return reply(route,{})
  if path=='/api/customers/me':return reply(route,dict(id='marketing-customer',name='Nacho',email='hola@example.test',roles=['CUSTOMER']))
  if path=='/api/customers/me/wallet':return reply(route,wallet())
  if path=='/api/customers/me/wallet/topups':model['balance']+=int(req.post_data_json['packId']);return reply(route,dict(wallet(),creditedTokens=int(req.post_data_json['packId'])))
  if path.endswith('/requests') and req.method=='POST':model['balance']-=1;return reply(route,dict(status='DISPATCHED',commandId='marketing-request'))
  if path.endswith('/presence'):return reply(route,dict(allowed=True,mode='ANYWHERE'))
  if path.endswith('/google/config'):return reply(route,dict(enabled=False,clientId=''))
  if path=='/api/venues':return reply(route,venues)
  if path==f'/api/venues/{ID}':return reply(route,venue)
  if path.endswith('/tracks'):return reply(route,tracks)
  if path.endswith('/playback'):return reply(route,dict(active=True,isPlaying=True,now=tracks[2]))
  if path.endswith('/music-status'):return reply(route,dict(active=True,isPlaying=True,now=tracks[2],playlist=tracks,samePlaylist=True))
  if path=='/api/auth/me':return reply(route,dict(id='marketing-owner',name='Nacho',email='owner@example.test'))
  if path=='/api/admin/venues':return reply(route,[venue])
  if path.endswith('/spotify/status'):return reply(route,dict(connected=True,profile='Bar Central',controlEnabled=True,playlistWriteEnabled=True,playlistId='P'*22))
  if path.endswith('/music/playlist'):return reply(route,dict(playlist=dict(id='P'*22,name='La noche en Bar Central',snapshot='s1',tracks=tracks),operation=None))
  if path.endswith('/music/player'):return reply(route,dict(now=tracks[2],isPlaying=True,contextUri='spotify:playlist:'+'P'*22,progressMs=76000,shuffle=False,repeat='off',device=dict(id='browser',name='TOCÁ · Bar Central',volume=65)))
  return reply(route,[])
 page.route('**/*',api)
 page.set_viewport_size(dict(width=850,height=520));page.goto(BASE+'/assets/landing/map-background.svg');page.locator('svg').screenshot(path=str(OUT/'map-demo.png'));page.set_viewport_size(dict(width=390,height=780))
 page.goto(BASE+'/#/explore')
 try:
  marker=page.get_by_role('button',name='Ver detalles de Bar Central',exact=True);marker.wait_for(timeout=10000)
  # Use a wider map view in the homepage screenshot before the venue sheet centers it.
  page.evaluate('state.map.setZoom(13,{animate:false})')
  marker.click()
 except Exception:
  page.screenshot(path='/tmp/toca-landing-capture-failed.png');print('Capture diagnostics:',errors,logs,page.evaluate('({maps:typeof L,loader:typeof tocaLoadMaps,map:!!state.map})'),page.locator('#app').inner_text()[:300],flush=True);raise
 expect(page.locator('.place-primary')).to_be_visible();page.wait_for_timeout(500)
 expect(page.locator('.toca-map-venue-pin-v1845')).to_have_count(3)
 assert page.locator('.toca-map-venue-pin-v1845').all_text_contents()==['♫']*3
 projected_aspect=page.evaluate("""corners=>{const project=([lon,lat])=>state.map.project([lat,lon]),nw=project(corners[0]),ne=project(corners[1]),sw=project(corners[3]);return (ne.x-nw.x)/(sw.y-nw.y)}""",map_corners)
 assert math.isclose(projected_aspect,850/520,rel_tol=.0001),'Map background must retain its native proportions after projection'
 assert page.locator('.toca-map-venue-pin-v1845').evaluate_all("nodes=>nodes.every(node=>{const box=node.getBoundingClientRect();return Math.abs(box.width-box.height)<.01})"),'Music markers must remain circular'
 page.screenshot(path=str(OUT/'explore.png'));page.locator('.place-primary').click();page.locator('#song-search').fill('Original');page.locator('[data-action=request]').first.wait_for();page.wait_for_timeout(200)
 page.screenshot(path=str(OUT/'search.png'));page.locator('[data-action=request]').first.click();panel=page.locator('#toca-token-recharge');expect(panel).to_be_visible();page.wait_for_timeout(200)
 page.screenshot(path=str(OUT/'tokens.png'));panel.locator('label').filter(has=page.locator('input[value="5"]')).click();panel.locator('[data-wallet-topup]').click();expect(page.locator('#toca-song-added')).to_be_visible();page.wait_for_timeout(300)
 page.screenshot(path=str(OUT/'success.png'));expect(page).to_have_url(BASE+'/#/venue/'+ID)
 page.evaluate("state.token='synthetic-marketing-owner-session';state.user={id:'marketing-owner',name:'Nacho'};sessionStorage.setItem('amplify-token',state.token);sessionStorage.setItem('amplify-user',JSON.stringify(state.user))")
 page.set_viewport_size(dict(width=1100,height=720));page.goto(BASE+'/#/admin/music');page.reload();page.locator('[data-track-index="3"]').wait_for();page.wait_for_timeout(250);page.evaluate('document.activeElement?.blur()');page.screenshot(path=str(OUT/'admin-music.png'))
 assert not errors,errors
 browser.close()
server.shutdown();print('Captured actual app walkthrough screens with synthetic fixtures',flush=True)
