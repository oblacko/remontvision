-- 064: updated_at у lookbook-статей — сигнал dateModified для SEO (аудит 09.11.2026, §6.2 #12/#17).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE articles SET updated_at = COALESCE(published_at, created_at) WHERE updated_at IS NULL;
