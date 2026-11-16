"""Contact form against an isolated local API/PostgreSQL; no external mail.

Uses the same explicit test-database guards as http_auth_probe.py. Set
TOCA_TEST_WEB_URL to also submit the actual homepage form in Chromium.
"""
import json
import os
import uuid
from urllib.parse import urlsplit
import http_auth_probe as probe

ids = []


def payload(**overrides):
    identity = str(uuid.uuid4())
    ids.append(identity)
    return dict(dict(id=identity, name='Contact fixture', email='contact@example.test',
                     kind='suggestion', message='Una sugerencia de prueba para mejorar TOCÁ.',
                     website=''), **overrides)


try:
    probe.verify_test_database_binding()
    body = payload()
    status, headers, result = probe.request('/api/contact', body)
    assert status == 202 and result == dict(accepted=True, receiptId=body['id']), (status, result)
    assert 'no-store' in headers.get('Cache-Control', '')
    for _ in range(8):
        assert probe.request('/api/contact', body)[0] == 202
    assert probe.sql(f"SELECT count(*) FROM contact_message WHERE id='{body['id']}'") == '1'
    assert probe.request('/api/contact', dict(body, message='Otro contenido para el mismo envío.'))[0] == 409
    invalid = dict(body, id=str(uuid.uuid4()), email='invalid')
    assert probe.request('/api/contact', invalid)[0] == 400
    invalid = dict(body, id=str(uuid.uuid4()), message='short')
    assert probe.request('/api/contact', invalid)[0] == 400
    status, _, response = probe.request('/api/contact', method='GET')
    assert status in (404, 405) and 'email' not in json.dumps(response)
    trap = payload()
    trap['website'] = 'https://spam.example.test'
    assert probe.request('/api/contact', trap)[0] == 202
    assert probe.sql(f"SELECT count(*) FROM contact_message WHERE id='{trap['id']}'") == '0'
    for _ in range(3):
        assert probe.request('/api/contact', payload())[0] == 202
    status, headers, _ = probe.request('/api/contact', payload(), headers={
        'X-Toca-Client-IP': probe.rotated_ip,
        'X-Forwarded-For': probe.rotated_ip,
        'X-Toca-Proxy-Key': 'untrusted-test-key'
    })
    assert status == 429 and int(headers['Retry-After']) > 0
    assert probe.request('/api/contact', body)[0] == 202, 'Lost-response retries remain idempotent after quota'
    print('PASS contact HTTP: durable receipt, idempotent retry, conflict, validation, private inbox, honeypot and trusted-peer rate limit', flush=True)

    web = os.environ.get('TOCA_TEST_WEB_URL')
    if web:
        from playwright.sync_api import sync_playwright, expect
        parsed = urlsplit(web)
        assert parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            context = browser.new_context(viewport=dict(width=390, height=900), service_workers='block')
            context.add_init_script("localStorage.setItem('amplify-api'," + json.dumps(f'http://{probe.host}:{probe.port}') + ");")
            page = context.new_page()
            errors, submissions = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def capture(request):
                if request.method == 'POST' and urlsplit(request.url).path == '/api/contact':
                    body = request.post_data_json
                    ids.append(body['id'])
                    submissions.append(body)
                    assert not request.headers.get('authorization')
            page.on('request', capture)
            page.route('https://**/*', lambda route: route.abort())
            page.goto(web + '/#/?section=contacto')
            form = page.locator('#landing-contact-form')
            form.locator('[name=name]').fill('Browser fixture')
            form.locator('[name=email]').fill('browser@example.test')
            form.locator('[name=kind]').select_option('problem')
            form.locator('[name=message]').fill('Este mensaje se envía desde el formulario real.')
            form.locator('button[type=submit]').click()
            expect(form.locator('.landing-form-status')).to_contain_text('Recibimos tu mensaje')
            assert len(submissions) == 1 and not errors, errors
            identity = str(uuid.UUID(submissions[0]['id']))
            row = probe.sql(f"SELECT email||'|'||kind||'|'||message FROM contact_message WHERE id='{identity}'")
            assert row == 'browser@example.test|problem|Este mensaje se envía desde el formulario real.'
            assert form.locator('[name=message]').input_value() == ''
            context.close()
            browser.close()
        print('PASS homepage form + real API/PostgreSQL: anonymous submission, stored fields, inline confirmation and cleared form', flush=True)
finally:
    if ids:
        safe = ','.join("'" + str(uuid.UUID(identity)) + "'" for identity in ids)
        probe.sql(f'DELETE FROM contact_message WHERE id IN ({safe})')
    probe.cleanup()
