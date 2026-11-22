# Статус проекта: что сделано и что работает

**Дата:** 2026-11-22. **Прод:** `main`, деплой `41e6ff9` 2026-11-22 15:00 UTC. **Ветка:** `main`.

Это единый источник истины о состоянии продукта. Остальные документы описывают механику; при расхождении верьте этому файлу и коду.

## Сделано за последние изменения

### 2026-11-22
- **Обложки стилей → WebP:** сгенерированные `style-*.png` (32 стиля × public/dist, ~2 МБ каждый) сжаты в WebP quality 82 через `scripts/compress-style-images.mjs`; PNG удалены, `generatedStyleImage()` отдаёт WebP (~0.1–0.2 МБ). Набор ассетов `web/public/images` и `web/dist/images` идентичен (37 WebP на каталог). Задеплоено (`41e6ff9`, workflow `deploy` зелёный): на проде все 32 `image_url` в `/api/styles` — `.webp`, отдаются 200 с `content-type: image/webp`, старые `.png` — 404.
- **Деплой фикса sitemap (REM-51):** коммит `cc085d9` запушен в `main`, workflow `deploy` (test → SSH deploy → smoke) зелёный. На проде `/sitemap.xml` содержит `https://www.remontvision.ru/articles/kuhnya-v-stile-provans`; число `<loc>` 120 → 121 (добавлена только статья 78), статья отдаёт 200 и self-canonical, `/api/health` ok. Статьи 79–83 не менялись.
- **Деплой в прод:** коммит `fc2553d` запушен в `main`, CI (`ci.yml`) и `deploy.yml` прошли успешно. Прод `https://www.remontvision.ru` поднят, smoke PASS, `/api/health` ok, `/api/styles` отдаёт новые обложки.
- **Обложки стилей через реальный пайплайн:** `scripts/generate-style-covers-pipeline.mjs` создаёт комнату, ставит в очередь рендер и прогоняет его через `processRender` (cleanup → art director → layout → render → QA). Сгенерированы и применены 5 проблемных стилей из одного фото `assets/zal.jpg`: `tropical_modern`, `english`, `art_deco`, `dark_academia`, `chalet` → `web/public/images/` и `web/dist/images/` (PNG, позже сжаты в WebP). `/api/styles` теперь отдаёт новые обложки.
- **Фикс кэша `room_analysis.openings`:** `cachedOpenings` теперь корректно разворачивается из `data.openings` перед использованием; устранён `Cannot read properties of undefined (reading 'length')` при повторных рендерах той же комнаты.
- **Мягче тестовые брифы:** убраны хардкодные перекрытия пола (`floorOverride`), снижена агрессивность `ROOM_PROGRAM`, `WALLS`, `PLACEMENT`, убран `LIGHT_FIXTURE` и инструкция заменять светильник в `style-briefs.mjs` (production и так заменяет через electrical lock). Подписные движения `tropical_modern`, `english`, `dark_academia`, `chalet` больше не нарушают `ARCH_LOCK`.
- **ARCH_LOCK_V2 усилен:** двери теперь сохраняют тип, заполнение и глухарь; restyle касается только материала/цвета дверного полотна. Terrace/balcony/French/all-glass door leaves вне зоны допустимого.
- **tropical_modern:** описание стиля (`prompt_description`) и миграция `068` убрали terrace-ассоциации (`humid airy atmosphere` → `humid enclosed interior atmosphere`), вернули терракотовый акцент `#E07A5F`.
- **Генератор UI:** скрыт выбор модели и разрешения; скрыты кнопки «Подобрать 3 стиля» / «Подобрать 5 стилей». При загрузке списка `renderModels` автоматически выбирается дефолтная модель и разрешение.
- **Sitemap:** добавлена `/contacts`, стили и страницы галереи теперь с `lastmod`/`changefreq`/`priority`.
- **SEO:** на главную страницу добавлен мета-тег `google-site-verification`.
- **Регрессия промтов:** baseline обновлён под новый electrical lock и ARCH_LOCK_V2. `npm test` 477/478 (1 skipped), `npm run test:integration` 75/75, web lint/build зелёные.

