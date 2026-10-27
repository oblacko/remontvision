-- 008: пакеты кредитов, стили, референсы стилей и избранные товары стиля.
CREATE TABLE IF NOT EXISTS credit_packs (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  credits       INT NOT NULL CHECK (credits > 0),
  price_kopecks INT NOT NULL CHECK (price_kopecks > 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  sort          INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO credit_packs (id, title, credits, price_kopecks, active, sort) VALUES
  ('pack2',  '2 кредита — попробовать', 2,   9900, true, 10),
  ('pack5',  '5 кредитов',              5,  22900, true, 20),
  ('pack15', '15 кредитов — выгодно',  15,  59900, true, 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS styles (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key                TEXT UNIQUE NOT NULL,
  name               TEXT UNIQUE NOT NULL,
  accent             TEXT NOT NULL DEFAULT 'sand',
  prompt_description TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  preset_image_path  TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  sort               INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO styles (key, name, accent, prompt_description, description, active, sort) VALUES
  ('modern',  'Современный',      'sand',     'modern minimalist interior, handleless matte cabinets, warm LED lighting, large-format porcelain tile', 'Чистые линии, тёплый свет, крупноформатные материалы', true, 10),
  ('scandi',  'Скандинавский',    'dust',     'scandinavian interior, light oak, white walls, linen, soft natural light, functional minimalism', 'Светлый дуб, лён и много естественного света', true, 20),
  ('loft',    'Лофт',             'graphite', 'industrial loft, exposed concrete or brick, black metal, warm wood, large windows', 'Бетон, металл, дерево и большие окна', true, 30),
  ('japandi', 'Джапанди',         'forest',   'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette', 'Тёплый минимализм, натуральное дерево и спокойные оттенки', true, 40),
  ('neo',     'Неоклассика',      'sand',     'neoclassical interior, elegant wall moldings, warm neutrals, subtle brass, timeless', 'Молдинги, тёплые нейтральные цвета, латунь', true, 50),
  ('minimal', 'Минимализм',       'graphite', 'minimalist interior, clean lines, neutral palette, hidden storage, soft lighting', 'Минимум деталей, скрытое хранение и мягкий свет', true, 60),
  ('dark',    'Тёмный модерн',    'graphite', 'dark modern interior, graphite and walnut, moody lighting, premium materials', 'Графит, орех и премиальные материалы', true, 70),
  ('boho',    'Бохо',             'terra',    'bohemian interior, layered textiles, rattan, plants, warm earthy colors', 'Текстиль, ротанг, растения и тёплая земляная палитра', true, 80),
  ('deco',    'Ар-деко',          'terra',    'art deco interior, brass, velvet, geometric patterns, rich jewel tones', 'Латунь, бархат и геометрия', true, 90),
  ('country', 'Кантри',           'forest',   'country interior, natural wood, cozy textiles, warm rustic details', 'Натуральное дерево, уютный текстиль и rustic-детали', true, 100)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS style_references (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  style_id   BIGINT NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_style_references_style ON style_references (style_id, sort);

CREATE TABLE IF NOT EXISTS style_products (
  style_id   BIGINT NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (style_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_style_products_product ON style_products (product_id);
