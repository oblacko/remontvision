CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS feeds (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  url            TEXT NOT NULL,
  format         TEXT NOT NULL DEFAULT 'yml',
  adapter        TEXT NOT NULL DEFAULT 'pampadu_yml',
  active         BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  offer_count    INT NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id            UUID PRIMARY KEY,
  feed_id       BIGINT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,
  merchant      TEXT,
  category      TEXT,
  category_raw  TEXT,
  name          TEXT NOT NULL,
  vendor        TEXT,
  model         TEXT,
  description   TEXT,
  price         NUMERIC,
  old_price     NUMERIC,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  availability  TEXT NOT NULL DEFAULT 'unknown',
  picture_url   TEXT,
  picture_path  TEXT,
  canonical_url TEXT,
  affiliate_url TEXT,
  erid          TEXT,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'active',
  content_hash  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_offers_category ON offers (category);
CREATE INDEX IF NOT EXISTS idx_offers_params ON offers USING gin (params);

CREATE TABLE IF NOT EXISTS offer_embeddings (
  offer_id   UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  dim        INT NOT NULL,
  embedding  vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, model)
);
CREATE INDEX IF NOT EXISTS idx_offer_embeddings_hnsw
  ON offer_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id          BIGSERIAL PRIMARY KEY,
  feed_id     BIGINT REFERENCES feeds(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  processed   INT NOT NULL DEFAULT 0,
  total       INT NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
