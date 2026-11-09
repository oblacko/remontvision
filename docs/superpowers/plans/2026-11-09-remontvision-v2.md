# Ремонтвижн 2.0 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести продукт с «продажи генераций» на «продажу дизайнов с 3 бесплатными правками»: новые пакеты 10/20/60 кредитов, модели с ценой в кредитах (5 штук, управление в админке), приватный режим, подбор товаров в отдельной вкладке, честные тексты вместо «реальных товаров и сметы», плюс скорость и фундамент для выбора/перемещения объектов.

**Architecture:** Биллинг остаётся в `src/payments.js` (ledger `credit_txn`, атомарное списание в транзакции). Новое правило «1 дизайн = результат + 3 бесплатные правки» вводится через колонку `renders.root_render_id` и счётчик правок в том же списании. Модели — таблица `render_models`, наполняет владелец через админку; цена модели умножает списание стартового рендера. Пользовательские тексты меняются только в UI/публичных страницах; внутренние доки и код не трогаем.

**Tech Stack:** Node 20.6+ (ESM), Express, Postgres (миграции append-only в `migrations/`), React 19 + TypeScript (strict) + Tailwind 3 + shadcn-подобные `ui/*`, node:test, sharp.

**Spec:** утверждённый разговором дизайн (решения владельца, 2026-11-09) + `docs/launch/GROWTH-TEST.md` (рынок/офферы) + `docs/ui-kit.html` (дизайн-правило). Полный текст решений — в разделе «Решения владельца» ниже.

## Решения владельца (источник истины для текстов и биллинга)

1. Пакеты: **399 ₽ = 10 кредитов** («Одна комната»), **599 ₽ = 20** («Вся квартира»), **1 499 ₽ = 60** («Весь дом»).
2. Слова «генерация» нет в пользовательских текстах. Единица — **дизайн**. Громкая упаковка: «10 дизайнов и до 30 правок — 399 ₽», «Каждый дизайн включает 3 бесплатных изменения».
3. **1 дизайн = результат + 3 бесплатные правки.** Правка №4+ — **1 кредит** (подтверждено владельцем: фикс 1, не цена модели).
4. **Подбор товаров — отдельно, 1 кредит**, запускается **в отдельной вкладке браузера** по кнопке юзера; основная вкладка генератора не блокируется.
5. **5 моделей** в админке, у каждой своя цена в кредитах. Правки идут на модели дизайна (модель при правке менять нельзя).
6. **Приватный режим**: галочка только для пользователей с хотя бы одной успешной покупкой; на бесплатных — заблокирована с подписью «Только на платных пакетах». Приватный рендер **не попадает** в будущие галерею/статьи. **Кнопка «Поделиться» остаётся у всех.** Фото не удаляются; настройки удаления (какие/через сколько) владелец сделает позже — в этот план не входят.
7. Перемещение объектов — Путь 1 (промт из движения на текущих моделях); inpaint — позже.
8. Все новые экраны — по `docs/ui-kit.html`.

## Global Constraints

- Backend: ESM, 2 пробела, одинарные кавычки, `h()` вокруг async route-обработчиков, ошибки `{ error: 'русский текст' }`, SQL только параметризованный, миграции только новые файлы `NNN_snake_name.sql`.
- Frontend: strict TS, `import type`, без `any`, компоненты-function, `cn()`, Tailwind-токены из `index.css`; мобильный 360–390px без горизонтального скролла (`documentElement.scrollWidth === clientWidth`).
- UI-кит: кнопки ≥44px (S=44, M=48, L=56), офсетная тень 4px, hover только `@media (hover:hover)`, фокус чёрный 3px, выбор карточки = рамка 2px + цвет + значок (3 признака), шторки снизу на мобильном, контраст по таблице «Решения дизайнера», иконки штрих 1.5px/20px из набора кита, моно-метки ≥12px.
- Модели не хардкодить: `render_models` в БД, дефолты только как фолбэк.
- Пользовательский текст без слов «генераци…» и без «реальные товары»; слово «смета» — только в отрицательных формулировках оферты («Сервис не составляет смету») и в пометках «демо-пример».
- Определение done (AGENTS.md): `npm test` зелёный; `cd web && npm run lint`; `npm run build`; `docs/HISTORY.md` + relevant docs; нет секретов в диффе.

