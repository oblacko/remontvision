-- 016: публичные ссылки на дизайн, лайки и комментарии.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_renders_share_token ON renders (share_token) WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS render_likes (
  id BIGSERIAL PRIMARY KEY,
  render_id TEXT NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  visitor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (render_id, visitor)
);

CREATE TABLE IF NOT EXISTS render_comments (
  id BIGSERIAL PRIMARY KEY,
  render_id TEXT NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  name TEXT,
  text TEXT NOT NULL,
  visitor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_render_comments_render ON render_comments (render_id, created_at DESC);
