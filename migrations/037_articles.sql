-- 037: lookbook-статьи (контент-движок: рендер + палитра + товары Hoff).
CREATE TABLE IF NOT EXISTS articles (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  style        TEXT,
  room_type    TEXT,
  tier         TEXT,
  cover_path   TEXT,
  palette      JSONB NOT NULL DEFAULT '[]'::jsonb,
  body         JSONB NOT NULL DEFAULT '{}'::jsonb,
  products     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, published_at DESC);
