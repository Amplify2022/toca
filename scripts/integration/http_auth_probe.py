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


def tests():
    status, _, _ = request("/api/health", method="GET")
    assert status == 200, "Local API health failed"
    verify_test_database_binding()
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
        print("PASS", path, "10 attempts/client, forwarding headers ignored, independent owner still logs in")

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
