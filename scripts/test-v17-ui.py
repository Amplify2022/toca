#!/usr/bin/env python3
"""Browser smoke with mocked API; no external Spotify, map, or database."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'web'
VENUE={'id':'a7777777-7777-4777-8777-777777777777','name':'Bar Rock','address':'18 de Julio 1000','city':'Montevideo','description':'Local','genre':'Rock','latitude':-34.9,'longitude':-56.19,'active':True,'spotifyConnected':True,'photos':[], 'coverPhotoUrl':None}
INIT="""(() => {const stores={};const storage = prefix => ({getItem(k){return stores[prefix+k]??null},setItem(k,v){stores[prefix+k]=String(v)},removeItem(k){delete stores[prefix+k]}});
Object.defineProperty(window,'localStorage',{value:storage('l:')});Object.defineProperty(window,'sessionStorage',{value:storage('s:')});
localStorage.setItem('amplify-mode','live');sessionStorage.setItem('amplify-token','test-token');sessionStorage.setItem('amplify-user',JSON.stringify({name:'Admin',email:'admin@test.com'}));
window.L={map(){return {setView(){return this},fitBounds(){},getZoom(){return 13},remove(){},invalidateSize(){},on(){return this}}},marker(){return {addTo(){return this},on(){return this}}},tileLayer(){return {addTo(){return this}}},divIcon(){return {}},control:{zoom(){return {addTo(){}}}}};
})();"""
FETCH="""(() => {
const V=__VENUE__;let gallery=[];window.__postedRules=[];window.__uploadedPhotos=[];
window.fetch=async (res,opts={})=>{const url=String(res);const method=opts.method||'GET';let data=[];let status=200;
 if(url.includes('/api/admin/venues/')&&url.includes('/tracks?q='))data=[{id:'3tddzXTgneWrkV2cYNUBZe',title:'Deja De Llorar',artist:'El Polaco'}];
 else if(url.includes('/api/admin/venues/')&&url.includes('/blocked')&&method==='POST'){window.__postedRules.push(JSON.parse(opts.body));data={trackId:'3tddzXTgneWrkV2cYNUBZe'}}
 else if(url.includes('/api/admin/venues/')&&url.includes('/allowed')&&method==='POST'){window.__postedRules.push(JSON.parse(opts.body));data={trackId:'3tddzXTgneWrkV2cYNUBZe'}}
 else if(url.includes('/api/admin/venues/')&&url.includes('/photos')&&method==='POST'){
  window.__uploadedPhotos.push(JSON.parse(opts.body));const id='99999999-9999-4999-8999-999999999999';gallery=[{id,isPrimary:true,url:'/api/venues/'+V.id+'/photos/'+id}];V.photos=gallery;V.coverPhotoUrl=gallery[0].url;data={photos:gallery,coverPhotoUrl:V.coverPhotoUrl};}
 else if(url.includes('/api/admin/venues/')&&url.includes('/blocked'))data=[];
 else if(url.includes('/api/admin/venues/')&&url.includes('/allowed'))data=[];
 else if(url.includes('/api/admin/venues/')&&url.includes('/spotify/status'))data={connected:true,premium:true,playlistId:'pl'};
 else if(url.includes('/api/admin/venues')&&url.endsWith('/venues'))data=[V];
 else if(url.includes('/api/auth/me'))data={id:'u1',name:'Admin',email:'admin@test.com'};
 else if(url.includes('/api/venues/')&&url.includes('/requests'))data=[];
 else if(url.includes('/api/venues/')&&url.includes('/playlist'))data=[];
 else if(url.includes('/api/venues/')&&url.includes('/music-status'))data={active:true,isPlaying:false,playlist:[]};
 else if(url.includes('/api/venues/'))data=V;
 else if(url.includes('/api/venues'))data=[V];
 return {ok:status===200,status,json:async()=>data,text:async()=>JSON.stringify(data)};
};})();""".replace('__VENUE__',json.dumps(VENUE))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page();errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.set_content('<!doctype html><html><head></head><body><div id="app"></div><div id="toast"></div></body></html>')
 for f in ['styles.css','toca.css']:page.add_style_tag(content=(ROOT/f).read_text())
 page.evaluate(INIT);page.evaluate(FETCH)
 for f in ['app.js','toca-ui.js','live-music.js','venue-location.js','toca-v17.js']:
  page.add_script_tag(content=(ROOT/f).read_text())
 page.evaluate("location.hash='#/admin/music'");page.evaluate('render()')
 page.wait_for_selector('#rule-search-BLOCK')
 assert page.locator('input[placeholder*="ID de canción"]').count()==0
 assert page.get_by_text('Para operar con Spotify real necesitás').count()==0
 page.locator('#rule-search-BLOCK').fill('Polaco')
 page.locator('[data-action="rule-select"][data-mode="BLOCK"]').wait_for(timeout=5000)
 assert page.get_by_text('Deja De Llorar').count()>0
 page.locator('[data-action="rule-select"][data-mode="BLOCK"]').click()
 page.wait_for_function('window.__postedRules.length===1',timeout=5000)
 assert page.evaluate('window.__postedRules[0].trackId')=='3tddzXTgneWrkV2cYNUBZe'
 page.evaluate("location.hash='#/admin/profile'");page.evaluate('render()')
 page.wait_for_selector('#toca-photo-input')
 assert page.locator('.toca-photos-panel').count()==1
 assert page.get_by_text('Mapa © OpenStreetMap contributors').count()==0
 assert page.locator('.toca-location-coords').inner_text().find('-34')==-1
 page.locator('#toca-photo-input').set_input_files('/mnt/data/toca-v17-work/test-photo.jpg')
 page.wait_for_function('window.__uploadedPhotos.length===1', timeout=15000)
 assert page.evaluate('window.__uploadedPhotos[0].contentType')=='image/jpeg'
 assert len(page.evaluate('window.__uploadedPhotos[0].dataBase64'))>50
 page.wait_for_selector('.toca-photo-item',timeout=10000)
 assert page.get_by_text('Foto de portada').count()>0
 page.evaluate("location.hash='#/explore'");page.evaluate('render()')
 page.wait_for_selector('.toca-venue-photo img')
 assert '/api/venues/' in page.locator('.toca-venue-photo img').first.get_attribute('src')
 assert not errors,errors
 browser.close()
print('PASS TOCÁ v1.7: Spotify rule lookup and selection, obsolete notice removed, gallery and coordinates hidden')
