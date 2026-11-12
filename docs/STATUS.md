# Статус проекта: что сделано и что работает

**Дата:** 2026-11-11. **Прод:** 092bdcd. **Ветка:** `main`.

Это единый источник истины о состоянии продукта. Остальные документы описывают механику; при расхождении верьте этому файлу и коду.

## Сделано за последние изменения

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
- `WORKER_CONCURRENCY` (1–8, по умолчанию 6): больше рендеров в работе; image-вызовы идут параллельно в пределах семафора.

### Direction
- Один vision-вызов арт-директора: факты по фото + поле `direction` (карточки стиля/концепции, история на входе). Без концепции или при конфликтной паре — `facts_only`, чтобы простые рендеры не дорожали.
- Кэш `room_analysis` (миграция `059`): размеры, мебель, ремонт, арт-направление, `direction` и layout на комнату/стиль/концепт/`keepFurniture`/размеры. Повторный рендер не платит за vision.
- Новизна — `src/variability.js`: акцент только из палитры стиля, seed-ротация, avoid последних 5 рендеров комнаты.
- Замеры: `art_direction_ok`, `design_direction_ok`, `room_analysis_cache_hit`, `layout_plan_cache_hit`.

### Тесты и CI
- Интеграционный харнесс: отдельная `<db>_test`, приложение без `listen`/воркеров, временный `DATA_DIR`, запрет S3 и нелокальной БД.
- 45 интеграционных тестов: кредиты/возвраты, очередь/lease/fencing, auth, комнаты, шаринг, платежи, файлы, image-слот, direction-кэш.
- CI: backend unit + integration (Postgres service), web lint/build, catalog pytest; деплой зависит от `test`.

## Что работает

| Функция | Статус | Как проверить |
|---|---|---|
| Регистрация/вход по e-mail OTP | Работает | `/api/auth/request-code` → `/api/auth/verify` |
| Вход через Яндекс | Работает (если настроен) | `/api/auth/yandex/start` |
| Генерация по фото | Работает (live/mock) | `POST /api/rooms` → `GET /api/rooms/:id` |
| Мульти-стиль до 8 пар | Работает | `items: [{style, concept}]` |
| Оценка размеров vision | Работает в воркере | `renders.meta.room_dimensions_estimate` |
| Очистка комнаты | Работает при `keep_furniture=false`; выключена по умолчанию | админка «Очистка» |
| Правки (3 бесплатные) | Работает | `POST /api/rooms/:id/iterate` |
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
| Search Lab | Внутренний R&D | `/admin` → «Поиск (лаб)» |
| Каталог | Демо, 100 товаров, 0 URL | админка «Каталог» |

## Что не работает / известные проблемы

1. **Реальные заказы:** нет товаров с URL; кнопка ведёт в поиск.
2. **Смета новых рендеров пустая:** `render_items` заполняется только у старых рендеров и правок.
3. **Legacy procurement (Yandex)** не подключён к API; код и таблицы ждут удаления.
4. **`/app` — 301**; старый редактор — только fallback `public/app.html`.
5. **`estimate-room`** не вызывается фронтендом.
6. **Style-ref/hero-референсы** выключены по умолчанию (`text`).
7. **Правила промта `furnitureOff`, `catalogOn`, `styling`** не доходят до генерации — известный баг, см. `docs/redesign/`.
8. **Возвраты выключены** (`REFUNDS_ENABLED=false`); чеки автоматические через `src/receipts.js` при `RECEIPTS_WEBHOOK_URL`, без него — `pending` в `receipts`.
9. **Диск прода 91%**, бэкап 45 ч без `db_dump` — эксплуатационный CRIT.
10. **Inpainting** люстр/розеток отсутствует.
11. **Один провайдер** — OpenRouter.

## Проверка (свежие прогоны, 2026-11-11)

- `npm test` — 363 pass, 1 skip.
- `npm run test:integration` — 45/45.
- `cd web && npm run lint` — 0 errors; `npm run build` — зелёный.
- `catalog-service` pytest — 72 passed.
- Прод-смоук: `/api/health`, `/`, `/app`, `/offer` — PASS.
- Миграции на проде: `051`, `052`, `053`.

## Отложено (осознанно)

- Интеграционные тесты webhook/result идемпотентности платежей и amount mismatch.
- kill -9 e2e, QA-reject refund, TTL-истечение кэша, prompt-identity snapshot.
- Purge-job для `generation_cache`; утечка `app_settings` в admin-тесте.
- Redesign-срезы 2–6, 8–12: удаление legacy procurement, `runVisionTask`, фабрики настроек, реестр категорий, роутеры/DTO, фронтенд, выравнивание доков.
- Scaling plan, задачи 4–6: отдельный сервис воркера, per-user лимиты/капы, SSE, нагрузочные/chaos-тесты.

## Связанные документы

- [README.md](../README.md)
- [GENERATION-QUEUE.md](GENERATION-QUEUE.md)
- [docs/redesign/2026-11-11-redesign-codebase/redesign.md](redesign/2026-11-11-redesign-codebase/redesign.md)
- [docs/redesign/2026-11-11-redesign-codebase/plan.md](redesign/2026-11-11-redesign-codebase/plan.md)
- [OPERATIONS.md](OPERATIONS.md)
