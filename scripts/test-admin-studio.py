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
  page.set_default_timeout(8000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  venue=dict(id=ID,name='Existing Bar',address='Old address',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=True,photos=[],coverPhotoUrl='/assets/venues/bar-1.webp',requestAccessMode='NEARBY',openingHours='W2|-|19:00-23:00|-|-|-|18:00-01:00|-')
  playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=[dict(id=A,title='Track A',artist='Band A',durationMs=180000,imageUrl='/assets/venues/bar-1.webp'),dict(id=B,title='Track B',artist='Band B',durationMs=200000)])
  writes=[];controls=[];tokens=[];edits=[];version=[1];owned=[venue]
  operation=[None];connected=[True];flags=[True];blocked=[];allowed=[];playlist_reads=[]
  drop_response=[False];applied={};edit_ids=[];recovery_unavailable=[False]
  playback_options=dict(shuffle=False,repeat='off');playing=[False];now=[playlist['tracks'][0].copy()];context_uri=['spotify:playlist:'+playlist['id']];device=[dict(id='speaker',name='TOCA',volume=50)]
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
   elif path.endswith('/spotify/status'):data=dict(connected=connected[0],premium=True,controlEnabled=flags[0],playlistWriteEnabled=flags[0],playlistId=playlist['id'])
   elif path.endswith('/spotify/playlists'):data=[dict(id=playlist['id'],name=playlist['name'])]
   elif path.endswith('/spotify/playlist'):
    writes.append((path,body));data={}
   elif path.endswith('/spotify/devices'):data=[dict(id='speaker',name='Bar Speakers',type='Speaker',active=True,restricted=False),dict(id='restricted',name='Private speaker',restricted=True)]
   elif path.endswith('/session'):writes.append((path,body));venue['active']=body['active'];data={}
   elif path.endswith('/policy'):writes.append((path,body));venue['curatedOnly']=body['curatedOnly'];data={}
   elif path.endswith('/blocked'):
    if method=='POST':blocked.append(dict(trackId=body['trackId'],title='Search Track',artist='Search Band'))
    data=blocked
   elif path.endswith('/allowed'):data=allowed
   elif path.endswith('/google/search'):data=[dict(id='google-place-1',name='Imported Bar',address='New address 123')]
   elif path.endswith('/google/preview'):data=dict(source='Google Maps',fields=dict(name='Imported Bar',address='New address 123',city='Montevideo',description='Google description',latitude=-34.91,longitude=-56.18,openingHours='W2|18:00-02:00|-|-|-|-|-|-'),warnings=[],details=dict(phone='+598 12345678'),sourceUrl='https://maps.google.com/?cid=123')
   elif path.endswith('/instagram/preview'):
    profile=parse_qs(urlsplit(route.request.url).query).get('profile',[''])[0]
    if profile=='missing.profile':
     route.fulfill(status=503,content_type='application/json',body=json.dumps(dict(message='El proveedor no está disponible. Intentá nuevamente.')),headers={'Access-Control-Allow-Origin':'*'});return
    data=dict(source='Instagram',fields=dict(name='BLUZZ BAR',description=BIO,instagramHandle='bar.ig'),warnings=['Instagram no publica dirección ni horarios estructurados mediante esta API. Revisá la biografía y completá los campos faltantes.'],details={},sourceUrl='https://www.instagram.com/bar.ig/')
   elif path.endswith('/music/playlist'):playlist_reads.append(path);data=dict(playlist=playlist,operation=operation[0])
   elif path.endswith('/music/player'):
    if method=='POST':
     controls.append(body);data=dict(accepted=True)
     if body['action']=='start':now[0]=playlist['tracks'][body['position']].copy();playing[0]=True;context_uri[0]='spotify:playlist:'+playlist['id']
     if body['action']=='pause':playing[0]=False
     if body['action']=='resume':playing[0]=True
     if body['action']=='shuffle':playback_options['shuffle']=body['enabled']
     if body['action']=='repeat':playback_options['repeat']=body['state']
    else:data=dict(now=now[0],isPlaying=playing[0],contextUri=context_uri[0],progressMs=5000,repeat=playback_options['repeat'],shuffle=playback_options['shuffle'],device=device[0])
   elif path.endswith('/music/browser-token'):tokens.append(route.request.headers.get('authorization'));data=dict(accessToken='synthetic-spotify-access-token',expiresIn=60)
   elif path.endswith('/reconcile'):operation[0]=None;data=dict(status='COMPLETED')
   elif '/music/edits/' in path:
    operation_id=path.rsplit('/',1)[1];edit_ids.append(operation_id)
    if recovery_unavailable[0]:
     route.fulfill(status=503,content_type='application/json',body=json.dumps(dict(message='No se pudo consultar la edición pendiente.')),headers={'Access-Control-Allow-Origin':'*'});return
    if operation_id in applied:
     route.fulfill(content_type='application/json',body=json.dumps(applied[operation_id]),headers={'Access-Control-Allow-Origin':'*'});return
    edits.append(body);action=body['action']
    if action=='add':playlist['tracks'].append(dict(id=body['trackId'],title='Added Track',artist='Added Band',durationMs=180000))
    if action=='move':playlist['tracks'].insert(body['to'],playlist['tracks'].pop(body['from']))
    if action=='remove':playlist['tracks'].pop(body['position'])
    if action in ['rename','create']:playlist['name']=body['name']
    if action=='create':playlist['id']='C'*22;playlist['tracks']=[]
    version[0]+=1;playlist['snapshot']='s'+str(version[0]);data=dict(status='COMPLETED',result=dict(playlistId=playlist['id'],name=playlist['name']))
    applied[operation_id]=data
    if drop_response[0]:drop_response[0]=False;route.abort();return
   elif path.endswith('/tracks'):data=[dict(id=A,title='Search Track',artist='Search Band',durationMs=180000)]
   elif method in ['POST','PUT','DELETE']:writes.append((path,body));data={}
   route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'})
  page.route('http://localhost:8080/**',api)
  page.route('https://**/*',lambda route:route.abort())
  page.route('https://sdk.scdn.co/spotify-player.js',lambda route:route.fulfill(content_type='application/javascript',body="""
   window.Spotify={Player:class {constructor(options){this.o=options;this.listeners={}}addListener(k,v){this.listeners[k]=v}activateElement(){return Promise.resolve()}disconnect(){}connect(){this.o.getOAuthToken(t=>{if(t!=='synthetic-spotify-access-token')throw Error('wrong token');this.listeners.ready({device_id:'browser-device'})});return Promise.resolve(true)}}};window.onSpotifyWebPlaybackSDKReady();
  """))
  page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]')
  root.locator('[data-studio-tracks] .toca-studio-track').first.wait_for()
  assert root.locator('[data-cabina-open="add"]').inner_text()=='Agregar canción'
  assert root.locator('[data-cabina-open="playlist-options"]').count()==1
  assert root.locator('.cabina-playlist-selector').get_attribute('data-cabina-open')=='playlist-options'
  cover=root.locator('[data-track-index="0"] .cabina-art img')
  cover.wait_for();assert cover.get_attribute('src').endswith('/assets/venues/bar-1.webp')
  page.wait_for_function("document.querySelector('[data-track-index=\"0\"] .cabina-art img').naturalWidth>0")
  root.locator('[data-cabina-open="add"]').click()
  root.locator('[data-studio-search]').fill('Search')
  root.locator('[data-studio-search-results] [data-studio-edit="add"]').click()
  page.wait_for_function("document.querySelectorAll('[data-studio-tracks] .toca-studio-track').length===3")
  root.locator('dialog[open] [data-cabina-close]').first.click()
  root.locator('[data-cabina-track="0"]').click()
  root.locator('[data-studio-edit="move"][data-from="0"]').click();page.wait_for_function("document.querySelector('[data-studio-tracks] [data-track-index=\"0\"] strong').textContent==='Track B'")
  root.locator('[data-cabina-open="playlist-options"]').click()
  root.locator('[data-cabina-name-mode="rename"]').click()
  root.locator('[data-studio-name]').fill('Renamed list');root.locator('[data-studio-rename]').click();page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent.includes('Renamed list')")
  root.locator('.cabina-heading-actions [data-cabina-open="connection"]').click()
  root.locator('[data-browser-connect]').click();page.wait_for_function("!document.querySelector('dialog[open]')")
  assert 'Audio conectado' in root.locator('[data-studio-status]').inner_text()
  root.locator('[data-cabina-start]').click()
  root.locator('[data-player-start]').click();page.wait_for_function("document.querySelector('[data-player-toggle]').textContent==='Pausar'")
  assert tokens==['Bearer synthetic-admin-session'],tokens
  assert [c['action'] for c in controls][:2]==['transfer','start'],controls
  root.locator('[data-player-command="next"]').click()
  with page.expect_response(lambda response:response.url.endswith('/music/player') and response.request.method=='POST' and response.request.post_data_json==dict(action='volume',volume=35)):
   root.locator('[data-player-volume]').evaluate("el=>{el.value='35';el.dispatchEvent(new Event('change',{bubbles:true}))}")
  root.locator('[data-cabina-open="playback"]').click()
  playback_dialog=root.locator('[data-cabina-dialog="playback"]');before_options=len(controls)
  assert 'Volumen' not in playback_dialog.inner_text() and playback_dialog.locator('select').count()==0
  root.locator('[data-player-shuffle][value="on"]').check()
  root.locator('[data-player-repeat][value="context"]').check()
  assert len(controls)==before_options
  # A player poll cannot overwrite choices that have not been confirmed.
  page.wait_for_timeout(7200)
  assert root.locator('[data-player-repeat][value="context"]').is_checked()
  page.screenshot(path=f'{SHOTS}/toca-playback-options-{width}.png')
  root.locator('[data-playback-apply]').click()
  page.wait_for_function("!document.querySelector('dialog[open]')")
  assert controls[before_options:]==[dict(action='shuffle',enabled=True),dict(action='repeat',state='context')]
  assert any(c==dict(action='volume',volume=35) for c in controls)
  # Cancel discards the draft; reopening shows the saved state.
  root.locator('[data-cabina-open="playback"]').click()
  assert root.locator('[data-player-repeat][value="context"]').is_checked()
  root.locator('[data-player-repeat][value="track"]').check()
  before_cancel=len(controls);playback_dialog.locator('[data-cabina-close]').last.click()
  root.locator('[data-cabina-open="playback"]').click()
  assert root.locator('[data-player-repeat][value="context"]').is_checked()
  assert len(controls)==before_cancel
  playback_dialog.locator('[data-cabina-close]').first.click()
  # Each row starts its own position, then pauses/resumes without seeking to zero.
  row=root.locator('[data-cabina-row-play="0"]');row.click()
  page.wait_for_function("document.querySelector('[data-cabina-row-play=\"0\"]').textContent.includes('Reproducir')")
  assert controls[-1]==dict(action='pause')
  root.locator('[data-cabina-row-play="1"]').click()
  page.wait_for_function("document.querySelector('[data-cabina-row-play=\"1\"]').textContent.includes('Pausar')")
  assert controls[-1]==dict(action='start',position=1,trackId=A,playlistId=playlist['id'],snapshot=playlist['snapshot'])
  root.locator('[data-cabina-row-play="1"]').click()
  page.wait_for_function("document.querySelector('[data-cabina-row-play=\"1\"]').textContent.includes('Reproducir')")
  assert controls[-1]==dict(action='pause')
  root.locator('[data-cabina-row-play="1"]').click()
  page.wait_for_function("document.querySelector('[data-cabina-row-play=\"1\"]').textContent.includes('Pausar')")
  assert controls[-1]==dict(action='resume')
  # Both menu directions change the actual order, not just the displayed count.
  root.locator('[data-cabina-track="1"]').click();root.locator('[data-studio-edit=move][data-from="1"][data-to="0"]').click()
  page.wait_for_function("document.querySelector('[data-track-index=\"0\"] strong').textContent==='Track A'")
  root.locator('[data-cabina-track="0"]').click();root.locator('[data-studio-edit=move][data-from="0"][data-to="1"]').click()
  page.wait_for_function("document.querySelector('[data-track-index=\"0\"] strong').textContent==='Track B'")
  # Pointer drag moves the exact occurrence, including duplicate Spotify IDs.
  handle=root.locator('[data-cabina-drag="0"]');handle.scroll_into_view_if_needed()
  source=handle.bounding_box();destination=root.locator('[data-track-index="2"]').bounding_box()
  page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);page.mouse.down()
  page.mouse.move(destination['x']+25,destination['y']+destination['height']-3,steps=12);page.mouse.up()
  page.wait_for_function("document.querySelector('[data-track-index=\"2\"] strong').textContent==='Track B'")
  assert root.locator('[data-track-index] .cabina-song-meta strong').all_text_contents()==['Track A','Added Track','Track B']
  # Keyboard confirmation and cancellation provide an alternative to dragging.
  handle=root.locator('[data-cabina-drag="2"]');handle.focus();handle.press('Space');handle.press('Home');handle.press('Enter')
  page.wait_for_function("document.querySelector('[data-track-index=\"0\"] strong').textContent==='Track B'")
  before_drag=len(edits);handle=root.locator('[data-cabina-drag="0"]');handle.focus();handle.press('Space');handle.press('End');handle.press('Escape')
  assert len(edits)==before_drag and root.get_attribute('data-cabina-dragging') is None
  if width==390:
   source=handle.bounding_box();destination=root.locator('[data-track-index="1"]').bounding_box()
   point=dict(pointerId=41,pointerType='touch',isPrimary=True,button=0)
   handle.dispatch_event('pointerdown',dict(point,clientX=source['x']+12,clientY=source['y']+12))
   page.locator('body').dispatch_event('pointermove',dict(point,clientX=destination['x']+25,clientY=destination['y']+destination['height']-3))
   page.locator('body').dispatch_event('pointerup',point)
   page.wait_for_function("document.querySelector('[data-track-index=\"1\"] strong').textContent==='Track B'")
  # Long lists scroll internally without extending the document past its layout.
  original_tracks=playlist['tracks'][:]
  playlist['tracks']=original_tracks+[dict(id=str(i).zfill(22),title='Extra song '+str(i),artist='Test band',durationMs=180000) for i in range(30)]
  root.locator('[data-studio-refresh]').click()
  page.wait_for_function("n=>document.querySelectorAll('[data-track-index]').length===n",arg=len(playlist['tracks']))
  page.set_viewport_size(dict(width=width,height=600))
  for scroll in [0,100000]:
   page.evaluate('y=>window.scrollTo(0,y)',scroll)
   layout=page.evaluate("""()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {sidebar:rect('.toca-admin-sidebar'),player:rect('.cabina-player'),frame:rect('.toca-admin-frame'),nav:rect('.toca-admin-mobile-nav'),document:document.documentElement.scrollHeight,y:scrollY,height:innerHeight}}""")
   assert layout['document']<=layout['frame']['bottom']+layout['y']+1,layout
   if width>760:
    assert layout['sidebar']['top']==0 and layout['sidebar']['bottom']==layout['height'],layout
    assert layout['player']['left']==layout['sidebar']['right'] and layout['player']['bottom']==layout['height'],layout
   else:assert layout['player']['bottom']<=layout['nav']['top']+1,layout
  root.locator('.cabina-track-list').evaluate('e=>e.scrollTop=e.scrollHeight')
  page.screenshot(path=f'{SHOTS}/toca-music-scroll-{width}.png')
  playlist['tracks']=original_tracks
  page.set_viewport_size(dict(width=width,height=1000))
  root.locator('[data-studio-refresh]').click()
  page.wait_for_function("n=>document.querySelectorAll('[data-track-index]').length===n",arg=len(original_tracks))
  page.evaluate('window.scrollTo(0,0)')
  page.screenshot(path=f'{SHOTS}/toca-studio-{width}.png',full_page=True,style='.cabina-player{position:static!important;margin-top:30px!important}.toca-cabina{padding-bottom:0!important}.toca-admin-mobile-nav{position:static!important}.toca-admin-content{padding-bottom:30px!important}')
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Horizontal overflow'
  root.locator('[data-cabina-open="playlist-options"]').click()
  root.locator('[data-cabina-name-mode="create"]').click()
  count_before_create=len(edits)
  root.locator('[data-studio-name]').fill('Brand new');root.locator('[data-studio-name]').press('Enter');page.wait_for_function("document.querySelector('[data-studio-playlist-name]').textContent.includes('Brand new')")
  assert [e['action'] for e in edits][:3]==['add','move','rename'] and edits[-1]['action']=='create',edits
  # Empty playlist, dialog validation and selecting a playlist do not restart playback.
  root.locator('.cabina-empty-list').wait_for()
  root.locator('.cabina-empty-list [data-cabina-name-mode="create"]').click()
  root.locator('[data-studio-name]').fill('   ');root.locator('[data-studio-create]').click()
  assert len(edits)==count_before_create+1
  root.locator('dialog[open] [data-cabina-close]').first.click()
  before=len(controls)
  root.locator('.cabina-playlist-selector').click()
  root.locator('[data-cabina-dialog="playlist-options"] [data-cabina-open="select-playlist"]').click()
  root.locator('[data-cabina-playlist-select]').select_option(playlist['id'])
  root.locator('[data-cabina-select-playlist]').click()
  page.wait_for_function("!document.querySelector('dialog[open]')")
  assert len(controls)==before
  # Request admission is independent from playback, with the configured 100 m access.
  root.locator('[data-action="toggle-session"]').click()
  page.wait_for_function("document.querySelector('[data-action=\"toggle-session\"]').getAttribute('aria-checked')==='true'")
  assert len(controls)==before
  assert '100 m' in root.locator('.cabina-session-bottom').inner_text()
  # Rules are a dialog and retain their place after saving without stopping audio.
  root.locator('[data-cabina-open="rules"]').click()
  root.locator('[data-action="toggle-curated"]').click()
  page.wait_for_function("document.querySelector('dialog[data-cabina-dialog=rules][open] [data-action=\"toggle-curated\"]').getAttribute('aria-checked')==='true'")
  root.locator('#rule-search-BLOCK').fill('Search')
  root.locator('[data-action="rule-select"][data-mode=BLOCK]').click()
  page.wait_for_function("document.querySelector('dialog[data-cabina-dialog=rules][open] .toca-rule-item')")
  assert blocked[0]['trackId']==A and len(controls)==before
  page.keyboard.press('Escape')
  assert root.locator('dialog[open]').count()==0
  # A pending write locks create/add/rename/selection, but keeps playback available.
  operation[0]=dict(id='88888888-8888-4888-8888-888888888888',action='add',status='UNCERTAIN',message='Verificando cambio')
  root.locator('[data-studio-refresh]').click();root.locator('[data-studio-reconcile]').wait_for()
  assert root.locator('[data-cabina-open="add"]').is_disabled()
  assert root.locator('.cabina-playlist-selector').is_disabled()
  assert root.locator('[data-studio-create]').is_disabled()
  assert root.locator('[data-player-toggle]').is_enabled()
  root.locator('[data-studio-reconcile]').click()
  page.wait_for_function("!document.querySelector('[data-studio-reconcile]')")
  assert root.locator('.cabina-empty-list [data-cabina-name-mode="create"]').is_enabled()
  # Losing an edit response preserves its key; recovery never creates another edit.
  root.locator('[data-cabina-open="playlist-options"]').click()
  root.locator('[data-cabina-name-mode="rename"]').click()
  root.locator('[data-studio-name]').fill('Recovered name');drop_response[0]=True
  root.locator('[data-studio-rename]').click()
  root.locator('dialog[open] [data-cabina-close]').first.click()
  root.locator('[data-studio-recover]').wait_for()
  assert root.locator('.cabina-playlist-selector').is_disabled()
  saved=page.evaluate("JSON.parse(sessionStorage.getItem('toca-music-edit:'+"+json.dumps(ID)+"))")
  count=len(edits);root.locator('[data-studio-recover]').click()
  page.wait_for_function("!document.querySelector('[data-studio-recover]')")
  assert len(edits)==count and edit_ids[-1]==saved['id']
  assert page.evaluate("sessionStorage.getItem('toca-music-edit:'+"+json.dumps(ID)+")") is None
  # A failed recovery must not prevent loading the playlist or the player.
  saved=dict(id='99999999-9999-4999-8999-999999999999',input=dict(action='rename',name='Recovered on startup',snapshot=playlist['snapshot']))
  page.evaluate("value=>sessionStorage.setItem('toca-music-edit:'+"+json.dumps(ID)+",JSON.stringify(value))",saved)
  recovery_unavailable[0]=True;page.reload()
  root.locator('[data-studio-recover]').wait_for()
  assert root.locator('[data-studio-playlist-name]').inner_text()==playlist['name']
  page.wait_for_function("document.querySelector('[data-player-title]').textContent!=='Sin reproducción activa'")
  assert root.locator('[data-player-toggle]').is_enabled()
  recovery_unavailable[0]=False;root.locator('[data-studio-recover]').click()
  page.wait_for_function("!document.querySelector('[data-studio-recover]')")
  # Available output selection transfers audio and excludes restricted devices.
  root.locator('.cabina-heading-actions [data-cabina-open="connection"]').click()
  root.locator('[data-cabina-devices]').click();root.locator('[data-cabina-select-device=speaker]').wait_for()
  assert root.locator('[data-cabina-select-device=restricted]').count()==0
  root.locator('[data-cabina-select-device=speaker]').click()
  page.wait_for_function("document.querySelector('dialog[open] [data-cabina-dialog-status]').textContent.includes('Salida de audio seleccionada')")
  assert controls[-1]['action']=='transfer'
  root.locator('dialog[open] [data-cabina-close]').first.click()
  # Feature flags stay authoritative, including after opening menus.
  playlist['tracks']=[dict(id=A,title='Track A',artist='Band A',durationMs=180000,imageUrl='/assets/venues/bar-1.webp'),dict(id=B,title='Track B',artist='Band B',durationMs=200000)]
  playlist['snapshot']='flags-test'
  flags[0]=False;page.reload();root.locator('[data-track-index="0"]').wait_for()
  assert root.locator('[data-player-toggle]').is_disabled()
  assert root.locator('[data-cabina-open="add"]').is_enabled()
  root.locator('[data-cabina-open="add"]').click()
  assert 'habilitar la edición' in root.locator('dialog[open]').inner_text()
  root.locator('dialog[open] [data-cabina-close]').first.click()
  before_controls=len(controls)
  root.locator('[data-cabina-row-play="0"]').click()
  root.locator('dialog[data-cabina-dialog=connection][open]').wait_for()
  assert 'deshabilitado' in root.locator('[data-cabina-dialog-status]').filter(has_text='deshabilitado').first.inner_text()
  assert len(controls)==before_controls
  root.locator('dialog[open] [data-cabina-close]').first.click()
  assert root.locator('[data-cabina-drag="0"]').is_disabled()
  root.locator('[data-cabina-track="0"]').click()
  assert root.locator('dialog[open] [data-studio-edit=move]').is_disabled()
  root.locator('dialog[open] [data-cabina-close]').first.click()
  root.locator('[data-cabina-open="playlist-options"]').click()
  assert root.locator('[data-cabina-name-mode="create"]').first.is_disabled()
  page.keyboard.press('Escape');flags[0]=True
  # Starting without an active output opens audio selection and sends no failed play.
  device[0]=None;now[0]=None;playing[0]=False;page.reload();root.locator('[data-track-index="0"]').wait_for()
  before_controls=len(controls)
  root.locator('[data-cabina-start]').click();root.locator('[data-player-start]').click()
  root.locator('dialog[data-cabina-dialog=connection][open]').wait_for()
  assert 'Elegí dónde' in root.locator('dialog[open] [data-cabina-dialog-status]').inner_text()
  assert len(controls)==before_controls
  # First connection state hides unusable player and playlist controls.
  connected[0]=False;page.reload();root.locator('.cabina-empty').wait_for()
  assert root.locator('.cabina-player').count()==0
  assert root.locator('.cabina-empty [data-action="connect-spotify"]').is_visible()
  assert not errors,errors
  # First-bar registration uses the dedicated guided flow; its full paths are
  # covered by test-venue-onboarding.py.
  owned.clear();page.goto(BASE+'/#/admin/profile')
  page.locator('#onboard-search').wait_for()
  assert page.locator('#create-venue').count()==0
  context.close();print('PASS cabina: playlist CRUD/selection, player/SDK, independent requests, rules, pending edits, output, flags, disconnected and guided onboarding:',width)
 browser.close()
