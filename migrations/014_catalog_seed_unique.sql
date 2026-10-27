-- 014: обычный уникальный индекс по seed_key (NULL не конфликтуют между собой).
-- Нужен для ON CONFLICT (seed_key) в идемпотентном сиде каталога.
DROP INDEX IF EXISTS idx_products_seed_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_seed_key ON products (seed_key);
