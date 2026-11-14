-- A credit is charged only when the request has succeeded, never on admission.
ALTER TABLE customer_token_entry DROP CONSTRAINT customer_token_entry_kind_check;
ALTER TABLE customer_token_entry DROP CONSTRAINT customer_token_entry_check;
ALTER TABLE customer_token_entry ADD CONSTRAINT customer_token_entry_kind_check
    CHECK (kind IN ('TOPUP','RESERVE','RELEASE','SPEND'));
ALTER TABLE customer_token_entry ADD CONSTRAINT customer_token_entry_check CHECK (
    (kind='TOPUP' AND amount IN (5,12,30) AND command_id IS NULL AND idempotency_key IS NOT NULL)
    OR (kind IN ('RESERVE','SPEND') AND amount=-1 AND idempotency_key IS NULL)
    OR (kind='RELEASE' AND amount=1 AND idempotency_key IS NULL));

-- Return unconfirmed debits from the previous implementation. Keep the audit
-- entries; their reversal preserves the ledger without inventing new credits.
UPDATE customer_wallet w SET balance=w.balance+r.amount,updated_at=now()
FROM (SELECT h.customer_id,sum(h.amount)::integer AS amount
      FROM customer_token_hold h WHERE h.status='RESERVED'
      GROUP BY h.customer_id) r WHERE w.customer_id=r.customer_id;
INSERT INTO customer_token_entry(id,customer_id,kind,amount,command_id)
SELECT gen_random_uuid(),h.customer_id,'RELEASE',h.amount,h.command_id
FROM customer_token_hold h WHERE h.status='RESERVED'
ON CONFLICT(command_id,kind) DO NOTHING;
UPDATE customer_token_hold SET status='RELEASED' WHERE status='RESERVED';

-- An old, unconfirmed remote plan must not run concurrently with a new one.
-- An explicit customer retry can prepare it afresh under the new rules.
UPDATE request_command SET status='FAILED',action='RETRY_AFTER_UPDATE',
    error='El pedido anterior no se confirmó. Tu saldo está intacto.',updated_at=now()
WHERE status IN ('PENDING','PREPARING','APPLYING','UNCERTAIN');
ALTER TABLE request_command ADD COLUMN playback_attempted BOOLEAN NOT NULL DEFAULT false;
