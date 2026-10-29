CREATE TABLE IF NOT EXISTS procurement_runs (
  id              TEXT PRIMARY KEY,
  render_id       TEXT NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_type       TEXT,
  mode            TEXT NOT NULL DEFAULT 'list',
  region          TEXT,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_hash     TEXT NOT NULL,
  analysis        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'queued',
  stage           TEXT,
  error           TEXT,
  cost_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
  credit_charged  BOOLEAN NOT NULL DEFAULT false,
  credit_refunded BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_procurement_runs_user ON procurement_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_runs_render ON procurement_runs (render_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_runs_active
  ON procurement_runs (render_id, config_hash)
  WHERE status IN ('queued','processing','done');

CREATE TABLE IF NOT EXISTS procurement_items (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES procurement_runs(id) ON DELETE CASCADE,
  layer              TEXT NOT NULL,
  category           TEXT NOT NULL,
  label              TEXT NOT NULL,
  query              TEXT,
  search_mode        TEXT NOT NULL DEFAULT 'text',
  status             TEXT NOT NULL DEFAULT 'pending',
  sort               INT NOT NULL DEFAULT 0,
  attributes         JSONB NOT NULL DEFAULT '{}'::jsonb,
  bbox               JSONB,
  crop_path          TEXT,
  visibility         TEXT,
  confidence         DOUBLE PRECISION,
  quantity           NUMERIC,
  unit               TEXT,
  measurement_status TEXT,
  candidate_count    INT NOT NULL DEFAULT 0,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_items_run ON procurement_items (run_id, sort);

CREATE TABLE IF NOT EXISTS procurement_search_rounds (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id           BIGINT NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  round_no          INT NOT NULL DEFAULT 1,
  kind              TEXT NOT NULL DEFAULT 'text',
  provider          TEXT NOT NULL DEFAULT 'yandex',
  query             TEXT NOT NULL,
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  results_count     INT NOT NULL DEFAULT 0,
  best_score        DOUBLE PRECISION,
  decision          TEXT,
  cost_usd          DOUBLE PRECISION,
  latency_ms        INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_rounds_item ON procurement_search_rounds (item_id, round_no);

CREATE TABLE IF NOT EXISTS procurement_candidates (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id         BIGINT NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  round_id        BIGINT REFERENCES procurement_search_rounds(id) ON DELETE SET NULL,
  provider        TEXT NOT NULL DEFAULT 'yandex',
  store           TEXT,
  canonical_url   TEXT NOT NULL,
  title           TEXT,
  image_url       TEXT,
  image_path      TEXT,
  price           NUMERIC,
  currency        TEXT NOT NULL DEFAULT 'RUB',
  availability    TEXT,
  sku             TEXT,
  dimensions      JSONB,
  checked_at      TIMESTAMPTZ,
  match_score     DOUBLE PRECISION,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_reasons   JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected        BOOLEAN NOT NULL DEFAULT false,
  raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_candidates_url ON procurement_candidates (item_id, canonical_url);
CREATE INDEX IF NOT EXISTS idx_procurement_candidates_item ON procurement_candidates (item_id, match_score DESC);

CREATE TABLE IF NOT EXISTS procurement_clicks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES procurement_runs(id) ON DELETE CASCADE,
  item_id      BIGINT REFERENCES procurement_items(id) ON DELETE SET NULL,
  candidate_id BIGINT REFERENCES procurement_candidates(id) ON DELETE SET NULL,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip_hash      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_clicks_run ON procurement_clicks (run_id, created_at DESC);

ALTER TABLE credit_txn ADD COLUMN IF NOT EXISTS procurement_run_id TEXT REFERENCES procurement_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_credit_txn_procurement ON credit_txn (procurement_run_id);
