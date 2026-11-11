# Redesign (codebase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking. **Slice 1 must be complete and green before any restructure slice starts.**

**Goal:** Привести кодовую базу к проверяемой и простой структуре: удалить мёртвый legacy, свести AI-вызов в одну точку, развести HTTP/домен/данные, закрепить инварианты тестами — без изменения пользовательского поведения.

**Architecture:** Сначала characterization-тесты и CI-гейт, затем удаление мёртвого кода, затем `runVisionTask` как единственная точка AI-вызова, фабрики настроек, реестр категорий, роутеры/DTO, инварианты очереди, стадии `processRender`, агрегаты `db.js`, фронтовый reducer и приведение доков к коду.

**Tech Stack:** Node 20 ESM, Express, PostgreSQL 16, node:test, React 19 + TS + Vite, Python FastAPI (catalog-service), docker-compose.

**Spec:** `app/docs/redesign/2026-11-11-redesign-codebase/redesign.md` (находки, инварианты, order). Связанный план очереди: `/home/oblacko/.opencode/plan/2026-11-11-generation-queue-scaling.md`.

## Global Constraints

- Правила `app/AGENTS.md` действуют: ESM + `.js` в импортах, 2 пробела, одинарные кавычки, `h()` для async-роутов, параметризованный SQL, `withTransaction`, ошибки `{error: 'русский'}`.
- Миграции только новыми файлами `NNN_snake_name.sql`; применённые не редактировать (включая переименования 046/047→048/049 — фиксируем факт, не переписываем).
- Секреты не коммитить; внешние картинки — только `fetchRemoteImage`.
- Перед деплоем, платными вызовами, удалением/откатом данных — явное «да» владельца.
- Definition of Done каждого среза: `npm test` зелёный, `cd web && npm run lint && npm run build`, обновлён `docs/HISTORY.md`, `npm run docs:llms` при изменении доков.
- Никаких изменений пользовательского поведения до Slice 1: characterization-тесты фиксируют сегодняшнее поведение и проходят на текущем коде по построению (документированное исключение из правила «сначала падающий тест»).

## Review Focus

Пять классов, которые вероятнее всего сломаются при реструктуризации; каждый получает тест в своём срезе:

1. **Деньги под конкуренцией** — двойное списание/возврат кредита при параллельном enqueue, retry, timeout и QA-reject (Slice 1.2, 7).
2. **Потеря/дубль рендера** — kill воркера, restart, вторая реплика (Slice 1.2, 7).
3. **Идемпотентность и подлинность платежа** — повторный webhook/result, неверная подпись, amount mismatch (Slice 1.2).
4. **Дрейф промта** — после выноса AI-gateway/категорий базовый кадр и edit-промт остаются байт-в-байт эквивалентны (Slice 3, 5).
5. **Молча не применённая настройка** — админ переключает, воркер игнорирует (Slice 4).

---

## Slice 1: Safety net — characterization-тесты и CI-гейт

**Зависит от:** ничего. **Блокирует:** все остальные срезы.

### Task 1.1: Тестовая инфраструктура (DB + app factory + фейковый AI)

**Files:**
- Create: `test/support/db.js`, `test/support/app.js`, `test/support/fake-ai.js`, `test/support/fixtures.js`
- Modify: `package.json` (script `test:integration`)

**Interfaces:**
- `withTestDb(fn)` → поднимает временную БД (docker `db` на 5434 или `RV_TEST_DATABASE_URL`), применяет миграции, очищает таблицы, вызывает `fn({ q, pool, client })`
- `createTestApp({ ai })` → Express-приложение без `startWorker`, с инъекцией fake AI и temp storage
- `fakeAi` → `{ visionJson, generateRender, ... }`, считает вызовы, умеет отдавать 429/пустой JSON/ошибку
- `seedRoom()/seedUser()` → минимальные фикстуры

- [ ] `test/support/db.js`: миграции на чистой БД применяются дважды (идемпотентно), очистка между тестами
- [ ] `test/support/app.js`: приложение стартует без воркера и принимает fake AI через параметр
- [ ] `test/support/fake-ai.js`: считает вызовы, конфигурируемые ответы/ошибки
- [ ] `npm run test:integration` проходит на пустом наборе
- [ ] Commit: `test: integration harness with database and fake AI`

