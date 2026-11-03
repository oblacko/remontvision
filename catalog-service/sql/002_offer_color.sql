-- Цветовой дескриптор оффера для цветового re-rank поверх DINOv2.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS color_hist real[];
