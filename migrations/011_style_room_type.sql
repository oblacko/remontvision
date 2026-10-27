-- 011: референсы и избранные товары стиля можно привязать к типу комнаты.
ALTER TABLE style_references ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE style_products ADD COLUMN IF NOT EXISTS room_type TEXT;