### Task 1.2: Characterization-тесты критичных границ

**Files:**
- Create: `test/integration/credits.test.js`, `queue.test.js`, `auth.test.js`, `payments.test.js`, `rooms.test.js`, `share.test.js`, `admin-settings.test.js`, `files.test.js`

**Interfaces:** используют харнесс 1.1; каждый тест — «текущее поведение», без изменения кода продукта.

- [ ] `credits.test.js`: корень списывает `modelCredits`; 3 бесплатные правки; 4-я платная; refund ровно один раз и ровно списанной суммы; параллельный enqueue не уводит баланс в минус
- [ ] `queue.test.js`: `POST /api/rooms` → `claimNextRender` → `processRender` (fake AI) → `done`; ошибка стадии → `error` + refund; timeout-reaper возвращает кредит; restart/вторая реплика не дублирует списание (текущее поведение фиксируется как есть, дефекты помечаются `TODO(slice7)`)
- [ ] `auth.test.js`: OTP-лимиты, verify, cookie-флаги, `sessionUser`, logout; OAuth `safeRedirectPath` и state
- [ ] `payments.test.js`: create → webhook/result → credits идемпотентно; подписи; amount mismatch; повторная доставка
- [ ] `rooms.test.js`: 402 при нехватке кредитов, 409 при активной комнате, 404 чужой комнаты, rollback комнаты при частичном 402
- [ ] `share.test.js`: `/s/:token` поля, OG-экранирование, лайк/комментарий
- [ ] `admin-settings.test.js`: save/load/reset каждого стора; 403 без `X-Admin-Key`
- [ ] `files.test.js`: владелец файла, 401/404, S3/disk
- [ ] Все тесты зелёные на текущем коде; Commit: `test: characterize credits, queue, auth, payments, rooms, admin`

### Task 1.3: CI-гейт

**Files:**
- Create: `.github/workflows/ci.yml` (или job `test` в `deploy.yml` перед деплоем)

- [ ] CI: `npm ci && npm test` (backend), `pytest` (catalog-service), `cd web && npm ci && npm run lint && npm run build`
- [ ] Деплой зависит от зелёного теста (`needs: test`)
- [ ] PR-прогон + push в `main`
- [ ] Commit: `ci: run tests, lint and build before deploy`

---

## Slice 2: Удаление мёртвого legacy

**Зависит от:** Slice 1.2 (пин-тесты). **BLOCKED-ON-TESTS:** нет (поведение удаляемого недостижимо).

**Files:**
- Delete: `src/procurement.js`, `src/procurementjobs.js`, `src/procurementtemplates.js`, `src/procurementconfig.js`
- Modify: `src/db.js` (удалить procurement-методы 479-585), `src/server.js` (удалить `/buy/:id` при подтверждении), `web/src/pages/Admin.tsx` (убрать вкладку), `src/payments.js` (убрать `spendCredit*`, `PACKS` → `q.creditPacks`), `src/openrouter.js` (удалить `estimateRoomDimensions`), `scripts/ops/speed-report.mjs` (перенести `src/speedreport.js`), `web/src/components/ui/*` (удалить 50 неиспользуемых)
- Create: `migrations/051_drop_procurement.sql` — только после явного «да» владельца (деструктивно)

- [ ] `grep` подтверждает отсутствие вызовов удаляемых символов
- [ ] `npm test` + `test:integration` зелёные (поведение не изменилось)
- [ ] Docs: `PROCUREMENT.md` → статус «удалено», `API.md` без procurement-роутов, `AGENTS.md` таблица без procurement
- [ ] Решение владельца по деструктивной миграции; без «да» — таблицы остаются
- [ ] Commit: `refactor: remove dead procurement subsystem and unused UI`

---

## Slice 3: AI-gateway `runVisionTask`

**Зависит от:** Slice 1.2.

**Files:**
- Create: `src/ai/visiontask.js`, `src/credits.js`
- Modify: `src/openrouter.js`, `src/architect.js`, `src/breakdown.js`, `src/roadmap.js`, `src/designeragent.js`, `src/artdirector.js`, `src/layoutagent.js`, `src/productpicker.js`, `src/articles.js`, `src/payments.js`, `src/referral.js`

