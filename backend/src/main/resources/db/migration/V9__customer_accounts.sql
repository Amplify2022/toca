-- TOCÁ customer identities; completely separate from bar administrators.
-- No payment balance or billing operations are implemented in this migration.
CREATE TABLE customer_account (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_session (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_session_user_idx ON customer_session(customer_id);
CREATE INDEX customer_session_expiry_idx ON customer_session(expires_at);

-- Each submission has its own event, even when several people request the same track.
-- Historic anonymous events remain anonymous. They must not be claimed via guestId.
ALTER TABLE song_request_event ADD COLUMN customer_id UUID REFERENCES customer_account(id) ON DELETE SET NULL;
CREATE INDEX song_request_event_customer_idx ON song_request_event(customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;

-- Basic per-email throttling, complemented by an edge/IP rate limit before public launch.
CREATE TABLE customer_login_failure (
    id BIGSERIAL PRIMARY KEY,
    email_hash CHAR(64) NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_login_failure_lookup_idx ON customer_login_failure(email_hash, happened_at DESC);
CREATE INDEX customer_login_failure_gc_idx ON customer_login_failure(happened_at);
