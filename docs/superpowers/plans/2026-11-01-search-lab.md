# Search Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админский стенд, где видно и можно перезапускать каждый шаг пайплайна ИИ-поиска товаров по фото (vision → bbox-оверлей → сетка/кроп → миниатюры → поиск со всеми параметрами), с редактируемыми версионируемыми промтами; код переиспользуем для будущего пользовательского экрана.

**Architecture:** Новые backend-модули + миграция `031_search.sql`; артефакты каждого шага сохраняются в storage (`search-lab/…`) и БД; worker-очередь по образцу `procurementjobs.js`. Фронт — переиспользуемый `SearchPipeline` (принимает `api`-функцию) + админская вкладка `SearchLab`. В v1 без `@imgly/background-removal`: Mode A = кроп на белой карточке.

**Tech Stack:** Node 20 ESM, Express, `sharp`, `fast-xml-parser`, React 19 + Tailwind, ужe существующие OpenRouter/Yandex клиенты.

**Spec:** `docs/SEARCH-SERVICE-PLAN.md` и ТЗ `~/Загрузки/tz_ai_search_service.md` с поправками: визуальный поиск = `POST /v2/image/search_by_image`; grid aspect = `21:9`; bbox = `[x,y,w,h]`; поиск идёт по всем сайтам, фильтр доменов — локальный.

## Global Constraints

- Backend ESM, 2 пробела, одинарные кавычки, точка с запятой; относительные импорты всегда с `.js`.
- Модели не хардкодить — только из `app_settings`/`.env`; конфиг поиска отдельный (`search.v1`).
- SQL только параметризованный, транзакции через `withTransaction`, миграции только новыми файлами `NNN_*.sql`.
- Внешние изображения по URL — только `fetchRemoteImage` (SSRF).
- Фронт: `import type`, без `any`, без точки с запятой (кроме `ui/*`), иконки `lucide-react`, `cn()`.
- Клиентские ошибки — `{ error: 'русский текст' }`; 5xx — «Внутренняя ошибка».
- Тесты `node:test`, Postgres не нужен (не импортировать `db.js` в unit-тестах).
- Форматы: bbox всегда `[x, y, w, h]` 0–1; Mode A/B — выбор, не последовательность; grid aspect `21:9`.

## File Structure

| Файл | Ответственность |
|---|---|
| `migrations/031_search.sql` | search_jobs/objects/results/steps/cache/clicks/prompts |
| `src/searchconfig.js` | конфиг `search.v1`: модели, домены, лимиты |
| `src/searchprompts.js` | версионируемые промты (vision/grid/cell) |
| `src/searchutil.js` | чистые функции: `canonicalUrl`, `filtersHash`, `mergeResults` |
| `src/searchvision.js` | `parseSearchImage` + `normalizeSearchVision` |
| `src/searchthumbs.js` | `composeCard`, `drawBboxOverlay` |
| `src/searchgrid.js` | `buildGridPrompt`, `generateGridImage`, `sliceGrid`, `drawGridOverlay`, `checkGridCell` |
| `src/searchservice.js` | оркестратор шагов + DTO + поиск объекта |
| `src/searchjobs.js` | worker-очередь (`startSearchWorker`) |
| `src/yandexsearch.js` (modify) | `searchWeb`, `searchImagesByText`, `searchImagesByImage`, `normalizeImageSearchResults`, body-builders |
| `src/openrouter.js` (modify) | `generateTextImage` |
| `src/server.js` (modify) | маршруты `/api/admin/search/*`, `/search-lab/:file`, старт worker |
| `web/src/components/SearchPipeline.tsx` | переиспользуемый пайплайн UI |
| `web/src/components/SearchLab.tsx` | админская вкладка: конфиг + версии промтов + SearchPipeline |
| `web/src/pages/Admin.tsx` (modify) | вкладка «Поиск» |
| `test/searchvision.test.js`, `searchgrid.test.js`, `searchthumbs.test.js`, `searchutil.test.js`, `yandexsearch-image.test.js`, `searchconfig.test.js`, `searchprompts.test.js` | unit-тесты |

