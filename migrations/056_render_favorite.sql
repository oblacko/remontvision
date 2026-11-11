-- Избранное: отметка дизайна в кабинете.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_renders_favorite ON renders (room_id) WHERE is_favorite;
