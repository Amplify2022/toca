#!/usr/bin/env python3
"""Against a rebuilt LOCAL API only; fixtures and failures use synthetic users.

Run with privileges allowing loopback source binding and local docker socket:
  python scripts/integration/http_auth_probe.py
No credential values are printed. Fixture accounts are cleaned in finally.
"""
import http.client
import hashlib
import ipaddress
import json
import os
import random
import subprocess
import uuid

host = os.environ.get("TOCA_TEST_HOST", "127.0.0.1")
port = int(os.environ.get("TOCA_TEST_PORT", "8081"))
if os.environ.get("TOCA_TEST_ALLOW_SCHEMA_MIGRATION") != "true":
    raise SystemExit("Set TOCA_TEST_ALLOW_SCHEMA_MIGRATION=true only for a dedicated local test database")
database = os.environ.get("TOCA_TEST_DATABASE", "")
if (not database or "test" not in database.lower() or not os.environ.get("TOCA_TEST_DB_USER")
        or not os.environ.get("TOCA_TEST_POSTGRES_CONTAINER")):
    raise SystemExit("Explicit test database, TOCA_TEST_DB_USER and TOCA_TEST_POSTGRES_CONTAINER are required")
if not ipaddress.ip_address(host).is_loopback:
    raise SystemExit("This probe is restricted to loopback API addresses")
prefix = f"127.{random.randint(30, 220)}.{random.randint(1, 250)}"
owner_ip, attacker_ip, fresh_ip, register_ip, rotated_ip = [f"{prefix}.{n}" for n in range(1, 6)]
marker = "p1-" + str(uuid.uuid4())
password = "P1-fixture-password-" + str(uuid.uuid4())
created = []


def request(path, body=None, source=owner_ip, headers=None, method="POST"):
    connection = http.client.HTTPConnection(host, port, timeout=15, source_address=(source, 0))
    payload = json.dumps(body).encode() if body is not None else None
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    try:
        connection.request(method, path, body=payload, headers=request_headers)
        response = connection.getresponse()
        raw = response.read()
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            data = {}
        return response.status, dict(response.getheaders()), data
    finally:
        connection.close()


def sql(statement):
    result = subprocess.run([
        "docker", "exec", os.environ["TOCA_TEST_POSTGRES_CONTAINER"],
        "psql", "-v", "ON_ERROR_STOP=1", "-U", os.environ["TOCA_TEST_DB_USER"],
        "-d", database, "-qAtc", statement
    ], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Local test database fixture operation failed")
    return result.stdout.strip()


def cleanup():
    if not created:
        return
    statements = []
    for table, identity in created:
        identity = str(uuid.UUID(identity))
        statements.append(f"DELETE FROM {table} WHERE id='{identity}'::uuid")
    sql(";".join(statements))


def verify_test_database_binding():
    """Prove the API uses the intended DB before creating accounts through it."""
    customer = str(uuid.uuid4())
    session = str(uuid.uuid4())
    token = uuid.uuid4().hex + uuid.uuid4().hex
    digest = hashlib.sha256(token.encode()).hexdigest()
    created.append(("customer_account", customer))
    sql("BEGIN;"
        f"INSERT INTO customer_account(id,name,email,password_hash) VALUES('{customer}','P1 DB sentinel','{marker}-sentinel@example.test','unused-test-hash');"
        f"INSERT INTO account_role(customer_id,role) VALUES('{customer}','CUSTOMER');"
        f"INSERT INTO customer_session(id,customer_id,token_hash,expires_at) VALUES('{session}','{customer}','{digest}',now()+interval '5 minutes');"
        "COMMIT")
    status, _, data = request("/api/customers/me", source=fresh_ip,
        headers={"Authorization": "Bearer " + token}, method="GET")
    assert status == 200 and data.get("id") == customer, f"Test DB identity check failed (HTTP {status}); no HTTP accounts created"
    return token


def unfunded_request_http(token):
    headers={'Authorization':'Bearer '+token}
    status,_,user=request('/api/customers/me',headers=headers,method='GET');assert status==200
    customer=str(uuid.UUID(user['id']));owner=str(uuid.uuid4());venue=str(uuid.uuid4())
    created.extend([('venue',venue),('admin_user',owner)])
    sql(f"INSERT INTO admin_user(id,name,email,password_hash) VALUES('{owner}','Flow fixture','{owner}@example.test','unused');"
        f"INSERT INTO venue(id,owner_id,name,slug,address,city,latitude,longitude,join_token,active,spotify_premium,playlist_id,request_access_mode,queue_started_at) VALUES('{venue}','{owner}','Flow fixture','{venue}','Test','Test',-34.9,-56.17,'{venue}',true,true,'PPPPPPPPPPPPPPPPPPPPPP','ANYWHERE',now());")
    track='A'*22;idem=str(uuid.uuid4())
    status,_,data=request('/api/venues/'+venue+'/requests',{'trackId':track},headers={'X-TOCA-Customer':'Bearer '+token,'Idempotency-Key':idem})
    assert status==402 and data.get('code')=='INSUFFICIENT_TOKENS',f'Expected structured no-funds response, got HTTP {status}'
    assert sql(f"SELECT count(*) FROM request_command WHERE venue_id='{venue}'")=="0",'No funds must not create a request or an admin review item'
    if os.environ.get('TOCA_TEST_WEB_URL'):
        from playwright.sync_api import sync_playwright,expect
        from urllib.parse import urlsplit
        web=os.environ['TOCA_TEST_WEB_URL']
        parsed=urlsplit(web);assert parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1'),'Test web must be local'
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport=dict(width=390,height=900),service_workers='block')
            pending_key=f'toca:request:credits-v1:{customer}:{venue}:{track}'
            script="localStorage.setItem('amplify-mode','live');localStorage.setItem('amplify-api',"+json.dumps(f'http://{host}:{port}')+");sessionStorage.setItem('toca:customer:session',"+json.dumps(token)+");sessionStorage.setItem("+json.dumps(pending_key)+","+json.dumps(json.dumps({'idempotencyKey':str(uuid.uuid4())}))+ ");"
            context.add_init_script(script)
            page=context.new_page();errors=[];posts=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:posts.append(r.url) if r.method=='POST' and r.url.endswith('/requests') else None)
            page.route('https://**/*',lambda route:route.abort())
            page.goto(web+'/#/request/'+venue);page.wait_for_load_state('networkidle')
            # Inject only catalog display data. The click handler, balance rejection,
            # redirect, customer authentication and recharge page use the real API.
            page.evaluate("""track=>{state.catalog=[track];document.getElementById('song-results').innerHTML=trackRow(track,1,'search')}""",dict(id=track,title='Zero-token song',artist='Fixture artist'))
            page.locator('[data-action="request"]').click()
            expect(page.locator('#toca-token-recharge')).to_be_visible()
            expect(page.locator('[data-wallet-balance]')).to_have_text('0 tokens')
            assert '/profile/tokens' in page.url and len(posts)==1
            assert 'Error: No tenés' not in page.locator('#toast').inner_text()
            assert not errors,errors
            page.screenshot(path='/tmp/toca-zero-token-real-redirect.png')
            context.close();browser.close()
    print('PASS actual unfunded request: structured HTTP 402, no command or review created, browser opens recharge without error toast')


