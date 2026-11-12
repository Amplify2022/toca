"""Real signup/router/forms and real map SDKs, with simulated API/provider responses."""
import functools,json,os,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SHOTS=Path(os.environ.get('TOCA_SCREENSHOT_DIR','/tmp/toca-onboarding-shots'));SHOTS.mkdir(parents=True,exist_ok=True)
OWNER='11111111-1111-4111-8111-111111111111';ID='77777777-7777-4777-8777-777777777777'
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
   for scenario in ['google','instagram','manual']:
    context=browser.new_context(viewport={'width':width,'height':1000},locale='es-UY',service_workers='block');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    owned=[];creates=[];registrations=[];publications=[];first_failure=[scenario=='google']
    page.add_init_script("localStorage.setItem('amplify-mode','live')")
    def api(route):
     path=urlsplit(route.request.url).path;method=route.request.method;body=route.request.post_data_json if method in ['POST','PUT','PATCH'] and route.request.post_data else None;result={};code=200
     if method=='OPTIONS':pass
     elif path=='/api/auth/register':
      registrations.append(body);result=dict(token='synthetic-admin-session',user=dict(id=OWNER,name='Owner',email='owner@example.test'))
     elif path=='/api/auth/me':result=dict(id=OWNER,name='Owner',email='owner@example.test')
     elif path=='/api/admin/venue-import/status':result=dict(google=True,instagram=True)
     elif path.endswith('/google/search'):result=[dict(id='test-place-id',name='Imported Bar',address='Test street 123')]
     elif path.endswith('/google/preview'):result=dict(source='Google Maps',fields=dict(name='Imported Bar',address='Test street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,openingHours='W2|-|-|-|-|20:00-02:00|20:00-03:00|-'))
     elif path.endswith('/instagram/preview'):result=dict(source='Instagram',fields=dict(name='Instagram Bar',instagramHandle='bar.ig',description='Viernes & Sábados 20 Hs.\nTodos los miércoles Jazz Club.'))
     elif path=='/api/admin/geocode':result=dict(results=[dict(lat=-34.9,lon=-56.17,name='Test street 123, Montevideo')])
     elif path=='/api/admin/geocode/suggest':result=dict(results=[dict(lat=-34.9,lon=-56.17,name='Test street 123, Montevideo',address='Test street 123',city='Montevideo')])
     elif path=='/api/admin/venues':
      if method=='POST':
       creates.append(body)
       if not owned:owned.append(dict(**body,id=ID,photos=[],coverPhotoUrl=None,published=False,active=False,spotifyConnected=False))
       result=owned[0]
       if first_failure[0]:first_failure[0]=False;route.abort('connectionfailed');return
      else:result=owned
     elif path==f'/api/admin/venues/{ID}/publication':
      assert owned[0]['coverPhotoUrl'];publications.append(method);owned[0]['published']=True;result=owned[0]
     elif path==f'/api/admin/venues/{ID}/photos':
      owned[0]['photos']=[dict(id='photo',url=f'/api/venues/{ID}/photos/photo',isPrimary=True)];owned[0]['coverPhotoUrl']=f'/api/venues/{ID}/photos/photo';result=owned[0]
     elif path.endswith('/photos/photo'):route.fulfill(content_type='image/webp',body=(ROOT/'web/assets/venues/bar-1.webp').read_bytes());return
     elif path==f'/api/admin/venues/{ID}' and method in ['PUT','PATCH']:owned[0].update(body['changes'] if method=='PATCH' else body);result=owned[0]
     elif path==f'/api/venues/{ID}':result=owned[0]
     elif path.endswith('/request-access'):result=dict(mode=owned[0]['requestAccessMode'],radiusMeters=100,requiresQr=False)
     elif path.endswith('/spotify/status'):result=dict(connected=False,premium=False)
     elif path.endswith('/stats'):result=dict(tracks=0,repeats=0,synced=0,days=[])
     elif path.endswith('/requests') or path.endswith('/request-commands') or path.endswith('/blocked') or path.endswith('/allowed'):result=[]
     elif path=='/api/venues':result=[v for v in owned if v['published'] and v['coverPhotoUrl']]
     route.fulfill(status=code,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'})
    def handle(route):
     url=route.request.url
     if url.startswith(BASE):route.continue_();return
     if url.startswith('http://localhost:8080'):api(route);return
     if url in ASSETS:route.fulfill(body=ASSETS[url],content_type='text/css' if url.endswith('.css') else 'application/javascript');return
     if url.startswith('https://tiles.versatiles.org/'):route.fulfill(content_type='application/json',body=json.dumps(dict(version=8,sources={},layers=[dict(id='background',type='background',paint={'background-color':'#15231c'})])));return
     route.abort()
    page.route('**/*',handle)
    page.goto(BASE+'/#/register');form=page.locator('#onboard-account');form.wait_for()
    form.locator('[name=name]').fill('Owner');form.locator('[name=email]').fill('owner@example.test');form.locator('[name=password]').fill('Synthetic-password-123');form.get_by_role('button',name='Crear cuenta y seguir').click()
    page.locator('#onboard-search').wait_for();assert len(registrations)==1
    assert page.evaluate("Object.entries(sessionStorage).filter(([k])=>k.includes('venue-registration')).every(([,v])=>!v.includes('Synthetic-password'))")
    if scenario=='manual':page.locator('[data-onboard=manual]').click()
    else:
     if scenario=='instagram':page.locator('input[name=onboard-provider][value=instagram]').check()
     page.locator('#onboard-query').fill('bar.ig' if scenario=='instagram' else 'My bar')
     if scenario=='google':page.locator('#onboard-search-city').fill('Montevideo')
     page.locator('#onboard-query').press('Enter')
     if scenario=='google':page.locator('.result-choice').click()
    form=page.locator('#onboard-details');form.wait_for()
    if scenario!='google':
     assert form.locator('[name=address]').input_value()==''
     if scenario=='manual':form.locator('[name=name]').fill('Manual bar')
     form.locator('[name=city]').fill('Montevideo');form.locator('[name=address]').fill('Test street 123')
     form.locator('[data-v183-choice]').first.click()
    form.locator('[data-action=location-confirm]').click()
    page.wait_for_function("document.querySelector('.toca-location-widget').dataset.confirmed==='true'")
    if scenario=='instagram':
     page.locator('#onboard-extras').evaluate('(e)=>e.open=true')
     assert form.locator('[name=open-4]').input_value()=='20:00' and form.locator('[name=close-4]').input_value()==''
     assert not form.locator('[name=hoursConfirmed]').is_checked()
     form.locator('[name=hoursConfirmed]').check();page.locator('[data-onboard=confirm]').click()
     assert 'cierre' in page.locator('[data-onboard-error]').inner_text()
     form.locator('[name=close-4]').fill('02:00');form.locator('[name=close-5]').fill('04:00')
    page.screenshot(path=str(SHOTS/f'{scenario}-review-{width}.png'),full_page=True)
    page.locator('[data-onboard=confirm]').click();page.locator('input[name=onboard-access]').first.wait_for()
    page.locator('input[value=ANYWHERE]').check();page.locator('[data-onboard=review]').click();form=page.locator('#onboard-details');form.wait_for()
    assert form.locator('[name=address]').input_value()=='Test street 123'
    page.reload();form=page.locator('#onboard-details');form.wait_for();assert form.locator('[name=address]').input_value()=='Test street 123'
    assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='true'
    page.locator('[data-onboard=confirm]').click();page.locator('input[value=ANYWHERE]').wait_for();assert page.locator('input[value=ANYWHERE]').is_checked()
    page.locator('[data-onboard=create]').click()
    if scenario=='google':page.locator('[data-onboard-error]').filter(has_text='fetch').wait_for();page.locator('[data-onboard=create]').click()
    page.get_by_role('heading',name='Tu bar ya tiene su lugar.').wait_for()
    assert creates[-1]['requestAccessMode']=='ANYWHERE'
    assert len({p['registrationId'] for p in creates})==1 and len(owned)==1
    if scenario=='instagram':assert creates[-1]['openingHours']=='W2|-|-|-|-|20:00-02:00|20:00-04:00|-'
    else:assert creates[-1]['openingHours']==''
    assert not publications and page.locator('[data-onboard=review-publication]').is_disabled()
    page.screenshot(path=str(SHOTS/f'{scenario}-ready-{width}.png'),full_page=True)
    page.get_by_role('link',name='Agregar foto',exact=False).click();page.locator('#toca-photo-input').wait_for(state='attached')
    if scenario=='manual':
     page.locator('.breadcrumbs a').click();page.get_by_role('link',name='Editar datos',exact=False).click()
     page.locator('#profile-name').fill('Edited draft');page.get_by_role('button',name='Guardar cambios',exact=True).click()
     page.locator('.identity h2').filter(has_text='Edited draft').wait_for()
     page.get_by_role('link',name='Agregar foto',exact=False).click()
    page.locator('#toca-photo-input').set_input_files(str(ROOT/'web/assets/venues/bar-1.webp'))
    page.locator('.toca-photo-item').wait_for()
    assert not owned[0]['published'] and not publications
    page.locator('.breadcrumbs a').click();page.locator('.identity').wait_for()
    page.get_by_role('link',name='Revisar publicación',exact=False).click();page.locator('[data-onboard=review-publication]').wait_for()
    page.locator('[data-onboard=review-publication]').click();page.locator('[data-onboard=publish]').click()
    page.get_by_role('heading',name='Tu bar ya está publicado.').wait_for();assert publications==['PUT']
    if scenario=='google':
     # Changing source must ignore an older response even if a provider ignores abort.
     key='toca:venue-registration:v1:'+OWNER
     page.evaluate('(key)=>sessionStorage.removeItem(key)',key)
     page.reload();page.get_by_role('heading',name='Tu bar ya está publicado.').wait_for()
     page.goto(BASE+'/#/admin/onboarding?step=find');page.locator('#onboard-search').wait_for()
     page.evaluate("""()=>{window.__originalFetch=window.fetch;window.fetch=(url,opts)=>String(url).includes('profile=slow.profile')?new Promise(resolve=>{window.__releaseImport=()=>resolve(new Response(JSON.stringify({fields:{name:'STALE PROFILE',description:'wrong data'}}),{headers:{'Content-Type':'application/json'}}));}):window.__originalFetch(url,opts);}""")
     page.locator('input[value=instagram]').check();page.locator('#onboard-query').fill('slow.profile');page.locator('[data-onboard=search]').click()
     page.wait_for_function("typeof window.__releaseImport==='function'")
     page.locator('input[value=google]').check()
     page.evaluate("""async()=>{window.__releaseImport();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.fetch=window.__originalFetch;}""")
     assert page.locator('#onboard-search').is_visible() and page.locator('input[value=google]').is_checked()
     assert 'STALE PROFILE' not in page.locator('#app').inner_text()
     # Recovery keeps the typed query, and manual entry remains available.
     page.route('**/api/admin/venue-import/instagram/preview?profile=unavailable.profile',lambda r:r.fulfill(status=503,content_type='application/json',body=json.dumps(dict(message='Fuente no disponible')),headers={'Access-Control-Allow-Origin':'*'}))
     page.locator('input[value=instagram]').check();page.locator('#onboard-query').fill('unavailable.profile');page.locator('[data-onboard=search]').click()
     page.locator('[data-onboard-error]').filter(has_text='Fuente no disponible').wait_for()
     assert page.locator('#onboard-query').input_value()=='unavailable.profile'
     page.locator('[data-onboard=manual]').click();page.locator('#onboard-details').wait_for()
     # Corrupt or another owner's saved draft never takes over the current bar.
     page.goto(BASE+'/#/admin/onboarding?step=find');page.locator('#onboard-search').wait_for()
     page.evaluate('(key)=>{sessionStorage.setItem(key,"{");sessionStorage.setItem("toca:venue-registration:v1:another-owner",JSON.stringify({name:"Other owner secret bar"}));}',key)
     page.reload();page.locator('#onboard-search').wait_for()
     assert 'Other owner secret bar' not in page.locator('#app').inner_text()
     page.route('**/api/admin/venue-import/status',lambda r:r.fulfill(content_type='application/json',body=json.dumps(dict(google=False,instagram=False)),headers={'Access-Control-Allow-Origin':'*'}))
     page.reload();page.locator('#onboard-search').wait_for();assert page.locator('[data-onboard=search]').is_disabled()
     page.locator('[data-onboard=manual]').click();page.locator('#onboard-details').wait_for()
     print('PASS late provider response, recoverable search, owner-scoped/corrupt draft and unavailable sources:',width,flush=True)
    assert not errors,errors
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
    context.close();print('PASS signup, '+scenario+' flow, map confirmation, retained draft, access mode, cover and explicit publication:',width,flush=True)
  browser.close()
finally:server.shutdown()