## Review Focus

1. **Правка меняет модель:** модель правки наследуется от родителя; выбор модели в UI правок заблокирован. Тест: `modelForEdit(parent)` возвращает модель родителя и игнорирует переданную.
2. **Цепочки правок глубже 2 уровней:** бесплатный лимит — 3 правки на корневой дизайн суммарно (правки правок считаются). Тест: root→A→B→C: A,B,C бесплатны; D (4-я) — 1 кредит.
3. **Сбой после платной правки:** `restoreCreditForRender` находит txn с `reason='iterate'` и возвращает 1 кредит; для бесплатной правки — no-op без ошибки. Тест: решение `editChargeDecision` + существующий тест восстановления.
4. **Приватный рендер и шаринг:** `is_private=true` исключает рендер из выборок для галереи/статей, но `/api/renders/:id/share` и публичная страница работают. Тест: SQL-фильтр + маршрут шаринга.
5. **Копирайт:** CI-скрипт падает, если в `web/src`, `web/index.html`, `public/*.html` встречаются `генераци` или `реальные товары`; «смета» допустима только в `public/offer.html` в отрицательной формулировке и в бейджах «демо-пример».
6. **UTM-атрибуция:** first-touch UTM переживает перезагрузки (localStorage, 30 дней), не перезаписывается повторными визитами и прикрепляется к `signup`/`render_start`/`purchase` ровно один раз на событие. Тест: юнит на модуль `utm.ts`.

---

# Блок 0. Биллинг, модели, приватность, тексты

## Task 0.1: Миграция — пакеты 10/20/60, таблица render_models, колонки рендеров

**Files:**
- Create: `migrations/0NN_billing_v2.sql` (номер = max существующего + 1; проверка: `ls migrations/ | sort | tail -1`)
- Modify: `src/payments.js:27-31` (PACKS fallback)

**Interfaces:**
- Produces: таблица `render_models(id text PK, label text, model_id text, credits int NOT NULL DEFAULT 1 CHECK (credits >= 1), art_direction_enabled bool DEFAULT true, active bool DEFAULT true, sort int DEFAULT 0)`; колонки `renders.root_render_id uuid NULL`, `renders.model_key text NULL`, `renders.model_credits int DEFAULT 1`, `renders.is_private boolean DEFAULT false`; пакеты room=10/flat=20/house=60.

- [ ] **Step 1: Написать падающий тест** `test/packs.test.js`

```js
test('packs: 10/20/60 кредитов', () => {
  const byId = Object.fromEntries(PACKS.map(p => [p.id, p]));
  assert.equal(byId.room.credits, 10);
  assert.equal(byId.room.price_kopecks, 39900);
  assert.equal(byId.flat.credits, 20);
  assert.equal(byId.house.credits, 60);
});
```

- [ ] **Step 2: Запустить тест — FAIL** (`node --test test/packs.test.js`; PACKS сейчас 8/15/50)
- [ ] **Step 3: Создать миграцию** по образцу `migrations/036_*.sql`: `UPDATE credit_packs SET credits=10 ... WHERE id='room'` (и flat=20, house=60) + `CREATE TABLE IF NOT EXISTS render_models ...` + `ALTER TABLE renders ADD COLUMN IF NOT EXISTS root_render_id uuid, ADD COLUMN IF NOT EXISTS model_key text, ADD COLUMN IF NOT EXISTS model_credits int DEFAULT 1, ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;` + бэкфилл `root_render_id`: рекурсивный CTE от старых цепочек (`WITH RECURSIVE` — корень = строка без parent, потомкам проставить id корня). Обновить PACKS в `payments.js`.
- [ ] **Step 4: Тест — PASS** (`node --test test/packs.test.js`)
- [ ] **Step 5: `npm test` зелёный; commit** `git add migrations src/payments.js test && git commit -m "feat(billing): packs 10/20/60, render_models table, render flags"`

