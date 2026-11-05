CREATE TABLE IF NOT EXISTS architect_prompts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT NOT NULL,
  version    INT NOT NULL,
  system     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

CREATE INDEX IF NOT EXISTS idx_architect_prompts_kind ON architect_prompts (kind, version DESC);
