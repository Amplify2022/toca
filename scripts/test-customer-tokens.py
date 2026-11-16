"""Customer token flow in the full app. Static web + deterministic API fixtures."""
import json,os,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('TOCA_WEB_URL','http://localhost:5174')
VENUE_ID='77777777-7777-4777-8777-777777777777'
TRACK_ID='A'*22
VENUE=dict(id=VENUE_ID,name='Bluzz Bar',city='Montevideo',address='Centro',genre='Rock',description='Bar de prueba',active=True,spotifyConnected=True,requestAccessMode='ANYWHERE',latitude=-34.9,longitude=-56.2,photos=[],coverPhotoUrl=None,openingHours=None)
TRACK=dict(id=TRACK_ID,title='Original Prankster',artist='The Offspring',durationMs=221000)
PACKS=[dict(id=str(n),tokens=n,price=price) for n,price in [(5,99),(12,199),(30,399)]]
SHOTS=Path('/tmp/toca-customer-token-shots');SHOTS.mkdir(exist_ok=True)

def scenario(browser,width):
    context=browser.new_context(viewport=dict(width=width,height=900),service_workers='block')
    context.add_init_script("""

      sessionStorage.setItem('toca:customer:session','synthetic-customer-session-abcdefghijklmnopqrstuvwxyz');
      sessionStorage.setItem('toca:tokens-prototype:v1',JSON.stringify({balance:99999}));
      sessionStorage.setItem('toca:request:customer-test:77777777-7777-4777-8777-777777777777:AAAAAAAAAAAAAAAAAAAAAA',JSON.stringify({commandId:'legacy-free-command'}));
      window.__gpsCalls=0;
      window.__gpsModes=[];
      navigator.geolocation.getCurrentPosition=(success,failure,options)=>{
        window.__gpsCalls++;
        window.__gpsModes.push(options.enableHighAccuracy);
        if(window.__gpsDenied)return failure({code:1});
        const error=window.__gpsFailures?.shift();
        if(error)return failure({code:error});
        success({coords:{latitude:-34.9,longitude:-56.2,accuracy:10}});
      };
    """)
    page=context.new_page();errors=[];dialogs=[];orders=[];topup_calls=[];credited={};movements=[]
    model=dict(balance=0,processing=False,order='success',topup='success',checks=0)
    accepted_requests={};held_topups=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:(dialogs.append(dialog.message),dialog.dismiss()))
    def wallet():return dict(balance=model['balance'],requestCost=1,simulationEnabled=True,currency='UYU',packs=PACKS,**({'movements':movements} if movements else {}))
    def api(route):
        request=route.request;path=request.url.split('8080',1)[1].split('?',1)[0];data=[];status=200
        if path=='/api/customers/me':data=dict(id=model.get('customerId','customer-test'),name='Nacho',email='nacho@example.test',roles=['CUSTOMER'])
        elif path=='/api/customers/me/avatar':data=dict(avatar=None)
        elif path=='/api/customers/me/wallet':
            if model.get('walletError'):
                model['walletError']=False;status=500;data=dict(message='No tenés tokens suficientes. Recargá para pedir esta canción.')
            else:data=wallet()
        elif path=='/api/customers/me/wallet/topups':
            assert request.method=='POST' and request.headers.get('authorization','').startswith('Bearer synthetic-')
            body=request.post_data_json;assert list(body)==['packId']
            idem=request.headers.get('idempotency-key');assert idem;topup_calls.append(idem)
            amount=int(body['packId']);assert amount in (5,12,30)
            if idem not in credited:
                credited[idem]=amount;model['balance']+=amount
                movements.insert(0,dict(kind='TOPUP',amount=amount,createdAt='2026-11-14T18:00:00Z'))
                if model['topup']=='lost':model['topup']='success';route.abort('failed');return
            data=dict(wallet(),topupId=idem,creditedTokens=amount,simulated=True)
            if model.pop('holdTopup',False):held_topups.append((route,data));return
        elif path.endswith('/google/config'):data=dict(enabled=False,clientId='')
        elif path.endswith('/presence'):
            if request.method=='POST':
                assert request.post_data_json==dict(latitude=-34.9,longitude=-56.2,accuracy=10)
                model['locationAllowed']=True;model['checkins']=model.get('checkins',0)+1
            data=dict(allowed=not model.get('nearby') or model.get('locationAllowed',False),mode='NEARBY' if model.get('nearby') else 'ANYWHERE',requiresQr=False)
        elif path==f'/api/venues/{VENUE_ID}':data=dict(VENUE,requestAccessMode='NEARBY') if model.get('nearby') else VENUE
        elif path=='/api/venues':data=[VENUE]
        elif path.endswith('/tracks'):data=[TRACK]
        elif path.endswith('/music-status'):data=dict(active=True,isPlaying=False,now=None,playlist=[TRACK],samePlaylist=True)
        elif path.endswith('/requests') and request.method=='POST':
            assert request.headers.get('x-toca-customer','').startswith('Bearer synthetic-')
            assert request.headers.get('idempotency-key');orders.append(request.headers['idempotency-key'])
            idem=request.headers['idempotency-key']
            if idem in accepted_requests:
                data=accepted_requests[idem]
            elif model['order']=='lost-song':
                assert model['balance']>=1;model['balance']-=1
                accepted_requests[idem]=dict(commandId='command-test',status='DISPATCHED');route.abort('failed');return
            elif model['order'] in ('race','race-code','race-legacy','failed-no-funds'):
                model['balance']=0
                status={'race':402,'race-code':409,'race-legacy':500,'failed-no-funds':200}[model['order']]
                data=dict(message='No tenés tokens suficientes. Recargá para pedir esta canción.')
                if model['order']=='race-code':data=dict(code='INSUFFICIENT_TOKENS',message='Recargá tu saldo.')
                if model['order']=='failed-no-funds':data.update(commandId='rejected-command',status='FAILED')
            elif model['order']=='failed':data=dict(commandId='command-test',status='FAILED',message='No pudimos agregar la canción. No se descontaron tokens.')
            else:
                assert model['balance']>=1;model['checks']=0
                state='UNCERTAIN' if model['order'] in ('uncertain','reload') else 'DISPATCHED'
                model['processing']=state=='UNCERTAIN'
                if state=='DISPATCHED':model['balance']-=1
                data=dict(commandId='command-test',status=state)
        elif path.endswith('/request-commands/command-test'):
            model['checks']+=1
            done=model['order']!='reload' and (model['order']!='uncertain' or model['checks']>=3)
            if done and model['processing']:model['balance']-=1
            model['processing']=not done;data=dict(commandId='command-test',status='DISPATCHED' if done else 'UNCERTAIN')
        elif path.endswith('/request-commands/old-command'):
            data=dict(commandId='old-command',status='FAILED',code='REQUEST_RETRY_AFTER_UPDATE',message='El pedido anterior no se confirmó.')
        route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
    page.route('http://localhost:8080/**',api);page.route('https://**/*',lambda route:route.abort())
    def search():
        if page.url.endswith('/#/venue/'+VENUE_ID):page.locator('.toca-detail-layout').wait_for()
        page.wait_for_load_state('networkidle')
        page.goto(BASE+'/#/request/'+VENUE_ID);page.wait_for_load_state('networkidle')
        page.locator('.toca-request-page #song-search').fill('')
        page.locator('.toca-request-page #song-search').fill('Original')
        button=page.locator(f'[data-action="request"][data-track="{TRACK_ID}"]');button.wait_for();return button
    button=search();button.click()
    sheet=page.locator('#toca-token-recharge');expect(sheet).to_be_visible()
    assert '/profile/tokens' in page.url and not orders
    expect(page.locator('[data-wallet-balance]')).to_have_text('0 tokens')
    assert 'Necesitás 1 token' in sheet.inner_text()
    assert 'Estamos confirmando tu pedido con Spotify' not in page.locator('body').inner_text()
    page.screenshot(path=str(SHOTS/f'empty-{width}.png'))
    # All funding failures open the same recharge route, never a generic toast.
    for mode in ('preflight','race-code','race-legacy','failed-no-funds'):
        sheet.get_by_role('button',name='Cancelar',exact=True).click()
        model['balance']=0 if mode=='preflight' else 1;model['order']=mode
        if mode=='preflight':model['walletError']=True
        button=search();button.click();expect(sheet).to_be_visible()
        expect(page.locator('[data-wallet-balance]')).to_have_text('0 tokens')
        assert 'Error: No tenés' not in page.locator('#toast').inner_text()
        assert page.evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('toca:request:credits-v1:')).length")==0
    orders.clear();model['order']='success'
    sheet.locator('.tw-packs label').filter(has=page.locator('input[value="5"]')).click()
    expect(sheet.locator('[data-topup-total]')).to_have_text('5 tokens')
    sheet.locator('[data-wallet-topup]').dblclick();expect(sheet).not_to_be_visible()
    confirmation=page.locator('#toca-song-added');expect(confirmation).to_be_visible()
    expect(confirmation.locator('h2')).to_have_text('¡Tema agregado!')
    assert model['balance']==4 and len(topup_calls)==1 and len(credited)==1 and len(orders)==1
    assert page.locator('[data-wallet-request]:visible').count()==0
    page.wait_for_timeout(300)
    box=confirmation.bounding_box();assert abs(box['x']+box['width']/2-width/2)<2 and abs(box['y']+box['height']/2-450)<2,box
    page.screenshot(path=str(SHOTS/f'added-after-topup-{width}.png'))
    expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    expect(confirmation).not_to_be_visible()
    assert not dialogs
    page.goto(BASE+'/#/profile');expect(page.locator('[data-wallet-balance]')).to_have_text('4 tokens')
    page.reload();expect(page.locator('[data-wallet-balance]')).to_have_text('4 tokens')
    page.screenshot(path=str(SHOTS/f'profile-{width}.png'))
    # A server-side last-token race also routes to recharge and releases the key.
    model['order']='race';button=search();button.click();expect(sheet).to_be_visible()
    assert len(orders)==2 and model['balance']==0
    assert page.evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('toca:request:credits-v1:')).length")==0
    # Lost recharge response: retry the same idempotency key, never credit twice.
    model['topup']='lost';sheet.locator('[data-wallet-topup]').click()
    expect(sheet.locator('[data-topup-error]')).to_be_visible();assert model['balance']==12
    expect(sheet.locator('input[value="5"]')).to_be_disabled()
    model['order']='failed'
    sheet.locator('[data-wallet-topup]').click();expect(sheet).not_to_be_visible()
    expect(page.locator('[data-wallet-request]')).to_be_visible()
    expect(page.locator('[data-wallet-balance]')).to_have_text('12 tokens')
    assert topup_calls[-1]==topup_calls[-2] and model['balance']==12
    expect(page.locator('#toast')).to_contain_text('No se descontaron tokens')
    expect(page.locator('[data-wallet-balance]')).to_have_text('12 tokens')
    # The final available token can remain reserved until the same order settles.
    model['balance']=1;model['order']='uncertain';page.locator('[data-wallet-request]').click()
    expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'),timeout=12000)
    assert model['balance']==0 and not model['processing']
    # A reload must retain the pending command even when available balance is zero.
    model['balance']=1;model['order']='reload';button=search();button.click()
    assert model['balance']==1,'Pending request must not change the balance'
    assert 'en reserva' not in page.locator('body').inner_text()
    page.wait_for_function("Object.keys(sessionStorage).some(k=>k.startsWith('toca:request:credits-v1:')&&JSON.parse(sessionStorage.getItem(k)).commandId)")
    order_count=len(orders);page.reload();model['order']='success';page.wait_for_load_state('networkidle')
    page.locator('#song-search').fill('Original');button=page.locator(f'[data-action="request"][data-track="{TRACK_ID}"]');button.click()
    expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert len(orders)==order_count and model['balance']==0
    # A migrated interrupted command is prepared afresh on this explicit click.
    model['balance']=1;model['order']='upgrade';order_count=len(orders)
    page.evaluate("""([venue,track])=>sessionStorage.setItem(`toca:request:credits-v1:customer-test:${venue}:${track}`,JSON.stringify({commandId:'old-command',idempotencyKey:'legacy-update-key'}))""",[VENUE_ID,TRACK_ID])
    button=search();button.click();expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert len(orders)==order_count+1 and model['balance']==0
    # One current check-in authorizes consecutive nearby requests, even if a
    # subsequent GPS attempt would fail. Expiry still requires a new reading.
    model.update(balance=3,order='success',nearby=True,locationAllowed=False)
    gps_before=page.evaluate('window.__gpsCalls')
    order_count=len(orders)
    button=search();button.click();expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert model['balance']==2 and model['checkins']==1
    assert page.evaluate('window.__gpsCalls')==gps_before+1
    page.evaluate('window.__gpsDenied=true')
    button=search();button.click();expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert model['balance']==1 and len(orders)==order_count+2
    assert model['checkins']==1 and page.evaluate('window.__gpsCalls')==gps_before+1
    model['locationAllowed']=False
    button=search();button.click()
    expect(page.locator('#toast')).to_contain_text('permitir')
    assert model['balance']==1 and len(orders)==order_count+2
    assert page.evaluate('window.__gpsCalls')==gps_before+2
    page.evaluate('window.__gpsDenied=false;window.__gpsFailures=[2,3]')
    button.click();expect(page.locator('#toast')).to_contain_text('No pudimos obtener')
    assert model['balance']==1 and len(orders)==order_count+2 and model['checkins']==1
    # Recover from another temporary failure on this same page; submit once,
    # charge once and return to the playlist, without requiring a reload.
    page.evaluate('window.__gpsFailures=[2]')
    button.click();expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert model['balance']==0 and len(orders)==order_count+3 and model['checkins']==2
    assert page.evaluate('window.__gpsModes.slice(-2)')==[True,False]
    # A confirmed top-up resumes automatically after refreshing during a pending song.
    model.update(balance=0,order='reload',nearby=False,processing=False);button=search();button.click();expect(sheet).to_be_visible()
    sheet.locator('.tw-packs label').filter(has=page.locator('input[value="5"]')).click()
    count_before=len(orders);sheet.locator('[data-wallet-topup]').click()
    page.wait_for_function("Object.keys(sessionStorage).some(k=>k.startsWith('toca:request:credits-v1:')&&JSON.parse(sessionStorage.getItem(k)).commandId)")
    assert len(orders)==count_before+1 and model['balance']==5
    assert page.locator('#toca-song-added').count()==0,'Pending is not success'
    page.reload();expect(page.locator('.tw-request-status')).to_contain_text('Agregando')
    model['order']='success';expect(page.locator('#toca-song-added')).to_be_visible()
    expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert len(orders)==count_before+1 and model['balance']==4
    # A lost song response is checked automatically with the same durable key.
    model.update(balance=0,order='lost-song',processing=False);button=search();button.click();expect(sheet).to_be_visible()
    count_before=len(orders);sheet.locator('[data-wallet-topup]').click()
    expect(page.locator('#toca-song-added')).to_be_visible()
    expect(page).to_have_url(re.compile('/#/venue/'+VENUE_ID+'$'))
    assert len(orders)==count_before+2 and orders[-1]==orders[-2] and model['balance']==11
    # Canceling the original request leaves subsequent profile top-ups independent.
    model.update(balance=0,order='success');button=search();button.click();expect(sheet).to_be_visible()
    sheet.get_by_role('button',name='Cancelar',exact=True).click()
    assert page.evaluate("sessionStorage.getItem('toca:wallet:song:customer-test')") is None
    page.goto(BASE+'/#/profile/tokens?recharge=1');expect(sheet).to_be_visible()
    count_before=len(orders);sheet.locator('[data-wallet-topup]').click();expect(sheet).not_to_be_visible()
    expect(page.locator('[data-wallet-balance]')).to_have_text('12 tokens')
    assert len(orders)==count_before and page.locator('#toca-song-added').count()==0
    assert '/profile/tokens' in page.url and page.locator('.tw-chosen').count()==0
    # A late top-up reply cannot submit the previous customer's song for a new session.
    model.update(balance=0,holdTopup=True);button=search();button.click();expect(sheet).to_be_visible()
    sheet.locator('[data-wallet-topup]').click();page.wait_for_timeout(100);assert held_topups
    count_before=len(orders)
    model['customerId']='other-customer'
    page.evaluate("async()=>{tocaCustomerForgetSession();await tocaCustomerAcceptGoogleSession('synthetic-other-customer-session-abcdefghijklmnopqrstuvwxyz','other-customer');location.hash='#/profile'}")
    route,data=held_topups.pop();route.fulfill(status=200,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
    page.wait_for_timeout(400)
    assert len(orders)==count_before and page.locator('#toca-song-added').count()==0
    assert page.evaluate('tocaCustomerUser().id')=='other-customer' and page.url.endswith('/#/profile')
    assert not dialogs and not errors,(dialogs,errors)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    context.close();print('PASS integrated credits: automatic request after top-up, centered success, one debit, reload/lost-response recovery, independent top-ups, customer isolation and GPS:',width,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (390,1440):scenario(browser,width)
    browser.close()
