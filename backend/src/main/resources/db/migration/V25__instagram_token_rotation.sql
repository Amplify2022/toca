CREATE TABLE instagram_discovery_credential (
    credential_id CHAR(64) PRIMARY KEY,
    token_ciphertext TEXT,
    expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_id UUID,
    CHECK ((token_ciphertext IS NULL) = (expires_at IS NULL))
);
