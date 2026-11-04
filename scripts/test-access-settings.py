"""Mi Bar access controls with the real frontend and a simulated API."""
from playwright.sync_api import sync_playwright
import json
ID='77777777-7777-4777-8777-777777777777'
venue=dict(id=ID,name='Policy Bar',address='Center',city='Montevideo',latitude=-34.9,longitude=-56.17,genre='Rock',active=False,spotifyConnected=False,photos=[],coverPhotoUrl=None,requestAccessMode='NEARBY')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page();mode=['NEARBY'];saves=[]
 page.add_init_script("localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','synthetic-admin-session');sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner',name:'Owner',email:'owner@example.test'}));")
 def api(route):
  path=route.request.url.split('8080',1)[1].split('?',1)[0];data=[]
  if path=='/api/auth/me':data=dict(id='owner',name='Owner',email='owner@example.test')
  elif path=='/api/admin/venues':data=[venue]
  elif path==f'/api/venues/{ID}':data=venue
  elif path.endswith('/request-access'):
   if route.request.method=='PUT':mode[0]=route.request.post_data_json['mode'];saves.append(mode[0])
   data=dict(mode=mode[0],radiusMeters=100,requiresQr=False)
  elif path.endswith('/spotify/status'):data=dict(connected=False,premium=False)
  route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
 page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda route:route.abort())
 page.goto('http://localhost:5173/#/admin/profile')
 group=page.locator('.toca-access-settings');group.wait_for()
 assert 'QR vigente' not in group.inner_text()
 group.locator('input[value="ANYWHERE"]').check();group.locator('[data-toca-access-save]').click()
 page.wait_for_function("document.querySelector('[data-toca-access-status]')?.textContent.includes('guardada')")
 group.locator('input[value="NEARBY"]').check();group.locator('[data-toca-access-save]').click()
 page.wait_for_timeout(200)
 assert saves==['ANYWHERE','NEARBY'],saves
 print('PASS Mi Bar switches ANYWHERE/NEARBY without requiring QR')
 browser.close()
