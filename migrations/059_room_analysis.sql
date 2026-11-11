-- Кэш анализа комнаты: размеры, мебель, ремонт, арт-направление и layout.
-- Инвалидация — по cache_key (фото/стиль/концепт/keepFurniture/размеры).
CREATE TABLE IF NOT EXISTS room_analysis (
  room_id    TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  cache_key  TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
