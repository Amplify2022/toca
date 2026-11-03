ALTER TABLE venue ADD COLUMN spotify_device_id VARCHAR(150);
ALTER TABLE song_request ADD COLUMN guest_id VARCHAR(90);
CREATE INDEX song_request_guest_recent ON song_request(venue_id,guest_id,created_at DESC);
