-- 017: габариты и формат товара для промта и проверок масштаба.
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions JSONB NOT NULL DEFAULT '{}'::jsonb;
