-- 045: исходник правки может быть подготовленным изображением (перенос объекта).
ALTER TABLE renders ADD COLUMN IF NOT EXISTS edit_source_path TEXT;