def wallet_http(customer_token, admin_token, other_token):
    headers={"Authorization":"Bearer "+customer_token}
    status,_,_=request('/api/customers/me/wallet',method='GET')
    assert status==401,'Wallet requires customer authentication'
    status,_,_=request('/api/customers/me/wallet',headers={"Authorization":"Bearer "+admin_token},method='GET')
    assert status==401,'Bar administrator identity must not authorize a customer wallet'
    status,_,data=request('/api/customers/me/wallet',headers=headers,method='GET')
    assert status==200 and data['balance']==0 and data['requestCost']==1
    idem=str(uuid.uuid4());topup_headers={**headers,'Idempotency-Key':idem}
    status,_,data=request('/api/customers/me/wallet/topups',{'packId':'5','tokens':999999,'price':0,'customerId':'ignored'},headers=topup_headers)
    assert status==200 and data['balance']==5 and data['creditedTokens']==5 and data['simulated'] is True,'Only server-defined pack amount may be credited'
    movement=data['topupId']
    status,_,data=request('/api/customers/me/wallet/topups',{'packId':'5'},headers=topup_headers)
    assert status==200 and data['balance']==5 and data['topupId']==movement,'Retry must credit once'
    status,_,_=request('/api/customers/me/wallet/topups',{'packId':'12'},headers=topup_headers)
    assert status==409,'Cannot change the pack of an existing operation'
    status,_,_=request('/api/customers/me/wallet/topups',{'packId':'999999'},headers={**headers,'Idempotency-Key':str(uuid.uuid4())})
    assert status==400,'Arbitrary credit amounts are rejected'
    status,_,_=request('/api/customers/me/wallet/topups',{'packId':'5'},headers=headers)
    assert status==400,'Every recharge requires an idempotency key'
    status,_,data=request('/api/customers/me/wallet',headers={"Authorization":"Bearer "+other_token},method='GET')
    assert status==200 and data['balance']==0,'One account cannot credit another wallet'
    print('PASS wallet HTTP: customer auth, admin isolation, zero initial balance, server-defined packs, idempotent recharge and account isolation')
    if os.environ.get('TOCA_TEST_WEB_URL'):
        from pathlib import Path
        from urllib.parse import urlsplit
        from playwright.sync_api import sync_playwright,expect
        web=os.environ['TOCA_TEST_WEB_URL'];parsed=urlsplit(web)
        assert parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1'),'Test web must be local'
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport=dict(width=390,height=900),service_workers='block')
            context.add_init_script("localStorage.setItem('amplify-mode','live');localStorage.setItem('amplify-api',"+json.dumps(f'http://{host}:{port}')+");sessionStorage.setItem('toca:customer:session',"+json.dumps(other_token)+");")
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('https://**/*',lambda route:route.abort())
            page.goto(web+'/#/profile')
            try:expect(page.locator('[data-wallet-balance]')).to_have_text('0 tokens')
            except AssertionError:
                diagnostic=page.evaluate("""async()=>{try{const r=await fetch(API_URL+'/api/customers/me/wallet',{headers:{Authorization:tocaCustomerBearer()}});const d=await r.json();return {status:r.status,keys:Object.keys(d),balance:d.balance,balanceType:typeof d.balance,packs:Array.isArray(d.packs),movements:Array.isArray(d.movements)}}catch(e){return {error:e.message}}}""")
                page.screenshot(path='/tmp/toca-wallet-real-api-failure.png')
                print('Wallet browser diagnostic:',diagnostic,flush=True)
                raise
            page.locator('.toca-wallet-widget a.tw-button').click()
            panel=page.locator('#toca-token-recharge');expect(panel).to_be_visible()
            panel.locator('.tw-packs label').filter(has=page.locator('input[value="5"]')).click()
            panel.locator('[data-wallet-topup]').click();expect(panel).not_to_be_visible()
            expect(page.locator('[data-wallet-balance]')).to_have_text('5 tokens')
            page.reload();expect(page.locator('[data-wallet-balance]')).to_have_text('5 tokens')
            page.screenshot(path='/tmp/toca-wallet-real-api.png')
            assert not errors,errors
            context.close();browser.close()
        status,_,data=request('/api/customers/me/wallet',headers={"Authorization":"Bearer "+other_token},method='GET')
        assert status==200 and data['balance']==5,'Browser recharge must persist in PostgreSQL'
        print('PASS wallet browser + real API + PostgreSQL: profile zero, simulated recharge, panel closes and balance survives refresh')


