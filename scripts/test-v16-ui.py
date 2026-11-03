#!/usr/bin/env python3
"""Browser smoke with mocked API, maps, and geocoder (not a real external-service test)."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'web'
VENUES=[
 {"id":"abc", "name":"Bar Rock", "address":"18 de Julio 1000", "city":"Montevideo", "description":"Lugar", "latitude":-34.9, "longitude":-56.19, "genre":"Rock", "active":True, "spotifyConnected":True},
 {"id":"def", "name":"Bar Jazz", "address":"Pocitos 44", "city":"Montevideo", "description":"Lugar", "latitude":-34.91, "longitude":-56.16, "genre":"Jazz", "active":True,"spotifyConnected":True},
 {"id":"ghi", "name":"Bar Pop", "address":"Centro 10", "city":"Montevideo", "description":"Lugar", "latitude":-34.901, "longitude":-56.17, "genre":"Pop", "active":False,"spotifyConnected":False},
]
INIT=r'''(() => {
const stores={};const storage = prefix => ({getItem(k){return stores[prefix+k]??null},setItem(k,v){stores[prefix+k]=String(v)},removeItem(k){delete stores[prefix+k]}});
Object.defineProperty(window,'localStorage',{value:storage('l:')});
Object.defineProperty(window,'sessionStorage',{value:storage('s:')});
localStorage.setItem('amplify-mode','live');
sessionStorage.setItem('amplify-token','test-token');
sessionStorage.setItem('amplify-user',JSON.stringify({name:'Admin',email:'admin@test.com'}));
window.__markers=[];
window.L={
 map(el){return { _el:el,_events:{}, setView(p,z){this.center=p;this.zoom=z;return this;},fitBounds(){},getZoom(){return this.zoom||13;},remove(){},invalidateSize(){},on(k,v){this._events[k]=v;return this;}}},
 marker(pos,opt){const marker={pos:pos,opts:opt,callbacks:{},addTo(map){this.map=map;window.__markers.push(this);return this;},on(k,fn){this.callbacks[k]=fn;return this;},setLatLng(p){this.pos=p;return this;},getLatLng(){return {lat:this.pos[0],lng:this.pos[1]}}};return marker;},
 tileLayer(){return {addTo(){return this}}},divIcon(){return {}},control:{zoom(){return {addTo(){}}}}
};
})();'''
FETCH=r'''(() => {
const VENUES=__VENUES__;
window.fetch=async function(resource,opts={}){
 const url=String(resource);let data=[];
 if(url.includes('/api/admin/geocode'))data={results:[{lat:-34.905,lon:-56.171,name:'18 de Julio 123, Montevideo, Uruguay'}]};
 else if(url.includes('/api/auth/me'))data={id:'u1',name:opts?.method==='PUT'?'Nacho Test':'Admin',email:'admin@test.com'};
 else if(url.includes('/api/admin/venues/abc/spotify/status'))data={connected:true,premium:true,playlistId:'test'};
 else if(url.includes('/api/admin/venues')&&url.endsWith('/venues'))data=[VENUES[0]];
 else if(url.includes('/api/venues/abc/requests'))data=[];
 else if(url.includes('/api/venues/abc'))data=VENUES[0];
 else if(url.includes('/api/venues'))data=VENUES;
 return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
};
})();'''.replace('__VENUES__',json.dumps(VENUES))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 errors=[];page.on('pageerror',lambda exc: errors.append(str(exc)))
 page.set_content('<!doctype html><html><head></head><body><div id="app"></div><div id="toast"></div></body></html>')
 page.add_style_tag(content=(ROOT/"styles.css").read_text())
 page.add_style_tag(content=(ROOT/"toca.css").read_text())
 page.evaluate(INIT)
 page.evaluate(FETCH)
 for name in ['app.js','toca-ui.js','live-music.js','venue-location.js']:
  page.add_script_tag(content=(ROOT/name).read_text())
 page.evaluate("location.hash='#/explore'")
 page.evaluate('render()')
 page.wait_for_selector('#venue-search',timeout=10000)
 page.locator('#venue-search').fill('Jazz');page.wait_for_timeout(120)
 assert page.locator('#toca-results-count').inner_text().startswith('1 '),page.locator('#toca-results-count').inner_text()
 assert page.locator('.toca-map-pin').count()==1, 'map fallback pins not filtered'
 assert page.locator('#venue-grid').inner_text().find('Bar Jazz')!=-1
 page.locator('#venue-search').fill('zzzzzz');page.wait_for_timeout(120)
 assert page.locator('.toca-map-pin').count()==0
 assert 'No encontramos' in page.locator('#venue-grid').inner_text()
 page.evaluate("location.hash='#/admin/profile'")
 page.evaluate('render()')
 page.wait_for_selector('.toca-location-widget',timeout=10000)
 assert page.locator('[name="latitude"]').get_attribute('type')=='hidden'
 assert page.get_by_text('Información pública').count()==0
 assert page.get_by_text('Acceso rápido').count()==0
 assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='true'
 page.locator('input[name="address"]').fill('Nueva dirección 123')
 assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='false'
 assert page.locator('input[name="latitude"]').input_value()==''
 # Search, choose result, confirm. Fetch and Leaflet are stubbed above.
 page.locator('#toca-location-query').fill('Nueva dirección 123')
 page.locator('[data-action="location-search"]').click()
 page.locator('[data-action="location-result"]').first.wait_for(timeout=10000)
 page.locator('[data-action="location-result"]').first.click()
 assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='false'
 page.locator('[data-action="location-confirm"]').click()
 assert page.locator('.toca-location-widget').get_attribute('data-confirmed')=='true'
 assert abs(float(page.locator('input[name="latitude"]').input_value())+34.905)<0.001
 assert abs(float(page.locator('input[name="longitude"]').input_value())+56.171)<0.001
 # Genre suggestions and free text
 page.locator('[data-genre="Cumbia"]').click()
 assert 'Cumbia' in page.locator('[name="genre"]').input_value()
 page.locator('[data-genre="Cumbia"]').click()
 assert 'Cumbia' not in page.locator('[name="genre"]').input_value()
 page.locator('[data-genre="Otros"]').click()
 page.locator('[name="genre"]').fill('Candombe, Jazz')
 assert page.locator('[data-genre="Jazz"]').get_attribute('aria-pressed')=='true'
 # Layout no longer has the narrow max width; one account form per authenticated user.
 assert page.locator('.toca-editor-heading h2').inner_text()=='Mi bar'
 widths=page.evaluate("""() => {
    const content=document.querySelector('.toca-admin-content').getBoundingClientRect();
    const card=document.querySelector('.toca-profile-editor>.card').getBoundingClientRect();
    const map=document.querySelector('#toca-location-map').getBoundingClientRect();
    return {content:content.width,card:card.width,map:map.width};
 }""")
 assert widths['card']>=widths['content']-85, widths
 assert widths['map']>=widths['card']-110, widths
 page.screenshot(path='/mnt/data/toca-v16-preview.png',full_page=True)
 page.evaluate("location.hash='#/admin/account'")
 page.evaluate('render()')
 page.locator('#account-update').wait_for(timeout=5000)
 page.locator('#account-name').fill('Nacho Test')
 page.locator('#account-update button').click()
 page.wait_for_timeout(100)
 assert page.locator('#account-name').input_value()=='Nacho Test'
 assert page.evaluate('state.user.name')=='Nacho Test'
 assert not errors, errors
 browser.close()
print('PASS v1.6 browser: filters, authenticated geocode, pin, genres, account update')
