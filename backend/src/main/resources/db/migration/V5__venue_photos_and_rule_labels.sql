-- Keep Spotify track IDs internal; show human-readable labels in admin rules.
ALTER TABLE venue_track_rule ADD COLUMN IF NOT EXISTS title VARCHAR(300);
ALTER TABLE venue_track_rule ADD COLUMN IF NOT EXISTS artist VARCHAR(300);

-- Small, bounded bar gallery (up to 8 images, 2.5 MB each validated in API).
CREATE TABLE venue_photo (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
    data BYTEA NOT NULL,
    content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    position INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX venue_photo_venue_idx ON venue_photo(venue_id, is_primary DESC, position ASC);
CREATE UNIQUE INDEX venue_photo_one_primary_idx ON venue_photo(venue_id) WHERE is_primary=true;
