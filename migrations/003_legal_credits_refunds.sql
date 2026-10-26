-- 003: версии документов и журнал акцептов, учёт кредитов по рендерам,
-- доказательства оказания услуги, возвраты и чеки.

-- ---------- версии юридических документов ----------
CREATE TABLE IF NOT EXISTS legal_docs (
  document     TEXT NOT NULL,
  version      TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  url          TEXT NOT NULL,
  PRIMARY KEY (document, version)
);

INSERT INTO legal_docs (document, version, published_at, url) VALUES
  ('offer',       '2026-10-26.2', now(), '/offer'),
  ('privacy',     '2026-10-26.2', now(), '/privacy'),
  ('cross_border','2026-10-26.2', now(), '/privacy#cross-border')
ON CONFLICT (document, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document     TEXT NOT NULL,
  version      TEXT NOT NULL,
  context      TEXT NOT NULL,            -- signup | login | payment
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip           INET,
  user_agent   TEXT,
  payment_id   BIGINT REFERENCES payments(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_accept_user ON legal_acceptances (user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_accept_doc ON legal_acceptances (document, version);

-- ---------- кредиты: привязка списания к конкретному рендеру ----------
ALTER TABLE credit_txn ADD COLUMN IF NOT EXISTS render_id TEXT;
ALTER TABLE credit_txn ADD COLUMN IF NOT EXISTS note TEXT;
CREATE INDEX IF NOT EXISTS idx_credit_txn_render ON credit_txn (render_id);
-- восстановление по одному рендеру ровно один раз
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_refund_once
  ON credit_txn (render_id) WHERE reason = 'iterate_refund';

-- ---------- доказательства оказания услуги ----------
ALTER TABLE renders ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS error_stage TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS request_ip INET;

-- ---------- актуальность цен ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- возвраты ----------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_kopecks INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS refunds (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id         BIGINT NOT NULL REFERENCES payments(id),
  provider_refund_id TEXT UNIQUE,
  amount_kopecks     INT NOT NULL,
  credits            INT NOT NULL DEFAULT 0,
  method             TEXT NOT NULL DEFAULT 'yukassa', -- yukassa | manual
  status             TEXT NOT NULL DEFAULT 'created', -- created | pending | succeeded | canceled | manual
  reason             TEXT,
  payload            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds (payment_id, created_at DESC);

-- ---------- чеки самозанятого ----------
CREATE TABLE IF NOT EXISTS receipts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id          BIGINT NOT NULL REFERENCES payments(id),
  provider            TEXT NOT NULL DEFAULT 'webhook',
  provider_receipt_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | sent | error
  payload             JSONB NOT NULL DEFAULT '{}',
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts (payment_id, created_at DESC);
