ALTER TABLE customer_account ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE admin_user ADD COLUMN email_verified_at TIMESTAMPTZ;
CREATE TABLE account_action (
 token_hash CHAR(64) PRIMARY KEY, kind VARCHAR(10) NOT NULL CHECK(kind IN ('customer','admin')),
 account_id UUID NOT NULL, purpose VARCHAR(10) NOT NULL CHECK(purpose IN ('reset','verify')),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_action_expiry ON account_action(expires_at);
CREATE TABLE customer_favorite (
 customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
 venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
 PRIMARY KEY(customer_id,venue_id)
);
