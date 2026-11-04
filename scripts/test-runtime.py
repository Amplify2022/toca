from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 c=b.new_context();page=c.new_page();page.route('https://**/*',lambda r:r.abort())
 page.goto('http://localhost:5173/#/request/demo-1');page.locator('#song-search').wait_for();assert '/customer/login' not in page.url
 print('PASS self-contained demo request')
 page.goto('http://localhost:5173/#/explore');page.locator('.toca-venue').first.wait_for();assert page.locator('#leaflet-map').evaluate('(e)=>getComputedStyle(e).display')=='none'
 page.locator('.toca-venue').first.click();page.locator('.toca-detail-layout').wait_for();page.wait_for_timeout(200)
 assert page.evaluate('document.activeElement.tagName') in ['H1','H2']
 print('PASS fallback map, route heading focus')
 page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');c.set_offline(True);page.reload();page.locator('#app h1').wait_for();assert page.locator('#app').inner_text()
 print('PASS installed shell offline reload')
 b.close()
