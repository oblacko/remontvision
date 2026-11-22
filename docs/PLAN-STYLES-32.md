# План внедрения: 32 стиля, библиотека стилей и иллюстрации

**Дата:** 21.11.2026
**Основание:** утверждённый список 32 стилей (`/home/oblacko/.opencode/plan/styles-catalog-tz.md`, `styles-details.md`, `styles-matrix.md`).
**Цель:** добавить 32 стиля в каталог и БД, показывать топ-10 в основном сценарии, открыть библиотеку стилей, сгенерировать иллюстрации и прогнать тесты.

**Статус на 21.11.2026:** этапы 1–2 выполнены. `npm test` 477/478, integration 75/75, web lint/build зелёные. Иллюстрации генерируются по одной с QA (`scripts/run-style-illustrations.mjs`): проверка архитектуры, окна, дверей, радиаторов, стиля, контраста, живости и заполнения стен; при провале — повторная генерация. Лимит — 100 генераций.

---

## Принципы

1. **Топ-10 в основном сценарии.** Пользователь видит 10 featured-стилей. Остальные — в библиотеке `/styles`.
2. **Продающее + академическое название.** В UI — `display_name` («Киотская тишина»), в URL/title — `name` («Джапанди»).
3. **Все 32 активны.** Волны внедрения не скрывают стили, но blind test остаётся обязательным для рисковых.
4. **Совместимость сохраняется.** Матрица 32×10, 257 ok / 50 weaken / 13 conflict.
5. **Иллюстрации — из реальных генераций.** Не рисованные заглушки, а рендеры по каждому стилю.

---

## Этап 1. Данные и БД

### 1.1. `src/designdata.js`
- [ ] 32 карточки `DESIGN_STYLES` с полями: `id`, `name`, `display_name`, `family`, `era`, `is_featured`, `palette`, `materials`, `axes`, `prompt_en`, `description`.
- [ ] `DESIGN_STYLE_ORDER` — 32 id в порядке из `styles-matrix.md`.
- [ ] `MATRIX` — 10 строк × 32 значения.
- [ ] `WEAKEN_PARAMS` — 50 записей из `styles-matrix.md`.
- [ ] Сохранить `compatibilityOf`, `compatibilityNote`, `allOkPairs`, `pickRandomCompatiblePair` без изменения сигнатур.
- [ ] Проверить, что старые 10 стилей не переименованы (совместимость комнат/рендеров).

### 1.2. `migrations/065_styles_32.sql`
- [ ] `ALTER TABLE styles ADD COLUMN IF NOT EXISTS display_name TEXT`, `family TEXT`, `era TEXT`, `is_featured BOOLEAN DEFAULT false`, `seo_name TEXT`.
- [ ] `INSERT ... ON CONFLICT (key) DO UPDATE` для 32 стилей.
- [ ] Переиспользовать существующие `modern`, `boho`, `country` (не создавать новые ключи).
- [ ] `prompt_description` = `prompt_en` из `styles-details.md`.
- [ ] `swatches` — 4 hex из палитры.
- [ ] `active = true` для всех 32.
- [ ] `sort` — по спросу/семействам.
- [ ] `is_featured = true` для топ-10: modern, loft, scandinavian, provence, minimalism, neoclassic, boho, baroque, japandi, classic.
- [ ] Не скрывать старые стили blanket-UPDATE (иначе сломаются комнаты).
- [ ] Добавить `slot`/`family` для фильтров библиотеки.

### 1.3. Сервер
- [ ] `src/server.js`: `styleDto` отдаёт `display_name`, `family`, `era`, `is_featured`, `seo_name`.
- [ ] `STATIC_STYLE_KEYS` — расширить 32 ключами.
- [ ] `STYLE_IMAGE_ALIASES` — временные алиасы для стилей без обложек.
- [ ] `/api/styles` — 32 активных.
- [ ] `/api/design` — 32 стиля и 320 ячеек совместимости.

