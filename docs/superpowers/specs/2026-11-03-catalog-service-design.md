# Дизайн: отдельный сервис каталога товаров с векторным поиском

Дата: 2026-11-03. Статус: согласован.

## Цель и зачем

Сегодня Search Lab ищет товары через Yandex Search API: платно за каждый запрос,
недетерминированно, с риском captcha и «выдуманными» URL, которые нужно проверять.
В CPA-фидах Pampadu уже есть реальные офферы с ценой, наличием, картинкой и
партнёрской ссылкой. Векторизовав их картинки DINOv2 и проиндексировав в pgvector,
получаем быстрый и почти бесплатный поиск «кроп объекта → похожие товары» с
настоящими ссылками и монетизацией.

## Границы

Отдельный сервис `catalog-service` (Python/FastAPI) со своей PostgreSQL (pgvector).
Он владеет импортом фидов, хранением офферов, эмбеддингами и поиском по сходству.
Remontvision (Node) — клиент: вызывает сервис live и сохраняет снапшот выдачи у себя.

| Компонент | Стек | Ответственность |
|---|---|---|
| `app/catalog-service` | Python 3.12, FastAPI, SQLAlchemy/psycopg, pgvector, torch + DINOv2 | feeds, offers, embeddings, `/search` |
| remontvision | Node 20 | клиент сервиса, гибридный мердж с Yandex, снапшот/клики/биллинг, UI |

## Goals / non-goals / anti-goals

**Goals**
- Импорт YML-фидов (много источников) в единый каталог офферов.
- Векторизация картинок DINOv2 (ViT-L/14 reg4 + dino.txt) в pgvector.
- Поиск по эмбеддингу кропа и тексту + фильтры (категория, цена, магазин).
- Результаты с CPA-ссылкой и `erid` (маркировка рекламы, ФЗ-38).

**Non-goals (сейчас)**
- Замена Yandex: сначала гибрид.
- Обновление цен/наличия в реальном времени, полная смета, пользовательский flow.

**Anti-goals**
- Не выдумывать URL/цены/артикулы.
- Не терять `erid` и не показывать оффер как «купить» без валидной CPA-ссылки.
- Не смешивать каталог-сервис с curated `products` remontvision.

## Решения (согласованы)

- Стек сервиса: Python 3.12 + FastAPI + SQLAlchemy/psycopg + pgvector + torch.
- Модель: ViT-L/14 reg4 + dino.txt, общее 1280d пространство (image и text в одном индексе).
- Хранение: одна таблица `offers` + `raw jsonb` + `params jsonb` + адаптер на источник.
- Поиск: гибрид (каталог — дополнительный источник к Yandex), снапшот у remontvision.
- Пилот: фид 789 (918 офферов, мебель). Далее 792 и другие источники.
- Размещение: `app/catalog-service/` в текущей репе, деплой в общем compose.

## Архитектура

```
фиды (YML, URL в feeds)
   │  feed.py: fetch (SSRF-safe) → fast-xml-parser-эквивалент (xml.etree) → адаптер
   ▼
offers (canonical + raw jsonb + params jsonb)
   │  pipeline.py: скачать picture → embedder.embed_image → upsert
   ▼
offer_embeddings (offer_id, model, dim, embedding vector(1280), HNSW cosine)

/search:
  image_b64? / text? + filters
   → embedder.embed_image / embed_text (1280d, L2-нормализация)
   → repo.search(embedding, filters, top_k)  (cosine)
   → [{offer..., score}]
```

dino.txt кладёт картинку и текст в одно пространство: один вектор на оффер
покрывает и image→image, и text→image. Точная размерность и пороги фиксируются
спайком; код не хардкодит размерность — она приходит из `EMBED_DIM`.

## Схема БД сервиса

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE feeds (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  format        TEXT NOT NULL DEFAULT 'yml',
  adapter       TEXT NOT NULL DEFAULT 'pampadu_yml',
  active        BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  offer_count   INT NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE offers (
  id            UUID PRIMARY KEY,
  feed_id       BIGINT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,
  merchant      TEXT,
  category      TEXT,          -- внутренняя категория (bed, sofa, light...)
  category_raw  TEXT,          -- категория источника
  name          TEXT NOT NULL,
  vendor        TEXT,
  model         TEXT,
  description   TEXT,
  price         NUMERIC,
  old_price     NUMERIC,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  availability  TEXT NOT NULL DEFAULT 'unknown',
  picture_url   TEXT,
  picture_path  TEXT,
  canonical_url TEXT,
  affiliate_url TEXT,
  erid          TEXT,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'active',
  content_hash  TEXT,          -- хэш картинки/данных для идемпотентности
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed_id, external_id)
);
CREATE INDEX idx_offers_category ON offers (category);
CREATE INDEX idx_offers_params ON offers USING gin (params);

