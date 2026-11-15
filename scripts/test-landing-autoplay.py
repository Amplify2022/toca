"""Real five-second walkthrough timing, visibility, interaction and reduced motion."""
import argparse
import functools
import threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser()
parser.add_argument('--mode',choices=['desktop','mobile'],required=True)
mode=parser.parse_args().mode
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'web')))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}'

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  def setup(**options):
   context=browser.new_context(service_workers='block',**options)
   page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.add_init_script("localStorage.setItem('amplify-mode','live')")
   page.route('https://**/*',lambda route:route.abort())
   page.route('http://localhost:8080/**',lambda route:route.fulfill(content_type='application/json',body='[]',headers={'Access-Control-Allow-Origin':'*'}))
   page.goto(BASE+'/#/');expect(page.locator('[data-stage-count]')).to_have_text('Paso 1 de 4')
   return context,page,errors
  def active(page,index):return page.locator(f'[data-landing-stage="{index}"]')
  def expect_step(page,index):
   expect(active(page,index)).to_have_attribute('aria-selected','true',timeout=6500)
   expect(page.locator(f'#landing-screen-{index}')).to_be_visible()
   expect(page.locator('[data-stage-count]')).to_have_text(f'Paso {index+1} de 4')
  def running(page):
   page.wait_for_function("Number(document.querySelector('.landing-how-grid').style.getPropertyValue('--stage-progress'))>.01")
  if mode=='desktop':
   context,page,errors=setup(viewport=dict(width=1440,height=900))
   page.wait_for_timeout(5300);expect_step(page,0)
   area=page.locator('.landing-screen-area');area.scroll_into_view_if_needed();page.mouse.move(0,0);running(page)
   page.wait_for_timeout(4500);expect_step(page,0)
   for index in [1,2,3,0]:expect_step(page,index)
   print('PASS real 5-second progression: offscreen pause, no early advance, all four screens and loop',flush=True)
   area.hover();index=int(page.locator('[data-landing-stage][aria-selected=true]').get_attribute('data-landing-stage'))
   page.wait_for_timeout(5300);expect_step(page,index)
   toggle=page.locator('[data-stage-playback]');toggle.click();expect(toggle).to_have_text('Reanudar')
   page.mouse.move(0,0);page.wait_for_timeout(5300);expect_step(page,index)
   toggle.click();area.scroll_into_view_if_needed();page.mouse.move(0,0);expect_step(page,(index+1)%4)
   active(page,3).click();expect(toggle).to_have_text('Reanudar');page.mouse.move(0,0)
   page.wait_for_timeout(5300);expect_step(page,3)
   print('PASS hover pause, explicit pause/resume and manual selection stays selected',flush=True)
   toggle.click();area.scroll_into_view_if_needed();page.mouse.move(0,0);running(page)
   # Dispatch the browser visibility event with a hidden-tab state, keeping real timers.
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
   page.wait_for_timeout(5300);expect_step(page,3)
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
   expect_step(page,0)
   old=page.locator('.landing-how-grid').element_handle()
   page.goto(BASE+'/#/download');expect(page.locator('.landing-download-page')).to_be_visible()
   frozen=old.evaluate("node=>node.style.getPropertyValue('--stage-progress')")
   page.wait_for_timeout(500)
   assert old.evaluate("node=>node.style.getPropertyValue('--stage-progress')")==frozen
   page.goto(BASE+'/#/');expect_step(page,0);assert not errors,errors
   context.close();print('PASS hidden-tab pause/resume, navigation cleanup and a fresh walkthrough on return',flush=True)
  else:
   context,page,errors=setup(viewport=dict(width=390,height=900),is_mobile=True,has_touch=True)
   page.locator('.landing-screen-area').scroll_into_view_if_needed();running(page);expect_step(page,1)
   active(page,3).tap();expect(page.locator('[data-stage-playback]')).to_have_text('Reanudar')
   page.locator('[data-stage-playback]').tap();expect_step(page,0)
   assert not errors,errors;context.close()
   print('PASS mobile auto advance, manual touch selection, resume and wrap without sticky hover',flush=True)
   context,page,errors=setup(viewport=dict(width=1440,height=900),reduced_motion='reduce')
   page.locator('.landing-screen-area').scroll_into_view_if_needed();page.mouse.move(0,0)
   expect(page.locator('[data-stage-playback]')).to_have_text('Reanudar')
   page.wait_for_timeout(5300);expect_step(page,0)
   page.locator('[data-stage-playback]').click();page.locator('.landing-screen-area').scroll_into_view_if_needed();page.mouse.move(0,0);expect_step(page,1)
   assert not errors,errors;context.close()
   print('PASS reduced motion starts paused and only advances after explicit play',flush=True)
  browser.close()
finally:server.shutdown()
