-- 042_oauth_states: одноразовые state для OAuth-редиректов (Яндекс и будущие провайдеры).
-- В строке храним и согласия, данные до callback: иначе после редиректа их негде взять.

CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  consents    JSONB NOT NULL DEFAULT '{}'::jsonb,
  redirect_to TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states (expires_at);
