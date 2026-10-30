# AGENTS.md

Инструкции для LLM-агентов и разработчиков, которые меняют этот репозиторий.

## Что это за проект

`ремонтвижн` — AI-редизайн интерьера по фото. Пользователь загружает фото, выбирает комнату/стиль/класс материалов, получает визуализацию, затем может запустить платный подбор реальных товаров по рендеру. Есть кабинет, публичный шаринг, админка, импорт товаров, кредиты и платежи.

Короткая карта: [llms.txt](llms.txt). Полный контекст: [llms-full.txt](llms-full.txt). Рабочая память и текущие решения: [docs/MEMORY.md](docs/MEMORY.md).

## Главное, что нужно знать до изменений

1. **Сейчас каталог демонстрационный.** 100 активных товаров, у всех `url = NULL`, реальных заказов нет. Не утверждайте в UI/доках, что товары можно купить, пока не импортированы URL.
2. **Не хардкодьте модели.** Render/vision/cleanup-модели хранятся в `app_settings` и `.env` (`RENDER_MODEL`, `VISION_MODEL`, cleanup-конфиг) и меняются через админку. Перед выводами проверяйте фактическую конфигурацию; architecture QA по умолчанию выключен (`ARCHITECTURE_QA_ENABLED=0`).
3. **FLUX.2 Pro не принимает `resolution`.** Отправка resolution даёт 400. `supportsResolution()` true для Seedream и FLUX 3 Image/Klein; FLUX 2 Pro resolution не принимает. У FLUX возможна блокировка content moderation на спальнях/кроватях — проверяйте.
4. **Промт состоит из двух слоёв:**
   - код: `src/openrouter.js`, `src/roomtypes.js`;
   - редактируемые правила: `src/promptconfig.js` + `app_settings.prompt.rules.v1` + админка «Промт».
   Не дублируйте правила в разных местах: меняйте defaults в `promptconfig.js` и/или через админку.
5. **Design-first и смета:** базовый рендер получает только исходник + один art ref и текстовые материалы, без product refs. Curated-товары — подборка, не обещание точного совпадения. Товарная правка использует один product ref и обязательное vision QA; при отказе версия отклоняется, кредит возвращается.
6. **Секреты не коммитить.** `.env`, `ADMIN_KEY`, ключи OpenRouter/Robokassa/ЮKassa/Resend, пароль прокси — только на сервере/локально.

## Команды

Все команды — из корня репозитория (`app/`), если не указано иное.

```bash
# Backend
npm install
npm test                                      # node:test, 62 теста, Postgres не нужен
node --test test/prompt.test.js               # один файл
node --test --test-name-pattern="base prompt" test/prompt.test.js   # один тест
npm start                                     # Node 20.6+, .env через node --env-file
npm run dev                                   # watch-режим

# Frontend
cd web
npm install
npm run lint                                  # ESLint 9, flat config
npm run build                                 # tsc -b + vite build → web/dist
npx tsc -b                                    # только проверка типов (без сборки)
npm run dev                                   # Vite dev-сервер

# Локальная БД и документация
docker compose up -d db                       # Postgres 127.0.0.1:5434
npm run docs:llms                             # пересобрать llms-full.txt после правок docs
```

Проверка синтаксиса backend-файлов:

```bash
node --check src/server.js
node --check src/jobs.js
node --check src/openrouter.js
```

## Деплой

- Пуш в `main` → GitHub Actions `.github/workflows/deploy.yml` → SSH на VPS → `git pull` + `docker compose up -d --build` + smoke.
- Smoke проверяет `/api/health`, наличие `id="root"` на `/`, доступность `/app`.
- Миграции накатываются при старте контейнера из `migrations/*.sql` (append-only, учёт в `_migrations`).
- `.env` на VPS деплоем не перезаписывается.
- После изменений обновляйте `docs/HISTORY.md` и relevant docs.

## Где что менять