## Task 0.2: Модуль правил списания `src/billing.js`

**Files:**
- Create: `src/billing.js`, `test/billing.test.js`

**Interfaces:**
- Produces: `editChargeDecision({ iteration, editCount }) -> { free: boolean }` (бесплатно при `iteration && editCount < 3`); `modelCreditsFor(modelKey, models) -> number` (credits активной модели, fallback 1); `modelForEdit(parentModelKey, models) -> string` (всегда ключ модели родителя; передача другой модели игнорируется); `FREE_EDITS = 3`.

- [ ] **Step 1: Тесты** — кейсы: правки 1–3 бесплатны (editCount 0,1,2 → free), 4-я платная (editCount 3 → не free), корневой рендер никогда не free (iteration=false), неизвестная модель → 1 кредит, модель за 2 кредита → 2, `modelForEdit` возвращает модель родителя.
- [ ] **Step 2: `node --test test/billing.test.js` — FAIL (модуль не существует)**
- [ ] **Step 3: Реализовать** чистые функции без БД (см. сигнатуры).
- [ ] **Step 4: PASS; commit** `feat(billing): edit charge rules and model pricing helpers`

## Task 0.3: Списание по новым правилам в `enqueueRenderWithCredit`

**Files:**
- Modify: `src/payments.js:350-408` (enqueueRenderWithCredit), `src/jobs.js:746` (enqueueRender — прокинуть `modelKey`, `modelCredits`, `isPrivate`)
- Modify: `src/server.js` — вызовы `enqueueRender` (строки ~1403 и ~2126) передают `modelKey`/`modelCredits`/`isPrivate`

**Interfaces:**
- Consumes: `editChargeDecision`, `modelCreditsFor` из Task 0.2.
- Produces: `enqueueRenderWithCredit({ ..., modelKey = null, modelCredits = 1, isPrivate = false })`. Логика в транзакции: корень → баланс ≥ `modelCredits`, txn `delta = -modelCredits`, `reason='render'`; правка → `editCount = SELECT COUNT(*) FROM renders WHERE root_render_id = $root AND id <> $id`; бесплатная → txn нет; платная → баланс ≥ 1, txn `delta = -1`, `reason='iterate'`. `root_render_id`: у корня = собственный id, у правки = от родителя. INSERT renders дополнен колонками `root_render_id, model_key, model_credits, is_private`.

- [ ] **Step 1: Юнит-тест** `test/billing.test.js`: SQL-фрагмент счёта правок параметризован и проверяется хелпером `rootEditCountSql` (чистая строка + параметры) — падает до реализации.
- [ ] **Step 2: FAIL; реализовать** в payments.js (транзакция как сейчас, добавляются только новые условия).
- [ ] **Step 3: `npm test` PASS** (регрессия: существующие тесты Robokassa/подписей не сломаны)
- [ ] **Step 4: commit** `feat(billing): per-model pricing and 3 free edits per design`

## Task 0.4: API моделей и правки моделей в запросах

**Files:**
- Modify: `src/server.js` — новые маршруты; валидация в `POST /api/rooms` и `POST /api/rooms/:id/iterate`
- Modify: `src/db.js` — `listRenderModels(activeOnly)`, `getRenderModel(key)`

**Interfaces:**
- Produces: `GET /api/models` → `{ models: [{ key, label, credits }] }` (только активные); `POST /api/rooms` и `POST /api/rooms/:id/iterate` принимают `model: string` (опционально; default — активная модель с sort=0; невалидный → 400 `{ error: 'Модель недоступна' }`) и `private: boolean`; у iterate `model` игнорируется (наследуется родитель), `private` наследуется от родителя.
- Изменение в `GET /api/credits`: добавить `has_purchased: boolean` (`SELECT EXISTS(... payments WHERE user_id=$1 AND status='succeeded')`).

