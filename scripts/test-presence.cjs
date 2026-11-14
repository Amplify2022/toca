// Frontend access regression tests. API/GPS are simulated; no real QR/session
// values are used. Backend authorization is covered by PostgreSQL integration.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../web/toca-presence-v1827.js'), 'utf8');

function setup(options = {}) {
  const calls = [], messages = [], gpsOptions = [];
  let gpsCalls = 0, loginCalls = 0, allowed = !!options.allowed;
  const sandbox = {
    API_URL: 'https://api.example.test',
    location: {hash: '#/request/bar-1?join=current-qr'},
    state: {},
    document: {addEventListener() {}},
    isSecureContext: options.secure !== false,
    route: () => ({params: new URLSearchParams('join=current-qr')}),
    rememberJoin: (venueId, queryToken) => {
      assert.equal(venueId, 'bar-1');
      assert.equal(queryToken, 'current-qr');
      return options.qr || '';
    },
    toast: message => messages.push(message),
    console: {warn() {}},
    navigator: {geolocation: {getCurrentPosition(success, failure, requestOptions) {
      gpsCalls++;
      gpsOptions.push(requestOptions);
      options.onGps?.();
      if (options.gpsDenied) return failure({code: 1});
      const next=options.gpsResults?.shift() || {};
      if(next.error) return failure({code:next.error});
      success({coords: {latitude: -34.9, longitude: -56.2, accuracy: next.accuracy ?? 10}});
    }}},
    tocaCustomerVerified: () => options.authenticated !== false,
    tocaCustomerBearer: () => options.authenticated === false ? '' : options.token || 'Bearer synthetic-customer',
    tocaCustomerRequireForRequest: async () => { loginCalls++; },
    fetch: async (url, request) => {
      calls.push({url, ...request});
      const post = request.method === 'POST';
      const status = post ? options.postStatus || 200 : 200;
      if (post && status === 200) allowed = true;
      if (!post && options.presenceResults?.length) allowed=options.presenceResults.shift();
      return {ok: status < 400, status, json: async () => post
        ? (status === 200 ? {allowed: true} : {message: 'Tenés que estar dentro de los 100 metros del bar'})
        : {allowed, mode: options.mode || 'NEARBY', requiresQr: options.mode !== 'ANYWHERE'}};
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, {filename: 'toca-presence-v1827.js'});
  return {sandbox, calls, messages, gpsOptions, gps: () => gpsCalls, logins: () => loginCalls};
}

(async () => {
  let test = setup();
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), true);
  assert.equal(test.gps(),1,'NEARBY checks GPS without QR');
  const post=test.calls[1];
  assert.equal(post.method,'POST');assert.equal(post.headers['X-TOCA-Join'],undefined);
  assert.deepEqual(JSON.parse(post.body),{latitude:-34.9,longitude:-56.2,accuracy:10});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
  assert.equal(test.gps(),1,'The second request reuses the first server-confirmed location');
  assert.equal(test.calls.length,3,'Two requests use GET, POST, GET without a second check-in');

  test=setup({mode:'ANYWHERE',allowed:true,gpsDenied:true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
  assert.equal(test.gps(),0,'ANYWHERE never asks location');assert.equal(test.calls.length,1);

  test=setup({allowed:true,gpsDenied:true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
  assert.equal(test.gps(),0,'A current server-verified check-in must survive a later noisy or denied GPS reading');
  assert.equal(test.calls.length,1,'Reusing a valid check-in must not post another location');

  test=setup({allowed:false,gpsDenied:true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false);
  assert.equal(test.gps(),1,'An expired or invalidated check-in must require fresh location again');

  test=setup({postStatus:403});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false);
  assert.match(test.messages[0],/100 metros/);

  for(const code of [2,3]){
    test=setup({gpsResults:[{error:code},{accuracy:45}]});
    assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
    assert.equal(test.gps(),2,'Temporary unavailable/timeout must retry without page refresh');
    assert.deepEqual(test.gpsOptions.map(x=>x.enableHighAccuracy),[true,false]);
    assert.ok(test.gpsOptions.every(x=>x.maximumAge===30000 && x.timeout===8000));
    assert.equal(JSON.parse(test.calls[1].body).accuracy,45,'Fallback must send its actual accuracy for server validation');
    assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
    assert.equal(test.gps(),2,'The next song must reuse the recovered check-in');
  }

  test=setup({gpsResults:[{accuracy:500},{accuracy:25}]});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true,'An imprecise first reading can recover with a sufficiently precise second reading');

  test=setup({gpsResults:[{accuracy:500},{accuracy:101}]});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false);
  assert.equal(test.calls.filter(x=>x.method==='POST').length,0,'Fallback must never submit imprecise coordinates');
  assert.match(test.messages[0],/suficiente precisión/);

  test=setup({gpsResults:[{error:2},{error:3}],presenceResults:[false,true]});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true,'Re-read the server grant after a temporary GPS failure');
  assert.equal(test.calls.length,2);assert.equal(test.calls.filter(x=>x.method==='POST').length,0);
  assert.equal(test.messages.length,0,'A recovered grant must not leave an error toast');

  test=setup({gpsResults:[{error:2},{error:3}]});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false,'Both failures must stop an unverified request');
  assert.equal(test.calls.filter(x=>x.method==='POST').length,0);
  assert.match(test.messages[0],/No pudimos obtener/);
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true,'An explicit retry after failure must work without reloading');

  test=setup();
  assert.deepEqual(await Promise.all([test.sandbox.tocaPresenceEnsure('bar-1'),test.sandbox.tocaPresenceEnsure('bar-1')]),[true,true]);
  assert.equal(test.gps(),1,'Overlapping clicks share one location reading');
  assert.equal(test.calls.filter(x=>x.method==='POST').length,1);

  const changedSession={onGps(){changedSession.token='Bearer another-synthetic-customer';}};
  test=setup(changedSession);
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false);
  assert.equal(test.calls.filter(x=>x.method==='POST').length,0,'A location check must not be posted under a different account');

  test = setup({authenticated: false});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), false);
  assert.equal(test.logins(), 1);
  assert.equal(test.calls.length, 0);

  test = setup({qr: 'current-qr', secure: false});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), false);
  assert.equal(test.calls.length, 1);
  assert.match(test.messages[0], /HTTPS/);

  test = setup({qr: 'current-qr', gpsDenied: true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), false);
  assert.equal(test.calls.length, 1);
  assert.equal(test.gps(),1,'Denied permission must not trigger automatic GPS retries');
  assert.match(test.messages[0], /permitir/);
  console.log('PASS: valid location reuse, expiry, temporary GPS recovery, precision, server recheck, concurrent clicks, account isolation, distance, ANYWHERE and permission denial');
})().catch(error => { console.error(error); process.exitCode = 1; });