## Migration `migrations/031_search.sql`

```sql
CREATE TABLE IF NOT EXISTS search_jobs (
  id            TEXT PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'photo',
  render_id     TEXT REFERENCES renders(id) ON DELETE CASCADE,
  photo_path    TEXT,
  mode          TEXT NOT NULL DEFAULT 'A',
  status        TEXT NOT NULL DEFAULT 'queued',
  stage         TEXT,
  error         TEXT,
  photo_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  vision_raw    JSONB,
  prompts       JSONB NOT NULL DEFAULT '{}'::jsonb,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_search_jobs_user ON search_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS search_objects (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  idx             INT NOT NULL DEFAULT 0,
  category        TEXT,
  label           TEXT NOT NULL,
  description     TEXT,
  color           TEXT,
  material        TEXT,
  style           TEXT,
  hex             TEXT,
  size            TEXT,
  search_query    TEXT,
  bbox            JSONB,
  confidence      DOUBLE PRECISION,
  visibility      TEXT NOT NULL DEFAULT 'seen',
  thumbnail_path  TEXT,
  thumbnail_mode  TEXT,
  cell_check      JSONB,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_objects_job ON search_objects (job_id, idx);

CREATE TABLE IF NOT EXISTS search_results (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  object_id       BIGINT NOT NULL REFERENCES search_objects(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'text',
  provider        TEXT NOT NULL DEFAULT 'yandex',
  store           TEXT,
  canonical_url   TEXT NOT NULL,
  title           TEXT,
  image_url       TEXT,
  image_path      TEXT,
  price           NUMERIC,
  currency        TEXT NOT NULL DEFAULT 'RUB',
  match_score     DOUBLE PRECISION,
  score_breakdown JSONB,
  checked_at      TIMESTAMPTZ,
  raw             JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_id, canonical_url)
);
CREATE INDEX IF NOT EXISTS idx_search_results_object ON search_results (object_id, match_score DESC);

CREATE TABLE IF NOT EXISTS search_steps (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  object_id  BIGINT REFERENCES search_objects(id) ON DELETE CASCADE,
  step       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'running',
  input      JSONB,
  output     JSONB,
  prompt     TEXT,
  cost_usd   DOUBLE PRECISION,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_steps_job ON search_steps (job_id, created_at);

CREATE TABLE IF NOT EXISTS search_cache (
  object_id    BIGINT NOT NULL REFERENCES search_objects(id) ON DELETE CASCADE,
  filters_hash TEXT NOT NULL,
  payload      JSONB NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (object_id, filters_hash)
);

CREATE TABLE IF NOT EXISTS search_prompts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       TEXT NOT NULL,
  version    INT NOT NULL,
  prompt     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

CREATE TABLE IF NOT EXISTS search_clicks (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  result_id  BIGINT NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_clicks_result ON search_clicks (result_id, created_at DESC);
```

## Prompt contracts

**vision:** JSON `{"photo_quality":{"score":0..1,"recommend_mode":"A"|"B"},"objects":[{"category","label","description","color","material","style","hex","size","search_query","bbox":[x,y,w,h],"confidence","visibility"}]}`.

**grid:** шаблон с `{objects}`; сетка 2×5 на белом фоне, ровные поля, один изолированный товар в ячейке, без текста.

**cell:** `{"ok":bool,"label","category","description"}`.

## Module interfaces