- [ ] **Step 1: Юнит-тесты** `test/models.test.js`: парсер/валидатор `resolveModelKey(body, models)` (default, невалидный, неактивный), `inheritPrivate(parent, body)`.
- [ ] **Step 2: FAIL; реализовать** хелперы в `src/modelconfig.js` (или `billing.js`) + маршруты/валидацию.
- [ ] **Step 3: `npm test` PASS; commit** `feat(api): model selection and private flag on render endpoints`

## Task 0.5: Админка «Модели»

**Files:**
- Modify: `src/server.js` — `GET /api/admin/models`, `POST /api/admin/models` (upsert: id, label, model_id, credits, art_direction_enabled, active, sort), `POST /api/admin/models/:id/toggle`
- Modify: `web/src/pages/Admin.tsx` — секция «Модели»: таблица (kit `table`) + форма (kit `.fld`, `.chk`, `.btn btn--primary`), поля: label, model_id, credits (число ≥1), активна, art_direction, порядок. Рядом с каждой строкой — заметка «1 кредит ≈ 40 ₽; если модель дороже ~15–20 ₽ за рендер — ставьте 2 кредита».
- Modify: `web/src/components/GenerationPanel.tsx` — карточки выбора модели (kit `.tile` + 3 признака выбора), цена «N кр.»; при правке (`edit`-режиме) карточки заблокированы с подписью «Модель — от родительского дизайна»; галочка «Приватный режим» (kit `.chk`) disabled с подписью «Только на платных пакетах», когда `has_purchased=false`.

- [ ] **Step 1:** Backend-маршруты + валидация (id латиница, credits ≥ 1) — по образцу admin packs (server.js:575-590).
- [ ] **Step 2:** Admin.tsx секция; мобильная проверка 390px без hscroll.
- [ ] **Step 3:** GenerationPanel: пикер моделей (данные из `GET /api/models`), приватная галочка (данные `has_purchased` из `/api/credits`), проброс `model`/`private` в POST.
- [ ] **Step 4:** `cd web && npm run lint && npm run build`; ручной smoke: генератор 390×844 — карточки, блокировка правок, подпись у галочки.
- [ ] **Step 5:** commit `feat(admin+ui): render models CRUD and generator model picker with private toggle`

## Task 0.6: Подбор товаров в отдельной вкладке

**Files:**
- Modify: `web/src/App.tsx` (или router) — маршрут `/room/:id/procurement`
- Create: `web/src/pages/Procurement.tsx` — страница: рендер + `ProcurementPanel` + kit-прогресс (`.pb` + `.st`), заголовок «Поиск товаров», ссылка «Вернуться к результату» (kit `.btn` + иконка `l`)
- Modify: `web/src/components/ProcurementPanel.tsx` / кнопка запуска в результате — кнопка «Найти товары» становится ссылкой `target="_blank"` на `/room/:id/procurement`; `goal('product_click', { source })` при клике по ссылке товара

- [ ] **Step 1:** Маршрут + страница; кнопка открывает новую вкладку; задний API без изменений (`POST /api/renders/:id/product-search` остаётся).
- [ ] **Step 2:** lint + build; smoke: запуск из вкладки, прогресс, возврат, основная вкладка свободна.
- [ ] **Step 3:** commit `feat(ui): procurement opens in a separate tab`

## Task 0.7: Чистка копирайта «дизайны вместо генераций» + честные тексты

