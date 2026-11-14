-- Existing and new customers start at zero. Never import browser demo balances.
CREATE TABLE customer_wallet (
    customer_id UUID PRIMARY KEY REFERENCES customer_account(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 1000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_token_hold (
    command_id UUID PRIMARY KEY REFERENCES request_command(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount = 1),
    status VARCHAR(10) NOT NULL CHECK (status IN ('RESERVED','CAPTURED','RELEASED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_token_hold_owner ON customer_token_hold(customer_id,status);
CREATE TABLE customer_token_entry (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('TOPUP','RESERVE','RELEASE')),
    amount INTEGER NOT NULL,
    command_id UUID REFERENCES request_command(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(100),
    pack_id VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((kind='TOPUP' AND amount IN (5,12,30) AND command_id IS NULL AND idempotency_key IS NOT NULL)
        OR (kind='RESERVE' AND amount=-1 AND idempotency_key IS NULL)
        OR (kind='RELEASE' AND amount=1 AND idempotency_key IS NULL)),
    UNIQUE(customer_id,idempotency_key),
    UNIQUE(command_id,kind)
);
CREATE INDEX customer_token_entry_owner ON customer_token_entry(customer_id,created_at DESC,id);
