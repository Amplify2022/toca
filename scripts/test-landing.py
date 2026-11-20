"""Real landing UI: anchors, walkthrough, honest store availability, QR and contact retry."""
import os
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
  browser=p.chromium.launch(executable_path=os.getenv('TOCA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
  for width in [1440,1024,768,390,320]:
   context=browser.new_context(viewport=dict(width=width,height=900),service_workers='block');page=context.new_page();errors=[];posted=[];receipts=set();fail=[True]
   page.on('pageerror',lambda e:errors.append(str(e)))
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
   def header_anchor(identity):
    toggle=page.locator('.landing-menu-toggle')
    if toggle.is_visible() and toggle.get_attribute('aria-expanded')!='true':toggle.click()
    page.locator(f'.toca-landing-header [data-home-anchor="{identity}"]').click()
   header=page.locator('.toca-landing-header')
   assert header.locator('nav a').count()==3
   assert not root.locator('.landing-benefits,#descargar').count()
   assert root.locator('#la-app [data-landing-stage]').count()==4
   assert root.locator('#como-funciona').count()==0
   if width>760:
    nav_box=header.locator('nav').bounding_box();download_box=header.locator('[data-download-open]').bounding_box()
    assert 0<download_box['x']-(nav_box['x']+nav_box['width'])<=32,'Header links must sit beside the download button'
   else:
    toggle=page.locator('.landing-menu-toggle');toggle.click();expect(toggle).to_have_attribute('aria-expanded','true')
    page.keyboard.press('Escape');expect(toggle).to_have_attribute('aria-expanded','false')
   assert root.locator('main').count()==1 and root.locator('.toca-hero-phone .toca-mini-map').count()==0
   phone=root.locator('.toca-hero-phone-app img');expect(phone).to_have_attribute('src','/assets/landing/explore.png?v=discovery-4')
   page.wait_for_function("document.querySelector('.toca-hero-phone-app img').naturalWidth===390")
   download_button=header.get_by_role('button',name='Bajá la app',exact=True)
   expect(download_button).to_have_attribute('aria-haspopup','dialog')
   assert download_button.locator('svg').count()==0
   assert not root.get_by_role('link',name='Explorar bares',exact=True).locator('svg').count()
   assert root.locator('#la-app h2').inner_text()=='Tu próxima canción, en cuatro pasos.'
   assert page.evaluate('document.documentElement.scrollHeight>2900')
   visual=page.locator('.toca-hero-visual').bounding_box()
   frame_box=phone.bounding_box()
   assert visual['x']<=frame_box['x'] and frame_box['x']+frame_box['width']<=visual['x']+visual['width']
   assert visual['y']<=frame_box['y'] and frame_box['y']+frame_box['height']<=visual['y']+visual['height']
   status=page.locator('.landing-phone-status')
   expect(status).to_have_text('9:41')
   assert status.locator('svg').count()==3
   assert phone.evaluate("""el=>{
    const frame=el.parentElement;
    return el.naturalWidth/el.naturalHeight===.5&&
     Math.abs(frame.clientWidth-el.clientWidth-6)<=1&&
     Math.abs(frame.clientHeight-el.clientHeight-frame.querySelector('.landing-phone-status').clientHeight-6)<=1&&
     getComputedStyle(el).objectFit==='cover';
   }""")
   root.evaluate('(node)=>node.__kept=true')
   header_anchor('la-app');expect(page).to_have_url(BASE+'/#/?section=la-app')
   page.wait_for_timeout(600)
   assert page.locator('#la-app').bounding_box()['y']>=page.locator('.toca-landing-header').bounding_box()['height']-2
   assert root.evaluate('(node)=>node.__kept===true')
   page.evaluate("location.hash='/?section=como-funciona'");page.wait_for_timeout(200)
   assert page.locator('#la-app').bounding_box()['y']>=header.bounding_box()['height']-2,'Existing how-it-works links must reach the combined section'
   tabs=page.locator('[data-landing-stage]')
   assert not tabs.locator('svg').count(),'Walkthrough steps must not have arrows'
   for i in range(4):
    tabs.nth(i).click();expect(tabs.nth(i)).to_have_attribute('aria-selected','true');expect(page.locator(f'#landing-screen-{i}')).to_be_visible()
    expect(page.locator(f'#landing-screen-{i}')).to_have_attribute('aria-hidden','false')
    image=page.locator(f'#landing-screen-{i} img');page.wait_for_function('(src)=>Array.from(document.images).some(i=>i.src.endsWith(src)&&i.naturalWidth>0)',arg=image.get_attribute('src'))
   if width<=760:
    assert tabs.first.locator('strong').is_hidden()
    expect(root.locator('.landing-mobile-copy .is-active')).to_contain_text('Tu tema está')
    assert tabs.last.bounding_box()['y']<root.locator('.landing-mobile-copy').bounding_box()['y']<root.locator('.landing-screen-phone').bounding_box()['y']
    assert root.locator('#landing-contact-form .input').evaluate_all("nodes=>nodes.every(node=>parseInt(getComputedStyle(node).fontSize)>=16)")
   else:
    assert tabs.first.bounding_box()['x']>root.locator('.landing-screen-phone').bounding_box()['x']
   tabs.last.press('Home');expect(tabs.first).to_have_attribute('aria-selected','true')
   assert not page.locator('[data-stage-playback]').count()
   assert not root.locator('.landing-stage-progress,[role=progressbar]').count()
   actions=page.locator('.landing-owner-actions')
   assert actions.locator('.toca-btn svg').count()==0
   assert actions.locator('a').evaluate_all("""nodes=>{
    const [first,second]=nodes;
    const [primary,secondary]=nodes.map(link=>getComputedStyle(link));
    const center=element=>{const box=element.getBoundingClientRect();return box.x+box.width/2;};
    const group=first.closest('.landing-owner-actions');
    return Math.abs(group.getBoundingClientRect().left-group.parentElement.getBoundingClientRect().left)<1&&
     [first,second].every(link=>Math.abs(center(link.firstElementChild)-center(link))<1)&&
     ['fontSize','fontWeight','lineHeight','paddingLeft'].every(key=>primary[key]===secondary[key]);
   }"""),'Venue actions stay left-aligned and their labels are centered'
   header_anchor('contacto');page.wait_for_timeout(450)
   form=page.locator('#landing-contact-form');form.locator('[name=name]').fill('Landing fixture');form.locator('[name=email]').fill('landing@example.test');form.locator('[name=message]').fill('Tengo una sugerencia para mejorar la aplicación.')
   header_anchor('la-app');page.go_back();expect(form.locator('[name=name]')).to_have_value('Landing fixture')
   form.locator('button[type=submit]').click();expect(form.locator('.landing-form-status')).to_contain_text('No pudimos confirmar')
   form.locator('button[type=submit]').click();expect(form.locator('.landing-form-status')).to_contain_text('Recibimos tu mensaje')
   assert len(posted)==2 and posted[0]['id']==posted[1]['id'] and len(receipts)==1
   assert form.locator('[name=message]').input_value()==''
   # The locally generated QR contains only the download URL, never an auth token.
   page.evaluate("""()=>{const QR=AmplifyQR;window.AmplifyQR=function(...args){const qr=new QR(...args),add=qr.addData.bind(qr);qr.addData=value=>{window.__qr=value;return add(value)};return qr;}}""")
   page.locator('.toca-landing-header [data-download-open]').click();dialog=page.locator('#landing-download-dialog');expect(dialog).to_be_visible();assert dialog.locator('canvas').count()==1
   assert page.evaluate('window.__qr')==BASE+'/#/explore'
   expect(dialog.locator('.landing-store')).to_have_count(0)
   web_link=dialog.get_by_role('link',name='Abrir versión web')
   expect(web_link).to_have_attribute('href','#/explore')
   assert not web_link.locator('svg').count()
   dialog.locator('[data-download-close]').click();expect(dialog).not_to_be_visible()
   assert page.locator('.landing-socials a[href*="instagram.com/tocamusicapp"]').count()==1
   assert page.locator('.landing-socials a[href*="facebook.com"]').count()==1
   assert page.locator('.landing-socials a').count()==2
   for name in ['TikTok','X']:
    expect(page.get_by_role('img',name=f'{name} · Próximamente',exact=True)).to_be_visible()
   stores=page.locator('.landing-footer .landing-store')
   expect(stores).to_have_count(2)
   expect(stores.first).to_have_text('PróximamenteApp Store')
   expect(stores.last).to_have_text('PróximamenteGoogle Play')
   assert page.locator('.landing-footer a.landing-store').count()==0
   for id in ['la-app','para-bares','contacto']:
    page.locator('#'+id).scroll_into_view_if_needed();page.wait_for_timeout(100)
   page.wait_for_function("Array.from(document.querySelectorAll('.landing-expanded img')).filter(i=>!i.closest('[hidden]')).every(i=>i.complete&&i.naturalWidth>0)")
   owner_image=page.locator('#para-bares figure img')
   assert owner_image.evaluate('image=>image.naturalWidth>=2200'),'Venue preview needs high-resolution cover thumbnails'
   ratio=owner_image.evaluate('image=>image.naturalWidth/image.naturalHeight');box=owner_image.bounding_box()
   assert abs(box['width']/box['height']-ratio)<.01,'Venue preview must retain its natural proportions'
   form.locator('.landing-form-status').evaluate('(node)=>node.hidden=true')
   tabs.first.click();page.mouse.move(0,0);page.wait_for_timeout(700)
   page.evaluate('scrollTo(0,0)');page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   if width in [1440,390,320]:page.screenshot(path=str(OUT/f'inicio-{width}.png'),full_page=True)
   if width==1440:
    page.locator('.landing-footer').screenshot(path=str(OUT/'inicio-footer.png'))
    page.goto(BASE+'/prototypes/home-phone/');frame=page.frame_locator('iframe');expect(frame.locator('.toca-hero-phone-app img')).to_be_visible();page.wait_for_timeout(200)
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