| Задача | Файлы |
|---|---|
| Промт, стиль, light/cleanup/Pinterest | `src/promptconfig.js`, `src/openrouter.js` |
| Размеры комнаты, кровать, радиаторы | `src/promptconfig.js`, `src/openrouter.js`, `src/scaleplan.js`, `web/src/components/GenerationPanel.tsx` |
| Оценка размеров по фото | `src/openrouter.js`, `src/server.js`, `web/src/components/GenerationPanel.tsx` |
| Правила комнат, слоты, запреты | `src/roomtypes.js` |
| Подбор товаров (старый каталог) | `src/curate.js` |
| Подбор товаров по рендеру | `src/procurement.js`, `src/procurementjobs.js`, `src/procurementtemplates.js`, `src/yandexsearch.js` |
| Настройки поиска в админке | `web/src/pages/Admin.tsx`, `src/procurementconfig.js` |
| Источник стиля и свотчи | `src/styleconfig.js`, `src/styleswatch.js`, `migrations/024_style_briefs.sql` |
| Очистка комнаты кнопкой | `web/src/components/GenerationPanel.tsx`, `POST /api/cleanup`, `rooms.precleaned_shell_path` |
| Панель подбора | `web/src/components/ProcurementPanel.tsx` |
| Генерация/очередь | `src/jobs.js`, `src/openrouter.js` |
| Анализ рендера, RAL, подсказки | `src/analysis.js`, `src/openrouter.js` |
| API, auth, admin, share | `src/server.js` |
| SQL/данные | `src/db.js`, `migrations/` |
| Каталог | `catalog/seed.json`, `public/catalog/`, `src/catalogseed.js` |
| Импорт товаров | `src/productimport.js`, `src/remoteimage.js` |
| Стилевые референсы | `scripts/generate-style-references.mjs`, `style-refs/`, `src/stylerefseed.js` |
| Модели/прокси | `src/modelconfig.js`, `src/modelcaps.js`, `src/proxy.js` |
| Очистка комнаты | `src/cleanupconfig.js`, `src/jobs.js`, `src/openrouter.js`, админка «Очистка» |
| UI генератора | `web/src/components/GenerationPanel.tsx` |
| Кабинет | `web/src/pages/Cabinet.tsx` |
| Админка | `web/src/pages/Admin.tsx` |
| Публичный шаринг | `web/src/pages/Share.tsx`, `web/src/components/ShareDialog.tsx` |

## Стиль кода

### Backend (ESM, JavaScript)

- ESM (`"type": "module"`), Node 20.6+, без TypeScript. В относительных импортах всегда указывайте `.js`.
- 2 пробела, одинарные кавычки, точка с запятой в конце инструкций. Не переформатируйте чужие файлы целиком.
- Порядок импортов: `node:*` → внешние пакеты → локальные `./*.js`. Именованные импорты предпочтительнее `default`.
- Имена файлов — одним словом в нижнем регистре (`promptconfig.js`, `modelcaps.js`). Функции/переменные — `camelCase`, константы — `UPPER_SNAKE_CASE`, таблицы/колонки SQL — `snake_case`.
- Все async route-обработчики оборачивайте в `h()`; ошибки бросайте как `Error` и при необходимости ставьте `e.status` (400/402/404/409/429/502/503).
- Клиенту отдавайте `{ error: 'текст на русском' }`; для 5xx — общее «Внутренняя ошибка», детали только в `log({ event, ... })`.
- Секреты, токены и URL прокси не логируйте и маскируйте в API (`maskProxy`).
- SQL — только параметризованный (`$1`, `$2`), значения не интерполируйте. Транзакции — через `withTransaction`.
- Миграции только добавляйте новыми файлами `NNN_snake_name.sql`; уже применённые не редактируйте.
- Внешние изображения по URL — только через `fetchRemoteImage` (защита от SSRF и больших файлов).
- Комментарии — на русском, только про неочевидные причины/ограничения, без пересказа кода.

### Frontend (TypeScript, React 19)

