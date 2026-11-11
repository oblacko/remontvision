-- Кэш дорогих AI-шагов с TTL (пока — design_direction).
-- Ключ — стабильная строка (стиль|концепт|комната|размеры|версия промта),
-- значение — JSON с массивом вариантов.
CREATE TABLE IF NOT EXISTS generation_cache (
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

CREATE INDEX IF NOT EXISTS idx_generation_cache_age ON generation_cache (created_at);