CREATE TABLE offer_embeddings (
  offer_id   UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  dim        INT NOT NULL,
  embedding  vector(1280) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, model)
);
CREATE INDEX idx_offer_embeddings_hnsw
  ON offer_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE sync_jobs (
  id          BIGSERIAL PRIMARY KEY,
  feed_id     BIGINT REFERENCES feeds(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,   -- import | embed
  status      TEXT NOT NULL DEFAULT 'queued',
  processed   INT NOT NULL DEFAULT 0,
  total       INT NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
```

## API сервиса

Все запросы требуют `X-Catalog-Token: $CATALOG_SERVICE_TOKEN` (кроме `/health`).

```
GET  /health
GET  /models                       -> { model, dim, embedder }
POST /feeds                        { name, url, format?, adapter? } -> feed
GET  /feeds                        -> [feed]
POST /feeds/:id/sync               -> { job_id }; запускает import + embed
GET  /feeds/:id/status             -> { feed, last_job }
POST /search
  { image_b64?, text?, filters:{categories?, price_min?, price_max?, merchant?},
    top_k?, min_score? }
  -> { results:[{ offer_id, name, price, old_price, currency, availability,
                  picture_url, affiliate_url, erid, category, params, score }] }
GET  /offers/:id                   -> offer
```

## Пайплайн импорта

1. Скачать YML (SSRF-safe: только http/https, публичные адреса, лимит размера).
2. `xml.etree.ElementTree` → `<offer>`/`<category>`.
3. Адаптер `pampadu_yml`: price/oldprice/currencyId/categoryId/url/picture/name/
   vendor/model/description/available/param* → canonical.
   - `affiliate_url` = исходный `<url>` (trk.ppdu.ru с erid).
   - `canonical_url` = декодированный параметр `dl` из redirect (если есть).
   - `erid` = из query `erid` redirect-ссылки.
4. `category` = маппинг `category_raw`/name через словарь (`categories.py`).
5. `params` = плоский key→value из `<param name=...>`.
6. Upsert по `(feed_id, external_id)`; `content_hash` = sha256(picture_url+price+
   availability). Если не изменился — эмбеддинг не пересчитывается.
7. Для новых/изменившихся: скачать `picture` → `embedder.embed_image` →
   upsert `offer_embeddings`.

## Изменения в remontvision

- Миграция `034_search_catalog.sql`: `ALTER TABLE search_results ADD affiliate_url TEXT, ADD erid TEXT;`
- `src/catalogclient.js` — клиент: `search({image,text,filters})`, `listFeeds()`,
  `syncFeed(id)`, URL+token из env, таймауты, ошибки.
- `src/searchconfig.js`: `catalog_enabled`, `catalog_service_url`, `catalog_top_k`,
  `catalog_min_score`.
- `src/searchservice.js`: в `processObjectSearch()` источник `catalog` — отправить
  кроп + search_query в сервис, сохранить результаты `source='catalog',
  provider='feed'`; `source` расширяется до `text|visual|catalog|both`.
- `src/searchutil.js`: `mergeResults` поддерживает третий источник и `score`.
- `src/server.js` `/buy/:id`: 302 на `affiliate_url`, если есть.
- Админка: переключатель источника каталога + секция «Фиды» (sync/статус).
- `legal.js`/UI: показ «Реклама. erid=…».

## Риски

- Качество cosine «рендер vs каталог» — главный гейт; закрывается спайком.
- Тяжёлый образ (torch) и загрузка весов — прогрев, healthcheck, кэш весов томом.
- Маппинг `categoryId` → внутренние категории — словарь в `categories.py`.
- Локально нет torch: тесты идут с `FakeEmbedder`; `TorchEmbedder` импортирует torch лениво.

## Открытые вопросы, решаемые спайком

- Точная размерность dino.txt-пространства и `min_score`.
- Достижимый Top-1/Top-3 на размеченных предметах (цель ≥75% Top-3).
