-- Векторный каталог из CPA-фидов: партнёрская ссылка и маркировка рекламы.
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS affiliate_url TEXT;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS erid TEXT;
