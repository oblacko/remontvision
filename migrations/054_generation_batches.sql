-- Пакет генерации: один запуск пользователя (например, «3 варианта») и его исходы.
-- До этого варианты хранились только как renders одной комнаты, и кабинет показывал
-- их как правки одного дизайна. batch_id связывает варианты, созданные вместе.
CREATE TABLE IF NOT EXISTS generation_batches (
  id               TEXT PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id),
  room_id          TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  tier             TEXT,
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_idempotency
  ON generation_batches (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_room ON generation_batches (room_id);

ALTER TABLE renders ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES generation_batches(id);
ALTER TABLE renders ADD COLUMN IF NOT EXISTS reserved_credits INT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS cost_final_usd NUMERIC;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS breakdown_stale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS breakdown_stale_at TIMESTAMPTZ;
-- Публикация в статьях: по умолчанию разрешена, «приватно» отключает.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS publish_consent BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS public_prompt TEXT;

-- Старые данные: пакет на группу корневых рендеров одной комнаты.
INSERT INTO generation_batches (id, user_id, room_id, tier, created_at)
SELECT gen_random_uuid()::text, r.user_id, r.id, NULL, MIN(rd.created_at)
FROM rooms r
JOIN renders rd ON rd.room_id = r.id AND rd.parent_render_id IS NULL
GROUP BY r.id, r.user_id;

UPDATE renders rd
SET batch_id = b.id
FROM generation_batches b
WHERE rd.room_id = b.room_id
  AND rd.parent_render_id IS NULL
  AND rd.batch_id IS NULL;
