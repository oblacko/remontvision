-- Фильтр фида по поддереву категорий (например, только «Спальня»).
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS root_category_id TEXT;
