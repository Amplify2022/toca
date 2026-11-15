"""Real account UI: photo persistence, upload validation, private session fencing and toast motion."""
import base64,functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];ID='77777777-7777-4777-8777-777777777777'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block');page=context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-owner');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner',email:'owner@example.test'}))")
  user=dict(id='owner',name='Owner',email='owner@example.test');avatar=[None];writes=[];reads=[];held=[];hold=[False]
  venue=dict(id=ID,name='Profile Bar',address='Test 123',city='Montevideo',active=False,published=True)
  def reply(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PUT,POST,DELETE,OPTIONS'})
  def api(route):
   req=route.request;path=urlsplit(req.url).path
   if req.method=='OPTIONS':return reply(route,{})
   if path=='/api/auth/me/avatar':
    if req.method=='GET':
     reads.append(req.headers.get('authorization'))
     if hold[0]:hold[0]=False;held.append(route);return
     return reply(route,dict(avatar=avatar[0] if req.headers.get('authorization')=='Bearer synthetic-owner' else None))
    writes.append(req.method)
    if req.method=='PUT':
     image=req.post_data_json['image'];raw=base64.b64decode(image.split(',')[1]);assert raw[:3]==b'\xff\xd8\xff' and raw[-2:]==b'\xff\xd9'
     avatar[0]=image;return reply(route,dict(avatar=image))
    avatar[0]=None;return reply(route,dict(deleted=True))
   if path=='/api/auth/me':
    if req.method=='PUT':user['name']=req.post_data_json['name']
    return reply(route,user if req.headers.get('authorization')=='Bearer synthetic-owner' else dict(id='other',name='Other'))
   if path=='/api/admin/venues':return reply(route,[venue])
   if path==f'/api/venues/{ID}':return reply(route,venue)
   if path.endswith('/spotify/status'):return reply(route,dict(connected=False))
   return reply(route,[])
  page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
  page.goto(BASE+'/#/admin/account');expect(page.locator('#admin-avatar-file')).to_be_attached()
  page.locator('#account-name').fill('Unsaved name')
  page.locator('#admin-avatar-file').set_input_files(ROOT/'web/assets/venues/bar-1.webp')
  expect(page.locator('[data-admin-photo] img')).to_be_visible()
  assert page.locator('.toca-admin-avatar img').count()==2
  assert page.locator('#account-name').input_value()=='Unsaved name','Photo save must preserve unsaved form input'
  expect(page.locator('.toasty')).to_have_text('Foto de perfil actualizada.')
  page.wait_for_timeout(400)
  assert float(page.locator('.toasty').evaluate('(n)=>getComputedStyle(n).opacity'))>.95
  page.wait_for_timeout(3400);assert page.locator('.toasty').count()==1
  page.wait_for_function("document.querySelector('.toasty')?.dataset.leaving==='true'")
  page.wait_for_timeout(180);assert page.locator('.toasty').count()==1,'Exit must fade gradually'
  expect(page.locator('.toasty')).to_have_count(0)
  # A full reload gets the persisted photo; names still save independently.
  page.reload();expect(page.locator('[data-admin-photo] img')).to_be_visible()
  page.locator('#account-name').fill('Updated owner');page.locator('#account-update button').click()
  expect(page.locator('.toca-admin-session strong')).to_have_text('Updated owner')
  assert page.locator('.toca-admin-avatar img').count()==2
  # Malformed input is rejected before a server write, and the previous photo stays.
  count=len(writes)
  page.locator('#admin-avatar-file').set_input_files(dict(name='fake.png',mimeType='image/png',buffer=b'not an image'))
  expect(page.locator('.admin-avatar-status')).to_contain_text('No se pudo abrir')
  assert len(writes)==count and page.locator('[data-admin-photo] img').count()==1
  page.locator('[data-admin-photo-remove]').click();expect(page.locator('[data-admin-photo] img')).to_have_count(0)
  assert page.locator('.toca-admin-avatar img').count()==0
  page.reload();expect(page.locator('#admin-avatar-file')).to_be_attached();assert page.locator('[data-admin-photo] img').count()==0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=f'/tmp/toca-admin-profile-{width}.png')
  # A late response belonging to the previous account cannot paint the next one.
  hold[0]=True;page.reload();page.wait_for_function("!!document.querySelector('#admin-avatar-file')")
  page.wait_for_timeout(100);assert held
  page.evaluate("async()=>{state.token='synthetic-other';state.user={id:'other',name:'Other'};await render()}")
  expect(page.locator('.toca-admin-session strong')).to_have_text('Other')
  reply(held.pop(),dict(avatar=page.evaluate("()=>{const c=document.createElement('canvas');c.width=c.height=20;return c.toDataURL('image/jpeg')}")))
  page.wait_for_timeout(200);assert page.locator('.toca-admin-avatar img,[data-admin-photo] img').count()==0
  assert not errors,errors
  context.close();print('PASS admin photo upload/persistence/delete, invalid images, session isolation, responsive layout and smooth toast:',width,flush=True)
 browser.close()
server.shutdown()