def tests():
    status, _, _ = request("/api/health", method="GET")
    assert status == 200, "Local API health failed"
    sentinel_token=verify_test_database_binding()
    tokens={}
    for path, table in [("/api/auth", "admin_user"), ("/api/customers", "customer_account")]:
        email = f"{marker}-{table}@example.test"
        status, _, data = request(path + "/register", {"name": "P1 fixture", "email": email, "password": password})
        assert status == 200, f"Fixture registration rejected: {path}, status={status}"
        created.append((table, data["user"]["id"]))
        attempt = {"email": email, "password": "wrong-fixture-password"}
        statuses = []
        for n in range(11):
            # Attacker-controlled forwarding headers must not select a new bucket.
            result, response_headers, _ = request(path + "/login", attempt, attacker_ip,
                {"X-Forwarded-For": f"192.0.2.{n + 1}", "Forwarded": f"for=198.51.100.{n + 1}"})
            statuses.append(result)
            if result == 429:
                assert int(response_headers.get("Retry-After", "0")) > 0
        assert statuses[:10] == [401] * 10, f"Unexpected allowed attempt result: {path}, {statuses}"
        assert statuses[10] == 429, f"No per-principal/client limit: {path}"
        # A different actual source must retain access despite attacks on its mailbox.
        status, _, data = request(path + "/login", {"email": email, "password": password}, fresh_ip)
        assert status == 200 and "token" in data, f"Victim globally locked out: {path} status={status}"
        tokens[table]=data['token']
        print("PASS", path, "10 attempts/client, forwarding headers ignored, independent owner still logs in")

    if os.environ.get('TOCA_TEST_REQUEST_FLOW')=='true':unfunded_request_http(tokens['customer_account'])
    wallet_http(tokens['customer_account'],tokens['admin_user'],sentinel_token)

    # Invalid registrations count before expensive hashing/account creation.
    outcomes = []
    for n in range(11):
        status, _, _ = request("/api/auth/register", {
            "name": "P1 invalid fixture", "email": f"{marker}-invalid-{n}@example.test", "password": "short"
        }, register_ip)
        outcomes.append(status)
    assert outcomes[:10] == [400] * 10 and outcomes[10] == 429, "Admin registration limit missing"
    print("PASS registration: bounded by actual peer before password hashing")

    # Rotating arbitrary emails cannot create an unlimited stream of buckets.
    for n in range(121):
        status, _, _ = request("/api/auth/login", {
            "email": f"{marker}-absent-{n}@example.test", "password": "unused-wrong-password"
        }, rotated_ip)
        if n < 120:
            assert status == 401, f"Unexpected peer prelimit outcome: {n} {status}"
        else:
            assert status == 429, "Rotating principal bypassed peer limit"
    print("PASS principal rotation: shared per-peer cap remains effective")
    status, _, _ = request("/api/customers/google/config", method="GET")
    assert status == 200, "Public Google config must not be blocked by POST rate policy"
    print("PASS auth HTTP regression suite")


if __name__ == "__main__":
    try:
        tests()
    finally:
        cleanup()
