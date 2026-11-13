-- NULL means a legacy connection whose granted permissions were not recorded.
-- Do not infer a grant from the scopes requested by the application.
ALTER TABLE venue ADD COLUMN spotify_scopes TEXT;
