-- Аренда обработки рендера: воркер продлевает lease, пока рендер жив.
-- Reaper и requeue трогают только задачи с истёкшим lease, поэтому вторая
-- реплика не крадёт in-flight работу у живой.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Очередь: claim ищет самый старый queued-рендер; без этого индекса — seq scan + sort.
CREATE INDEX IF NOT EXISTS idx_renders_queue ON renders (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_renders_lease ON renders (lease_expires_at) WHERE status = 'processing';

-- Уже обрабатываемые строки получают lease, чтобы rolling deploy не считал их зависшими.
UPDATE renders
SET lease_expires_at = now() + interval '5 minutes'
WHERE status = 'processing' AND lease_expires_at IS NULL;