### SEO страницы стилей 2026-11-22
- **Тексты 32 страниц** (REM-46, волны 1–3): `src/stylecontent.js` — уникальные лид, «узнать за 10 секунд», палитра с HEX и 60-30-10, свет, комнаты, сочетания, FAQ. Объём T1 450–470 слов, T2 300–320, T3 245–285; повторяющихся абзацев >20 слов нет (тест).
- **Карточка стиля**: блоки контента, `FAQPage` JSON-LD, 4–6 ссылок на стили, до 2 комнат галереи, два CTA с prefill; alt по шаблону «{Название} в {комнате}: {деталь}»; без контента — `noindex, follow`.
- **SSR-страницы стилей** (REM-45, волна 0): `GET /styles` (хаб) и `GET /styles/:key` (карточка) отдают серверный HTML — уникальный `title`/`description`, self-canonical `/styles/{key}`, OG/Twitter, `H1`, лид, палитра, материалы, ссылки, CTA, `BreadcrumbList`/`ItemList` JSON-LD. Неизвестный ключ → 404; `/styles/` и `/styles/{key}/` → 301. Источник мета — `src/styleseo.js` (32 записи из `style-seo-32.json`).
- **Sitemap**: стили из активных строк БД, `lastmod` из `updated_at`, `loc` = canonical; `/styles` — статическая запись.
- **Перелинковка**: подвалы (лендинг, статьи, галерея, стили) → `/styles`, `/articles`, `/gallery`; статья ↔ страница стиля.
- **Метрика**: события `style_view`, `style_generate_click`, `style_related_click`, `style_article_click`, `style_gallery_click`.

### 2026-11-21
- **Каталог стилей:** 32 стиля в `src/designdata.js` и БД (миграция `065`). Топ-10 featured в основном сценарии, остальные — в библиотеке `/styles`. Страница `/styles/:id` с палитрой и кнопкой «Сгенерировать такой же». `/api/styles` отдаёт `display_name`, `family`, `is_featured`.
- **Матрица:** 32 × 10 = 320 ячеек (257 ok / 50 weaken / 13 conflict).
- **FLUX 3 quality-max:** bbox-заморозка архитектуры включена по умолчанию, layout bbox, designer signature move, расширенные axes вариативности.

### Ночной прогон 2026-11-12
- **Доки и мёртвый код:** README/AGENTS/STATUS синхронизированы; удалены `reviewDesign`-ветка в `jobs.js`, `spendCredit`, `estimateRoomDimensions`; лог `credit_restore_failed` при отмене.
- **Фронт:** «Паспорт ремонта (PDF)» ведёт в `?tab=passport`; «Найти товары» скрыта; реферальный баннер по HttpOnly-куке через `GET /api/referral/context`; черновик генерации (localStorage + IndexedDB, JPEG ≤1 МБ); цена переноса/правки до подтверждения; тост возврата кредита; ETA по стадиям; 4 пресета правок.
- **Промт:** регрессия 20 конфигураций (`docs/regression`); нерушимая секция `GEOMETRY LOCK` с дословными метрами; вариативность комнаты (`src/variability.js`) с акцентом из палитры стиля и avoid прошлых рендеров; `furnitureOff` теперь применяется.
- **Пайплайн:** `room_analysis` (миграция `059`) — повторные рендеры комнаты/стиля/концепта без 3 vision-вызовов; арт-директор и direction слиты в один vision-вызов, `designeragent` удалён; bbox+label в промте удаления и дифф bbox±50% с warn >120%; `PARSE_AUTO` (по умолчанию off); асинхронная очистка комнаты (миграции `060`, `061`) с ожиданием shell ≤3 мин и `waiting_shell` heartbeat; layout без `x_cm/y_cm`, кэш по комнате, ≤5 прошлых стратегий.

### Аудит и улучшения 2026-11-11
- Отчёт: `docs/AUDIT-2026-11-11.md`.
- Параллельные image-вызовы: семафор вместо глобального лока, лимит в `render.product_refs.v1.image_concurrency`.
- Пакеты генерации `generation_batches` + `renders.batch_id`, идемпотентность запуска, `GET /api/batches/:id`.
- Первый результат показывается до обзорного разбора; разбор — по кнопке (`ARCHITECT_ON_DEMAND`).
- Перенос объекта: единый предпросмотр, цена в попапе, тень вставки.
- Паспорт дизайна: экран и PDF (`src/passport.js`).
- Уровни «Старт/Про/Студия», разрешения 1K/2K/4K, кнопки «Подобрать 3/5 стилей».
- Метрики: `GET /api/admin/metrics`.

