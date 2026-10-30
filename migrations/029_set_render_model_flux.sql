-- 029: зафиксировать FLUX 3 Image 1K как рабочую модель после прогона 10 сценариев.
-- Значение хранится в app_settings; админка может переопределить его позже.
INSERT INTO app_settings (key, value) VALUES
  ('model.render', 'black-forest-labs/flux-3-image'),
  ('model.resolution', '1K'),
  ('model.aspect_ratio', 'auto')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