- Строгий TS: `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. Типы импортируйте через `import type`; `any` не добавляйте без необходимости.
- 2 пробела, одинарные кавычки, без точки с запятой в коде приложения. Файлы `web/src/components/ui/*` — сгенерированный shadcn/ui: сохраняйте их стиль (двойные кавычки, точки с запятой).
- Порядок импортов: React → внешние пакеты → `@/...` → относительные пути. Алиас `@/*` указывает на `web/src/*`.
- Компоненты — function components. Страницы в `web/src/pages/` экспортируются по умолчанию; переиспользуемые компоненты в `web/src/components/` — именованным экспортом (`export function X`).
- Имена: компоненты/типы — `PascalCase`, функции/переменные — `camelCase`, хуки — `useSomething`, файлы компонентов — `PascalCase.tsx`.
- Стили — Tailwind 3 и семантические токены из `index.css` (`bg-background`, `text-foreground`, `border-border`). Для условных классов используйте `cn()` из `@/lib/utils`.
- UI-примитивы берите из `web/src/components/ui/` (Radix/shadcn), иконки — `lucide-react`; не добавляйте новые UI-библиотеки без необходимости.
- `fetch` оборачивайте в `try/catch`, проверяйте `r.ok`, не считайте ответ JSON без проверки. Пользовательские ошибки — на русском.

### Тесты

- `node:test` + `node:assert/strict`. Описания тестов — короткие английские фразы.
- Переменные окружения выставляйте до динамического `await import(...)`; в unit-тестах не импортируйте `db.js` напрямую (он делает `process.exit(1)` без `RV_DATABASE_URL`).
- Для конфигов используйте тестовые хелперы, если они есть (например, `setPromptConfigForTests`), чтобы не трогать БД.

## Тесты и проверка

- `npm test` — 62 теста: промт, размеры/кровать/радиаторы/scale plan, layout plan/framing/validator, оценка размеров по фото, edit-промт, RAL, каталог, JSON-LD/OG импорт, размеры товаров, model caps, подписи Robokassa, Yandex Search XML, procurement templates, типы комнат.
- `cd web && npm run lint` — ESLint; `cd web && npm run build` — TypeScript + Vite.
- Живой smoke лучше делать на VPS/canary, не на прод-пользователях.
- При изменении модели проверяйте `/api/admin/settings/models` и `GET /api/health`.

## Известные ограничения (на 2026-10-30)

- Нет реального каталога с URL → нет заказов из старой сметы.
- Подбор товаров использует Yandex Search API и allowlist магазинов; Яндекс Маркет отдаёт серверу SmartCaptcha, поэтому он не используется как основной магазин.
- Смета по площади и количествам пока не считается: только список товаров.
- Покрытие подбора неполное: hero-предметы, свет, ковры, пол и часть текстиля находятся; стены/потолок/плинтус и часть магазинов пока дают fallback-ссылку. Расширять через новые адаптеры и category-page extraction.
- Очистка комнаты по умолчанию выключена: design pass идёт по исходному фото, чтобы сохранить планировку. Architecture QA по умолчанию выключен (`ARCHITECTURE_QA_ENABLED=0`), включается только через env. Image-вызовы сериализуются, при 429 — до 4 попыток (10/20/40 с).
- Очистка «пустой каркас → дизайн» работает только при `keep_furniture=false`; биллинг пока 1 кредит за 2 вызова.
- Нет inpainting для люстр/розеток; позиции могут плавать.
- Нет автоматического обновления цен/наличия и фидов.
- Нет автоматических бэкапов, метрик и алертов.
- Старый редактор `/app` не переделан в новый стиль.
- Возвраты выключены (`REFUNDS_ENABLED=false`), чеки — вручную.

## Definition of done

1. `npm test` зелёный.
2. `cd web && npm run lint` проходит.
3. `cd web && npm run build` собирается.
4. Обновлён `docs/HISTORY.md`.
5. Обновлены relevant docs и, если менялась архитектура/статус, `llms.txt`/`llms-full.txt`.
6. Нет секретов в diff.
7. `npm run docs:llms` при изменении документации.
8. Деплой прошёл, smoke зелёный.
