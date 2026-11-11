-- Аренда: миграция добавляет владельца claim и бэкфиллит lease у уже
-- обрабатываемых строк, чтобы rolling deploy не переоткрыл их как просроченные.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS claimed_by TEXT;

UPDATE renders
SET lease_expires_at = now() + interval '5 minutes'
WHERE status = 'processing' AND lease_expires_at IS NULL;
