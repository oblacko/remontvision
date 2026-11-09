-- 043: биллинг v2 — пакеты 10/20/60, модели рендера как данные, флаги рендеров.
-- Цены пакетов не меняются: меняется только количество кредитов в пакете.

UPDATE credit_packs SET credits = 10, updated_at = now() WHERE id = 'room';
UPDATE credit_packs SET credits = 20, updated_at = now() WHERE id = 'flat';
UPDATE credit_packs SET credits = 60, updated_at = now() WHERE id = 'house';

-- Модели генерации: владелец добавляет и редактирует их через админку.
CREATE TABLE IF NOT EXISTS render_models (
  id                    TEXT PRIMARY KEY,
  label                 TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  credits               INT NOT NULL DEFAULT 1 CHECK (credits >= 1),
  art_direction_enabled BOOLEAN NOT NULL DEFAULT true,
  active                BOOLEAN NOT NULL DEFAULT true,
  sort                  INT NOT NULL DEFAULT 0
);

-- Стартовая модель — текущий дефолт из modelconfig.js, чтобы пикер работал сразу.
INSERT INTO render_models (id, label, model_id, credits, art_direction_enabled, active, sort)
VALUES ('flux-3-image', 'FLUX 3 Image', 'black-forest-labs/flux-3-image', 1, true, true, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS root_render_id text,
  ADD COLUMN IF NOT EXISTS model_key text,
  ADD COLUMN IF NOT EXISTS model_credits int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Лимит бесплатных правок считается по корневому дизайну.
CREATE INDEX IF NOT EXISTS idx_renders_root ON renders (root_render_id);

-- Бэкфилл старых цепочек: корень = строка без parent, потомки наследуют id корня.
WITH RECURSIVE render_trees AS (
  SELECT id, id AS root_id
  FROM renders
  WHERE parent_render_id IS NULL
  UNION ALL
  SELECT child.id, tree.root_id
  FROM renders child
  JOIN render_trees tree ON child.parent_render_id = tree.id
)
UPDATE renders
SET root_render_id = render_trees.root_id
FROM render_trees
WHERE renders.id = render_trees.id;