**`src/searchconfig.js`**
```js
export const SEARCH_SETTINGS_KEY = 'search.v1';
export const DEFAULT_SEARCH_CONFIG = { enabled, vision_model, grid_model, grid_resolution:'1K', grid_aspect:'21:9', domains, region:'213', search_limit:30, max_objects:10, max_run_cost_usd:2.0, cache_ttl_hours:24, visual_enabled:true };
export function getSearchConfig();
export function getSearchDefaults();
export async function loadSearchConfig();
export async function saveSearchConfig(patch);
export async function resetSearchConfig();
export function setSearchConfigForTests(patch);
export function searchConfigHash(config = getSearchConfig());
```
`vision_model` = `process.env.SEARCH_VISION_MODEL || 'google/gemini-3.1-pro-preview'`; `grid_model` = `process.env.SEARCH_GRID_MODEL || 'black-forest-labs/flux-3-image-klein'`; `saveSearchConfig` отклоняет `grid_aspect`, которого нет в `modelCaps(grid_model).aspects` (импорт `modelCaps` из `./modelcaps.js`).

**`src/searchprompts.js`**
```js
export const PROMPT_KINDS = ['vision', 'grid', 'cell'];
export const DEFAULT_SEARCH_PROMPTS = { vision, grid, cell };
export async function seedSearchPrompts();
export async function listSearchPrompts(kind);
export async function createPromptVersion(kind, prompt);
export async function activatePromptVersion(kind, id);
export async function loadSearchPrompts();
export function getActivePrompt(kind); // { id, version, prompt }
export function setSearchPromptsForTests(patch);
```

**`src/searchutil.js`**
```js
export function canonicalUrl(rawUrl);
export function filtersHash(filters);
export function mergeResults(textResults, visualResults, { limit = 30 });
```

**`src/searchvision.js`**
```js
export function normalizeSearchVision(raw, { maxObjects = 10 } = {});
export async function parseSearchImage(imageB64, mime = 'image/png', { model = null, prompt = null, roomType = '' } = {});
```

**`src/searchthumbs.js`**
```js
export async function composeCard(buffer, { size = 1024, background = '#ffffff' } = {});
export async function drawBboxOverlay(buffer, boxes);
```

**`src/searchgrid.js`**
```js
export function buildGridPrompt(objects, template);
export async function generateGridImage(objects, { prompt, model, resolution, aspect } = {});
export function sliceGrid(buffer, { rows = 2, cols = 5, margin = 0.045 } = {});
export async function drawGridOverlay(buffer, { rows = 2, cols = 5, margin = 0.045 } = {});
export async function checkGridCell(cellBuffer, expectedLabel, { prompt, model } = {});
```

**`src/yandexsearch.js`** (add; keep `searchWebSync` delegating)
```js
export async function searchWeb({ query, region='213', limit=5, apiKey, folderId, timeoutMs=30000, period='PERIOD_ALL_TIME', sortMode='SORT_MODE_BY_RELEVANCE', sortOrder='SORT_ORDER_DESC', groupMode='GROUP_MODE_DEEP', groupsOnPage=10, docsInGroup=1, maxPassages=2, l10n='LOCALIZATION_RU', page='0', familyMode='FAMILY_MODE_MODERATE', fixTypoMode='FIX_TYPO_MODE_ON' } = {});
export function buildSearchByImageBody({ imageB64 = null, url = null, site = '', page = '0', familyMode = 'FAMILY_MODE_MODERATE', folderId });
export function buildSearchWebBody({ query, region, limit, folderId, ...opts });
export async function searchImagesByText({ query, site = '', imageSpec = null, docsOnPage = 10, apiKey, folderId });
export async function searchImagesByImage({ imageB64 = null, url = null, site = '', page = '0', familyMode, apiKey, folderId });
export function normalizeImageSearchResults(json);
```

**`src/openrouter.js`**
```js
export async function generateTextImage({ prompt, aspectRatio = '21:9', model, resolution = null });
```

**`src/searchservice.js`**
```js
export async function createSearchJob({ userId = null, source, renderId = null, photoPath = null });
export async function processVisionStep(jobId);
export async function processGridStep(jobId);
export async function processCropsStep(jobId);
export async function processObjectSearch(jobId, objectId, filters);
export async function searchJobDto(jobId);
export async function logSearchClick({ resultId, userId = null, ipHash = null });
```
`filters` = `{ query, domains, price_from, price_to, region, period, sort, source, force }`. Маппинг: `PERIOD_ENUM`, `SORT_ENUM`. Поиск идёт без `site:`; allowlist применяется локально через `isAllowedDomain` после `mergeResults`.

