-- 019: клики по товарам из сметы (для заказа/рефералки).
CREATE TABLE IF NOT EXISTS product_clicks (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  render_id TEXT REFERENCES renders(id) ON DELETE SET NULL,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_clicks_product ON product_clicks (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_clicks_render ON product_clicks (render_id);