**Interfaces:**
- `runVisionTask({ system, user, images, modelPool, schema, normalize, isEmpty, sessionId })` → `{ parsed, cost, model }`; единые retry/timeout/cost; modelPool — из `modelconfig`
- `credits.js`: `grantCredits/spend/restore/balance`; `payments` и `referral` зависят от него

- [ ] Тест: `runVisionTask` делает fallback по modelPool, суммирует cost, возвращает null при пустом ответе (fake AI)
- [ ] Тест: байт-в-байт промт базового и edit-рендера до/после (snapshot `prompt.test.js`)
- [ ] Мигрированы 6 agent-модулей (C2) и 7 сырых вызовов (C3); `estimateRoomDimensions` удалён
- [ ] Цикл `payments↔referral` исчез, динамические импорты удалены
- [ ] `npm test` зелёный; Commit: `refactor(ai): single vision task gateway and credits module`

---

## Slice 4: Фабрики настроек и админ-роуты

**Зависит от:** Slice 1.2, 3.

**Files:**
- Create: `src/settings/store.js` (`createSettingsStore`, `createPromptStore`)
- Modify: 8 конфиг-модулей, `src/server.js`, `web/src/pages/Admin.tsx`

**Interfaces:**
- `createSettingsStore({ key, defaults, validate, reset })` → `{ get, getDefaults, load, save, reset, setForTests }`
- `mountSettings(app, store, path)` → GET/PUT/reset
- `app.use('/api/admin', requireAdmin)` — охрана в одном месте

- [ ] Тест: все 8 сторов проходят один контракт save/load/reset
- [ ] Тест: 403 на любой `/api/admin/*` без ключа
- [ ] `requireAdmin` в роутах удалён (×79)
- [ ] Решение владельца по no-op переключателям (подключить/удалить); тест: изменение настройки меняет поведение воркера
- [ ] Commit: `refactor(settings): store factories and single admin guard`

---

## Slice 5: Реестр категорий

**Зависит от:** Slice 1.2, 3.

**Files:**
- Create: `src/categories.js`, `catalog-service/app/categories.py` (генерация или endpoint)
- Modify: `src/roomtypes.js`, `src/pricing.js`, `src/curate.js`, `src/architect.js`, `src/searchvision.js`, `src/analysis.js`, `src/openrouter.js`, `catalog-service/app/*`

**Interfaces:**
- `CATEGORIES` → `[{ id, ru, en, layer, slotAliases, procurementQuery }]`; `bySlot(slot)`, `toPromptConstraint()`

- [ ] Тест: нет дублей id, все slotAliases указывают на существующие id
- [ ] Тест: промт-констрейнт и SLOT_LABELS генерируются из реестра (snapshot)
- [ ] Python получает тот же список (endpoint/файл); тест паритета
- [ ] Commit: `refactor(catalog): single category registry`

---

## Slice 6: HTTP-роутеры, DTO, общие типы API

**Зависит от:** Slice 1.2, 4.

**Files:**
- Create: `src/http/*.js` (auth, payments, admin, rooms, renders, search, share, files), `src/dtos.js`, `src/image.js`, `web/src/lib/api.ts`, `web/src/types/api.ts`
- Modify: `src/server.js` (только wiring), `web/src/pages/*`, `web/src/components/*`

**Interfaces:**
- `renderDto(render, room)` / `roomDto(...)` / `itemDto(...)`; `renderToDataUrl(path)`, `mimeForPath(path)`
- `request<T>(path, init)` → типизированные ошибки 401/402/409/503

- [ ] Тест: `/api/rooms/:id` и `/versions` содержат одинаковый набор полей
- [ ] Тест: 401/402/404/409/503 на репрезентативных роутах
- [ ] Фронт не содержит собственных `RoomData`/`ProductMatch`; `json().catch` заменён клиентом
- [ ] `npm run build` зелёный; Commit: `refactor(http): routers, DTOs and shared API types`

---

## Slice 7: Инварианты очереди

**Зависит от:** Slice 1.2. Синхронно с `2026-11-11-generation-queue-scaling.md`.

**Files:**
- Create: `migrations/051_render_lease.sql`
- Modify: `src/db.js`, `src/jobs.js`, `src/openrouter.js`

