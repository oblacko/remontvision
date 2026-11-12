-- Асинхронная очистка комнаты при первом enqueue (keep_furniture=false).
-- Статус живёт на комнате, shell переиспользуется всеми рендерами.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_status TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_error TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_started_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_finished_at TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleanup_cost_usd NUMERIC;
CREATE INDEX IF NOT EXISTS idx_rooms_cleanup_status ON rooms (cleanup_status)
  WHERE cleanup_status IS NOT NULL;