**`src/searchjobs.js`** — `startSearchWorker()` по образцу `procurementjobs.js`.

## API

```
GET    /api/admin/search/config
PUT    /api/admin/search/config            body { config }
POST   /api/admin/search/config/reset
GET    /api/admin/search/prompts
POST   /api/admin/search/prompts            body { kind, prompt }
POST   /api/admin/search/prompts/:id/activate
POST   /api/admin/search/prompts/reset
POST   /api/admin/search/jobs               multipart 'photo' | json { render_id }
GET    /api/admin/search/jobs/:id
POST   /api/admin/search/jobs/:id/vision
POST   /api/admin/search/jobs/:id/grid
POST   /api/admin/search/jobs/:id/crops
POST   /api/admin/search/jobs/:id/objects/:objId/search
GET    /api/admin/search/jobs/:id/objects/:objId/search
GET    /search-lab/:file                    (requireAdmin, serveStored dir 'search-lab')
```

job dto: `{ id, source, mode, status, stage, error, cost_usd, created_at, finished_at, photo_quality, vision_raw, objects:[...], steps:[...] }`. `thumbnail_path` и `steps[].output`-пути фронт приставляет к `/search-lab/`.

## Review Focus

1. Кривой bbox от vision (x>1, w<0, пропуск) — кроп не должен падать. → Task 4.
2. Неподдерживаемый grid aspect — `saveSearchConfig` отклоняет. → Task 2.
3. Нарезка сетки мимо — margin в долях min(cellW,cellH), детерминированно. → Task 8.
4. Кэш отдаёт чужие результаты — ключ включает все фильтры. → Task 3.
5. Дубли ссылок (utm/www/#) — `canonicalUrl`. → Task 3.

---

### Task 0: Spike живого Yandex image API + grid

**Files:** Create `scripts/search-spike.mjs` (throwaway, не в DoD); fixtures `test/fixtures/search_by_image.json`.

**Interfaces:** Consumes `yandexsearch.js` current exports + `generateTextImage` (Task 6) or direct fetch.

- [ ] Написать `scripts/search-spike.mjs`: принять путь к фото аргументом; закодировать base64; вызвать `POST https://searchapi.api.cloud.yandex.net/v2/image/search_by_image` с `{ folder_id, data, page:'0', family_mode:'FAMILY_MODE_MODERATE' }`; сохранить сырой JSON в `test/fixtures/search_by_image.json`; вывести `images.length` и первые 3 записи.
- [ ] Запустить: `node --env-file=.env scripts/search-spike.mjs <путь-к-фото>`.
- [ ] Ожидаемо: либо `images[]` с `page_url/host/passage`, либо ошибка — зафиксировать в ledger `Ruling`.
- [ ] Дополнительно сгенерировать сетку `21:9` через существующий клиент или OpenRouter напрямую; вывести `cost_usd`.
- [ ] Commit fixtures (скрипт можно не коммитить).

### Task 1: Migration + q methods

**Files:** Create `migrations/031_search.sql`; Modify `src/db.js`.

- [ ] Написать миграцию точно по тексту выше.
- [ ] Добавить в `q`: `createSearchJob`, `getSearchJob`, `updateSearchJob`, `listSearchJobs`, `createSearchObject`, `searchObjectsForJob`, `getSearchObject`, `updateSearchObject`, `deleteSearchObjectsForJob`, `upsertSearchResult` (ON CONFLICT (object_id,canonical_url) DO UPDATE), `searchResultsForObject`, `clearSearchResults`, `logSearchStep`, `getSearchCache`, `setSearchCache`, `logSearchClick`, `listSearchPrompts(kind)`, `createSearchPromptVersion(kind, prompt)`, `activateSearchPromptVersion(kind, id)`.
- [ ] Run: `node --check src/db.js` → PASS.
- [ ] Commit: `feat: search lab schema and db accessors`.

### Task 2: `searchconfig.js` + test

**Files:** Create `src/searchconfig.js`, `test/searchconfig.test.js`.

- [ ] Tests: `'default grid aspect is 21:9'`; `'hash changes when domains change'`; `'saveConfig rejects unsupported grid aspect'` (e.g. `'5:2'` throws).
- [ ] Run: `node --test test/searchconfig.test.js` → FAIL.
- [ ] Реализовать по сигнатурам (паттерн `promptconfig.js`).
- [ ] Run → PASS. Commit `feat: search config`.

### Task 3: `searchutil.js` + test

**Files:** Create `src/searchutil.js`, `test/searchutil.test.js`.

- [ ] Tests: `'canonicalUrl strips fragment and tracking'` (`https://www.Divan.ru/sofa/?utm_source=x#top` → `https://divan.ru/sofa/`); `'filtersHash ignores domain order'`; `'mergeResults dedups by canonicalUrl and caps limit'`.
- [ ] FAIL → реализовать → PASS → Commit.

### Task 4: `searchvision.js` + test

**Files:** Create `src/searchvision.js`, `test/searchvision.test.js`.

- [ ] Tests: `'clamps bbox into 0..1'`; `'drops objects missing label or search_query'`; `'caps at maxObjects'`; `'keeps size attribute'`; `'coerces hex to #RRGGBB or null'`.
- [ ] FAIL → реализовать `normalizeSearchVision` + `parseSearchImage` (по образцу `parseProcurementImage`, модель/промт из аргументов). → PASS → Commit.

### Task 5: `searchprompts.js` + test

**Files:** Create `src/searchprompts.js`, `test/searchprompts.test.js`.

- [ ] Tests: `'createPromptVersion bumps version'`; `'activate switches active'`; `'getActivePrompt returns active version'`.
- [ ] FAIL → реализовать (in-memory cache + q methods `listSearchPrompts`, `createPromptVersion`, `activatePromptVersion`). → PASS → Commit.

### Task 6: extend `yandexsearch.js` + test

**Files:** Modify `src/yandexsearch.js`; Create `test/yandexsearch-image.test.js`.

- [ ] Tests: `'normalizeImageSearchResults maps image fields'` (fixture from Task 0 или синтетический); `'buildSearchByImageBody sets data and page'`; `'buildSearchWebBody includes period and maxPassages'`.
- [ ] FAIL → реализовать `searchWeb`, body-builders, `searchImagesByText`, `searchImagesByImage`, `normalizeImageSearchResults`; `searchWebSync` делегирует в `searchWeb`. → PASS → Commit.

### Task 7: `generateTextImage` in `openrouter.js`

**Files:** Modify `src/openrouter.js`.

- [ ] Add `generateTextImage` по сигнатуре (через `withImageSlot`; парсить `data.choices?.[0]?.message?.images?.[0]?.image_url?.url` / `data.data?.[0]?.b64_json`).
- [ ] Run: `node --check src/openrouter.js` → PASS.
- [ ] Commit `feat: text image generation with explicit model`.

### Task 8: `searchthumbs.js` + test

**Files:** Create `src/searchthumbs.js`, `test/searchthumbs.test.js`.

- [ ] Tests: `'composeCard returns 1024x1024'`; `'drawBboxOverlay returns a buffer'`.
- [ ] FAIL → реализовать → PASS → Commit.

### Task 9: `searchgrid.js` + test

**Files:** Create `src/searchgrid.js`, `test/searchgrid.test.js`.

- [ ] Tests: `'sliceGrid returns rows*cols cells'` (синтетический 1000×500, 2×5, margin 0.045 → 10); `'sliceGrid cell dimensions match formula'`; `'buildGridPrompt embeds objects list'`.
- [ ] FAIL → реализовать (алгоритм: `cellW=W/cols`, `cellH=H/rows`, `pad=round(margin*min(cellW,cellH))`). → PASS → Commit.

### Task 10: `searchservice.js` + `searchjobs.js`

**Files:** Create `src/searchservice.js`, `src/searchjobs.js`.

- [ ] `processVisionStep`: `parseSearchImage` → save `vision_raw`/objects → `drawBboxOverlay` → `putBuffer('search-lab/<job>/overlay.png')` → `logSearchStep`.
- [ ] `processGridStep`: `buildGridPrompt` → `generateGridImage` → save grid → `drawGridOverlay` → `sliceGrid` → на ячейку `checkGridCell` + `composeCard` → `thumbnail_path`.
- [ ] `processCropsStep`: crop по bbox → `composeCard` → `thumbnail_path`.
- [ ] `processObjectSearch`: text + optional visual → `mergeResults` → local `isAllowedDomain` filter → price filter → `upsertSearchResult` → cache.
- [ ] `searchJobDto`, `createSearchJob`, `logSearchClick`.
- [ ] `searchjobs.js`: `startSearchWorker()` (requeue + stale 60 мин + claim 2 с).
- [ ] Run: `node --check src/searchservice.js src/searchjobs.js` → PASS.
- [ ] Commit `feat: search pipeline orchestrator and worker`.

### Task 11: server routes

**Files:** Modify `src/server.js`.

- [ ] Импорты `searchservice`, `searchjobs`, `searchconfig`, `searchprompts`.
- [ ] Маршруты по контракту (обёртка `h()`, `requireAdmin`); `POST /jobs` — multer `memUpload().single('photo')` или `{ render_id }`.
- [ ] `app.get('/search-lab/:file', ...)` с `requireAdmin` и `serveStored(...,'search-lab',...)`.
- [ ] В `main()`: `await loadSearchConfig(); await loadSearchPrompts(); await seedSearchPrompts();`; в `listen`: `startSearchWorker();`.
- [ ] Run: `node --check src/server.js` → PASS. Commit.

### Task 12: `SearchPipeline.tsx`

**Files:** Create `web/src/components/SearchPipeline.tsx`.

- [ ] Props: `{ jobId, api, onJobCreated, onCost }`, `api: (path, init?) => Promise<Response>`.
- [ ] Секции: загрузка фото (FormData) → vision (объекты + оверлей + A/B) → сетка/кроп (миниатюры с описанием) → поиск (query, домены-чипы + «добавить сайт», цена от/до, регион, период, сортировка, источник, результаты).
- [ ] Run: `cd web && npm run lint` → PASS. Commit.

### Task 13: `SearchLab.tsx` + Admin tab

**Files:** Create `web/src/components/SearchLab.tsx`; Modify `web/src/pages/Admin.tsx`.

- [ ] `SearchLab({ api, readJson })`: конфиг (модели, resolution, aspect, домены, регион, лимиты, visual_enabled), версии промтов (список, новая версия, активировать, сброс), `<SearchPipeline api={api} …/>`.
- [ ] Admin: `'search'` в `Tab`, кнопка вкладки, рендер.
- [ ] Run: `cd web && npm run lint && npm run build` → PASS. Commit.

### Task 14: docs + final verification

**Files:** Modify `docs/SEARCH-SERVICE-PLAN.md`, `docs/HISTORY.md`, `docs/MEMORY.md`.

- [ ] Обновить план (search_by_image, 21:9, bbox `[x,y,w,h]`, Search Lab, версии промтов).
- [ ] HISTORY + MEMORY.
- [ ] Run: `npm run docs:llms`.
- [ ] Run: `npm test`; `cd web && npm run lint && npm run build` → всё PASS.
- [ ] Проверить: нет секретов в diff.
- [ ] Commit.
