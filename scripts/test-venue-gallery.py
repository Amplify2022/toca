"""Public venue header gallery in the full app; local photos and API fixtures."""
import functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]/'web'
ID='77777777-7777-4777-8777-777777777777'
PHOTO=f'/api/venues/{ID}/photos/'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in (390,1440):
   venue=dict(id=ID,name='Bluzz Bar',address='Centro',city='Montevideo',genre='Rock',active=True,description='El bar y su música',photos=[dict(url=PHOTO+'b'),dict(url=PHOTO+'a',isPrimary=True),dict(url=PHOTO+'c')],coverPhotoUrl=PHOTO+'a')
   context=browser.new_context(viewport=dict(width=width,height=1000),service_workers='block',reduced_motion='reduce')
   context.add_init_script("localStorage.setItem('amplify-mode','live')")
   page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   def api(route):
    path=urlsplit(route.request.url).path;data=[]
    if path.startswith(PHOTO):
     index={'a':1,'b':2,'c':3}[path.rsplit('/',1)[1]]
     return route.fulfill(content_type='image/webp',body=(ROOT/f'assets/venues/bar-{index}.webp').read_bytes())
    if path==f'/api/venues/{ID}':data=venue
    elif path=='/api/venues':data=[venue]
    elif path.endswith('/music-status'):data=dict(active=True,isPlaying=False,playlist=[])
    route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
   page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda route:route.abort())
   def open_profile():
    if page.url==BASE+'/#/venue/'+ID:page.reload()
    else:page.goto(BASE+'/#/venue/'+ID)
    page.locator('.toca-detail-intro h1').wait_for();page.wait_for_load_state('networkidle')
   open_profile();gallery=page.get_by_role('region',name='Fotos de Bluzz Bar');track=gallery.locator('[data-gallery-track]')
   assert gallery.locator('.toca-gallery-slide').count()==3,'Include every photo, with cover deduplicated'
   sources=gallery.locator('img').evaluate_all('els=>els.map(el=>new URL(el.src).pathname)')
   assert sources==[PHOTO+'a',PHOTO+'b',PHOTO+'c'],sources
   assert page.locator('.toca-public-gallery,[data-photo-preview]').count()==0,'No repeated photos below the venue details'
   assert page.locator('.toca-detail-main > :first-child').get_attribute('data-venue-gallery') is not None
   assert gallery.get_by_role('link',name='Volver',exact=True).get_attribute('href')=='#/explore'
   assert gallery.get_by_role('button',name='Agregar a favoritos').count()==1
   expect(gallery.locator('[data-gallery-counter]')).to_have_text('1 / 3')
   expect(gallery.get_by_role('button',name='Foto anterior')).to_be_disabled()
   gallery.get_by_role('button',name='Foto siguiente').click();expect(gallery.locator('[data-gallery-counter]')).to_have_text('2 / 3')
   gallery.get_by_role('button',name='Foto siguiente').click();expect(gallery.locator('[data-gallery-counter]')).to_have_text('3 / 3')
   expect(gallery.get_by_role('button',name='Foto siguiente')).to_be_disabled()
   track.focus();page.keyboard.press('Home');expect(gallery.locator('[data-gallery-counter]')).to_have_text('1 / 3')
   page.keyboard.press('ArrowRight');expect(gallery.locator('[data-gallery-counter]')).to_have_text('2 / 3')
   page.keyboard.press('End');expect(gallery.locator('[data-gallery-counter]')).to_have_text('3 / 3')
   page.keyboard.press('ArrowLeft');expect(gallery.locator('[data-gallery-counter]')).to_have_text('2 / 3')
   # Native horizontal scrolling (the same browser scroller used for swiping).
   track.evaluate('el=>el.scrollTo({left:0,behavior:"instant"})');expect(gallery.locator('[data-gallery-counter]')).to_have_text('1 / 3')
   track.evaluate('el=>el.scrollTo({left:el.clientWidth*2,behavior:"instant"})');expect(gallery.locator('[data-gallery-counter]')).to_have_text('3 / 3')
   page.set_viewport_size(dict(width=760 if width==390 else 390,height=1000))
   expect(gallery.locator('[data-gallery-counter]')).to_have_text('3 / 3')
   page.wait_for_function("(()=>{const t=document.querySelector('[data-gallery-track]');return Math.abs(t.scrollLeft-t.clientWidth*2)<2})()")
   page.set_viewport_size(dict(width=width,height=1000));page.wait_for_load_state('networkidle')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   gallery.screenshot(path=f'/tmp/toca-venue-gallery-{width}.png')
   assert gallery.locator('img').first.evaluate('el=>getComputedStyle(el).objectFit')=='contain'
   # Cover-only, photos-only and an omitted collection all remain usable.
   venue['photos']=None;open_profile();assert gallery.locator('.toca-gallery-slide').count()==1
   assert gallery.locator('[data-gallery-step],[data-gallery-counter]').count()==0
   venue['coverPhotoUrl']=None;venue['photos']=[dict(url=PHOTO+'b'),dict(url=PHOTO+'c')]
   open_profile();assert gallery.locator('.toca-gallery-slide').count()==2
   assert gallery.locator('img').first.get_attribute('src').endswith(PHOTO+'b')
   venue.pop('photos');open_profile()
   assert page.locator('[data-venue-gallery]').count()==0
   expect(page.locator('.toca-detail-cover img')).to_be_visible()
   assert not errors,errors
   context.close();print('PASS header gallery: every photo, cover order/deduplication, arrows, keyboard, native scroll, resize, single/missing photos and no lower gallery:',width,flush=True)
  browser.close()
finally:server.shutdown()
