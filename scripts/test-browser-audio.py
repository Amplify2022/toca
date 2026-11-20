"""Late/repeated SDK ready events must not pause playback or issue extra starts."""
import functools,json,os,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import expect,sync_playwright
ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block');page=context.new_page();page.clock.install();page.set_default_timeout(9000)
  page.add_init_script("sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
  tracks=[dict(id=letter*22,title='Track '+letter,artist='Test band',durationMs=180000) for letter in 'ABCDEFGH']
  playlist=dict(id='P'*22,name='Night',snapshot='s1',tracks=tracks)
  venue=dict(id=ID,name='Audio Bar',address='Test street',city='Montevideo',active=True,published=True)
  playback=dict(now=tracks[6],isPlaying=False,progressMs=12000,contextUri='spotify:playlist:'+playlist['id'],device=dict(id='old-device',name='Old device',volume=50),shuffle=False,repeat='off')
  controls=[];devices=[];held=[];hold=[True];errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def reply(route,data):route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
  def api(route):
   req=route.request;path=urlsplit(req.url).path;body=req.post_data_json if req.method in ['POST','PUT'] else None;data=[]
   if req.method=='OPTIONS':return reply(route,{})
   if path=='/api/auth/me':data=dict(id='owner',name='Owner')
   elif path=='/api/admin/venues':data=[venue]
   elif path==f'/api/venues/{ID}':data=venue
   elif path.endswith('/spotify/status'):data=dict(connected=True,controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'],deviceId=(playback['device'] or {}).get('id'))
   elif path.endswith('/music/playlist/revision'):data=dict(playlist={k:playlist[k] for k in ['id','name','snapshot']},operation=None)
   elif path.endswith('/music/playlist'):data=dict(playlist=playlist,operation=None)
   elif path.endswith('/music/browser-token'):data=dict(accessToken='synthetic-spotify-token',expiresIn=60)
   elif path.endswith('/spotify/device'):devices.append(body);playback['device']=dict(id=body['deviceId'],name=body['deviceId'],volume=50);data={}
   elif path.endswith('/spotify/devices'):data=[dict(id='remote',name='Remote speakers',type='Speaker',restricted=False)]
   elif path.endswith('/music/player'):
    if req.method=='GET':data=playback
    else:
     controls.append(body)
     if body['action']=='transfer':
      if hold[0]:hold[0]=False;held.append(route);page.evaluate('window.__transferHeld=true');return
      playback['isPlaying']=False
     elif body['action']=='start':playback.update(now=tracks[body['position']],isPlaying=True,progressMs=0)
     elif body['action']=='pause':playback['isPlaying']=False
     elif body['action']=='resume':playback['isPlaying']=True
     data=dict(accepted=True)
   reply(route,data)
  page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
  page.route('https://sdk.scdn.co/spotify-player.js',lambda r:r.fulfill(content_type='application/javascript',body="""
   window.Spotify={Player:class{constructor(o){this.o=o;this.listeners={};window.__sdk=this}addListener(k,v){this.listeners[k]=v}activateElement(){return Promise.resolve()}getCurrentState(){return Promise.resolve(null)}disconnect(){}connect(){this.o.getOAuthToken(()=>queueMicrotask(()=>this.listeners.ready({device_id:'browser'})));return Promise.resolve(true)}ready(id='browser'){this.listeners.ready({device_id:id})}}};window.onSpotifyWebPlaybackSDKReady();
  """))
  page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-track-index="0"]').wait_for()
  root.locator('.cabina-heading-actions [data-cabina-open=connection]').click()
  with page.expect_request(lambda r:r.method=='POST' and r.url.endswith('/music/player')):root.locator('[data-browser-connect]').click()
  page.wait_for_function('window.__transferHeld===true')
  assert held and controls==[dict(action='transfer')]
  # Readiness may fire repeatedly while the first transfer is still in flight.
  page.evaluate('window.__sdk.ready();window.__sdk.ready()')
  root.locator('dialog[open] [data-cabina-close]').first.click()
  root.locator('[data-cabina-start]').click();root.locator('[data-player-start]').click()
  page.clock.fast_forward(10000)
  assert controls==[dict(action='transfer')],controls
  # Play waits for that transfer; it cannot be paused by its late completion.
  with page.expect_request(lambda r:r.method=='POST' and r.url.endswith('/music/player') and r.post_data_json.get('action')=='start'):reply(held.pop(),dict(accepted=True))
  page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  assert [c['action'] for c in controls]==['transfer','start']
  assert controls[-1]==dict(action='start',position=0,trackId=tracks[0]['id'],playlistId=playlist['id'],snapshot='s1')
  # Repeated reconnect notifications must not transfer, pause, skip or restart.
  page.evaluate("for(let i=0;i<6;i++)window.__sdk.ready();window.__sdk.listeners.not_ready({device_id:'browser'});window.__sdk.ready()")
  page.clock.fast_forward(12000)
  assert [c['action'] for c in controls]==['transfer','start'] and len(devices)==1
  assert playback['isPlaying'] and playback['now']['id']==tracks[0]['id']
  # Clicking a different row requests that song once, not a sequence of next commands.
  root.locator('[data-cabina-row-play="4"]').click()
  page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  assert controls[-1]==dict(action='start',position=4,trackId=tracks[4]['id'],playlistId=playlist['id'],snapshot='s1')
  assert playback['now']['id']==tracks[4]['id']
  root.locator('[data-player-toggle]').click();page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  assert controls[-1]==dict(action='pause')
  root.locator('[data-player-toggle]').click();page.wait_for_function("!document.querySelector('[data-player-toggle]').disabled")
  assert controls[-1]==dict(action='resume')
  before=len(controls);page.evaluate('window.__sdk.ready()');page.clock.fast_forward(12000);assert len(controls)==before
  # Selecting Connect explicitly must not be undone by a later browser-ready event.
  root.locator('.cabina-heading-actions [data-cabina-open=connection]').click();root.locator('[data-cabina-devices]').click()
  root.locator('[data-cabina-select-device=remote]').click();page.wait_for_function("document.querySelector('dialog[open] [data-cabina-dialog-status]').textContent.includes('Salida de audio seleccionada')")
  before=len(controls);bindings=len(devices);page.evaluate("window.__sdk.ready('browser-new')");page.clock.fast_forward(1000)
  assert len(controls)==before and len(devices)==bindings
  # With no output selected, confirming one continues the original start exactly once.
  for output in ['browser','remote','cancel']:
   playback.update(now=None,isPlaying=False,device=None)
   page.reload()
   root.locator('[data-track-index="0"]').wait_for()
   before=len(controls)
   root.locator('[data-cabina-start]').click();root.locator('[data-player-start]').click()
   connection=root.locator('[data-cabina-dialog="connection"]')
   expect(connection).to_be_visible()
   assert len(controls)==before
   if output=='cancel':
    connection.locator('[data-cabina-close]').click()
    expect(connection).not_to_be_visible()
    root.locator('.cabina-heading-actions [data-cabina-open=connection]').click()
   if output=='remote':
    connection.locator('[data-cabina-devices]').click()
    confirm=connection.locator('[data-cabina-select-device=remote]')
   else:
    confirm=connection.locator('[data-browser-connect]')
   if output=='cancel':
    confirm.click()
    expect(connection).not_to_be_visible()
    assert [c['action'] for c in controls[before:]]==['transfer']
   else:
    with page.expect_request(lambda r:r.method=='POST' and r.url.endswith('/music/player') and r.post_data_json.get('action')=='start'):
     confirm.click()
    expect(root.locator('[data-player-title]')).to_have_text('Track A')
    assert [c['action'] for c in controls[before:]]==['transfer','start']
    assert controls[-1]==dict(action='start',position=0,trackId=tracks[0]['id'],playlistId=playlist['id'],snapshot='s1')
  assert not errors,errors
  context.close();print('PASS delayed setup, duplicate ready, no 10-second pause, exact selected song, remote output and one-click continuation:',width,flush=True)
 browser.close()
server.shutdown()