### Очередь генерации
- `claimNextRender`: `FOR UPDATE SKIP LOCKED` + lease 5 минут (миграция `051`).
- `claimed_by` (миграция `053`): heartbeat и завершение проверяют владельца; воркер, потерявший lease, не перезаписывает результат.
- `requeueProcessing` и reaper трогают только истёкшие lease; зависший `processing` дольше 60 минут падает и возвращает кредит.
- Глобальный image-слот — семафор (`src/imageslot.js`): лимиты система/провайдер/пользователь, а не Postgres advisory lock; ожидание ограничено, слот освобождается в `finally`.
- `WORKER_CONCURRENCY` (env, 1–500, по умолчанию 100): больше рендеров в работе; image-вызовы идут параллельно в пределах семафора (`IMAGE_CONCURRENCY` 100 / `IMAGE_CONCURRENCY_USER` 12).

### Direction
- Один vision-вызов арт-директора: факты по фото + поле `direction` (карточки стиля/концепции, история на входе). Без концепции или при конфликтной паре — `facts_only`, чтобы простые рендеры не дорожали.
- Кэш `room_analysis` (миграция `059`): размеры, мебель, ремонт, арт-направление, `direction` и layout на комнату/стиль/концепт/`keepFurniture`/размеры. Повторный рендер не платит за vision.
- Новизна — `src/variability.js`: акцент только из палитры стиля, seed-ротация, avoid последних 5 рендеров комнаты.
- Замеры: `art_direction_ok`, `design_direction_ok`, `room_analysis_cache_hit`, `layout_plan_cache_hit`.

### Тесты и CI
- Интеграционный харнесс: отдельная `<db>_test`, приложение без `listen`/воркеров, временный `DATA_DIR`, запрет S3 и нелокальной БД.
- 75 интеграционных тестов: кредиты/возвраты, очередь/lease/fencing, auth, комнаты, шаринг, платежи, файлы, image-слот, room_analysis, referral, cleanup-async.
- CI: backend unit + integration (Postgres service), web lint/build, catalog pytest; деплой зависит от `test`.

## Что работает

| Функция | Статус | Как проверить |
|---|---|---|
| Регистрация/вход по e-mail OTP | Работает | `/api/auth/request-code` → `/api/auth/verify` |
| Вход через Яндекс | Работает (если настроен) | `/api/auth/yandex/start` |
| Генерация по фото | Работает (live/mock) | `POST /api/rooms` → `GET /api/rooms/:id` |
| Мульти-стиль до 10 пар | Работает | `items: [{style, concept}]` |
| Библиотека 32 стилей | Работает | `/styles`, `/styles/:id`, `GET /api/styles` |
| Оценка размеров vision | Работает в воркере | `renders.meta.room_dimensions_estimate` |
| Очистка комнаты | Работает при `keep_furniture=false`; выключена по умолчанию, асинхронно при первом enqueue, shell переиспользуется | админка «Очистка» |
| Правки (3 бесплатные) | Работает; цена видна до подтверждения | `POST /api/rooms/:id/iterate` |
| Черновик генерации | Работает | закрыть/открыть вкладку, баннер «Продолжить/Начать заново» |
| Возврат кредита | Работает | тост после отмены/ошибки, `GET /api/credits/refunds` |
| Товарный QA | Работает для правки с `product_id` | `render.product_qa` |
| Шаринг `/s/:token` | Работает | лайки/комментарии |
| Разбор интерьера | Работает | `POST /api/renders/:id/breakdown` |
| Роадмап ремонта | Работает (после покупки) | `POST /api/renders/:id/roadmap` |
| Перенос объекта | Работает | `move` в iterate |
| Подбор товаров | Работает через MCP/catalog-service, бесплатно | `POST /api/renders/:id/product-search` |
| Платежи | Robokassa/ЮKassa; возвраты выключены | `POST /api/payments/create` |
| Рефералка | +2 кредита пригласившему после первой покупки | `/api/referral` |
| Админка | 15 вкладок | `/admin` + `X-Admin-Key` |
| Статьи | Работают | `/articles/:slug` |
| Стили (SSR) | Работают | `/styles`, `/styles/:key` |
| Search Lab | Внутренний R&D | `/admin` → «Поиск (лаб)» |
| Каталог | Демо, 100 товаров, 0 URL | админка «Каталог» |

