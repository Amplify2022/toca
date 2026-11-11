-- Preserve visibility for existing venues. New registrations explicitly start unpublished.
ALTER TABLE venue ADD COLUMN published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE venue ADD COLUMN registration_id UUID;
ALTER TABLE venue ADD CONSTRAINT venue_owner_registration_unique UNIQUE(owner_id,registration_id);
