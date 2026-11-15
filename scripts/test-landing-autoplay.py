"""Real five-second rotation, including hover/focus and manual selections."""
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
   assert not page.locator('.landing-stage-progress,[role=progressbar]').count()
   return context,page,errors
  def active(page,index):return page.locator(f'[data-landing-stage="{index}"]')
  def expect_step(page,index):
   expect(active(page,index)).to_have_attribute('aria-selected','true',timeout=6500)
   expect(page.locator(f'#landing-screen-{index}')).to_be_visible()
   expect(page.locator('[data-stage-count]')).to_have_text(f'Paso {index+1} de 4')
  if mode=='desktop':
   context,page,errors=setup(viewport=dict(width=1440,height=900))
   page.wait_for_timeout(5300);expect_step(page,0)
   active(page,0).click();expect(page.locator('[data-stage-playback]')).to_have_text('Pausar')
   # Keep both the pointer and keyboard focus on a step throughout the full cycle.
   page.evaluate("""()=>{
    const grid=document.querySelector('.landing-how-grid');
    window.__stageChanges=[{index:0,time:performance.now()}];
    new MutationObserver(()=>{
     const index=Number(grid.querySelector('[aria-selected=true]').dataset.landingStage);
     if(window.__stageChanges.at(-1).index!==index)window.__stageChanges.push({index,time:performance.now()});
    }).observe(grid,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
   }""")
   page.wait_for_timeout(4400);expect_step(page,0)
   for index in [1,2,3,0]:expect_step(page,index)
   changes=page.evaluate('window.__stageChanges');assert [row['index'] for row in changes]==[0,1,2,3,0]
   intervals=[changes[i]['time']-changes[i-1]['time'] for i in range(1,len(changes))]
   assert all(4800<=interval<=6200 for interval in intervals),intervals
   assert page.locator('[data-landing-stage="0"]').evaluate("node=>node.matches(':hover')&&document.activeElement===node")
   print('PASS no progress bars; hovered and focused steps advance every five seconds through the full cycle:',[round(interval) for interval in intervals],flush=True)
   toggle=page.locator('[data-stage-playback]');toggle.click();expect(toggle).to_have_text('Reanudar')
   page.wait_for_timeout(5300);expect_step(page,0)
   toggle.click();expect_step(page,1)
   active(page,3).click();expect(toggle).to_have_text('Pausar')
   page.wait_for_timeout(4400);expect_step(page,3);expect_step(page,0)
   print('PASS explicit pause/resume; manual selection gets a fresh five seconds and continues while focused',flush=True)
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
   page.wait_for_timeout(5300);expect_step(page,0)
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
   page.wait_for_timeout(4400);expect_step(page,0);expect_step(page,1)
   page.locator('#contacto').scroll_into_view_if_needed();page.wait_for_timeout(5300);expect_step(page,1)
   old=page.locator('[data-stage-count]').element_handle()
   page.goto(BASE+'/#/download');expect(page.locator('.landing-download-page')).to_be_visible()
   frozen=old.text_content();page.wait_for_timeout(5300);assert old.text_content()==frozen
   page.goto(BASE+'/#/');expect_step(page,0);assert not errors,errors
   context.close();print('PASS hidden/offscreen pause, full interval on return, navigation cleanup and fresh start',flush=True)
  else:
   context,page,errors=setup(viewport=dict(width=390,height=900),is_mobile=True,has_touch=True)
   page.locator('.landing-screen-area').scroll_into_view_if_needed();expect_step(page,1)
   active(page,3).tap();expect(page.locator('[data-stage-playback]')).to_have_text('Pausar')
   page.wait_for_timeout(4400);expect_step(page,3);expect_step(page,0)
   page.locator('[data-stage-playback]').tap();expect(page.locator('[data-stage-playback]')).to_have_text('Reanudar')
   page.wait_for_timeout(5300);expect_step(page,0)
   page.locator('[data-stage-playback]').tap();expect_step(page,1)
   assert not errors,errors;context.close()
   print('PASS mobile auto advance, touch selection without implicit pause and explicit controls',flush=True)
   context,page,errors=setup(viewport=dict(width=1440,height=900),reduced_motion='reduce')
   page.locator('.landing-screen-area').scroll_into_view_if_needed()
   expect(page.locator('[data-stage-playback]')).to_have_text('Reanudar')
   page.wait_for_timeout(5300);expect_step(page,0)
   page.locator('[data-stage-playback]').click();expect_step(page,1)
   assert not errors,errors;context.close()
   print('PASS reduced motion starts paused and advances after explicit play, even with the pointer over the control',flush=True)
  browser.close()
finally:server.shutdown()
