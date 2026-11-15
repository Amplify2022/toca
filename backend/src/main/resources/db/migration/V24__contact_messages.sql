CREATE TABLE contact_message (
 id UUID PRIMARY KEY,
 payload_hash CHAR(64) NOT NULL,
 name VARCHAR(120) NOT NULL,
 email VARCHAR(200) NOT NULL,
 kind VARCHAR(20) NOT NULL CHECK (kind IN ('suggestion','problem','other')),
 message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 notified_at TIMESTAMPTZ,
 notification_attempts INTEGER NOT NULL DEFAULT 0,
 notification_error VARCHAR(200),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_until TIMESTAMPTZ
);
CREATE INDEX contact_message_delivery ON contact_message(next_attempt_at)
 WHERE notified_at IS NULL AND notification_attempts<5;
