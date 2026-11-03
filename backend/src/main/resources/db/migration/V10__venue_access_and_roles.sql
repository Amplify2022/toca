-- TOCÁ v1.8.27: venue request access policy and explicit account roles.
-- Existing credentials and sessions are intentionally preserved.
ALTER TABLE venue ADD COLUMN request_access_mode VARCHAR(12) NOT NULL DEFAULT 'NEARBY'
    CONSTRAINT venue_request_access_mode_check CHECK (request_access_mode IN ('NEARBY','ANYWHERE'));

-- Short-lived proximity check-in. Raw GPS coordinates are NOT stored.
CREATE TABLE venue_customer_presence (
    venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(venue_id, customer_id)
);
CREATE INDEX venue_customer_presence_expiry_idx ON venue_customer_presence(expires_at);

-- Separate principals prevent an email match from ever granting admin access.
-- Both tables retain their established passwords/sessions. A future verified
-- account-linking flow can unify identities without unsafe automatic merging.
CREATE TABLE account_role (
    admin_user_id UUID REFERENCES admin_user(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customer_account(id) ON DELETE CASCADE,
    role VARCHAR(24) NOT NULL CHECK (role IN ('CUSTOMER', 'VENUE_ADMIN')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT account_role_exactly_one_subject CHECK (
        (admin_user_id IS NOT NULL AND customer_id IS NULL) OR
        (admin_user_id IS NULL AND customer_id IS NOT NULL)
    ),
    CONSTRAINT account_role_subject_role CHECK (
        (admin_user_id IS NOT NULL AND role='VENUE_ADMIN') OR
        (customer_id IS NOT NULL AND role='CUSTOMER')
    )
);
CREATE UNIQUE INDEX account_role_admin_uniq ON account_role(admin_user_id, role)
    WHERE admin_user_id IS NOT NULL;
CREATE UNIQUE INDEX account_role_customer_uniq ON account_role(customer_id, role)
    WHERE customer_id IS NOT NULL;
INSERT INTO account_role(admin_user_id,role)
    SELECT id,'VENUE_ADMIN' FROM admin_user;
INSERT INTO account_role(customer_id,role)
    SELECT id,'CUSTOMER' FROM customer_account;
