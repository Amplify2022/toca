"""Login recovery placement, responsive account forms and independent admin/customer sessions."""
import functools,json,threading
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
ADMIN='synthetic-admin-token';CUSTOMER='synthetic-customer-token'
USER=dict(id='customer',name='Customer',email='customer@example.test')
OWNER=dict(id='owner',name='Owner',email='owner@example.test')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
  for width in [1440,390,320]:
   context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block')
   page=context.new_page();page.set_default_timeout(6000);errors=[];calls=[];failure=[False];held=[];hold=[False]
   page.on('pageerror',lambda e:errors.append(str(e)))
   def reply(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'})
   def api(route):
    req=route.request;path=urlsplit(req.url).path
    if req.method=='OPTIONS':return reply(route,{})
    if '/api/accounts/' in path:
     calls.append(dict(path=path,body=req.post_data_json,auth=req.headers.get('authorization','')))
     if hold[0]:hold[0]=False;held.append(route);return
     if failure[0]:failure[0]=False;return reply(route,dict(message='Demasiados intentos. Reintentá más tarde.'),429)
     return reply(route,dict(accepted=True,completed=True))
    if path=='/api/customers/me':return reply(route,USER)
    if path=='/api/auth/me':return reply(route,OWNER)
    if path.endswith('/google/config'):return reply(route,dict(enabled=False,clientId=''))
    return reply(route,[])
   page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
   for kind,url,selector in [('admin','login','.auth-box'),('customer','customer/login','.toca-customer-card')]:
    page.goto(BASE+'/#/'+url);card=page.locator(selector);link=page.locator('a[data-manage-account]')
    expect(link).to_have_count(1);expect(card.locator('[data-manage-account]')).to_have_count(1)
    bounds=card.bounding_box();a=link.bounding_box()
    assert bounds['y']<a['y'] and a['y']+a['height']<bounds['y']+bounds['height']
    assert abs(a['x']+a['width']/2-bounds['x']-bounds['width']/2)<2
    assert card.locator('.toca-auth-recovery').evaluate('(n)=>n===n.parentElement.lastElementChild')
    page.screenshot(path=f'/tmp/toca-login-{kind}-{width}.png',full_page=True)
    link.click();root=page.locator('.toca-account-page');expect(root).to_have_attribute('data-account-kind',kind)
    expect(root.locator('h1')).to_have_text('Recuperá tu acceso')
    form=root.locator('[data-account-action=recover]');form.locator('[name=email]').fill('example@example.test')
    failure[0]=True;form.locator('button').click();expect(root.locator('#account-status')).to_contain_text('Demasiados intentos')
    assert form.locator('button').is_enabled()
    hold[0]=True;count=len(calls);form.locator('button').click();page.wait_for_timeout(80)
    assert held and form.locator('button').is_disabled()
    form.evaluate('(form)=>form.requestSubmit()');assert len(calls)==count+1
    reply(held.pop(),dict(accepted=True));expect(root.locator('#account-status')).to_contain_text('Si hay una cuenta')
    assert calls[-1]['path']==f'/api/accounts/{kind}/recover'
    assert calls[-1]['body']==dict(email='example@example.test') and calls[-1]['auth']==''
    root.locator('summary').click();expect(root.locator('[data-account-action=verify-request]')).to_be_visible()
    inputs=root.locator('input:visible').all()
    for field in inputs:
     box=field.bounding_box();assert box['width']>=200 and box['height']==48
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=f'/tmp/toca-account-recovery-{kind}-{width}.png',full_page=True)
   # Both types may be signed in. Editing one must never clear the other's session.
   def sign_in_both():
    page.evaluate('d=>{sessionStorage.setItem("amplify-token",d.admin);sessionStorage.setItem("amplify-user",JSON.stringify(d.owner));sessionStorage.setItem("toca:customer:session",d.customer)}',dict(admin=ADMIN,owner=OWNER,customer=CUSTOMER))
   sign_in_both();page.goto(BASE+'/#/account?kind=customer');page.reload()
   root=page.locator('.toca-account-page');expect(root.locator('h1')).to_have_text('Acceso y seguridad')
   expect(root.locator('[data-account-action=verify-request] [name=email]')).to_have_value(USER['email'])
   for field in root.locator('input:visible').all():
    box=field.bounding_box();parent=field.locator('xpath=..').bounding_box();assert abs(box['width']-parent['width'])<2
   expect(root.locator('[data-account-action=delete]')).not_to_be_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=f'/tmp/toca-account-security-{width}.png',full_page=True)
   recovery=root.locator('details:has([data-account-action=recover])');recovery.locator('summary').click()
   expect(recovery.locator('[name=email]')).to_have_value(USER['email'])
   recovery.locator('button').click();expect(root.locator('#account-status')).to_contain_text('Si hay una cuenta')
   assert calls[-1]['path']=='/api/accounts/customer/recover' and calls[-1]['auth']=='Bearer '+CUSTOMER
   root.locator('[data-account-button=revoke]').click()
   expect(root.locator('#account-status')).to_contain_text('Se cerraron las sesiones')
   assert calls[-1]['auth']=='Bearer '+CUSTOMER
   assert page.evaluate('sessionStorage.getItem("amplify-token")')==ADMIN
   assert page.evaluate('sessionStorage.getItem("toca:customer:session")') is None
   expect(page).to_have_url(BASE+'/#/customer/login')
   # Account-token verification keeps both sessions intact.
   sign_in_both();page.goto(BASE+'/#/account?kind=customer&purpose=verify&token=synthetic-one-use');page.reload()
   root=page.locator('.toca-account-page');expect(root.locator('h1')).to_have_text('Verificá tu correo')
   assert root.locator('input').count()==0
   root.locator('[data-account-action=consume] button').click();expect(root.locator('#account-status')).to_contain_text('correo quedó verificado')
   assert calls[-1]['body']==dict(token='synthetic-one-use')
   assert root.locator('[data-account-action=consume] button').is_disabled()
   assert page.evaluate('sessionStorage.getItem("amplify-token")')==ADMIN
   assert page.evaluate('sessionStorage.getItem("toca:customer:session")')==CUSTOMER
   # Password-reset links keep their token in the request body and return to the right login.
   page.goto(BASE+'/#/account?kind=customer&purpose=reset&token=synthetic-reset')
   root=page.locator('.toca-account-page');root.locator('[name=password]').fill('New-synthetic-password')
   before=len(calls)
   root.locator('[name=passwordConfirmation]').fill('Other-synthetic-password')
   root.locator('[data-account-action=consume] button').click();expect(root.locator('#account-status')).to_contain_text('no coinciden')
   assert len(calls)==before
   root.locator('[name=passwordConfirmation]').fill('New-synthetic-password')
   root.locator('[data-account-action=consume] button').click();expect(root.locator('#account-status')).to_contain_text('contraseña se actualizó')
   assert calls[-1]['body']==dict(token='synthetic-reset',password='New-synthetic-password')
   assert page.evaluate('sessionStorage.getItem("amplify-token")')==ADMIN
   expect(page).to_have_url(BASE+'/#/customer/login')
   # Closing admin sessions preserves customer access and returns to the admin login.
   sign_in_both();page.goto(BASE+'/#/account?kind=admin');page.reload();root=page.locator('.toca-account-page')
   expect(root.locator('h1')).to_have_text('Acceso y seguridad')
   root.locator('[data-account-button=revoke]').click();expect(root.locator('#account-status')).to_contain_text('Se cerraron las sesiones')
   assert calls[-1]['auth']=='Bearer '+ADMIN
   assert page.evaluate('sessionStorage.getItem("amplify-token")') is None
   assert page.evaluate('sessionStorage.getItem("toca:customer:session")')==CUSTOMER
   expect(page).to_have_url(BASE+'/#/login')
   assert not errors,errors
   context.close();print('PASS centered login links, responsive recovery/security, errors, duplicate-submit guard, reset/verification links and independent sessions:',width,flush=True)
  browser.close()
finally:server.shutdown()
