-- Previously installed venues may have manual approval enabled.
-- TOCÁ playlist mode sends valid requests directly to the linked Spotify playlist.
ALTER TABLE venue ALTER COLUMN require_approval SET DEFAULT false;
UPDATE venue SET require_approval=false WHERE require_approval=true;
ALTER TABLE song_request ADD COLUMN IF NOT EXISTS request_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE song_request ADD COLUMN IF NOT EXISTS playlist_position INTEGER;
ALTER TABLE song_request ADD COLUMN IF NOT EXISTS last_requested_at TIMESTAMPTZ DEFAULT now();
-- Legacy pending/approved/dispatched rows never proved a Spotify playlist write.
-- Preserve their audit history but don't mislabel them as successfully synchronized.
UPDATE song_request
 SET status='FAILED',
     provider_error='Solicitud anterior a v1.1: no confirma edicion de playlist Spotify',
     updated_at=now()
 WHERE status IN ('PENDING','APPROVED','DISPATCHED');
