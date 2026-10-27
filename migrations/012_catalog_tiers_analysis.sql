-- 012: классы материалов, слоты каталога, метаданные и разбор рендера.
-- Бюджет-сумма больше не управляет подбором: основной выбор — класс материалов.

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tier TEXT NOT NULL DEFAULT 'comfort';
ALTER TABLE products ADD COLUMN IF NOT EXISTS room_types TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS surface TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seed_key TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_seed_key ON products (seed_key);
CREATE INDEX IF NOT EXISTS idx_products_active_category ON products (active, category);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price_tier TEXT NOT NULL DEFAULT 'comfort';

ALTER TABLE renders ADD COLUMN IF NOT EXISTS edit_target TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS ref_path TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS ref_product_id BIGINT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
ALTER TABLE renders ADD COLUMN IF NOT EXISTS analysis JSONB;
