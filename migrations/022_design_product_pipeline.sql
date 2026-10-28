ALTER TABLE render_items ADD COLUMN IF NOT EXISTS presentation_status TEXT NOT NULL DEFAULT 'curated';
UPDATE render_items SET presentation_status = 'matched' WHERE match_score IS NOT NULL AND presentation_status = 'curated';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS notice TEXT;
