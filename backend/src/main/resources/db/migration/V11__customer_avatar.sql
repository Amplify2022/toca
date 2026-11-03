-- Private, account-owned user avatar. Uploaded JPEGs are resized in browser and
-- revalidated and hard-capped by the API; no arbitrary client-supplied paths.
ALTER TABLE customer_account
  ADD COLUMN avatar_image BYTEA,
  ADD COLUMN avatar_content_type VARCHAR(20);
