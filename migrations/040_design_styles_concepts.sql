-- 040: дизайнер «стиль × концепт» из designer-agent-instruction-v1.
-- 10 канонических стилей заменяют старый кураторский набор; старые скрываются
-- (active=false), чтобы не ломать старые комнаты и рендеры.

-- rooms: выбранная концепция и собранное направление
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS concept_key TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design_direction JSONB;

-- Канонизируем существующие строки по названию, чтобы не плодить дубли.
UPDATE styles SET key = 'scandinavian' WHERE name = 'Скандинавский' AND key <> 'scandinavian';
UPDATE styles SET key = 'japandi' WHERE name = 'Джапанди' AND key <> 'japandi';
UPDATE styles SET key = 'loft' WHERE name = 'Лофт' AND key <> 'loft';
UPDATE styles SET key = 'neoclassic' WHERE name = 'Неоклассика' AND key <> 'neoclassic';
UPDATE styles SET key = 'art_deco' WHERE name = 'Ар-деко' AND key <> 'art_deco';
UPDATE styles SET key = 'mediterranean', name = 'Средиземноморский' WHERE key = 'mediterranean' AND name <> 'Средиземноморский';
UPDATE styles SET key = 'eco', name = 'Эко / органический модерн' WHERE key = 'organic';

-- 10 канонических стилей.
INSERT INTO styles (key, name, accent, prompt_description, description, swatches, active, sort) VALUES
  ('minimalism', 'Современный минимализм', 'sand',
   'modern minimalism interior, warm off-white and greige palette, matte MDF, microcement, glass, hidden profiles, calm neutral, soft diffuse daylight',
   'Чистые линии, тёплые нейтрали, матовые поверхности и скрытый профиль',
   '[{"hex":"#F5F3EF","name":"основной"},{"hex":"#C9C4BB","name":"поддерживающий"},{"hex":"#2E2E2C","name":"тёмный"},{"hex":"#B7A99A","name":"акцент"}]', true, 10),
  ('scandinavian', 'Скандинавский', 'dust',
   'scandinavian interior, light oak, white walls, natural linen, wool, ceramic, soft natural daylight, functional minimalism, warm and airy',
   'Светлый дуб, лён, шерсть и много естественного света',
   '[{"hex":"#FAF8F4","name":"основной"},{"hex":"#D8CFC2","name":"поддерживающий"},{"hex":"#8A9A8B","name":"тёмный"},{"hex":"#C26D5A","name":"акцент"}]', true, 20),
  ('japandi', 'Джапанди', 'forest',
   'japandi interior, warm minimalism, natural oak, dark walnut, rice paper, linen, wabi-sabi, calm earthy palette, tactile materials',
   'Тёплый минимализм, дуб и орех, рисовая бумага и лён',
   '[{"hex":"#EDE8DF","name":"основной"},{"hex":"#B9B0A2","name":"поддерживающий"},{"hex":"#4A4A45","name":"тёмный"},{"hex":"#7A8377","name":"акцент"}]', true, 30),
  ('loft', 'Лофт', 'graphite',
   'industrial loft, exposed brick and concrete, black metal, warm wood, leather, large windows, raw tactile textures',
   'Кирпич, бетон, чёрный металл и кожа',
   '[{"hex":"#B0A89A","name":"основной"},{"hex":"#6E6A63","name":"поддерживающий"},{"hex":"#4A4640","name":"тёмный"},{"hex":"#A8563A","name":"акцент"}]', true, 40),
  ('neoclassic', 'Неоклассика', 'sand',
   'neoclassical interior, chevron parquet, wall moldings, warm neutrals, subtle brass, velvet, timeless proportions',
   'Паркет ёлочкой, лепной карниз, латунь и бархат',
   '[{"hex":"#F2EDE4","name":"основной"},{"hex":"#D6CCBA","name":"поддерживающий"},{"hex":"#9A8F7D","name":"тёмный"},{"hex":"#1F3A5F","name":"акцент"}]', true, 50),
  ('eco', 'Эко / органический модерн', 'forest',
   'organic modern interior, linen, rattan, natural stone, living greenery, warm earthy palette, tactile materials, wellness mood',
   'Лён, ратанг, натуральный камень и живая зелень',
   '[{"hex":"#EAE4D8","name":"основной"},{"hex":"#C8B89A","name":"поддерживающий"},{"hex":"#7C8A6E","name":"тёмный"},{"hex":"#A4713E","name":"акцент"}]', true, 60),
  ('dark_contemporary', 'Тёмный контемпорари', 'graphite',
   'dark contemporary interior, smoked oak veneer, graphite, brass, dark stone, moody layered lighting, dramatic contrast',
   'Дымчатый дуб, графит, латунь и тёмный камень',
   '[{"hex":"#232323","name":"основной"},{"hex":"#3A3A38","name":"поддерживающий"},{"hex":"#1A1A19","name":"тёмный"},{"hex":"#C9A227","name":"акцент"}]', true, 70),
  ('art_deco', 'Ар-деко', 'terra',
   'art deco interior, geometric inlay, velvet, marble, gold, rich jewel tones, glamorous, symmetrical composition',
   'Геометричная интарсия, бархат, мрамор и золото',
   '[{"hex":"#EFE8DB","name":"основной"},{"hex":"#C9A961","name":"поддерживающий"},{"hex":"#1E2A38","name":"тёмный"},{"hex":"#6E3B3B","name":"акцент"}]', true, 80),
  ('mediterranean', 'Средиземноморский', 'terra',
   'mediterranean interior, whitewashed plaster, terracotta, wrought iron, aged wood, warm sunlight, olive and dusty-blue accents',
   'Побелка, терракота, кованое железо и состаренное дерево',
   '[{"hex":"#F7F3EA","name":"основной"},{"hex":"#E3D5B8","name":"поддерживающий"},{"hex":"#A8B5A0","name":"тёмный"},{"hex":"#3F6E8E","name":"акцент"}]', true, 90),
  ('memphis_accent', 'Мемфис-акцент', 'terra',
   'memphis accent interior, neutral shell, glossy plastic, laminate, chrome, one or two bold accent objects, playful geometry',
   'Нейтральная оболочка и один-два смелых акцентных предмета',
   '[{"hex":"#F4F1EC","name":"основной"},{"hex":"#DAD4C8","name":"поддерживающий"},{"hex":"#2E2E2C","name":"тёмный"},{"hex":"#E4583E","name":"акцент"}]', true, 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  accent = EXCLUDED.accent,
  prompt_description = EXCLUDED.prompt_description,
  description = EXCLUDED.description,
  swatches = EXCLUDED.swatches,
  active = true,
  sort = EXCLUDED.sort,
  updated_at = now();

-- Скрываем всё, что не входит в канонический набор.
UPDATE styles SET active = false
WHERE key NOT IN ('minimalism', 'scandinavian', 'japandi', 'loft', 'neoclassic', 'eco', 'dark_contemporary', 'art_deco', 'mediterranean', 'memphis_accent');

-- Концепции: текстовые карточки без картинок.
CREATE TABLE IF NOT EXISTS concepts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  main_move   TEXT NOT NULL DEFAULT '',
  quiet_areas TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort        INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO concepts (key, name, main_move, quiet_areas, description, sort) VALUES
  ('accent_block', 'Акцентный блок', 'один тёмный или насыщенный объём (стена, нижние фасады), остальное — нейтральная рама', 'верх стен, потолок', 'Один сильный цветовой объём в спокойной раме', 10),
  ('monochrome_depth', 'Монохромная глубина', 'один цвет в 3–4 тональностях; контраст фактур вместо цвета', 'пол', 'Глубина за счёт тона и фактуры, без второго цвета', 20),
  ('heavy_light', 'Тяжёлое × лёгкое', 'массивный предмет против воздушного (тёмный диван + прозрачный стол)', 'потолок', 'Контраст визуального веса предметов', 30),
  ('light_sculpture', 'Свет как скульптура', 'линии подсветки и световые пятна как главный приём', 'дневные поверхности', 'Свет становится главным художественным приёмом', 40),
  ('nature_focus', 'Природный фокус', 'одно живое крупное (дерево, камень, зелень) — центр композиции', 'всё вне фокуса', 'Крупный природный объект в центре', 50),
  ('graphic_rhythm', 'Графический ритм', 'повторяющийся мотив — рейки, панели, арки, вертикали', 'одна стена минимум без ритма', 'Ритм повторяющегося мотива', 60),
  ('asymmetric_balance', 'Асимметричный баланс', 'разновесные массы, уравновешенные по визуальному весу', 'периметр', 'Асимметрия, уравновешенная по массе', 70),
  ('tactile_base', 'Тактильная база', 'выразительность — фактуры (штукатурка, лён, ковка), цвет нейтрален', 'цвет нейтрален везде', 'Фактуры вместо цвета', 80),
  ('one_exception', 'Один предмет-исключение', 'спокойная рама + один сильный дизайнерский объект', 'всё кроме объекта', 'Один акцентный объект в спокойном окружении', 90),
  ('horizontal_division', 'Горизонтальное деление', 'светлый низ / тёмный верх (или наоборот), поясок', 'центральная зона', 'Горизонтальный пояс и деление по высоте', 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  main_move = EXCLUDED.main_move,
  quiet_areas = EXCLUDED.quiet_areas,
  description = EXCLUDED.description,
  sort = EXCLUDED.sort;

-- Реестр выбранных направлений для анти-повторов per-user.
CREATE TABLE IF NOT EXISTS design_registry (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
  room_id       TEXT,
  room_type     TEXT,
  style_key     TEXT NOT NULL,
  concept_key   TEXT NOT NULL,
  focal_zone    TEXT,
  main_move     TEXT,
  user_accepted BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_design_registry_user ON design_registry (user_id, created_at DESC);
