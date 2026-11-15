"""Real landing UI: anchors, walkthrough, honest store availability, QR and contact retry."""
import functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/previews';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')));threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390,320]:
   context=browser.new_context(viewport=dict(width=width,height=900),service_workers='block');page=context.new_page();errors=[];posted=[];receipts=set();fail=[True]
   page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script("localStorage.setItem('amplify-mode','live')")
   def api(route):
    req=route.request;path=urlsplit(req.url).path
    if req.method=='OPTIONS':return route.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'})
    if path=='/api/contact':
     data=req.post_data_json;posted.append(data);receipts.add(data['id']);assert not req.headers.get('authorization')
     if fail[0]:fail[0]=False;return route.abort('failed')
     result=dict(accepted=True,receiptId=data['id'])
    else:result=[]
    route.fulfill(content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*'})
   page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda r:r.abort())
   page.goto(BASE+'/#/');root=page.locator('.landing-expanded');expect(root).to_be_visible()
   assert root.locator('main').count()==1 and root.locator('.toca-hero-phone .toca-mini-map').count()==1,'The unapproved hero phone must remain unchanged'
   assert page.evaluate('document.documentElement.scrollHeight>3500')
   root.evaluate('(node)=>node.__kept=true')
   page.locator('.toca-landing-header [data-home-anchor="como-funciona"]').click();expect(page).to_have_url(BASE+'/#/?section=como-funciona')
   page.wait_for_timeout(600)
   assert page.locator('#como-funciona').bounding_box()['y']>=page.locator('.toca-landing-header').bounding_box()['height']-2
   assert root.evaluate('(node)=>node.__kept===true')
   tabs=page.locator('[data-landing-stage]')
   for i in range(4):
    tabs.nth(i).click();expect(tabs.nth(i)).to_have_attribute('aria-selected','true');expect(page.locator(f'#landing-screen-{i}')).to_be_visible()
    image=page.locator(f'#landing-screen-{i} img');page.wait_for_function('(src)=>Array.from(document.images).some(i=>i.src.endsWith(src)&&i.naturalWidth>0)',arg=image.get_attribute('src'))
   tabs.last.press('Home');expect(tabs.first).to_have_attribute('aria-selected','true')
   page.locator('.toca-landing-header [data-home-anchor="contacto"]').click();page.wait_for_timeout(450)
   form=page.locator('#landing-contact-form');form.locator('[name=name]').fill('Landing fixture');form.locator('[name=email]').fill('landing@example.test');form.locator('[name=message]').fill('Tengo una sugerencia para mejorar la aplicación.')
   page.locator('.toca-landing-header [data-home-anchor="la-app"]').click();page.go_back();expect(form.locator('[name=name]')).to_have_value('Landing fixture')
   form.locator('button[type=submit]').click();expect(form.locator('.landing-form-status')).to_contain_text('No pudimos confirmar')
   form.locator('button[type=submit]').click();expect(form.locator('.landing-form-status')).to_contain_text('Recibimos tu mensaje')
   assert len(posted)==2 and posted[0]['id']==posted[1]['id'] and len(receipts)==1
   assert form.locator('[name=message]').input_value()==''
   # The locally generated QR contains only the download URL, never an auth token.
   page.evaluate("""()=>{const QR=AmplifyQR;window.AmplifyQR=function(...args){const qr=new QR(...args),add=qr.addData.bind(qr);qr.addData=value=>{window.__qr=value;return add(value)};return qr;}}""")
   page.locator('.toca-landing-header [data-download-open]').click();dialog=page.locator('#landing-download-dialog');expect(dialog).to_be_visible();assert dialog.locator('canvas').count()==1
   assert page.evaluate('window.__qr')==BASE+'/#/download'
   expect(dialog.locator('.landing-store.is-upcoming')).to_have_count(2)
   dialog.locator('[data-download-close]').click();expect(dialog).not_to_be_visible()
   assert page.locator('.landing-socials a[href*="instagram.com/tocamusicapp"]').count()==1
   assert page.locator('.landing-socials a[href*="facebook.com"]').count()==1
   for id in ['como-funciona','para-bares','descargar','contacto']:
    page.locator('#'+id).scroll_into_view_if_needed();page.wait_for_timeout(100)
   page.wait_for_function("Array.from(document.querySelectorAll('.landing-expanded img')).filter(i=>!i.closest('[hidden]')).every(i=>i.complete&&i.naturalWidth>0)")
   form.locator('.landing-form-status').evaluate('(node)=>node.hidden=true')
   page.evaluate('scrollTo(0,0)');page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   page.screenshot(path=str(OUT/f'inicio-{width}.png'),full_page=True)
   if width==1440:
    page.goto(BASE+'/prototypes/home-phone/');frame=page.frame_locator('iframe');expect(frame.locator('[data-preview-phone] img')).to_be_visible();page.wait_for_timeout(200)
    frame.locator('.toca-landing-hero').screenshot(path=str(OUT/'inicio-celular-propuesta.png'))
   assert not errors,errors
   context.close();print('PASS landing anchors, history, actual walkthrough images, keyboard, contact retry, local QR and responsive layout:',width,flush=True)
  # Published store URLs are used only for the matching device, without inventing a listing.
  for ua,url in [('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)','https://apps.apple.com/app/id1234567890'),('Mozilla/5.0 (Linux; Android 14)','https://play.google.com/store/apps/details?id=test.toca.fixture')]:
   context=browser.new_context(user_agent=ua,service_workers='block');page=context.new_page();targets=[]
   page.add_init_script("window.TOCA_CONFIG={marketing:{appStoreUrl:'https://apps.apple.com/app/id1234567890',playStoreUrl:'https://play.google.com/store/apps/details?id=test.toca.fixture'}}")
   def external(route):
    if route.request.is_navigation_request():targets.append(route.request.url);return route.fulfill(body='Store destination fixture')
    return route.abort()
   page.route('https://**/*',external);page.goto(BASE+'/#/download');page.wait_for_url(url);assert targets==[url]
   context.close()
  browser.close()
finally:server.shutdown()
