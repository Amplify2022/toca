"""Real frontend, simulated Google/Meta/Spotify responses and Web Playback SDK.
No provider account is used and no real audio is played by this test.
"""
from playwright.sync_api import sync_playwright
import json
ID='77777777-7777-4777-8777-777777777777';A='A'*22;B='B'*22
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport={'width':width,'height':1000},service_workers='block');page=context.new_page()
  venue=dict(id=ID,name='Existing Bar',address='Old address',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=True,photos=[],coverPhotoUrl='/assets/venues/bar-1.webp',requestAccessMode='NEARBY')
  playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=[dict(id=A,title='Track A',artist='Band A',durationMs=180000),dict(id=B,title='Track B',artist='Band B',durationMs=200000)])
  writes=[];controls=[];tokens=[];edits=[];version=[1]
  page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-admin-session');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner',email:'owner@example.test'}));")
  def api(route):
   path=route.request.url.split('8080',1)[1].split('?',1)[0];method=route.request.method;body=route.request.post_data_json if method in ['POST','PUT'] else None;data=[]
   if method=='OPTIONS':data={}
   elif path=='/api/auth/me':data=dict(id='owner',name='Owner',email='owner@example.test')
   elif path=='/api/admin/venues':data=[venue]
   elif path==f'/api/venues/{ID}':data=venue
   elif path.endswith('/request-access'):data=dict(mode='NEARBY',radiusMeters=100,requiresQr=False)
   elif path.endswith('/spotify/status'):data=dict(connected=True,premium=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'])
   elif path.endswith('/spotify/playlists'):data=[dict(id=playlist['id'],name=playlist['name'])]
   elif path.endswith('/google/search'):data=[dict(id='google-place-1',name='Imported Bar',address='New address 123')]
   elif path.endswith('/google/preview'):data=dict(source='Google Maps',fields=dict(name='Imported Bar',address='New address 123',city='Montevideo',description='Google description',latitude=-34.91,longitude=-56.18,openingHours='W2|18:00-02:00|-|-|-|-|-|-'),warnings=[],details=dict(phone='+598 12345678'),sourceUrl='https://maps.google.com/?cid=123')
   elif path.endswith('/instagram/preview'):data=dict(source='Instagram',fields=dict(name='IG Bar',description='Instagram biography',instagramHandle='bar.ig'),warnings=['Completá los horarios y la dirección.'],details={})
   elif path.endswith('/music/playlist'):data=dict(playlist=playlist,operation=None)
   elif path.endswith('/music/player'):
    if method=='POST':controls.append(body);data=dict(accepted=True)
    else:data=dict(now=playlist['tracks'][0],isPlaying=any(c.get('action')=='start' for c in controls),progressMs=5000,repeat='off',shuffle=False,device=dict(name='TOCA',volume=50))
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
  page.goto('http://localhost:5173/#/admin/profile')
  box=page.locator('[data-venue-import]');box.wait_for();box.locator('[data-import-query]').fill('My bar Montevideo');box.locator('[data-import-search]').click()
  box.locator('[data-import-place]').click();box.locator('[data-import-apply]').wait_for()
  assert not box.locator('[data-import-field="name"]').is_checked()
  assert box.locator('[data-import-field="description"]').is_checked()
  box.locator('[data-import-field="address"]').check();box.locator('[data-import-apply]').click()
  assert page.locator('#venue-update [name="name"]').input_value()=='Existing Bar'
  assert page.locator('#venue-update [name="address"]').input_value()=='New address 123'
  assert page.locator('#venue-update [name="description"]').input_value()=='Google description'
  assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='false'
  assert not writes,'Import must not save automatically'
  box.locator('[data-import-source]').select_option('instagram');box.locator('[data-import-query]').fill('@bar.ig');box.locator('[data-import-search]').click();box.locator('[data-import-apply]').wait_for()
  box.locator('[data-import-field="description"]').check();box.locator('[data-import-apply]').click()
  assert page.locator('#venue-update [name="description"]').input_value()=='Instagram biography'
  page.screenshot(path=f'/tmp/toca-import-{width}.png',full_page=True)
  page.goto('http://localhost:5173/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-studio-tracks] .toca-studio-track').first.wait_for()
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
  root.locator('[data-player-volume]').evaluate("el=>el.value='35'");root.locator('[data-player-volume]').dispatch_event('change')
  root.locator('[data-player-shuffle]').check();root.locator('[data-player-repeat]').select_option('context')
  page.wait_for_timeout(100)
  assert any(c==dict(action='volume',volume=35) for c in controls)
  assert any(c==dict(action='shuffle',enabled=True) for c in controls)
  assert any(c==dict(action='repeat',state='context') for c in controls)
  page.screenshot(path=f'/tmp/toca-studio-{width}.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Horizontal overflow'
  root.locator('[data-studio-name]').fill('Brand new');root.locator('[data-studio-create]').click();page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent.includes('Brand new')")
  assert [e['action'] for e in edits]==['add','move','rename','create'],edits
  context.close();print('PASS import preview without autosave, selective replacement, admin playlist edits and browser audio wiring:',width)
 browser.close()
