CREATE TABLE admin_user (
 id UUID PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(200) NOT NULL UNIQUE,
 password_hash VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_session (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_session_user_idx ON auth_session (user_id);
CREATE TABLE venue (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES admin_user(id),
 name VARCHAR(160) NOT NULL, slug VARCHAR(190) NOT NULL UNIQUE,
 address VARCHAR(240) NOT NULL, city VARCHAR(120) NOT NULL,
 description TEXT NOT NULL DEFAULT '', genre VARCHAR(160) NOT NULL DEFAULT '',
 latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 active BOOLEAN NOT NULL DEFAULT false, require_approval BOOLEAN NOT NULL DEFAULT true,
 curated_only BOOLEAN NOT NULL DEFAULT false,
 join_token VARCHAR(60) NOT NULL UNIQUE,
 spotify_account_id VARCHAR(150), spotify_name VARCHAR(200), spotify_premium BOOLEAN NOT NULL DEFAULT false,
 spotify_access_encrypted TEXT, spotify_refresh_encrypted TEXT, spotify_expires_at TIMESTAMPTZ,
 playlist_id VARCHAR(150),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX venue_city_idx ON venue(city);
CREATE INDEX venue_owner_idx ON venue(owner_id);
CREATE TABLE spotify_oauth_state (
 state VARCHAR(100) PRIMARY KEY, venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
 owner_id UUID NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
 verifier VARCHAR(130) NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE song_request (
 id UUID PRIMARY KEY, venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
 track_id VARCHAR(128) NOT NULL,title VARCHAR(300) NOT NULL,artist VARCHAR(300) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','DISPATCHED','REJECTED','PLAYED','FAILED')),
 source VARCHAR(16) NOT NULL DEFAULT 'QR', provider_error VARCHAR(300),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX song_request_venue_status ON song_request(venue_id,status,created_at);
CREATE UNIQUE INDEX unique_active_track_per_venue ON song_request(venue_id,track_id) WHERE status IN ('PENDING','APPROVED','DISPATCHED');
CREATE TABLE venue_track_rule (
 venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
 track_id VARCHAR(128) NOT NULL, mode VARCHAR(10) NOT NULL CHECK (mode IN ('BLOCK','ALLOW')),
 PRIMARY KEY(venue_id,track_id,mode)
);
