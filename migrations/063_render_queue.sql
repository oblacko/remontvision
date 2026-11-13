-- Две очереди рендеров: правки ('edit') обслуживаются раньше базовых ('base').
-- Правка платит за фикс и не должна ждать за чужим базовым рендером.
-- Существующие строки получают 'base' дефолтом.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS queue TEXT NOT NULL DEFAULT 'base'
  CHECK (queue IN ('base', 'edit'));

-- Частичный индекс обслуживает claim по (queue, created_at) среди queued-строк:
-- сначала старейшая правка, затем старейшая база.
CREATE INDEX IF NOT EXISTS idx_renders_queue_claim ON renders (queue, created_at) WHERE status = 'queued';
