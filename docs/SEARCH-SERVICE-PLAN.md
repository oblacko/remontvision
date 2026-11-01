# План: ИИ-поиск товаров по фото (замена procurement)

Дата: 2026-11-01. Статус: согласован, готов к реализации.

## Статус реализации (2026-11-01)

Реализован **админский тестовый стенд** Search Lab; старый procurement не тронут.
Поправки к исходному плану:

- Visual search: `POST /v2/image/search_by_image` (не `search-images-by-pic`); live-проверка отложена — локально нет `YANDEX_SEARCH_API_KEY`.
- Grid: FLUX `black-forest-labs/flux-3-image-klein`, `1K`, aspect `21:9` (5:2 не поддерживается), нарезка 2×5.
- bbox: `[x, y, w, h]`, нормированные 0..1 (совместимо с `cropReference`).
- Поиск идёт по всем сайтам; allowlist доменов применяется локально (`isAllowedDomain`).
- Промты зрения/сетки/проверки ячейки версионируются в `search_prompts`; job снапшотит активные версии.
- v1 без удаления фона: Mode A = кроп → белая карточка 1024²; `@imgly/background-removal` отложен.
- Каждый шаг сохраняет артефакты в `search-lab/<jobId>-...` и стоимость в `search_steps`.

## Цель

Заменить текущий «подбор товаров» (procurement) на сервис по ТЗ
`tz_ai_search_service.md`: фото дизайна → до 10 объектов с миниатюрами →
клик → гибридный поиск (текст + visual) → результаты с фильтрами.

## Согласованные решения

- Полностью заменить текущий procurement; старые таблицы остаются (append-only).
- Вход: standalone-загрузка фото И по готовому рендеру. Только авторизованные.
- Объём MVP: всё сразу (mode A + mode B + visual search + фильтры).
- Visual search: Yandex Search API `search-images-by-pic`.
- Удаление фона: JS-библиотека в Node (`@imgly/background-removal`).
- Биллинг: 1 кредит за job; повторные клики из кэша бесплатны.
- Текстовый поиск: существующий Yandex Search API (не «Яндекс XML» — это устарело).

## Что переиспользуем

- `parseProcurementImage()` в `src/openrouter.js:817` — vision-разбор с bbox.
- `cropReference()` в `src/procurement.js:145` — crop по bbox.
- `src/yandexsearch.js` — текстовый поиск + allowlist + фильтр.
- `inspectProductUrl()` — проверка карточки (URL→цена/фото/SKU).
- `scoreProductMatch()` — визуальная оценка.
- Кредиты/биллинг, worker-очередь, storage, SSRF-защита.

## Новое

- Thumbnails Mode A: crop + удаление фона + белая карточка 1024² + тень.
- Thumbnails Mode B: FLUX-сетка 2×5 + нарезка + vision-проверка ячеек.
- Reverse image search: `searchByImage()` по `search-images-by-pic`.
- Гибридный мердж: text + visual → дедуп по domain+URL → ранжирование → лимит 30.
- Фильтры: домены + цена (от/до) + редактируемый search_query.
- Кэш результатов: hash(object_id + фильтры), TTL 24 ч.
- UI сетки миниатюр + индикатор режима + long-press редактирование запроса.

## Схема — миграция 031_search_jobs.sql

- search_jobs: id, user_id, source(photo|render), render_id null, photo_path,
  photo_quality jsonb, mode(A|B), status(analyzing|ready|failed), cost_usd,
  credit_charged/refunded, timestamps.
- search_objects: id, job_id, index, category, label, bbox jsonb, attributes jsonb,
  search_query, thumbnail_path, thumbnail_mode(A|B), status.
- search_results: id, object_id, source(text|visual), provider, store, canonical_url,
  title, image_url, image_path, price, currency, match_score, score_breakdown,
  checked_at, raw jsonb; unique (object_id, canonical_url).
- search_cache: object_id, filters_hash, payload jsonb, expires_at (TTL 24 ч).
- search_clicks: аналог procurement_clicks.

## Backend

- src/searchvision.js — parseSearchImage(): photo_quality{score,recommend_mode}
  + до 10 объектов (bbox/атрибуты/search_query). Форк parseProcurementImage.
- src/thumbnails.js — makeThumbnailA() (crop→rembg→карточка 1024²+тень),
  makeThumbnailB() (сетка→нарезка→vision-check).
- src/yandexsearch.js — добавить searchByImage().
- src/searchservice.js — orchestrator гибридного поиска + мердж + фильтры + кэш.
- src/searchjobs.js — worker очереди (замена procurementjobs.js).
- src/server.js — маршруты:
  POST /api/search-jobs (multipart)
  GET  /api/search-jobs/:id
  GET  /api/search-jobs/:id/objects
  POST /api/search-jobs/:id/thumbnails
  GET  /api/search-jobs/:id/thumbnails/:obj
  POST /api/objects/:objId/search
  GET  /api/objects/:objId/search
  POST /api/renders/:id/search (алиас по рендеру)
  /buy/:id остаётся.

## Frontend

- Новый SearchPanel.tsx / страница: upload → сетка миниатюр → результаты + фильтры.
- Заменяет ProcurementPanel.tsx.
- Новая зависимость @imgly/background-removal.

## Админка

Секция «Поиск товаров»: enable, visual on/off, allowlist доменов, пороги score,
лимиты (объекты/кандидаты/стоимость), TTL кэша, режим по умолчанию, список jobs,
ручной перезапуск объекта.

## Последовательность

1. Схема + parseSearchImage + Mode A (crop без rembg) + текстовый поиск + фильтры
   + кэш + UI сетки + тесты.
2. searchByImage() + гибридный мердж.
3. @imgly/background-removal → карточка 1024² + тень.
4. Mode B (сетка + нарезка + vision-check).
5. Standalone-вход, удаление старого procurement-UI, docs/HISTORY.md, deploy.

## Открытые технические моменты

- Точный контракт search-images-by-pic — подтвердить spike + fixtures.
- Память/время @imgly/background-removal (WASM) — прогреть один раз при старте worker.
- Cost-guard Mode B: жёсткий max_run_cost_usd, fallback на Mode A.

## Definition of done (по AGENTS.md)

npm test зелёный → cd web && npm run lint → npm run build → docs/HISTORY.md →
npm run docs:llms → нет секретов в diff → smoke на VPS.