### 1.4. Маркеры и теги
- [ ] `scripts/generate-articles-batch.mjs`: `STYLE_MARKERS` — 32 маркера, специфичные раньше общих.
- [ ] `src/curate.js`: `STYLE_TAGS` — 32 стиля.
- [ ] `src/productimport.js`: `STYLE_WORDS` — 32 стиля.
- [ ] `web/src/components/GenerationPanel.tsx`: `styleKeyOf` работает по `display_name` и `name`.

### 1.5. Тесты
- [ ] `test/designdata.test.js`: 32 карточки, уникальные id/name/display_name, 32 колонки в каждой строке MATRIX, значения ∈ {ok, weaken, conflict}, ≥5 ok на стиль.
- [ ] `test/variety.test.js`: оси новых стилей резолвятся, golden обновлён.
- [ ] Тест `DESIGN_STYLE_ORDER` ↔ `DESIGN_STYLES` — каждый id есть.
- [ ] Тест `is_featured` — ровно 10.
- [ ] Тест `prompt_en` — непустой, 30–100 слов, без «no / without / avoid».

**Оценка:** 4–6 часов.

---

## Этап 2. UI: топ-10 + библиотека

### 2.1. Основной сценарий
- [ ] `GenerationPanel.tsx`: `defaultStylePresets` = 10 featured (из API `/api/styles?featured=1`).
- [ ] Карточка показывает `display_name` крупно, `name` — подписью.
- [ ] Под сеткой — кнопка «Больше стилей» → `/styles`.
- [ ] Сохранить лимит 10 дизайнов.

### 2.2. Библиотека `/styles`
- [ ] Новая страница `web/src/pages/Styles.tsx`.
- [ ] 32 карточки, фильтры-чипы: «Все», «Современные», «Классика», «Тёплые», «Акцентные».
- [ ] Сетка: 2 колонки на 390 px, 3 на 768 px, 4–5 на десктопе.
- [ ] Карточка: обложка 4:5, `display_name`, `name`, семейство.
- [ ] Кнопка на карточке: «Смотреть стиль» → `/styles/:id`.
- [ ] Мобильная проверка 390×844.

### 2.3. Страница стиля `/styles/:id`
- [ ] Новая страница `web/src/pages/StyleDetail.tsx`.
- [ ] Заголовок: `name`, подзаголовок `display_name`.
- [ ] Блоки: описание, палитра (4 hex), материалы, свет, архитектурные решения.
- [ ] Галерея примеров: 3–5 рендеров (из `preset_image_path` / сгенерированных иллюстраций).
- [ ] Кнопка «Сгенерировать такой же» → открывает `GenerationPanel` с предвыбранным стилем.
- [ ] SEO: title, description, canonical, OG.

### 2.4. Роутинг и ссылки
- [ ] `web/src/App.tsx`: `/styles`, `/styles/:id`.
- [ ] `Home.tsx`: ссылка «Библиотека стилей» в блоке выбора.
- [ ] `src/gallery.js` / SSR-галерея: ссылка на `/styles` и на страницу стиля.
- [ ] `src/server.js`: SSR-мета для `/styles` и `/styles/:id` (или SPA-fallback с prerender).

**Оценка:** 6–8 часов.

---

## Этап 3. Иллюстрации стилей (платно, после подтверждения)

### 3.1. Скрипт генерации
- [ ] `scripts/generate-style-illustrations.mjs`.
- [ ] Для каждого из 32 стилей: 1–3 комнаты (гостиная, спальня, кухня).
- [ ] FLUX 3 Image 1K, `BBOX_LOCK_ENABLED=true`, `keepFurniture=false`.
- [ ] Сохранить в `web/public/style-illustrations/{styleId}-{room}.webp`.
- [ ] Метаданные: `docs/styles/illustrations.json` (style, room, prompt, модель, стоимость, QA-оценка).
- [ ] Vision-QA: architecture, style_match, photorealism, authorial.
- [ ] Отобрать лучший кадр на стиль; обновить `preset_image_path` в БД.

### 3.2. Бюджет
- 32 стиля × 1 комната = 32 рендера ≈ $1.60.
- 32 стиля × 3 комнаты = 96 рендеров ≈ $4.80.
- Vision-QA ≈ $0.02 × 96 = $1.92.
- Итого: **$3.50–7.00** в зависимости от количества комнат.
- Запуск только после явного «да» на бюджет.

