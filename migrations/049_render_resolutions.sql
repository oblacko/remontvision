-- 047: резолюции рендера (2K/4K) и цены за них.
-- resolution_prices: карта «резолюция модели → кредиты», редактируется в админке.
-- renders.resolution: выбранная резолюция конкретного рендера (NULL = дефолт модели).
ALTER TABLE render_models ADD COLUMN resolution_prices jsonb;
ALTER TABLE renders ADD COLUMN resolution text;
