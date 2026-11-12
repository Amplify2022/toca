"""Real profile UI and map SDKs; all provider/API responses are simulated."""
import functools,json,os,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
SHOTS=Path(os.environ.get('TOCA_SCREENSHOT_DIR','/tmp/toca-profile-shots'));SHOTS.mkdir(parents=True,exist_ok=True)
FILES={'leaflet@1.9.4/dist/leaflet.js':'leaflet.js','leaflet@1.9.4/dist/leaflet.css':'leaflet.css','maplibre-gl@5.24.0/dist/maplibre-gl.js':'maplibre.js','maplibre-gl@5.24.0/dist/maplibre-gl.css':'maplibre.css','@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js':'bridge.js'}
ASSETS={'https://cdn.jsdelivr.net/npm/'+key:(Path(os.environ.get('TOCA_MAP_TEST_ASSETS','/tmp/toca-map-assets'))/name).read_bytes() for key,name in FILES.items()}
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for width in [1440,390]:
   context=browser.new_context(viewport=dict(width=width,height=1000),locale='es-UY',service_workers='block');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   venue=dict(id=ID,name='Original Bar',address='Test street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,description='',genre='Jazz',instagramHandle='bar.ig',openingHours='W2|-|19:00-23:00|-|-|-|-|-',requestAccessMode='NEARBY',photos=[],coverPhotoUrl=None,published=False,active=False)
   owned=[venue];patches=[];writes=[];conflict=[False]
   page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner-session');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
   def api(route):
    path=urlsplit(route.request.url).path;method=route.request.method;body=route.request.post_data_json if method in ['POST','PUT','PATCH'] and route.request.post_data else None;data={};status=200
    if method=='OPTIONS':pass
    elif path=='/api/auth/me':data=dict(id='owner',name='Owner')
    elif path=='/api/admin/venues':
     assert method=='GET','Profile must never recreate a registered bar';data=owned
    elif path==f'/api/admin/venues/{ID}' and method=='DELETE':owned.clear();data=dict(deleted=True)
    elif path==f'/api/admin/venues/{ID}' and method=='PATCH':
     if conflict[0]:conflict[0]=False;data=dict(message='Los datos cambiaron en otra pantalla. Recargá y revisá.');status=409
     else:
      for key,val in body['expected'].items():assert val==venue.get(key,''),(key,val,venue.get(key))
      patches.append(body);venue.update(body['changes']);data=venue
    elif path==f'/api/admin/venues/{ID}/request-access':venue['requestAccessMode']=body['mode'];writes.append(body);data=dict(mode=body['mode'],radiusMeters=100,requiresQr=False)
    elif path==f'/api/admin/venues/{ID}/photos':venue['photos']=[dict(id='photo',url=f'/api/venues/{ID}/photos/photo',isPrimary=True)];venue['coverPhotoUrl']=f'/api/venues/{ID}/photos/photo';data=venue
    elif path.endswith('/photos/photo'):route.fulfill(content_type='image/webp',body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes());return
    elif path=='/api/admin/venue-import/status':data=dict(google=True,instagram=True)
    elif path.endswith('/google/search'):data=[dict(id='test-place',name='Imported Bar',address='Other street 456')]
    elif path.endswith('/google/preview'):data=dict(source='Google Maps',fields=dict(name='Imported Bar',address='Other street 456',city='Montevideo',latitude=-34.91,longitude=-56.18,description='Google biography'),warnings=[],details={})
    elif path.endswith('/instagram/preview'):data=dict(source='Instagram',fields=dict(name='Instagram Bar',description='Viernes & Sábados 20 Hs.',instagramHandle='bar.ig'),warnings=[],details={})
    elif path==f'/api/venues/{ID}':data=venue
    elif path.endswith('/request-access'):data=dict(mode=venue['requestAccessMode'],radiusMeters=100,requiresQr=False)
    route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'})
   def handle(route):
    url=route.request.url
    if url.startswith(BASE):route.continue_();return
    if url.startswith('http://localhost:8080'):api(route);return
    if url in ASSETS:route.fulfill(body=ASSETS[url],content_type='text/css' if url.endswith('.css') else 'application/javascript');return
    if url.startswith('https://tiles.versatiles.org/'):route.fulfill(content_type='application/json',body=json.dumps(dict(version=8,sources={},layers=[dict(id='background',type='background',paint={'background-color':'#15231c'})])));return
    route.abort()
   page.route('**/*',handle)
   page.goto(BASE+'/#/admin/profile');page.locator('[data-venue-profile] .identity').wait_for()
   assert page.locator('#venue-update,[data-venue-import],#venue-profile-form').count()==0
   assert 'Tu bar ya está creado.' in page.locator('[data-venue-profile]').inner_text()
   page.screenshot(path=str(SHOTS/f'overview-{width}.png'),full_page=True)
   page.get_by_role('link',name='Editar datos',exact=False).click();page.locator('#profile-name').fill('Edited Bar')
   page.locator('#profile-description').fill('Owner description');page.get_by_role('button',name='Guardar cambios',exact=True).click()
   page.locator('.identity h2').filter(has_text='Edited Bar').wait_for()
   assert set(patches[-1]['changes'])=={'name','description'} and venue['openingHours']=='W2|-|19:00-23:00|-|-|-|-|-'
   page.get_by_role('link',name='Editar datos',exact=False).click();page.locator('#profile-name').fill('Discard this')
   page.locator('.breadcrumbs a').click();page.locator('[data-profile-discard-confirm]').click();page.locator('.identity').wait_for();assert venue['name']=='Edited Bar'
   page.get_by_role('link',name='Editar horarios',exact=False).click();page.locator('[data-day="1"] .toca-hours-to').fill('00:00')
   page.get_by_role('button',name='Guardar horarios').click();page.locator('.identity').wait_for();assert set(patches[-1]['changes'])=={'openingHours'} and venue['description']=='Owner description'
   page.get_by_role('link',name='Cambiar acceso',exact=False).click();page.locator('input[value=ANYWHERE]').check()
   page.get_by_role('button',name='Guardar configuración').click();page.locator('.identity').wait_for();assert writes==[dict(mode='ANYWHERE')]
   page.get_by_role('link',name='Agregar foto',exact=False).click();page.locator('#toca-photo-input').set_input_files(str(ROOT/'web/assets/venues/bar-1.webp'))
   page.locator('.toca-photo-item').wait_for();assert not venue['published'];page.locator('.breadcrumbs a').click();page.locator('.identity').wait_for()
   page.get_by_role('link',name='Actualizar desde Google o Instagram',exact=False).click();box=page.locator('[data-venue-import]');box.wait_for()
   assert page.locator('#venue-profile-form,#venue-update').count()==0
   box.get_by_role('radio',name='Instagram',exact=True).check();box.locator('[data-import-query]').fill('bar.ig');box.locator('[data-import-search]').click()
   box.locator('[data-import-apply]').wait_for()
   for c in box.locator('[data-import-field]').all():c.uncheck()
   box.locator('[data-import-field=description]').check();box.locator('[data-import-apply]').click();page.locator('.identity').wait_for()
   assert set(patches[-1]['changes'])=={'description'} and venue['name']=='Edited Bar'
   page.get_by_role('link',name='Actualizar desde Google o Instagram',exact=False).click();box=page.locator('[data-venue-import]')
   box.get_by_role('radio',name='Instagram',exact=True).check();box.locator('[data-import-query]').fill('bar.ig');box.locator('[data-import-search]').click()
   box.locator('[data-import-apply]').wait_for()
   for c in box.locator('[data-import-field]').all():c.uncheck()
   bio=box.locator('[data-bio-hours]');bio.locator('[data-import-field=bioHours]').check()
   assert box.locator('[data-import-apply]').is_disabled()
   bio.locator('[data-bio-row="4"] [data-bio-close]').fill('02:00');bio.locator('[data-bio-row="5"] [data-bio-day]').uncheck()
   box.locator('[data-import-apply]').click();page.locator('.identity').wait_for()
   assert set(patches[-1]['changes'])=={'openingHours'} and venue['openingHours']=='W2|-|19:00-00:00|-|-|20:00-02:00|-|-'
   page.get_by_role('link',name='Actualizar desde Google o Instagram',exact=False).click();box=page.locator('[data-venue-import]')
   box.locator('[data-import-query]').fill('My bar');box.locator('[data-import-search]').click();box.locator('[data-import-place]').click();box.locator('[data-import-apply]').wait_for()
   for c in box.locator('[data-import-field]').all():c.uncheck()
   box.locator('[data-import-field=address]').check();box.locator('[data-import-field=location]').check()
   page.screenshot(path=str(SHOTS/f'import-{width}.png'),full_page=True)
   before=len(patches);box.locator('[data-import-apply]').click();page.locator('#profile-address').wait_for()
   page.get_by_role('button',name='Guardar cambios',exact=True).click();assert len(patches)==before
   page.locator('[data-action=location-confirm]').click();page.get_by_role('button',name='Guardar cambios',exact=True).click();page.locator('.identity').wait_for()
   assert set(patches[-1]['changes'])=={'address','latitude','longitude'} and patches[-1]['locationConfirmed'] is True
   assert venue['name']=='Edited Bar' and venue['requestAccessMode']=='ANYWHERE' and venue['openingHours']=='W2|-|19:00-00:00|-|-|20:00-02:00|-|-'
   page.get_by_role('link',name='Editar datos',exact=False).click();page.locator('#profile-name').fill('Keep my edit');conflict[0]=True
   page.get_by_role('button',name='Guardar cambios',exact=True).click();page.locator('[data-profile-error]').filter(has_text='cambiaron').wait_for()
   assert page.locator('#profile-name').input_value()=='Keep my edit'
   page.screenshot(path=str(SHOTS/f'data-{width}.png'),full_page=True)
   page.locator('.breadcrumbs a').click();page.locator('[data-profile-discard-confirm]').click();page.locator('.identity').wait_for()
   page.locator('.vp-danger').evaluate('(el)=>el.open=true');page.locator('[data-action=open-delete-venue]').click()
   page.locator('#toca-confirm-venue-name').fill(venue['name']);page.locator('[data-action=confirm-delete-venue]').click();page.locator('#onboard-search').wait_for()
   assert page.locator('#venue-profile-form,#venue-update').count()==0
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not errors,errors
   context.close();print('PASS summary, focused editors, independent saves, photos, access, selective import, map review, conflicts and first registration:',width,flush=True)
  browser.close()
finally:server.shutdown()
