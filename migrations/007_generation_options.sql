-- 007: цветовая схема, акцент и референс стиля для генерации.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS palette TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS accent TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS style_ref_path TEXT;
