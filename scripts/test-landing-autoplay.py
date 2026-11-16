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
   assert not page.locator('.landing-stage-progress,[role=progressbar],[data-stage-playback]').count()
   assert not page.locator('[data-landing-stage] svg').count(),'Step arrows must be removed'
   return context,page,errors
  def active(page,index):return page.locator(f'[data-landing-stage="{index}"]')
  def expect_step(page,index):
   expect(active(page,index)).to_have_attribute('aria-selected','true',timeout=6500)
   expect(page.locator(f'#landing-screen-{index}')).to_be_visible()
   expect(page.locator('[data-stage-count]')).to_have_text(f'Paso {index+1} de 4')
  if mode=='desktop':
   context,page,errors=setup(viewport=dict(width=1440,height=900))
   page.wait_for_timeout(5300);expect_step(page,0)
   active(page,0).click()
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
   page.wait_for_timeout(800);phone_box=page.locator('.landing-screen-phone').bounding_box()
   active(page,3).click();page.wait_for_timeout(150)
   alphas=page.evaluate(r"""()=>[0,3].map(index=>{const color=getComputedStyle(document.querySelector(`[data-landing-stage="${index}"]`)).borderTopColor;const parts=color.match(/rgba?\(([^)]+)\)/)[1].split(',');return parts.length===4?Number(parts[3]):1})""")
   assert all(0<alpha<1 for alpha in alphas),('Both outgoing and incoming borders must fade',alphas)
   layers=page.evaluate("""()=>[0,3].map(index=>{const panel=document.querySelector('#landing-screen-'+index),style=getComputedStyle(panel),box=panel.getBoundingClientRect();return {opacity:Number(style.opacity),x:box.x,y:box.y,width:box.width,height:box.height,hidden:panel.getAttribute('aria-hidden'),inert:panel.inert}})""")
   assert all(0<layer['opacity']<1 for layer in layers),('Both photos must crossfade',layers)
   assert all(abs(layer['opacity']-alpha)<.08 for layer,alpha in zip(layers,alphas)),('Photos and borders must fade together',layers,alphas)
   assert all(abs(layers[0][key]-layers[1][key])<1 for key in ['x','y','width','height']),'Photos must overlap within the same frame'
   assert layers[0]['hidden']=='true' and layers[0]['inert'] and layers[1]['hidden']=='false' and not layers[1]['inert']
   page.wait_for_timeout(700)
   assert active(page,0).evaluate("node=>getComputedStyle(node).borderTopColor")=='rgba(0, 0, 0, 0)'
   assert page.locator('#landing-screen-0').evaluate("node=>getComputedStyle(node).visibility")=='hidden'
   assert abs(page.locator('.landing-screen-phone').bounding_box()['height']-phone_box['height'])<1
   page.wait_for_timeout(3500);expect_step(page,3);expect_step(page,0)
   print('PASS synchronized photo/border crossfade, stable frame, accessible panel selection and five-second advance',flush=True)
   for index in [1,2,0]:active(page,index).click();page.wait_for_timeout(80)
   page.wait_for_timeout(800)
   assert page.locator('.landing-screen-panel').evaluate_all("nodes=>nodes.every((node,index)=>Number(getComputedStyle(node).opacity)===(index===0?1:0)&&node.inert===(index!==0)&&node.getAttribute('aria-hidden')===String(index!==0))"),'Rapid selections must settle on the last chosen photo'
   print('PASS rapid manual selections do not leave overlapping or stale photos',flush=True)
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
   page.wait_for_timeout(800);active(page,3).tap();page.wait_for_timeout(150)
   opacities=page.evaluate("[1,3].map(index=>Number(getComputedStyle(document.querySelector('#landing-screen-'+index)).opacity))")
   assert all(0<opacity<1 for opacity in opacities),('Mobile photos must crossfade',opacities)
   page.wait_for_timeout(4250);expect_step(page,3);expect_step(page,0)
   active(page,2).tap();expect_step(page,3)
   assert not errors,errors;context.close()
   print('PASS mobile auto advance and manual touch selection without a pause control',flush=True)
   context,page,errors=setup(viewport=dict(width=1440,height=900),reduced_motion='reduce')
   page.locator('.landing-screen-area').scroll_into_view_if_needed()
   page.wait_for_timeout(5300);expect_step(page,0)
   active(page,2).click();expect_step(page,2)
   assert active(page,2).evaluate("node=>getComputedStyle(node).transitionDuration")=='0s'
   assert page.locator('#landing-screen-2').evaluate("node=>getComputedStyle(node).transitionDuration==='0s'&&getComputedStyle(node).opacity==='1'")
   page.wait_for_timeout(5300);expect_step(page,2)
   page.emulate_media(reduced_motion='no-preference');expect_step(page,3)
   assert not errors,errors;context.close()
   print('PASS reduced motion disables fade/autoplay, keeps manual steps and resumes when the preference changes',flush=True)
  browser.close()
finally:server.shutdown()
