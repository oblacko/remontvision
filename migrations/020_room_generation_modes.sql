-- 020: режимы генерации — сохранять мебель и использовать каталог.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS keep_furniture BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS use_catalog BOOLEAN NOT NULL DEFAULT true;
