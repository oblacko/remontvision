-- Кэш анализа комнаты разносим по артефактам (facts/layout/art), у каждого свой
-- cache_key, чтобы смена стиля не инвалидировала style-независимые шаги (repair/layout).
ALTER TABLE room_analysis DROP CONSTRAINT IF EXISTS room_analysis_pkey;
ALTER TABLE room_analysis ADD COLUMN IF NOT EXISTS artifact TEXT NOT NULL DEFAULT 'all';
ALTER TABLE room_analysis ADD PRIMARY KEY (room_id, artifact);
