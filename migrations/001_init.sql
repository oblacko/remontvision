-- 001_init: базовая схема remontvision на Postgres
-- id комнат/рендеров — текстовые UUID (генерирует приложение), единообразно с API.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- юзеры и авторизация ----------
CREATE TABLE IF NOT EXISTS users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       CITEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- провайдеры входа: email (код), позже yandex/vk/mailru OAuth.
-- один юзер — много идентичностей; склейка по email.
CREATE TABLE IF NOT EXISTS auth_identities (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  provider     TEXT NOT NULL,            -- 'email' | 'yandex' | 'vk' | 'mailru'
  provider_sub TEXT,                     -- sub/id у провайдера (у email — NULL)
  email        CITEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      CITEXT NOT NULL,
  code_hash  TEXT NOT NULL,              -- sha256 кода
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  attempts   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes (email, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,       -- sha256 токена из куки
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ---------- кредиты и платежи (заполняется на этапе оплаты) ----------
CREATE TABLE IF NOT EXISTS credit_txn (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  delta      INT NOT NULL,               -- +начисление / -списание
  reason     TEXT NOT NULL,              -- 'purchase' | 'signup_bonus' | 'render' | 'iterate' | ...
  payment_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_txn_user ON credit_txn (user_id, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id),
  provider           TEXT NOT NULL,      -- 'yoomoney' | 'yukassa' | ...
  provider_payment_id TEXT UNIQUE,
  amount_kopecks     INT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'created', -- created|pending|succeeded|canceled
  payload            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ
);

-- ---------- домен ----------
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  style      TEXT NOT NULL,
  budget     INT NOT NULL DEFAULT 150,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued|analyzing|rendering|matching|done|error
  error      TEXT,
  photo_path TEXT NOT NULL,
  user_id    BIGINT REFERENCES users(id),    -- NULL = анонимная комната (до логина)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_user ON rooms (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS renders (
  id               TEXT PRIMARY KEY,
  room_id          TEXT NOT NULL REFERENCES rooms(id),
  parent_render_id TEXT REFERENCES renders(id),
  request_text     TEXT,
  prompt           TEXT,
  image_path       TEXT,
  cost_usd         DOUBLE PRECISION,
  model            TEXT,
  status           TEXT NOT NULL DEFAULT 'queued', -- queued|processing|done|error
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_renders_room ON renders (room_id, created_at);

CREATE TABLE IF NOT EXISTS suppliers (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL,
  base_url       TEXT NOT NULL UNIQUE,
  parser_type    TEXT NOT NULL DEFAULT 'generic', -- generic|jsonld|<имя адаптера>
  enabled        BOOLEAN NOT NULL DEFAULT true,
  last_crawled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id BIGINT REFERENCES suppliers(id),
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  brand       TEXT,
  attrs       JSONB NOT NULL DEFAULT '{}',
  price       INT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'шт',
  qty         REAL NOT NULL DEFAULT 1,
  source      TEXT,
  keywords    TEXT,
  url         TEXT,
  image_url   TEXT,
  price_date  DATE
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);

CREATE TABLE IF NOT EXISTS render_items (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  render_id  TEXT NOT NULL REFERENCES renders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  match_score REAL
);
CREATE INDEX IF NOT EXISTS idx_render_items_render ON render_items (render_id);

-- ---------- демо-каталог (как в MVP-сиде) ----------
INSERT INTO products (category, name, brand, attrs, price, unit, qty, source, keywords)
SELECT * FROM (VALUES
  ('tile',      'Керамогранит Atlas Concorde Brave',   'Atlas Concorde', '{"размер":"60x60","цвет":"грейдж"}'::jsonb,  2075, 'м²', 12, 'art-keramika.ru',    'керамогранит,плитка,пол,грейдж,под мрамор'),
  ('tile',      'Плитка Kerama Marazzi Баккара',        'Kerama Marazzi', '{"размер":"30x60","цвет":"белый"}'::jsonb,    1890, 'м²', 8,  'keramamaster.ru',    'плитка,кафель,фартук,белая,стена'),
  ('faucet',    'Смеситель Am.Pm Spirit F0730100',      'Am.Pm',          '{"цвет":"чёрный матовый","материал":"латунь"}'::jsonb, 12400, 'шт', 1, 'vodopad.ru', 'смеситель,кран,латунь,чёрный,кухня'),
  ('faucet',    'Смеситель Grohe Eurosmart',            'Grohe',          '{"цвет":"хром"}'::jsonb,                       8900, 'шт', 1, 'vodopad.ru',        'смеситель,кран,хром,классика'),
  ('light',     'Подсветка Arlight LED-лента 24В 3000К','Arlight',        '{"цвет_temp":"3000К","длина":"3 м"}'::jsonb,   1600, 'м', 3,  'arlight.ru',         'подсветка,led,лента,тёплый свет'),
  ('light',     'Люстра Maytoni Cluster',               'Maytoni',        '{"цвет":"латунь"}'::jsonb,                     7300, 'шт', 1,  'svetdom.ru',         'люстра,подвес,латунь,свет'),
  ('outlets',   'Розетки Schneider Electric AtlasDesign','Schneider',     '{"цвет":"антрацит"}'::jsonb,                    890, 'шт', 6,  'elektrika-shop.ru',  'розетка,выключатель,антрацит,рамка'),
  ('countertop','Столешница кварцевая Technistone',     'Technistone',    '{"материал":"кварц","толщина":"20 мм"}'::jsonb, 14500, 'м.п.', 3, 'stone-moscow.ru',  'столешница,кварц,подоконник'),
  ('paint',     'Краска Tikkurila Harmony',             'Tikkurila',      '{"цвет":"белый","блеск":"матовая"}'::jsonb,    3200, 'шт', 2,  'kraski.ru',          'краска,стены,матовая,белая'),
  ('cabinet',   'Фасады МДФ эмаль матовая графит',      '—',              '{"цвет":"графит"}'::jsonb,                     9800, 'м²', 6,  'mebel-fasad.ru',     'фасад,мдф,эмаль,графит,чёрный')
) AS v(category, name, brand, attrs, price, unit, qty, source, keywords)
WHERE NOT EXISTS (SELECT 1 FROM products);
