-- Private account photo, separate from the public venue gallery.
ALTER TABLE admin_user
  ADD COLUMN avatar_image BYTEA,
  ADD COLUMN avatar_content_type VARCHAR(20);
