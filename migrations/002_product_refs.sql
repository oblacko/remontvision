-- 002: каталог под референсы в генерацию
-- style_tags: теги стиля через запятую ('современный,тёмный') для отбора под стиль комнаты
-- image_path: локально загруженное фото товара (data/products/), приоритет над image_url
ALTER TABLE products ADD COLUMN IF NOT EXISTS style_tags TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_path TEXT;
