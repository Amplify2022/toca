-- Federated customer identities are separate from bar administrator accounts.
-- Google-only customers have no local password. Existing customer rows are preserved.
ALTER TABLE customer_account ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE customer_account ADD COLUMN google_sub VARCHAR(255);
ALTER TABLE customer_account ADD CONSTRAINT customer_account_google_sub_unique UNIQUE (google_sub);
ALTER TABLE customer_account ADD CONSTRAINT customer_account_identity_required
    CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