**Files:**
- Modify: `web/index.html` (title, description, keywords, OG, twitter, JSON-LD FAQ — «10 дизайнов за 399 ₽, в каждом 3 правки бесплатно»; убрать «реальные товары и смета» → «подбор товаров и ориентировочная стоимость»)
- Modify: `web/src/pages/Home.tsx` — :27 FAQ, :298 «Фото → дизайн → план ремонта», :309 герой, :338 «Бюджет до генерации» → «Класс материалов», :365-368 шаги, :393-409 блок примера с бейджем «демонстрационный пример, не оферта», :19-21 пакеты 10/20/60 + бейдж «Выгодно» на flat, герой-бейдж «10 дизайнов и до 30 правок — 399 ₽»
- Modify: `public/prices.html` — пакеты 10/20/60, «3 правки бесплатно в каждом дизайне», :57-58 → «подбор товаров и ориентировочная стоимость»
- Modify: `web/src/components/GenerationPanel.tsx` — этапы :180-191 («Генерация кадра» → «Создание дизайна»), подсказка загрузки (JPG/PNG/WebP/HEIC)
- Modify: `web/src/pages/Cabinet.tsx` — «дизайн» вместо «генераци…»
- Modify: `README.md`, `llms.txt` — числа 10/20/60, актуальный статус
- Create: `scripts/check-copy.mjs` + вызов из `npm test` (или отдельный `npm run check:copy`): фейл на `генераци` и `реальные товары` в `web/src`, `web/index.html`, `public/*.html`; «смета» допустима только в `public/offer.html` (отрицание) и с пометками «демо-пример»

- [ ] **Step 1:** Написать `scripts/check-copy.mjs` + тест-обёртку `test/copycheck.test.js` — FAIL на текущих текстах.
- [ ] **Step 2:** Пройтись по всем файлам (список выше), заменить тексты.
- [ ] **Step 3:** PASS; lint; build; `npm run docs:llms`.
- [ ] **Step 4:** commit `docs(ui): honest copy — designs with 3 free edits instead of generations`

## Task 0.8: Оферта и политика = факт

**Files:**
- Modify: `public/offer.html` — пакеты 10/20/60, провайдер: Robokassa (основной) и ЮKassa (резервный), 1–4 минуты, «1 дизайн = 1 результат + 3 правки бесплатно; каждая следующая правка — 1 кредит», «подбор товаров — 1 кредит», модели и их цены в кредитах (ссылка на `/prices`), приватный режим (не используется в примерах; фото не удаляются), явное «Сервис не составляет смету; стоимость — ориентир»
- Modify: `public/privacy.html` — пункты: приватный режим, согласие «использовать в примерах» (чекбокс появится в Проекте 4), обработка фото
- Modify: `public/sitemap.xml` — добавить `/offer` и опубликованные статьи

- [ ] **Step 1:** Тексты по факту (сверка: `/api/packs`, `/api/health`, `/api/models`).
- [ ] **Step 2:** sitemap: статьи — из `q.listArticles()` (`src/db.js:414`), статус `published`; генерировать динамически маршрутом `GET /sitemap.xml` (server.js) ИЛИ файлом при publish — выбрать маршрут (статьи публикуются в админке, файл устаревает).
- [ ] **Step 3:** Проверка: `curl /offer` содержит 10/20/60 и «1–4 минуты»; sitemap содержит `/articles/<slug>`.
- [ ] **Step 4:** commit `docs(legal): offer, privacy, sitemap reflect the real product`

## Task 0.9: UTM-персистентность + цели render_error, product_click

**Files:**
- Create: `web/src/lib/utm.ts` — `captureUtm()` (first-touch, localStorage `rv_utm`, 30 дней, не перезаписывать), `getUtm()` → объект параметров
- Modify: `web/src/lib/analytics.ts` — `goal(name, params)` мёржит `getUtm()` в `params.utm` (кроме `purchase`? нет — везде, кроме `share`)
- Modify: `web/src/App.tsx` (или main.tsx) — вызов `captureUtm()` при старте
- Modify: `web/src/components/TaskDock.tsx` / `GenerationPanel.tsx` — `goal('render_error', { room_id, stage })` при ошибке задачи
- Modify: `web/src/components/ProcurementPanel.tsx` — `goal('product_click', { source, url })` на клик карточки товара

- [ ] **Step 1:** Юнит `test/utm.test.js` (jsdom-фейк localStorage — чистые функции `captureUtmOnce`, `getUtm`: first-touch не перезаписывается, TTL 30 дней). FAIL → реализация.
- [ ] **Step 2:** Вызовы целей; lint; build.
- [ ] **Step 3:** commit `feat(analytics): utm persistence and render_error/product_click goals`

