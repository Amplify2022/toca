"""Interactive J + H prototype. Uses local assets only; never reaches the app API."""
import functools,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
STORE='toca:tokens-prototype:v1'
SHOTS=Path('/tmp/toca-token-prototype-shots');SHOTS.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/prototypes/tokens/'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [390,1440]:
   context=browser.new_context(viewport=dict(width=width,height=900),service_workers='block')
   page=context.new_page();page.clock.install();page.set_default_timeout(6000)
   errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
   page.goto(BASE);page.locator('[data-balance]').wait_for()
   def data():return page.evaluate('key=>JSON.parse(sessionStorage.getItem(key))',STORE)
   def balance():return sum(row['amount'] for row in data()['ledger'])
   def route(path):
    page.evaluate('p=>location.hash=p',path);page.wait_for_function('p=>location.hash==="#"+p',arg=path)
   def tick(ms):page.clock.fast_forward(ms);page.wait_for_timeout(30)
   def reset(empty=False):
    page.locator('.prototype-tools summary').click()
    page.locator('[data-scenario="empty"]' if empty else '[data-scenario="initial"]').click()
    page.wait_for_function('() => !!document.querySelector("[data-balance]")')
   def start_request(song='original-prankster'):
    route('/song/'+song);page.locator('[data-request]').click();page.locator('[data-confirm-request]').dblclick()
    page.wait_for_function('location.hash==="#/requests"')
   assert balance()==3 and page.locator('[data-balance]').inner_text()=='3 tokens'
   page.screenshot(path=str(SHOTS/f'profile-{width}.png'))
   page.locator('[data-recharge]').click();dialog=page.locator('#sheet')
   assert dialog.is_visible() and dialog.locator('input[value="12"]').is_checked()
   for count,total in [(5,8),(30,33),(12,15)]:
    dialog.locator('.pack').filter(has=page.locator(f'input[value="{count}"]')).click()
    assert dialog.locator('[data-pack-total]').inner_text()==f'{total} tokens'
   dialog.get_by_role('button',name='Cancelar',exact=True).click()
   assert not dialog.is_visible() and balance()==3
   page.locator('[data-recharge]').click();page.screenshot(path=str(SHOTS/f'recharge-{width}.png'))
   dialog.locator('[data-confirm-topup]').dblclick()
   assert dialog.locator('[data-confirm-topup]').is_disabled()
   page.keyboard.press('Escape');assert dialog.is_visible()
   tick(750);assert not dialog.is_visible() and balance()==15
   assert len([e for e in data()['ledger'] if e['kind']=='topup'])==1
   assert '+12 tokens' in page.locator('#toast').inner_text()
   page.screenshot(path=str(SHOTS/f'recharged-{width}.png'))
   tick(5100);assert not page.locator('#toast').is_visible()
   page.reload();page.locator('[data-balance]').wait_for();assert balance()==15
   # One reservation, one final debit; duplicate clicks and accepted songs never charge twice.
   start_request();assert balance()==14 and data()['requests'][0]['status']=='pending'
   route('/profile');assert '1 token en reserva' in page.locator('#view').inner_text()
   tick(1100);assert balance()==14 and data()['requests'][0]['status']=='accepted'
   assert page.locator('.reserve-note').count()==0
   route('/song/original-prankster');page.locator('[data-request]').click()
   assert balance()==14 and len(data()['requests'])==1
   # A failed request refunds once and leaves a complete, balanced movement history.
   page.locator('.prototype-tools summary').click();page.locator('#fail-next').check();page.locator('.prototype-tools summary').click()
   start_request('instant-crush');assert balance()==13
   tick(1100);assert balance()==14 and data()['requests'][0]['status']=='failed'
   assert len([e for e in data()['ledger'] if e['kind']=='refund'])==1
   assert 'token devuelto' in page.locator('#view').inner_text()
   # No funds: top up while retaining the selected song, then explicitly confirm its request.
   reset(True);assert balance()==0
   route('/song/brillas');page.locator('[data-request]').click()
   assert dialog.locator('#sheet-title').inner_text()=='Te falta 1 token'
   assert data()['requests']==[]
   page.screenshot(path=str(SHOTS/f'insufficient-{width}.png'))
   dialog.locator('[data-refill-for-song]').click()
   dialog.locator('.pack').filter(has=page.locator('input[value="5"]')).click()
   dialog.locator('[data-confirm-topup]').click();tick(750)
   assert balance()==5 and dialog.locator('#sheet-title').inner_text()=='Confirmá tu pedido'
   assert 'Brillas' in dialog.inner_text() and data()['requests']==[]
   page.screenshot(path=str(SHOTS/f'resume-song-{width}.png'))
   dialog.locator('[data-confirm-request]').click();tick(1100)
   assert balance()==4 and data()['requests'][0]['songId']=='brillas'
   # Reloading during a reservation releases it exactly once instead of losing a token.
   reset();start_request();assert balance()==2
   page.reload();page.locator('h1').wait_for();assert balance()==3
   assert data()['requests'][0]['status']=='failed'
   page.reload();page.locator('h1').wait_for();assert balance()==3
   assert len([e for e in data()['ledger'] if e['kind']=='refund'])==1
   # A scenario reset also invalidates any callbacks from the previous run.
   start_request('instant-crush');reset();tick(1500)
   assert balance()==3 and data()['requests']==[]
   route('/profile');page.locator('[data-settings]').click()
   dialog.locator('input[name="name"]').fill('Nacho <demo>');dialog.get_by_role('button',name='Guardar nombre').click()
   assert 'Nacho <demo>' in page.locator('.identity').inner_text()
   assert page.locator('.identity demo').count()==0
   route('/movements');assert page.locator('h1').inner_text()=='Tus movimientos'
   route('/discover');page.locator('.venue-hero').click();page.locator('[data-song="billie-jean"]').click()
   expect(page.locator('h1')).to_have_text('Billie Jean')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.evaluate('Object.keys(sessionStorage)')==[STORE]
   assert not any('/api/' in url or not url.startswith(BASE.split('/prototypes')[0]) for url in requests),requests
   assert not errors,errors
   context.close();print('PASS prototype: packs, balance, no duplicate charge, reservations, refund, insufficient funds, reload, routes and no APIs:',width,flush=True)
  for width in [320,768]:
   page=browser.new_page(viewport=dict(width=width,height=844));page.goto(BASE);page.locator('[data-recharge]').click()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#sheet').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
   page.screenshot(path=str(SHOTS/f'compact-{width}.png'));page.close()
   print('PASS compact layout:',width,flush=True)
  browser.close()
finally:server.shutdown()
