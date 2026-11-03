-- Horario comercial opcional mostrado en las tarjetas y ficha pública.
ALTER TABLE venue ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(180);