## Что не работает / известные проблемы

1. **Реальные заказы:** нет товаров с URL; кнопка ведёт в поиск.
2. **Смета новых рендеров пустая:** `render_items` заполняется только у старых рендеров и правок.
3. **Legacy procurement (Yandex)** не подключён к API; код и таблицы ждут удаления.
4. **`/app` — 301**; старый редактор — только fallback `public/app.html`.
5. **`estimate-room`** не вызывается фронтендом.
6. **Style-ref/hero-референсы** выключены по умолчанию (`text`).
7. **Правила промта `catalogOn`, `styling`** не доходят до генерации; `furnitureOff` исправлен. Кнопка «Найти товары» скрыта до оживления procurement.
8. **Возвраты выключены** (`REFUNDS_ENABLED=false`); чеки автоматические через `src/receipts.js` при `RECEIPTS_WEBHOOK_URL`, без него — `pending` в `receipts`.
9. **Эксплуатация:** диск прода 39% (был 91%), cron-бэкап БД+файлов работает, restore проверен 2026-11-21 (PASS); копии **вне VPS** и внешнего uptime-алерта нет — G4/G8 не закрыты (см. `docs/ops/CHECKLIST-G4-G8.md`).
10. **Inpainting** люстр/розеток отсутствует.
11. **Один провайдер** — OpenRouter.

## Проверка (свежие прогоны, 2026-11-12)

- `npm test` — 508 pass, 1 skip (включая регрессию 20/20).
- `npm run test:integration` — 80/80.
- `cd web && npm run lint` — 0 errors; `npm run build` — зелёный.
- `catalog-service` pytest — 72 passed (сервис не менялся, прогон 2026-11-11).
- Прод-смоук 2026-11-12: `/api/health` → `ok:true`, `/` → 200, `/app` → 301, `/offer` → 200, `/api/referral/context` → `{invited:false}`, `/api/credits/refunds` без auth → 401 — PASS.
- Ops 2026-11-21: `smoke.sh` — PASS; `restore-verify.sh --latest` с прод-бэкапа — PASS (49 таблиц, migrations=64); `daily-check` — WARN только «off-site копия не отмечена».
- Миграции на проде: `059`, `060`, `061` (после деплоя 2026-11-12).

## Отложено (осознанно)

- Интеграционные тесты webhook/result идемпотентности платежей и amount mismatch.
- kill -9 e2e, QA-reject refund, TTL-истечение кэша, prompt-identity snapshot.
- Purge-job для `generation_cache`/`room_analysis`; утечка `app_settings` в admin-тесте.
- Глобальный cap одновременных cleanup-задач (сейчас ограничены image-семафором и lease).
- Direction/акцент для кастомных admin-стилей без статической палитры.
- Отдельное событие «вернулся с оплаты» для черновика.
- Redesign-срезы 2–6, 8–12: удаление legacy procurement, `runVisionTask`, фабрики настроек, реестр категорий, роутеры/DTO, фронтенд, выравнивание доков.
- Scaling plan, задачи 4–6: отдельный сервис воркера, per-user лимиты/капы, SSE, нагрузочные/chaos-тесты.

## Связанные документы

- [README.md](../README.md)
- [GENERATION-QUEUE.md](GENERATION-QUEUE.md)
- [docs/redesign/2026-11-11-redesign-codebase/redesign.md](redesign/2026-11-11-redesign-codebase/redesign.md)
- [docs/redesign/2026-11-11-redesign-codebase/plan.md](redesign/2026-11-11-redesign-codebase/plan.md)
- [OPERATIONS.md](OPERATIONS.md)
