ALTER TABLE admin_user ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE admin_user ADD COLUMN google_sub VARCHAR(255) UNIQUE;
ALTER TABLE admin_user ADD CONSTRAINT admin_user_login_method
    CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
