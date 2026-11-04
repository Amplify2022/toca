"""Full-index request UI regression with a mocked API; no provider credentials.

Run a static web server on port 5173, then python3 scripts/test-request-flow.py.
Requires Playwright and /usr/bin/chromium.
"""
import json
from playwright.sync_api import sync_playwright

VENUE_ID = '77777777-7777-4777-8777-777777777777'
TRACK_ID = 'A' * 22
VENUE = dict(id=VENUE_ID, name='Integration Bar', city='Montevideo', address='Centro',
             genre='Rock', description='Test venue', active=True, spotifyConnected=True,
             requestAccessMode='ANYWHERE', latitude=-34.9, longitude=-56.2,
             photos=[], coverPhotoUrl=None, openingHours=None)
TRACK = dict(id=TRACK_ID, title='Request Test Song', artist='Test Artist', durationMs=180000)


def scenario(browser, outcome):
    context = browser.new_context()
    context.add_init_script("""
      localStorage.setItem('amplify-mode','live');
      sessionStorage.setItem('toca:customer:session','synthetic-customer-session-abcdefghijklmnopqrstuvwxyz');
    """)
    page = context.new_page()
    errors, keys = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())

    def route_api(route):
        request = route.request
        path = request.url.split('8080', 1)[1].split('?', 1)[0]
        data = []
        if path == '/api/customers/me':
            data = dict(id='customer-test', name='Test Customer', email='test@example.test', roles=['CUSTOMER'])
        elif path.endswith('/google/config'):
            data = dict(enabled=False, clientId='')
        elif path.endswith('/presence'):
            data = dict(allowed=True, mode='ANYWHERE', requiresQr=False)
        elif path == f'/api/venues/{VENUE_ID}':
            data = VENUE
        elif path.endswith('/tracks'):
            data = [TRACK]
        elif path.endswith('/stats'):
            data = dict(tracks=0,repeats=0,synced=0,days=[])
        elif path.endswith('/music-status'):
            data = dict(active=True, isPlaying=False, now=None, playlist=[])
        elif path.endswith('/requests') and request.method == 'POST':
            keys.append(request.headers.get('idempotency-key'))
            if outcome == 'lost-response' and len(keys) == 1:
                route.abort('failed')
                return
            data = dict(commandId='command-test', status='PENDING' if outcome == 'pending' else
                        'UNCERTAIN' if outcome == 'uncertain' else 'DISPATCHED')
        elif path.endswith('/request-commands/command-test'):
            data = dict(commandId='command-test', status='DISPATCHED')
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data),
                      headers={'Access-Control-Allow-Origin': '*'})

    page.route('http://localhost:8080/**', route_api)
    page.route('https://**/*', lambda route: route.abort())
    page.goto(f'http://localhost:5173/#/request/{VENUE_ID}')
    page.locator('#song-search').fill('Request')
    button = page.locator(f'[data-action="request"][data-track="{TRACK_ID}"]')
    button.wait_for()
    button.click()
    if outcome == 'uncertain':
        page.wait_for_function("document.getElementById('toca-request-sync-feedback')?.textContent.includes('revisión del bar')")
        assert page.evaluate('location.hash').startswith('#/request/')
        assert 'Playlist actualizada' not in page.locator('#toast').inner_text()
        button.click()
        page.wait_for_function("location.hash.startsWith('#/success/')")
        assert len(keys) == 1, 'Consulting uncertain command must not issue a second POST'
    elif outcome == 'lost-response':
        page.wait_for_function("document.getElementById('toca-request-sync-feedback')?.textContent.includes('conservamos el mismo pedido')")
        assert button.is_enabled(), 'Network errors must allow querying the retained request'
        button.click()
        page.wait_for_function("location.hash.startsWith('#/success/')")
        assert keys[0] == keys[1], 'A lost response must not generate a new command key'
    else:
        page.wait_for_function("location.hash.startsWith('#/success/')")
    assert keys and all(keys)
    assert not errors, errors
    context.close()


def admin_review(browser):
    context = browser.new_context()
    context.add_init_script("""
      localStorage.setItem('amplify-mode','live');
      sessionStorage.setItem('amplify-token','synthetic-admin-session-abcdefghijklmnopqrstuvwxyz');
      sessionStorage.setItem('amplify-user',JSON.stringify({id:'owner-test',name:'Owner',email:'owner@example.test'}));
    """)
    page = context.new_page()
    page.on('dialog', lambda dialog: dialog.accept())
    reconciled, posts, errors = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route_api(route):
        path = route.request.url.split('8080', 1)[1].split('?', 1)[0]
        data = []
        if path == '/api/auth/me':
            data = dict(id='owner-test', name='Owner', email='owner@example.test', roles=['VENUE_ADMIN'])
        elif path == '/api/admin/venues':
            data = [dict(VENUE, joinToken='synthetic-current-qr', playlistId='P' * 22)]
        elif path == f'/api/venues/{VENUE_ID}':
            data = VENUE
        elif path.endswith('/request-commands/command-test/reconcile'):
            assert route.request.method == 'POST'
            posts.append(path)
            reconciled.append(True)
            data = dict(commandId='command-test', status='DISPATCHED')
        elif path.endswith('/request-commands'):
            data = [] if reconciled else [dict(commandId='command-test', status='UNCERTAIN',
                                               title='Needs Review', message='Check Spotify')]
        elif path.endswith('/stats'):
            data = dict(tracks=0,repeats=0,synced=0,days=[])
        elif path.endswith('/music-status'):
            data = dict(active=True, isPlaying=False, now=None, playlist=[])
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data),
                      headers={'Access-Control-Allow-Origin': '*'})

    page.route('http://localhost:8080/**', route_api)
    page.route('https://**/*', lambda route: route.abort())
    page.goto('http://localhost:5173/#/admin/general')
    page.locator('[data-action="reconcile-request-command"]').wait_for()
    assert not posts, 'Uncertain commands require an explicit administrator action'
    page.locator('[data-action="reconcile-request-command"]').click()
    page.wait_for_function("document.getElementById('toca-request-commands')?.textContent.includes('No hay pedidos pendientes')")
    assert len(posts) == 1
    assert not errors, errors
    context.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                             args=['--no-sandbox'])
        for outcome in ['pending', 'uncertain', 'lost-response']:
            scenario(browser, outcome)
            print('PASS request UI:', outcome)
        admin_review(browser)
        print('PASS request UI: explicit administrator reconciliation')
        browser.close()
