// Frontend access regression tests. API/GPS are simulated; no real QR/session
// values are used. Backend authorization is covered by PostgreSQL integration.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../web/toca-presence-v1827.js'), 'utf8');

function setup(options = {}) {
  const calls = [], messages = [];
  let gpsCalls = 0, loginCalls = 0;
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
    navigator: {geolocation: {getCurrentPosition(success, failure) {
      gpsCalls++;
      if (options.gpsDenied) return failure({code: 1});
      success({coords: {latitude: -34.9, longitude: -56.2, accuracy: 10}});
    }}},
    tocaCustomerVerified: () => options.authenticated !== false,
    tocaCustomerBearer: () => options.authenticated === false ? '' : 'Bearer synthetic-customer',
    tocaCustomerRequireForRequest: async () => { loginCalls++; },
    fetch: async (url, request) => {
      calls.push({url, ...request});
      const post = request.method === 'POST';
      const status = post ? options.postStatus || 200 : 200;
      return {ok: status < 400, status, json: async () => post
        ? (status === 200 ? {allowed: true} : {message: 'Tenés que estar dentro de los 100 metros del bar'})
        : {allowed: !!options.allowed, mode: options.mode || 'NEARBY', requiresQr: options.mode !== 'ANYWHERE'}};
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, {filename: 'toca-presence-v1827.js'});
  return {sandbox, calls, messages, gps: () => gpsCalls, logins: () => loginCalls};
}

(async () => {
  let test = setup();
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), true);
  assert.equal(test.gps(),1,'NEARBY checks GPS without QR');
  const post=test.calls[1];
  assert.equal(post.method,'POST');assert.equal(post.headers['X-TOCA-Join'],undefined);
  assert.deepEqual(JSON.parse(post.body),{latitude:-34.9,longitude:-56.2,accuracy:10});

  test=setup({mode:'ANYWHERE',allowed:true,gpsDenied:true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
  assert.equal(test.gps(),0,'ANYWHERE never asks location');assert.equal(test.calls.length,1);

  test=setup({allowed:true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),true);
  assert.equal(test.gps(),1,'A previous check-in must not skip the distance check on a new request');

  test=setup({postStatus:403});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'),false);
  assert.match(test.messages[0],/100 metros/);

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
  assert.match(test.messages[0], /permitir/);
  console.log('PASS: distance access without QR, ANYWHERE without GPS, fresh position, outside radius, login and GPS permission errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
