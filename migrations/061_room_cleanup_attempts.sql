-- Счётчик попыток очистки: transient-ошибка не должна навсегда отключать cleanup,
-- но и бесконечно платить за неё нельзя.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_attempts INT NOT NULL DEFAULT 0;
