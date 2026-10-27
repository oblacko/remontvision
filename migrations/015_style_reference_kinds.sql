-- 015: референсы стилей: тип, источник, approve, score, seed.
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS seed_key TEXT;
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS score JSONB;
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS product_ids TEXT;
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_style_references_seed_key ON style_references (seed_key);
CREATE INDEX IF NOT EXISTS idx_style_references_lookup ON style_references (style_id, room_type, approved, sort);
