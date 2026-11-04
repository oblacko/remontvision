-- Дерево категорий поставщика и ссылка оффера на категорию.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS supplier_category_id TEXT;
CREATE INDEX IF NOT EXISTS idx_offers_supplier_category
  ON offers (supplier_category_id);

CREATE TABLE IF NOT EXISTS categories (
  feed_id            BIGINT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id        TEXT NOT NULL,
  name               TEXT NOT NULL,
  parent_external_id TEXT,
  path               TEXT,
  internal_category  TEXT,
  PRIMARY KEY (feed_id, external_id)
);
