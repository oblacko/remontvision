-- Наличие товара из JSON-LD/микроразметки карточки (in_stock/out_of_stock/preorder/unknown).
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS availability TEXT;

-- Уточнённая цена и наличие проверяются отдельным парсером страницы.
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS price_source TEXT;
