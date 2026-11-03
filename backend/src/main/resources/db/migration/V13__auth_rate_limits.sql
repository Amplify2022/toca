-- Shared across API instances. Keys contain hashes, never raw IPs, emails or tokens.
-- One reusable row per key; expired rows are also purged by AuthRateLimiter.
CREATE TABLE auth_rate_bucket (
    scope VARCHAR(48) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (scope, key_hash)
);
CREATE INDEX auth_rate_bucket_expiry_idx ON auth_rate_bucket(expires_at);

-- The former per-email failure history must not lock a mailbox for every IP.
-- Keep the table for migration compatibility; the new limiter no longer writes it.
DELETE FROM customer_login_failure;
