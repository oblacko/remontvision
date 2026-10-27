-- 009: тип комнаты для корректного набора товаров и промпта.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type TEXT;
