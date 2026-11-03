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
        ? (status === 200 ? {allowed: true} : {message: 'Escaneá el QR vigente del bar'})
        : {allowed: !!options.allowed, mode: options.mode || 'NEARBY', requiresQr: options.mode !== 'ANYWHERE'}};
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, {filename: 'toca-presence-v1827.js'});
  return {sandbox, calls, messages, gps: () => gpsCalls, logins: () => loginCalls};
}

(async () => {
  let test = setup();
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), false);
  assert.equal(test.gps(), 0, 'missing QR must not request GPS');
  assert.equal(test.calls.length, 1, 'GPS alone cannot submit a check-in');
  assert.match(test.messages[0], /QR vigente/);

  test = setup({mode: 'ANYWHERE', allowed: true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), true);
  assert.equal(test.gps(), 0, 'explicit ANYWHERE policy needs no GPS or QR');

  test = setup({allowed: true});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), true);
  assert.equal(test.gps(), 0, 'current bound grant can be reused');

  test = setup({qr: 'current-qr'});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), true);
  assert.equal(test.gps(), 1);
  const post = test.calls[1];
  assert.equal(post.method, 'POST');
  assert.equal(post.headers['X-TOCA-Join'], 'current-qr');
  assert.equal(post.headers['X-TOCA-Customer'], 'Bearer synthetic-customer');
  assert(!post.url.includes('current-qr'), 'QR secret must not enter request URLs');
  assert.deepEqual(JSON.parse(post.body), {latitude: -34.9, longitude: -56.2, accuracy: 10});
  assert(!test.messages[0].includes('Ubicación verificada'), 'do not claim physical-location proof');

  test = setup({qr: 'rotated-old-qr', postStatus: 403});
  assert.equal(await test.sandbox.tocaPresenceEnsure('bar-1'), false);
  assert.match(test.messages[0], /QR vigente/);

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
  console.log('PASS: 8 venue-access scenarios (QR required/header-only, ANYWHERE, bound grant, rotated token, auth, GPS availability/permission)');
})().catch(error => { console.error(error); process.exitCode = 1; });
