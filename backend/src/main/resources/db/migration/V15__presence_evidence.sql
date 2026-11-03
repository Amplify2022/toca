-- Bind NEARBY access to the server-issued venue QR generation. Existing
-- location-only grants intentionally remain invalid until the customer scans
-- the current QR. Token rotation revokes grants without storing the QR secret.
ALTER TABLE venue_customer_presence ADD COLUMN qr_token_hash CHAR(64);
