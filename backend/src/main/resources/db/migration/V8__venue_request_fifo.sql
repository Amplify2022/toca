-- Track the start of each session and queue entry independently of repeat requests.
-- Historical active rows from before this migration should not reserve queue slots.
ALTER TABLE venue ADD COLUMN IF NOT EXISTS queue_started_at TIMESTAMPTZ;
UPDATE venue SET queue_started_at=now() WHERE queue_started_at IS NULL;
ALTER TABLE song_request ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
UPDATE song_request SET queued_at=COALESCE(last_requested_at,created_at) WHERE queued_at IS NULL;
CREATE INDEX IF NOT EXISTS song_request_venue_queue_idx
    ON song_request(venue_id,queued_at,id) WHERE status='DISPATCHED';
