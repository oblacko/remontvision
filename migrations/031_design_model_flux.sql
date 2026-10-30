-- 031: вернуть FLUX 3 Image 1K как модель дизайна.
-- Klein — модель очистки/локальных правок; она даёт плоский и геометрически неточный дизайн.
-- Админка может переопределить значение позже; jobs.js дополнительно не даст использовать Klein для дизайна.
INSERT INTO app_settings (key, value) VALUES
  ('model.render', 'black-forest-labs/flux-3-image'),
  ('model.resolution', '1K'),
  ('model.aspect_ratio', 'auto')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
