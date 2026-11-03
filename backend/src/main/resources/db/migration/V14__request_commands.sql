-- Durable admissions: rate limits and idempotency belong to authenticated users,
-- not a browser-supplied guest ID. Commands survive remote/DB failure windows.
CREATE TABLE request_command (
    id UUID PRIMARY KEY,
    sequence BIGSERIAL NOT NULL UNIQUE,
    venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(100) NOT NULL,
    track_id VARCHAR(22) NOT NULL,
    guest_id VARCHAR(90) NOT NULL,
    playlist_id VARCHAR(150) NOT NULL,
    session_started_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK(status IN
        ('PENDING','PREPARING','APPLYING','SUCCEEDED','FAILED','UNCERTAIN')),
    title VARCHAR(300),
    artist VARCHAR(300),
    plan_json TEXT,
    request_id UUID REFERENCES song_request(id) ON DELETE SET NULL,
    action VARCHAR(40),
    playlist_position INTEGER,
    warning TEXT,
    error VARCHAR(500),
    worker_id UUID,
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(venue_id,customer_id,idempotency_key)
);
CREATE INDEX request_command_customer_rate ON request_command(venue_id,customer_id,created_at DESC);
CREATE INDEX request_command_pending ON request_command(sequence) WHERE status='PENDING';
CREATE INDEX request_command_recovery ON request_command(lease_until) WHERE status IN ('PREPARING','APPLYING');
-- The venue row lock guards claim ordering; this constraint is a second guard
-- against simultaneous remote effects across application instances.
CREATE UNIQUE INDEX request_command_one_active_per_venue ON request_command(venue_id)
    WHERE status IN ('PREPARING','APPLYING','UNCERTAIN');
ALTER TABLE song_request_event ADD COLUMN command_id UUID REFERENCES request_command(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX song_request_event_command ON song_request_event(command_id) WHERE command_id IS NOT NULL;
