# Design Session Pipeline — Phase 1: Architect Review + Real Catalog Products

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** После генерации один vision-проход архитектора разбирает готовый рендер и возвращает подсказки, палитру, электрику и список предметов; предметы матчатся в реальные офферы catalog-service (Hoff) и показываются в результате вместо демо-сметы.

**Architecture:** Новый модуль `src/architect.js` делает структурированный разбор рендера (DeepSeek, fallback на VISION_MODEL). Новый модуль `src/designoffers.js` превращает предметы в офферы через `catalogclient.searchCatalogText`. `jobs.js` вызывает разбор вместо `parseRender` (с fallback), убирает демо-`curateProducts`/`matchCatalog` и отдельный `ARCHITECTURE_QA`. Результат складывается в `renders.analysis`, который уже отдаётся в DTO и используется UI.

**Tech Stack:** Node 20 ESM, node:test, React 19 + TS, catalog-service `/search-text`, OpenRouter chat/vision.

**Spec:** `docs/DESIGN-SESSION.md` (product/architecture решение, записанное по итогам обсуждения).

## Global Constraints

- Не менять платежи, Robokassa, кредитную логику и промт базовой генерации без отдельной задачи.
- Все внешние запросы к каталогу — только через `src/catalogclient.js`; таймауты и ошибки не должны ронять рендер.
- Если каталог недоступен или категории нет — честно `offers: []` и `note`, без подстановки чужих категорий.
- `renders.analysis` остаётся JSONB; новые поля добавляются обратно совместимо.
- Не логировать секреты и токен каталога.
- Тесты: `npm test`; фронт: `npx eslint` по изменённым файлам, `npm run build`.
- Не деплоить без явной команды.

## Review Focus

- Пустой/битый JSON от vision-модели → рендер всё равно `done`, разбор fallback на `parseRender`.
- Catalog-service недоступен/таймаут → генерация не падает, товары помечены «каталог недоступен».
- Категория есть у vision, но отсутствует в Hoff (например, `tile`) → `offers: []`, без fallback в `decor`.
- В рендере 20+ предметов → матчинг ограничен, время и стоимость не растут бесконтрольно.
- Старые рендеры без `analysis.architect` → UI показывает прежний блок, ничего не ломается.

---

### Task 1: Architect review module

**Files:**
- Create: `src/architect.js`
- Test: `test/architect.test.js`

**Interfaces:**
- Produces: `normalizeArchitect(parsed) -> { room, palette, items, strengths, issues, hints, electrical }`
- Produces: `reviewDesign({ imageDataUrl, roomType, style, priceTier, mode, vision }) -> Promise<{ parsed, architect, cost } | null>`
  - `parsed` совместим с `parseRender`: `{ items, surfaces, visible, electrical }`.
  - `mode`: `'hints' | 'final'`.
  - `vision` — инъекция для тестов; по умолчанию `(await import('./openrouter.js')).visionJson`.

- [ ] **Step 1: Write failing tests**

Проверить: нормализация обрезает строки, оставляет только валидные категории, bbox 0..1, hints ≤ 6, palette hex только `#RRGGBB`, пустой ответ → `null` без исключения.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/architect.test.js`
Expected: FAIL `normalizeArchitect is not a function`.

- [ ] **Step 3: Implement `src/architect.js`**

Промт: архитектор смотрит готовый рендер, возвращает строгий JSON. Категории — `VISION_CATEGORIES` из catalog-service (bed, sofa, armchair, wardrobe, sideboard, storage, dining_table, coffee_table, desk, light, rug, mirror, decor, curtain, bedding, textile, wall_covering, floor_covering, tile, skirting, faucet, sink, shower, bathtub, toilet, appliance, cabinet, countertop, mattress). Модель: `ARCHITECT_MODEL || SEARCH_VISION_MODEL || 'deepseek/deepseek-v4.1-flash-1017'`; если текст пустой — повтор с `model: null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/architect.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/architect.js test/architect.test.js
git commit -m "feat: add architect review of generated render"
```

---

### Task 2: Catalog offer matching

**Files:**
- Create: `src/designoffers.js`
- Test: `test/designoffers.test.js`

**Interfaces:**
- Produces: `matchDesignOffers({ items, roomType, topK = 3, search = null }) -> Promise<Array<{ item, offers, note? }>>`
  - `search` — инъекция `searchCatalogText` для тестов.
  - `offers[]`: `{ id, name, price, currency, merchant, url, image_url, erid, score, params }`.
  - Ошибка одного item не роняет остальные; `note` содержит причину.
  - Не более 12 items, конкурентность 3.

- [ ] **Step 1: Write failing tests**

Проверить: один item → офферы нормализованы; пустая категория → `offers: []` + note; ошибка поиска → note, остальные items живы; лимит topK.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/designoffers.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/designoffers.js`**

