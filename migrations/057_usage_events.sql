-- События воронки: загрузка, настройки, запуск, результат, документы, товары, покупка.
-- Минимальная замена «нет аналитики»: без внешних сервисов, запросы только агрегатом.
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  props      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_name_created ON usage_events (name, created_at DESC);