## Task 0.10: HEIC на загрузке

**Files:**
- Modify: `src/server.js:117-126` — `IMG_EXT['image/heic'] = '.jpg'`, `IMG_EXT['image/heif'] = '.jpg'`; в `saveUpload`: HEIC/HEIF → `await sharp(file.buffer).rotate().jpeg({ quality: 92 }).toBuffer()` перед `sanitizeImage`; текст ошибки фильтра «Только JPG/PNG/WebP/HEIC»
- Modify: подсказки загрузки в UI (kit `.dz` hint)

- [ ] **Step 1:** Тест `test/uploadformats.test.js`: генерация HEIC-фикстуры через sharp (`sharp(jpeg).heif()`), прогон `convertHeicIfNeeded(buffer, mimetype)` → JPEG-буфер, неповреждён; для JPG — буфер без изменений. FAIL → реализация хелпера в `src/server.js`-соседнем модуле (`src/imageupload.js`).
- [ ] **Step 2:** `npm test` PASS; smoke: загрузка реального HEIC с iPhone в dev.
- [ ] **Step 3:** commit `feat(upload): accept HEIC/HEIF with server-side conversion`

## Task 0.11: Уведомление «Готово» по e-mail

**Files:**
- Create: `src/notify.js` — `sendRenderDoneEmail(email, { roomType, style, shareUrl })` через существующий Resend-путь OTP (`src/auth.js`, env `RESEND_API_KEY`/`RESEND_TEMPLATE_ID`; без ключей — `log({ event: 'email_skipped' })`)
- Modify: `src/jobs.js` — в конце успешного рендера (`stage='done'`): если у владельца комнаты есть email — вызов notify (fire-and-forget, ошибки не роняют job)
- Modify: `web/src/components/GenerationPanel.tsx` — при старте долгого рендера: kit-заметка (`.ban` + иконка `info`) «Можно закрыть вкладку — пришлём письмо, когда будет готово»

- [ ] **Step 1:** Юнит `test/notify.test.js`: шаблон темы/текста письма, пропуск без ключа (чистая функция `renderDoneEmail(...)` → {subject, text}). FAIL → реализация.
- [ ] **Step 2:** Подключение в jobs.js; lint; build.
- [ ] **Step 3:** commit `feat(notify): render-done email and close-tab hint`

## Task 0.12: Реферальная программа «+2 кредита обоим»

**Files:**
- Create: `migrations/0NN_referral.sql` — `referral_codes(id, user_id, code UNIQUE, created_at)` + `referral_rewards(invitee_id, owner_id, PRIMARY KEY(invitee_id))`
- Create: `src/referral.js` — `codeForUser(userId)` (8 символов), `resolveCode(code)`, `rewardPair(ownerId, inviteeId)` (однократно, без self-referral; оба +2 через `grantCredits`/`adjustCredits`, reason `'referral'`)
- Modify: `src/server.js` — `GET /r/:code` (cookie `rv_ref` 30 дней → redirect `/`); при signup с валидным `rv_ref` → reward
- Modify: `web/src/pages/Cabinet.tsx` — блок «Пригласите друга — +2 кредита обоим» с копированием ссылки (kit `.btn btn--s` + toast «Ссылка скопирована»)

- [ ] **Step 1:** Юнит `test/referral.test.js`: решение `rewardDecision({ sameUser, alreadyRewarded })`, генерация/проверка кода. FAIL → реализация.
- [ ] **Step 2:** Маршруты + кабинет; lint; build.
- [ ] **Step 3:** commit `feat(referral): +2 credits for both sides, one-time`

---

# Проект 1. Скорость

## Task 1.1: Замер пайплайна