**Interfaces:** `claimNextRender()` (SKIP LOCKED + lease), `heartbeatRender(id)`, `requeueProcessing()` (только истёкший lease), `withImageSlot` (advisory lock).

- [ ] Тесты из Review Focus №1-2: двойной claim, kill/restart, вторая реплика, refund ровно один раз
- [ ] Индекс `(status, created_at) WHERE status='queued'`
- [ ] Reaper считает от lease; heartbeat каждые 30 с
- [ ] Commit: `fix(queue): skip-locked claim, lease and global image slot`

---

## Slice 8: `processRender` → стадии

**Зависит от:** Slice 1.2, 3.

**Files:**
- Modify: `src/jobs.js`; Create: `src/pipeline/stages.js`

**Interfaces:** `stage(ctx)`, `runStage(stage, ctx)` (оборачивает stage/cost/refund); `BASE_STAGES`, `EDIT_STAGES`.

- [ ] Тест: порядок стадий base/edit совпадает с текущим
- [ ] Тест: ошибка на каждой стадии даёт тот же `error_stage`, `cost_breakdown` и refund, что сейчас
- [ ] `processRender` ≤ 100 строк; Commit: `refactor(jobs): stage pipeline`

---

## Slice 9: `db.js` → агрегаты и repository port

**Зависит от:** Slice 1.1, 8.

**Files:**
- Create: `src/data/repository.js` (интерфейс), `src/data/rooms.js`, `renders.js`, `credits.js`, `catalog.js`, `search.js`, `styles.js`, `settings.js`, `roadmap.js`
- Modify: `src/db.js`, импорты модулей

- [ ] Repository-контракт-тесты гоняются против fake и реальной БД
- [ ] `createRoom({...fields})` объектом; `patchRow()` один; 19-аргументный вызов удалён
- [ ] Commit: `refactor(db): aggregates and repository port`

---

## Slice 10: Фронтенд-декомпозиция

**Зависит от:** Slice 6.

**Files:**
- Create: `web/src/hooks/useGenerationFlow.ts`, `useRoom.ts`, `useSettingsTab.ts`, `web/src/lib/api.ts` (расширение)
- Modify: `web/src/components/GenerationPanel.tsx`, `web/src/pages/Admin.tsx`, `SearchPipeline.tsx`/`SearchLab.tsx`
- Add: `web/src/**/*.test.ts(x)` + vitest

- [ ] vitest: reducer `useGenerationFlow` (photo→style→generating→result), ошибки 401/402/409
- [ ] `GenerationPanel` < 500 строк, `Admin` < 800, вкладки через реестр
- [ ] Один Search Lab (второй удалён или редирект)
- [ ] `npm run lint && npm run build`; Commit: `refactor(web): flow reducer and page decomposition`

---

## Slice 11: Документация = код

**Зависит от:** 2-10.

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/API.md`, `docs/GENERATION.md`, `docs/GENERATION-FLOW.md`, `docs/PROCUREMENT.md`, `docs/ADMIN.md`, `docs/ROADMAP.md`, `docs/HISTORY.md`, `llms.txt`, `llms-full.txt`
- Add: `docs/GENERATION-QUEUE.md` в git

- [ ] Каждое утверждение README/AGENTS проверено grep'ом по коду
- [ ] Числа (тесты, миграции, стили, вкладки) взяты из фактов
- [ ] `npm run docs:llms` пересобран; `docs:check`/`check:copy` зелёные
- [ ] Commit: `docs: align project docs with current code`

---

## Slice 12: Финальная проверка инвариантов и сложности

**Зависит от:** 1-11.

- [ ] Все инварианты из `redesign.md` покрыты тестами и зелёные
- [ ] Нет файлов >1000 строк и функций >50 строк без обоснования
- [ ] Нет фичевой логики в shared-слоях; нет `any`/escape-hatch-типов
- [ ] Метрики до/после в `docs/redesign/2026-11-11-redesign-codebase/`: строк по файлам, число роутов в `server.js`, число копий AI-вызова
- [ ] Полный прогон: `npm test`, `test:integration`, `pytest`, `lint`, `build`
- [ ] Итоговый отчёт; срез документирован в HISTORY