**Оценка:** 2–3 часа машинного времени + отбор.

---

## Этап 4. SEO и контент

- [ ] `sitemap.xml`: `/styles`, `/styles/{id}` для всех 32.
- [ ] Мета-шаблон: `{name} — {display_name}: фото, особенности, генерация интерьера`.
- [ ] Уникальный текст на страницу: описание, материалы, свет, архитектура, 2–3 FAQ.
- [ ] Schema.org: `CollectionPage` для `/styles`, `CreativeWork`/`Article` для стиля.
- [ ] Внутренние ссылки: стиль → комнаты, стиль → соседние стили.
- [ ] `docs/` — обновить список стилей, `docs/HISTORY.md`.

**Оценка:** 4–6 часов.

---

## Этап 5. Тесты

### 5.1. Автотесты
- [ ] `npm test` — зелёный.
- [ ] `npm run test:integration` — зелёный.
- [ ] `cd web && npm run lint && npm run build` — зелёный.
- [ ] `node --check` по изменённым backend-файлам.
- [ ] `npm run docs:llms`.

### 5.2. API-тесты
- [ ] `/api/styles` → 32 активных, у каждого `image_url`, `display_name`, `family`.
- [ ] `/api/design` → 32 стиля, 320 ячеек.
- [ ] `/api/design/random` → 100 запусков без conflict.
- [ ] `/styles` → 200, 32 карточки.
- [ ] `/styles/{id}` → 200, уникальный title.

### 5.3. Генерационные тесты (платно)
- [ ] 32 рендера по одному на стиль (1K, одна комната).
- [ ] Vision-QA по каждому: style_match, architecture, photorealism, authorial.
- [ ] Blind test: 3 человека, узнаваемость ≥80%.
- [ ] Проблемные стили (baroque, space_age, grandmillennial, art_nouveau, eclectic) — повторный прогон после правки prompt_en.

### 5.4. UI-тесты
- [ ] 390×844: нет горизонтального скролла, чипы скроллятся, карточки тапаются.
- [ ] Переход лендинг → `/styles` → `/styles/:id` → генерация с предвыбранным стилем.
- [ ] Галерея → `/styles`.

**Оценка:** 1 день + машинное время.

---

## Порядок выполнения

| Шаг | Что | Зависимость |
|---|---|---|
| 1 | `designdata.js`: 32 карточки, order, matrix, weaken | — |
| 2 | Миграция 065 + серверные DTO | шаг 1 |
| 3 | Маркеры/теги (articles, curate, productimport) | шаг 1 |
| 4 | Тесты данных (unit) | шаги 1–3 |
| 5 | UI: топ-10 + `/styles` + `/styles/:id` | шаг 2 |
| 6 | Роутинг, ссылки, SSR-мета | шаг 5 |
| 7 | `npm test`, lint, build, integration | шаги 4–6 |
| 8 | Иллюстрации (платно) | шаг 7 + бюджет |
| 9 | SEO, sitemap, docs | шаг 7 |
| 10 | Blind test и приёмка | шаг 8 |

**Итого:** 2–3 рабочих дня без генераций; +1 день на иллюстрации и blind test.

---

## Критерии готовности

- [ ] 32 стиля в `DESIGN_STYLES`, порядок совпадает с `DESIGN_STYLE_ORDER`.
- [ ] Матрица 32×10, 320 ячеек, 257 ok / 50 weaken / 13 conflict.
- [ ] Топ-10 featured в основном сценарии, остальные — в `/styles`.
- [ ] `display_name` в UI, `name` в URL и SEO.
- [ ] `/styles` и `/styles/:id` работают, мобильны, с примерами.
- [ ] Из галереи и лендинга есть переход в библиотеку.
- [ ] Иллюстрации сгенерированы и отобраны.
- [ ] `npm test`, integration, web lint/build — зелёные.
- [ ] Обновлены `docs/HISTORY.md`, `docs/GENERATION.md`, `llms-full.txt`.
- [ ] Нет секретов в diff.
