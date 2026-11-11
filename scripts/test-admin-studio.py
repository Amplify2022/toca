"""Real frontend, simulated Google/Meta/Spotify responses and Web Playback SDK.
No provider account is used and no real audio is played by this test.
"""
from playwright.sync_api import sync_playwright
import json,os
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
BASE=os.environ.get('TOCA_WEB_TEST_URL','http://localhost:5173')
SHOTS=Path(os.environ.get('TOCA_SCREENSHOT_DIR','/tmp'));SHOTS.mkdir(parents=True,exist_ok=True)
BIO='Clásico de Montevideo, desde 2008 con amor.\nViernes & Sábados 20 Hs.\nTodos los Miércoles = Jazz Club\nEntrada libre\nCanelones 760, esquina Ciudadela.'
ID='77777777-7777-4777-8777-777777777777';A='A'*22;B='B'*22
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport={'width':width,'height':1000},locale='es-UY',service_workers='block');page=context.new_page()
  venue=dict(id=ID,name='Existing Bar',address='Old address',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=True,photos=[],coverPhotoUrl='/assets/venues/bar-1.webp',requestAccessMode='NEARBY',openingHours='W2|-|19:00-23:00|-|-|-|18:00-01:00|-')
  playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=[dict(id=A,title='Track A',artist='Band A',durationMs=180000),dict(id=B,title='Track B',artist='Band B',durationMs=200000)])
  writes=[];controls=[];tokens=[];edits=[];version=[1];owned=[venue]
  page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-admin-session');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner',email:'owner@example.test'}));")
  def api(route):
   path=route.request.url.split('8080',1)[1].split('?',1)[0];method=route.request.method;body=route.request.post_data_json if method in ['POST','PUT'] else None;data=[]
   if method=='OPTIONS':data={}
   elif path=='/api/auth/me':data=dict(id='owner',name='Owner',email='owner@example.test')
   elif path=='/api/admin/venues':
    if method=='POST':writes.append((path,body));venue.update(body);owned[:]=[venue];data=venue
    else:data=owned
   elif path==f'/api/venues/{ID}':data=venue
   elif path.endswith('/request-access'):data=dict(mode='NEARBY',radiusMeters=100,requiresQr=False)
   elif path.endswith('/spotify/status'):data=dict(connected=True,premium=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'])
   elif path.endswith('/spotify/playlists'):data=[dict(id=playlist['id'],name=playlist['name'])]
   elif path.endswith('/google/search'):data=[dict(id='google-place-1',name='Imported Bar',address='New address 123')]
   elif path.endswith('/google/preview'):data=dict(source='Google Maps',fields=dict(name='Imported Bar',address='New address 123',city='Montevideo',description='Google description',latitude=-34.91,longitude=-56.18,openingHours='W2|18:00-02:00|-|-|-|-|-|-'),warnings=[],details=dict(phone='+598 12345678'),sourceUrl='https://maps.google.com/?cid=123')
   elif path.endswith('/instagram/preview'):
    profile=parse_qs(urlsplit(route.request.url).query).get('profile',[''])[0]
    if profile=='missing.profile':
     route.fulfill(status=503,content_type='application/json',body=json.dumps(dict(message='El proveedor no está disponible. Intentá nuevamente.')),headers={'Access-Control-Allow-Origin':'*'});return
    data=dict(source='Instagram',fields=dict(name='BLUZZ BAR',description=BIO,instagramHandle='bar.ig'),warnings=['Instagram no publica dirección ni horarios estructurados mediante esta API. Revisá la biografía y completá los campos faltantes.'],details={},sourceUrl='https://www.instagram.com/bar.ig/')
   elif path.endswith('/music/playlist'):data=dict(playlist=playlist,operation=None)
   elif path.endswith('/music/player'):
    if method=='POST':controls.append(body);data=dict(accepted=True)
    else:data=dict(now=playlist['tracks'][0] if playlist['tracks'] else None,isPlaying=any(c.get('action')=='start' for c in controls),progressMs=5000,repeat='off',shuffle=False,device=dict(name='TOCA',volume=50))
   elif path.endswith('/music/browser-token'):tokens.append(route.request.headers.get('authorization'));data=dict(accessToken='synthetic-spotify-access-token',expiresIn=60)
   elif '/music/edits/' in path:
    edits.append(body);action=body['action']
    if action=='add':playlist['tracks'].append(dict(id=body['trackId'],title='Added Track',artist='Added Band',durationMs=180000))
    if action=='move':playlist['tracks'].insert(body['to'],playlist['tracks'].pop(body['from']))
    if action=='remove':playlist['tracks'].pop(body['position'])
    if action in ['rename','create']:playlist['name']=body['name']
    if action=='create':playlist['id']='C'*22;playlist['tracks']=[]
    version[0]+=1;playlist['snapshot']='s'+str(version[0]);data=dict(status='COMPLETED',result=dict(playlistId=playlist['id'],name=playlist['name']))
   elif path.endswith('/tracks'):data=[dict(id=A,title='Search Track',artist='Search Band',durationMs=180000)]
   elif method in ['POST','PUT','DELETE']:writes.append((path,body));data={}
   route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'})
  page.route('http://localhost:8080/**',api)
  page.route('https://**/*',lambda route:route.abort())
  page.route('https://sdk.scdn.co/spotify-player.js',lambda route:route.fulfill(content_type='application/javascript',body="""
   window.Spotify={Player:class {constructor(options){this.o=options;this.listeners={}}addListener(k,v){this.listeners[k]=v}activateElement(){return Promise.resolve()}disconnect(){}connect(){this.o.getOAuthToken(t=>{if(t!=='synthetic-spotify-access-token')throw Error('wrong token');this.listeners.ready({device_id:'browser-device'})});return Promise.resolve(true)}}};window.onSpotifyWebPlaybackSDKReady();
  """))
  page.goto(BASE+'/#/admin/profile')
  box=page.locator('[data-venue-import]');box.wait_for();box.screenshot(path=f'{SHOTS}/toca-import-idle-{width}.png');box.locator('[data-import-query]').fill('My bar Montevideo');box.locator('[data-import-search]').click()
  box.locator('[data-import-place]').click();box.locator('[data-import-apply]').wait_for()
  assert not box.locator('[data-import-field="name"]').is_checked()
  assert box.locator('[data-import-field="description"]').is_checked()
  box.screenshot(path=f'{SHOTS}/toca-import-google-{width}.png')
  box.locator('[data-import-field="address"]').check();box.locator('[data-import-apply]').click()
  assert page.locator('#venue-update [name="name"]').input_value()=='Existing Bar'
  assert page.locator('#venue-update [name="address"]').input_value()=='New address 123'
  assert page.locator('#venue-update [name="description"]').input_value()=='Google description'
  assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='false'
  assert not writes,'Import must not save automatically'
  box.get_by_role('radio',name='Instagram',exact=True).check()
  box.get_by_role('radio',name='Instagram',exact=True).press('ArrowLeft')
  assert box.get_by_role('radio',name='Google Maps',exact=True).is_checked()
  box.get_by_role('radio',name='Google Maps',exact=True).press('ArrowRight')
  assert box.get_by_role('radio',name='Instagram',exact=True).is_checked()
  assert box.locator('[data-import-results]').inner_text()==''
  assert 'Perfil de Instagram' in box.locator('[data-import-query-label]').inner_text()
  # A late provider response must not restore a preview after switching source.
  page.evaluate("""()=>{
   window.__importOriginalFetch=window.fetch;
   window.fetch=(url,options)=>String(url).includes('profile=slow.profile')?new Promise(resolve=>{
    window.__finishSlowImport=()=>resolve(new Response(JSON.stringify({source:'Instagram',fields:{name:'STALE PROFILE',instagramHandle:'wrong.bar'},warnings:[],details:{}}),{headers:{'Content-Type':'application/json'}}));
   }):window.__importOriginalFetch(url,options);
  }""")
  box.locator('[data-import-query]').fill('slow.profile');box.locator('[data-import-search]').click()
  page.wait_for_function("typeof window.__finishSlowImport==='function'")
  assert box.locator('[data-import-search]').is_disabled()
  box.screenshot(path=f'{SHOTS}/toca-import-loading-{width}.png')
  box.get_by_role('radio',name='Google Maps',exact=True).check()
  page.evaluate("""async()=>{window.__finishSlowImport();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.fetch=window.__importOriginalFetch;}""")
  assert box.locator('[data-import-results]').inner_text()==''
  assert not box.locator('[data-import-search]').is_disabled()
  box.get_by_role('radio',name='Instagram',exact=True).check()
  box.locator('[data-import-query]').fill('missing.profile');box.locator('[data-import-search]').click()
  box.get_by_role('heading',name='No pudimos traer los datos').wait_for()
  box.screenshot(path=f'{SHOTS}/toca-import-error-{width}.png')
  box.locator('[data-import-query]').fill('@bar.ig');box.locator('[data-import-query]').press('Enter')
  box.locator('[data-import-apply]').wait_for()
  for checkbox in box.locator('[data-import-field]').all():checkbox.uncheck()
  assert box.locator('[data-import-apply]').is_disabled()
  assert '0 datos' in box.locator('[data-import-count]').inner_text()
  box.locator('[data-import-field="description"]').check()
  assert '1 dato seleccionado' in box.locator('[data-import-count]').inner_text()
  assert not box.locator('[data-import-apply]').is_disabled()
  hours=box.locator('[data-bio-hours]');hours.wait_for()
  assert not hours.locator('[data-import-field="bioHours"]').is_checked()
  assert hours.locator('[data-bio-row="4"] [data-bio-open]').input_value()=='20:00'
  assert hours.locator('[data-bio-row="4"] [data-bio-close]').input_value()==''
  assert hours.locator('[data-bio-row="5"] [data-bio-open]').input_value()=='20:00'
  assert hours.locator('[data-bio-row="2"]').count()==0,'An event without opening hours is not an opening-hours proposal'
  hours.locator('[data-import-field="bioHours"]').check()
  assert box.locator('[data-import-apply]').is_disabled(),'Missing closing time must block opting into the suggestion'
  hours.screenshot(path=f'{SHOTS}/toca-bio-hours-pending-{width}.png',style='.toca-admin-mobile-nav{visibility:hidden!important}')
  hours.locator('[data-bio-row="4"] [data-bio-close]').fill('02:00')
  assert box.locator('[data-import-apply]').is_disabled(),'Saturday closing remains unknown'
  hours.locator('[data-bio-row="5"] [data-bio-day]').uncheck()
  assert not box.locator('[data-import-apply]').is_disabled(),'Only selected days need complete times'
  page.locator('#toast').evaluate('el=>el.replaceChildren()')
  box.screenshot(path=f'{SHOTS}/toca-import-instagram-{width}.png',style='.toca-admin-mobile-nav{visibility:hidden!important}')
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Import horizontal overflow'
  assert 'estructurados mediante esta API' not in box.inner_text()
  box.locator('[data-import-apply]').click()
  assert page.locator('#venue-update [name="description"]').input_value()==BIO
  assert page.evaluate("window.tocaSerializeHours(document.getElementById('venue-update'))")=='W2|-|19:00-23:00|-|-|20:00-02:00|18:00-01:00|-','Unmentioned and unchecked days must retain the owner settings'
  assert page.locator('#venue-update [name="name"]').input_value()=='Existing Bar'
  assert not writes,'Import must not save automatically'
  box.locator('[data-import-review]').click()
  assert page.locator('#venue-update [name="name"]').evaluate('el=>el===document.activeElement')
  page.screenshot(path=f'{SHOTS}/toca-import-{width}.png',full_page=True)
  page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-studio-tracks] .toca-studio-track').first.wait_for()
  root.locator('[data-studio-search]').fill('Search')
  root.locator('[data-studio-search-results] [data-studio-edit="add"]').click()
  page.wait_for_function("document.querySelectorAll('[data-studio-tracks] .toca-studio-track').length===3")
  root.locator('[data-studio-edit="move"][data-from="0"]').click();page.wait_for_function("document.querySelector('[data-studio-tracks]').textContent.includes('Track B')")
  root.locator('[data-studio-name]').fill('Renamed list');root.locator('[data-studio-rename]').click();page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent.includes('Renamed list')")
  root.locator('[data-browser-connect]').click();page.wait_for_function("document.querySelector('[data-browser-status]').textContent.includes('conectado')")
  root.locator('[data-player-start]').click();page.wait_for_function("document.querySelector('[data-player-toggle]').textContent==='Pausar'")
  assert tokens==['Bearer synthetic-admin-session'],tokens
  assert [c['action'] for c in controls][:2]==['transfer','start'],controls
  root.locator('[data-player-command="next"]').click()
  with page.expect_response(lambda response:response.url.endswith('/music/player') and response.request.method=='POST' and response.request.post_data_json==dict(action='volume',volume=35)):
   root.locator('[data-player-volume]').evaluate("el=>{el.value='35';el.dispatchEvent(new Event('change',{bubbles:true}))}")
  with page.expect_response(lambda response:response.url.endswith('/music/player') and response.request.method=='POST' and response.request.post_data_json==dict(action='shuffle',enabled=True)):
   root.locator('[data-player-shuffle]').check()
  with page.expect_response(lambda response:response.url.endswith('/music/player') and response.request.method=='POST' and response.request.post_data_json==dict(action='repeat',state='context')):
   root.locator('[data-player-repeat]').select_option('context')
  assert any(c==dict(action='volume',volume=35) for c in controls)
  assert any(c==dict(action='shuffle',enabled=True) for c in controls)
  assert any(c==dict(action='repeat',state='context') for c in controls)
  page.screenshot(path=f'{SHOTS}/toca-studio-{width}.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Horizontal overflow'
  root.locator('[data-studio-name]').fill('Brand new');root.locator('[data-studio-create]').click();page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent.includes('Brand new')")
  assert [e['action'] for e in edits]==['add','move','rename','create'],edits
  # First-bar registration uses the dedicated guided flow; its full paths are
  # covered by test-venue-onboarding.py.
  owned.clear();page.goto(BASE+'/#/admin/profile')
  page.locator('#onboard-search').wait_for()
  assert page.locator('#create-venue').count()==0
  context.close();print('PASS biography hours review, missing closing validation, partial merging, guided onboarding entry, import and studio regression:',width)
 browser.close()
