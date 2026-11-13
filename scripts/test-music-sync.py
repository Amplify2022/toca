"""Real UI: delayed provider replies, stale snapshots, SDK clock and compact hours."""
import copy,functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
A='A'*22;B='B'*22;C='C'*22;X='X'*22
CAT={key:dict(id=key,title=title,artist='Test band',durationMs=180000) for key,title in [(A,'Track A'),(B,'Track B'),(C,'Track C'),(X,'External Track')]}
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block')
  page=context.new_page();page.clock.install();page.set_default_timeout(9000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
  venue=dict(id=ID,name='Sync Bar',address='Test street 123',city='Montevideo',active=True,published=True,requestAccessMode='NEARBY',openingHours='W2|-|19:00-00:00|19:00-00:00|19:00-00:00|21:00-05:00|21:00-05:00|18:00-00:00')
  playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=[CAT[A].copy(),CAT[B].copy()])
  player=dict(now=CAT[A].copy(),isPlaying=True,contextUri='spotify:playlist:'+playlist['id'],progressMs=5000,repeat='off',shuffle=False,device=dict(id='speakers',name='Bar speakers',volume=50))
  edits=[];controls=[];saved={};lag=[];held=[];hold_edit=[False];hold_control=[False];conflict=[False];external=[False];uncertain=[False];pending=[None];version=[1];player_reads=[]
  def bump():version[0]+=1;playlist['snapshot']='s'+str(version[0])
  def reply(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
  def apply_control(body):
   if body['action']=='pause':player['isPlaying']=False
   if body['action']=='resume':player['isPlaying']=True
   if body['action']=='start':player.update(now=playlist['tracks'][body['position']].copy(),isPlaying=True,progressMs=0)
  def api(route):
   req=route.request;path=urlsplit(req.url).path;method=req.method;body=req.post_data_json if method in ['POST','PUT'] else None
   if method=='OPTIONS':return reply(route,{})
   if path=='/api/auth/me':return reply(route,dict(id='owner',name='Owner'))
   if path=='/api/admin/venues':return reply(route,[venue])
   if path==f'/api/venues/{ID}':return reply(route,venue)
   if path.endswith('/spotify/status'):return reply(route,dict(connected=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'],deviceId=player['device']['id']))
   if path.endswith('/spotify/device'):player['device']['id']=body['deviceId'];return reply(route,{})
   if path.endswith('/music/browser-token'):return reply(route,dict(accessToken='synthetic-spotify-token',expiresIn=60))
   if path.endswith('/music/player'):
    if method=='GET':player_reads.append(path);return reply(route,player)
    controls.append(body)
    if hold_control[0]:hold_control[0]=False;held.append((route,body));return
    apply_control(body);return reply(route,dict(accepted=True))
   if path.endswith('/music/playlist/revision'):return reply(route,dict(playlist={k:playlist[k] for k in ['id','name','snapshot']},operation=pending[0]))
   if path.endswith('/music/playlist'):
    if external[0]:external[0]=False;playlist['tracks'].insert(0,CAT[X].copy());bump()
    return reply(route,dict(playlist=lag.pop(0) if lag else playlist,operation=pending[0]))
   if '/music/edits/' in path:
    edits.append((path,copy.deepcopy(body)))
    if path in saved:return reply(route,saved[path])
    if uncertain[0]:
     uncertain[0]=False;pending[0]=dict(id=path.rsplit('/',1)[1],status='UNCERTAIN',action=body['action'],message='Resultado pendiente de verificación');data=dict(status='UNCERTAIN',result=dict(code='PLAYLIST_CHANGED',beforeWrite=False));saved[path]=data;return reply(route,data)
    if conflict[0]:
     conflict[0]=False;playlist['tracks'].insert(0,CAT[X].copy());bump();data=dict(status='FAILED',result=dict(code='PLAYLIST_CHANGED',beforeWrite=True));saved[path]=data;return reply(route,data)
    assert body['snapshot']==playlist['snapshot'],body
    before=copy.deepcopy(playlist)
    if body['action']=='add':playlist['tracks'].append(CAT[body['trackId']].copy())
    if body['action']=='remove':playlist['tracks'].pop(body['position'])
    if body['action']=='move':playlist['tracks'].insert(body['to'],playlist['tracks'].pop(body['from']))
    bump();data=dict(status='COMPLETED',result=dict(playlistId=playlist['id'],name=playlist['name'],snapshot=playlist['snapshot']),playlist=copy.deepcopy(playlist));saved[path]=data;lag.append(before)
    if hold_edit[0]:hold_edit[0]=False;held.append((route,data));return
    return reply(route,data)
   if path.endswith('/tracks'):return reply(route,[CAT[C]])
   return reply(route,[])
  page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
  page.route('https://sdk.scdn.co/spotify-player.js',lambda r:r.fulfill(content_type='application/javascript',body="""
   window.Spotify={Player:class {constructor(o){this.o=o;this.listeners={};window.__sdk=this;this.s=null}addListener(k,v){this.listeners[k]=v}activateElement(){return Promise.resolve()}disconnect(){}connect(){this.o.getOAuthToken(()=>this.listeners.ready({device_id:'browser'}));return Promise.resolve(true)}emit(s){this.s=s;this.at=performance.now();this.listeners.player_state_changed(s)}getCurrentState(){if(!this.s)return Promise.resolve(null);return Promise.resolve({...this.s,position:this.s.position+(this.s.paused?0:performance.now()-this.at)})}}};window.onSpotifyWebPlaybackSDKReady();
  """))
  def open_music():
   if page.url==BASE+'/#/admin/music':page.reload()
   else:page.goto(BASE+'/#/admin/music')
   page.locator('[data-track-index="0"]').wait_for();return page.locator('[data-admin-studio]')
  root=open_music();hold_edit[0]=True
  root.locator('[data-cabina-open=add]').click();root.locator('[data-studio-search]').fill('Track C')
  with page.expect_request(lambda r:'/music/edits/' in r.url):root.locator('[data-studio-edit=add]').click()
  page.wait_for_function("document.querySelector('[data-studio-edit=add]').textContent==='Agregando…'")
  assert root.locator('[data-studio-edit=add]').is_disabled() and held
  route,data=held.pop();reply(route,data)
  root.locator('[data-cabina-add-feedback]:visible').wait_for()
  assert 'Track C' in root.locator('[data-cabina-add-feedback]').inner_text()
  assert root.locator('[data-studio-edit=add]').inner_text()=='Agregado ✓'
  assert root.locator('[data-track-index] strong').all_text_contents()==['Track A','Track B','Track C']
  root.locator('dialog[open] [data-cabina-close]').first.click()
  page.clock.fast_forward(4000);assert root.locator('[data-studio-status]').inner_text().startswith('Playlist actualizada.')
  page.clock.fast_forward(1200);assert root.locator('[data-studio-status]').inner_text()==''
  assert root.locator('.cabina-added-row').count()==0
  # A stale preparation is retried only after the server confirms no provider write.
  conflict[0]=True
  root.locator('[data-cabina-track="1"]').click();root.locator('[data-studio-edit=remove]').click()
  page.wait_for_function("!Array.from(document.querySelectorAll('[data-track-index] strong')).some(x=>x.textContent==='Track B')")
  assert [t['title'] for t in playlist['tracks']]==['External Track','Track A','Track C']
  assert edits[-2][0]!=edits[-1][0] and edits[-1][1]['position']==2
  # The late pre-edit read does not resurrect the removed item.
  assert root.locator('[data-track-index] strong').all_text_contents()==['External Track','Track A','Track C']
  # Duplicate occurrences cannot be safely rebased after an external insertion.
  page.wait_for_function("!document.querySelector('[data-cabina-open=add]').disabled")
  lag.clear();playlist['tracks']=[CAT[A].copy(),CAT[B].copy(),CAT[A].copy()];bump();root=open_music();external[0]=True;count=len(edits)
  root.locator('[data-cabina-track="2"]').click();root.locator('[data-studio-edit=remove]').click()
  page.wait_for_function("document.querySelector('[data-studio-status]').textContent.includes('inequívoca')")
  assert len(edits)==count and [t['id'] for t in playlist['tracks']].count(A)==2
  message=root.locator('[data-studio-status]').inner_text();page.clock.fast_forward(6000);assert root.locator('[data-studio-status]').inner_text()==message
  # An unknown provider result must never trigger an automatic second write.
  uncertain[0]=True;count=len(edits)
  root.locator('[data-cabina-open=add]').click();root.locator('[data-studio-search]').fill('Track C');root.locator('[data-studio-edit=add]').click()
  root.locator('[data-studio-reconcile]').wait_for()
  assert len(edits)==count+1 and root.locator('[data-cabina-open=add]').is_disabled()
  saved[edits[-1][0]]=dict(status='RELEASED');pending[0]=None
  # SDK samples anchor a local clock. Ticking does not poll the HTTP API each second.
  root=open_music();root.locator('.cabina-heading-actions [data-cabina-open=connection]').click();root.locator('[data-browser-connect]').click()
  page.wait_for_function("!document.querySelector('dialog[open]')")
  assert 'Audio conectado' in root.locator('[data-studio-status]').inner_text()
  page.clock.fast_forward(4900)
  assert 'Audio conectado' in root.locator('[data-studio-status]').inner_text()
  page.clock.fast_forward(200)
  assert root.locator('[data-studio-status]').inner_text()==''
  def sdk(paused,position=5000):
   page.evaluate("s=>window.__sdk.emit(s)",dict(paused=paused,position=position,duration=180000,context=dict(uri='spotify:playlist:'+playlist['id']),track_window=dict(current_track=dict(id=A,name='Track A',artists=[dict(name='Test band')],duration_ms=180000))))
  sdk(False);assert root.locator('[data-player-elapsed]').inner_text()=='0:05'
  reads=len(player_reads);page.clock.fast_forward(1250);assert root.locator('[data-player-elapsed]').inner_text()=='0:06';assert len(player_reads)==reads
  # An old playing sample cannot undo immediate pause feedback while its reply waits.
  hold_control[0]=True
  with page.expect_request(lambda r:r.url.endswith('/music/player') and r.method=='POST'):root.locator('[data-player-toggle]').click()
  assert root.locator('[data-player-toggle]').get_attribute('aria-label')=='Reproducir música'
  elapsed=root.locator('[data-player-elapsed]').inner_text();page.clock.fast_forward(1250);assert root.locator('[data-player-elapsed]').inner_text()==elapsed
  route,body=held.pop();apply_control(body);reply(route,dict(accepted=True));sdk(True,6250)
  page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  hold_control[0]=True
  with page.expect_request(lambda r:r.url.endswith('/music/player') and r.method=='POST'):root.locator('[data-player-toggle]').click()
  assert root.locator('[data-player-toggle]').get_attribute('aria-label')=='Pausar música'
  route,body=held.pop();apply_control(body);reply(route,dict(accepted=True));sdk(False,6250)
  page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  # Rejected controls roll the icon back to the confirmed state.
  hold_control[0]=True
  with page.expect_request(lambda r:r.url.endswith('/music/player') and r.method=='POST'):root.locator('[data-player-toggle]').click()
  assert root.locator('[data-player-toggle]').get_attribute('aria-label')=='Reproducir música'
  route,body=held.pop();reply(route,dict(message='Provider rejected command'),502)
  page.wait_for_function("document.querySelector('[data-player-toggle]').getAttribute('aria-label')==='Pausar música'")
  # Mi Bar keeps each day group and its time range on the same row.
  page.goto(BASE+'/#/admin/profile');hours=page.locator('.vp-hours-summary');hours.wait_for()
  assert hours.locator('.vp-hours-slot').count()==3
  for slot in hours.locator('.vp-hours-slot').all():
   day=slot.locator('strong').bounding_box();time=slot.locator(':scope > span').bounding_box();assert abs(day['y']-time['y'])<2
   assert slot.bounding_box()['width']<=hours.bounding_box()['width']+1
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.locator('.vp-hours-card').screenshot(path=f'/tmp/toca-hours-summary-{width}.png')
  assert not errors,errors
  context.close();print('PASS confirmed playlist, bounded conflict recovery, duplicate safety, 5s feedback, SDK clock, instant controls and hours:',width,flush=True)
 browser.close()
server.shutdown()
