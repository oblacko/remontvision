-- 021: пустой каркас (очистка комнаты) для двухстадийной генерации.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS shell_path TEXT;
