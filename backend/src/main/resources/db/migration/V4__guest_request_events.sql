-- Audit every accepted guest action, including promotions of existing songs.
-- Kept separately from song_request, which is one row per active track.
CREATE TABLE IF NOT EXISTS song_request_event (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES song_request(id) ON DELETE CASCADE,
    guest_id VARCHAR(90) NOT NULL,
    track_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS song_request_event_guest_rate_idx
    ON song_request_event(venue_id,guest_id,created_at DESC);
