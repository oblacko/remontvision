CREATE TABLE IF NOT EXISTS search_jobs (
  id            TEXT PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'photo',
  render_id     TEXT REFERENCES renders(id) ON DELETE CASCADE,
  photo_path    TEXT,
  mode          TEXT NOT NULL DEFAULT 'A',
  status        TEXT NOT NULL DEFAULT 'queued',
  stage         TEXT,
  error         TEXT,
  photo_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  vision_raw    JSONB,
  prompts       JSONB NOT NULL DEFAULT '{}'::jsonb,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_search_jobs_user ON search_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS search_objects (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  idx             INT NOT NULL DEFAULT 0,
  category        TEXT,
  label           TEXT NOT NULL,
  description     TEXT,
  color           TEXT,
  material        TEXT,
  style           TEXT,
  hex             TEXT,
  size            TEXT,
  search_query    TEXT,
  bbox            JSONB,
  confidence      DOUBLE PRECISION,
  visibility      TEXT NOT NULL DEFAULT 'seen',
  thumbnail_path  TEXT,
  thumbnail_mode  TEXT,
  cell_check      JSONB,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_objects_job ON search_objects (job_id, idx);

CREATE TABLE IF NOT EXISTS search_results (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object_id       BIGINT NOT NULL REFERENCES search_objects(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'text',
  provider        TEXT NOT NULL DEFAULT 'yandex',
  store           TEXT,
  canonical_url   TEXT NOT NULL,
  title           TEXT,
  image_url       TEXT,
  image_path      TEXT,
  price           NUMERIC,
  currency        TEXT NOT NULL DEFAULT 'RUB',
  match_score     DOUBLE PRECISION,
  score_breakdown JSONB,
  checked_at      TIMESTAMPTZ,
  raw             JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_id, canonical_url)
);
CREATE INDEX IF NOT EXISTS idx_search_results_object ON search_results (object_id, match_score DESC);

CREATE TABLE IF NOT EXISTS search_steps (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  object_id  BIGINT REFERENCES search_objects(id) ON DELETE CASCADE,
  step       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'running',
  input      JSONB,
  output     JSONB,
  prompt     TEXT,
  cost_usd   DOUBLE PRECISION,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_steps_job ON search_steps (job_id, created_at);

CREATE TABLE IF NOT EXISTS search_cache (
  object_id    BIGINT NOT NULL REFERENCES search_objects(id) ON DELETE CASCADE,
  filters_hash TEXT NOT NULL,
  payload      JSONB NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (object_id, filters_hash)
);

CREATE TABLE IF NOT EXISTS search_prompts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT NOT NULL,
  version    INT NOT NULL,
  prompt     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

CREATE TABLE IF NOT EXISTS search_clicks (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  result_id  BIGINT NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_clicks_result ON search_clicks (result_id, created_at DESC);