- [ ] **Step 1:** Create `scripts/ops/speed-report.mjs`: читает `renders.meta.cost_breakdown` (ключи `art_direction`, `cleanup`, `design`, `design_retry`, `architecture_qa`, `product_qa`, `render_analysis`, `failed`) и ms из `meta.*.ms`; выводит p50/p90/mean по этапам и общему времени, за последние N=50 успешных рендеров.
- [ ] **Step 2:** Прогнать на проде (read-only) → отчёт в `docs/ops/speed-2026-11.md`; зафиксировать baseline p50/p90.
- [ ] **Step 3:** commit `ops(speed): baseline report script`

## Task 1.2: Меры (по результатам 1.1, все выключаемые)

- [ ] **Step 1:** `IMAGE_MIN_GAP_MS` (сейчас константа в `src/openrouter.js`) → в `app_settings` с текущим дефолтом; `ART_DIRECTION_ENABLED` → per-model (`render_models.art_direction_enabled`, фолбэк на текущий env-флаг).
- [ ] **Step 2:** UI: kit-этапы с ETA («Обычно 1–4 минуты»), прогресс `.pb`/`.st` уже есть — добавить ETA-подпись.
- [ ] **Step 3:** Юнит `test/renderconfig.test.js` (регрессия: флаги читаются из app_settings, env-фолбэк). `npm test` PASS.
- [ ] **Step 4:** Повторный замер `speed-report.mjs`; отчёт до/после; **QA не ухудшился** (сравнить долю `render_error`, vision QA остаётся). commit `perf(render): configurable gap and per-model art direction`

---

# Проекты 2–4: контуры (отдельные детальные планы при старте)

**Проект 2 — Выбор и перемещение объектов (Путь 1).** Задачи-группы: (1) vision-детекция объектов `{bbox,label}` в потоке правок — перенос механики из `src/searchservice.js` (`cropByBbox`, расширение 10%) в `src/objectdetect.js` + сохранение `renders.meta.objects`; (2) слой кликабельных боксов `web/src/components/ObjectLayer.tsx` (kit: оранжевая рамка выбора, mono-метки, цели ≥44px, drag с дельтой в % кадра); (3) генератор инструкции перемещения из bbox+дельты → `edit_target`; (4) привязка `buildSuggestions` (`src/analysis.js:166`) к выбранному объекту — юзер правит текст подсказки, объект сохраняется; (5) честная подпись «мелкие детали могут измениться». Тесты: `test/objectdetect.test.js` (парсинг bbox), `test/moveinstruct.test.js` (инструкция из дельты), QA обязателен.

**Проект 3 — Платный разбор и доп-продукты.** (1) флаги отображения разбора (RAL/электрика/подсказки/план закупки) по `has_purchased`; (2) PDF «Паспорт ремонта» — fake-door кнопка + тест цен 199/299/390 ₽; (3) бюджет-коридор (~40 позиций × 4 класса, площади из `src/scaleplan.js`, итог «от–до» + резерв 15–20%) — заменяет слово «смета»; (4) ТЗ для мастера — бесплатно в пакете.

**Проект 4 — Галерея и статьи-минилендинги.** (1) чекбокс согласия «использовать в примерах» (переиспользовать `recordAcceptances` из `src/auth.js`); (2) галерея до/после с фильтром `is_private=false AND consent=true`; (3) статьи с реальными рендерами (`src/articles.js`) + CTA с UTM; (4) 2–3 статьи под запросы.

---

## Порядок исполнения

Блок 0: 0.1 → 0.2 → 0.3 → 0.4 → 0.5 (0.6–0.12 параллельно). Проект 1 после Блока 0. Затем Проект 2 (отдельный план), 3, 4. Перед любым платным тестом — gates G1–G10 из `docs/launch/LAUNCH-GATES.md` (вне этого плана).

## Открытые решения (не блокируют старт)

- Список из 5 моделей и их цены в кредитах — наполняет владелец в админке после Task 0.5 (дефолты: текущий `RENDER_MODEL` = 1 кредит).
- Юридическая сверка оферты (Task 0.8) — владелец.
- Настройки удаления фото («какие и через сколько») — позже, владельцем, вне этого плана.
