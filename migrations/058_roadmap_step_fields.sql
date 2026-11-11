-- Шаг роадмапа — не просто строка: приоритет и кто выполняет/проверяет.
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS who TEXT;