Использовать `searchCatalogText({ query, filters: { categories: [category] }, product, topK })`. `query` = `item.search_query || [item.label, item.subtype, item.color, item.material].join(' ')`. `product` = `{ label, color, material, product_type, size, category }`. `url` = `affiliate_url || canonical_url`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/designoffers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/designoffers.js test/designoffers.test.js
git commit -m "feat: match generated design items to catalog offers"
```

---

### Task 3: Wire review + offers into generation

**Files:**
- Modify: `src/jobs.js`
- Modify: `src/server.js` (default `use_catalog=true`)
- Modify: `src/db.js` (only if a query is missing)

- [ ] **Step 1: Replace `parseRender` with architect review + fallback**

After saving the render image: call `reviewDesign(...)`; on success use `review.parsed`; on failure/empty call `parseRender(...)` as before. Add cost to `costBreakdown.architect_review`.

- [ ] **Step 2: Remove demo curation and demo matching**

Убрать `curateProducts`, `stylePreferred`, `preferred`, `designProducts`, `matchCatalog` из базовой ветки. `use_catalog` теперь означает «подобрать реальные товары после рендера».

- [ ] **Step 3: Match real offers**

If `useCatalog` and review has items: `analysis.products = await matchDesignOffers({ items: review.architect.items, roomType, topK: 3 })`. Store in `renders.analysis` together with architect data.

- [ ] **Step 4: Remove architecture QA block**

Удалить `assessArchitecture`/`ARCHITECTURE_QA_ENABLED` из `jobs.js` и импорт. Оставить `assessProductEdit` для товарных правок.

- [ ] **Step 5: Default products on**

`POST /api/rooms`: `use_catalog` default `true`; frontend state default `true`; toggle label → «Подобрать реальные товары».

- [ ] **Step 6: Verify**

Run: `node --check src/jobs.js && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/jobs.js src/server.js web/src/components/GenerationPanel.tsx
git commit -m "feat: architect review and real catalog products after generation"
```

---

### Task 4: Result UI — architect block and real products

**Files:**
- Modify: `web/src/components/GenerationPanel.tsx`

- [ ] **Step 1: Architect block**

Show palette swatches, strengths, hints as buttons, electrical recommendations. Hint click calls `startGeneration(hint.action, current.styleName, { target: hint.target, parentId: current.id })`.

- [ ] **Step 2: Real products block**

If `analysis.products` exists, render per item: label, note, offer cards (image, name, price, merchant, link). Hide demo estimate when there are no `current.items`.

- [ ] **Step 3: Summary line**

If real products present: «Товары: N предложений»; else keep demo text.

- [ ] **Step 4: Verify**

Run: `cd web && npx eslint src/components/GenerationPanel.tsx && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/GenerationPanel.tsx web/dist
git commit -m "feat: show architect review and real products in result"
```

---

### Task 5: Docs + verification

**Files:**
- Modify: `docs/HISTORY.md`

- [ ] **Step 1: Update history** with the new pipeline and removed demo/QA.
- [ ] **Step 2: Run full checks** `npm test`, `npm run build`, `npm run docs:llms`.
- [ ] **Step 3: Commit** docs.

---

## Phase 2 (next plan): Setup UX and session

- Remove room dimensions from the generation prompt; keep them optional for final estimate only.
- Cleanup as a checkbox, default off, with explicit states (`off/running/done/failed_fallback_original`).
- Products toggle persisted on the room/session and used later for search.
- One screen: canvas + «Архитектор» panel; stages `queued → briefing → rendering → reviewing → products → done`.
- Data events per step (see `docs/DESIGN-SESSION.md`).

## Phase 3 (next plan): Chat, versions, final summary

- `design_messages`, `design_versions`, `design_analysis`, `design_product_matches`, `design_events`.
- Edit in the same chat; delta review after edit; full final review on «Готово».
- Final summary: concept, palette, materials, products, outlets, quantities, export/share.
- Remove old procurement modal/path and Search Lab from user flow.
