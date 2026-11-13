"""Browser permission recovery with a simulated Spotify API/SDK, on desktop and mobile."""
import functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
SDK="""
window.Spotify={Player:class{
 constructor(o){this.o=o;this.listeners={};window.__sdk=this}
 addListener(k,v){this.listeners[k]=v}activateElement(){return Promise.resolve()}
 getCurrentState(){return Promise.resolve(null)}disconnect(){window.__disconnected=(window.__disconnected||0)+1}
 connect(){return new Promise(resolve=>this.o.getOAuthToken(token=>{
  if(token==='synthetic-incomplete'){this.listeners.authentication_error({message:'Invalid token scopes.'});resolve(false)}
  else{this.listeners.ready({device_id:'browser'});resolve(true)}
 }))}
}};window.onSpotifyWebPlaybackSDKReady();
"""
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390]:
   for mode in ['known-missing','legacy-sdk-error','token-api-error']:
    context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block');page=context.new_page();page.set_default_timeout(8000)
    page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner'}))")
    track=dict(id='A'*22,title='Test song',artist='Test band',durationMs=180000)
    playlist=dict(id='P'*22,name='Saved playlist',snapshot='s1',tracks=[track])
    venue=dict(id=ID,name='Permission Bar',address='Test street',city='Montevideo',active=True,published=True)
    playback=dict(now=None,isPlaying=False,progressMs=0,device=None)
    writes=[];token_requests=[];errors=[];authorized=[False];authorizations=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def reply(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'})
    def api(route):
     req=route.request;path=urlsplit(req.url).path;body=req.post_data_json if req.method in ['POST','PUT'] else None;data=[]
     if req.method=='OPTIONS':return reply(route,{})
     if req.method in ['POST','PUT','DELETE']:writes.append((path,body))
     if path=='/api/auth/me':data=dict(id='owner',name='Owner')
     elif path=='/api/admin/venues':data=[venue]
     elif path==f'/api/venues/{ID}':data=venue
     elif path.endswith('/spotify/status'):data=dict(connected=True,profile='Saved account',controlEnabled=True,playlistWriteEnabled=True,playlistId=playlist['id'],deviceId='',browserMissingScopes=[] if authorized[0] else ['streaming'] if mode=='known-missing' else None)
     elif path.endswith('/spotify/authorize'):authorizations.append(req.headers.get('authorization'));data=dict(url=BASE+'/oauth-consent')
     elif path.endswith('/music/playlist/revision'):data=dict(playlist={k:playlist[k] for k in ['id','name','snapshot']},operation=None)
     elif path.endswith('/music/playlist'):data=dict(playlist=playlist,operation=None)
     elif path.endswith('/music/browser-token'):
      token_requests.append(req.headers.get('authorization'))
      if mode=='token-api-error' and not authorized[0]:return reply(route,dict(message='Renová los permisos de Spotify para activar el audio del navegador. Usá la misma cuenta para conservar tu playlist.'),412)
      data=dict(accessToken='synthetic-complete' if authorized[0] else 'synthetic-incomplete',expiresIn=60)
     elif path.endswith('/spotify/device'):data={}
     elif path.endswith('/music/player'):
      if req.method=='GET':data=playback
      else:
       if body['action']=='transfer':playback['device']=dict(id='browser',name='TOCÁ browser')
       if body['action']=='start':playback.update(now=track,isPlaying=True)
       data=dict(accepted=True)
     reply(route,data)
    page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
    page.route('https://sdk.scdn.co/spotify-player.js',lambda r:r.fulfill(content_type='application/javascript',body=SDK))
    page.route(BASE+'/oauth-consent',lambda r:r.fulfill(content_type='text/html',body='<h1>Consentimiento simulado</h1>'))
    page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-track-index="0"]').wait_for()
    # Reproduce the user's flow: Play, choose browser audio, recover the grant.
    root.locator('[data-cabina-start]').click();root.locator('[data-player-start]').click()
    connection=root.locator('[data-cabina-dialog="connection"]');connection.wait_for(state='visible')
    connection.locator('[data-browser-connect]').click()
    page.wait_for_function("document.querySelector('[data-studio-status]').textContent.includes('Renová los permisos')")
    page.wait_for_function("!document.querySelector('[data-browser-connect]').disabled")
    assert connection.locator('[data-browser-authorization]').is_visible()
    assert connection.locator('[data-action="connect-spotify"]').is_visible()
    assert not writes,writes
    assert token_requests==([] if mode=='known-missing' else ['Bearer synthetic-owner'])
    assert root.locator('[data-studio-playlist-name]').inner_text()=='Saved playlist'
    assert page.evaluate("sessionStorage.getItem('amplify-token')")=='synthetic-owner'
    assert not page.evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-incomplete')")
    if mode=='legacy-sdk-error':
     page.screenshot(path=f'/tmp/toca-spotify-permissions-{width}.png',full_page=True)
     assert page.evaluate('window.__disconnected')==1
    with page.expect_navigation(url=BASE+'/oauth-consent'):connection.locator('[data-action="connect-spotify"]').click()
    assert authorizations==['Bearer synthetic-owner'] and not writes
    # Simulate the OAuth callback, now with all grants, keeping the same playlist.
    authorized[0]=True;page.goto(BASE+'/#/admin/music');root=page.locator('[data-admin-studio]');root.locator('[data-track-index="0"]').wait_for()
    assert root.locator('[data-studio-playlist-name]').inner_text()=='Saved playlist'
    root.locator('.cabina-heading-actions [data-cabina-open="connection"]').click()
    connection=root.locator('[data-cabina-dialog="connection"]');assert not connection.locator('[data-browser-authorization]').is_visible()
    connection.locator('[data-browser-connect]').click();page.wait_for_function("!document.querySelector('dialog[open]')")
    assert 'Audio conectado' in root.locator('[data-studio-status]').inner_text()
    root.locator('[data-cabina-start]').click();root.locator('[data-player-start]').click()
    page.wait_for_function("document.querySelector('[data-player-title]').textContent==='Test song'")
    assert [body['action'] for path,body in writes if path.endswith('/music/player')]==['transfer','start']
    # A later SDK authorization failure also stops the unusable player and opens renewal.
    before=len(writes);page.evaluate("window.__sdk.listeners.authentication_error({message:'Invalid token scopes.'})")
    assert connection.is_visible() and connection.locator('[data-browser-authorization]').is_visible()
    assert len(writes)==before and not any(path.endswith('/spotify/disconnect') for path,_ in writes)
    assert not errors,errors
    context.close();print('PASS Spotify permission renewal, playlist preserved, browser recovery:',width,mode,flush=True)
  browser.close()
finally:server.shutdown()
