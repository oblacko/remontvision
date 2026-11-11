# AGENTS.md

Инструкции для LLM-агентов и разработчиков, которые меняют этот репозиторий.

## Что это за проект

`ремонтвижн` — AI-редизайн интерьера по фото: пользователь загружает фото, выбирает тип комнаты и до 8 пар «стиль × концепция», получает визуализацию, затем может делать правки, разбирать интерьер, строить план ремонта и искать реальные товары. Есть кабинет, публичный шаринг, админка, статьи, кредиты и платежи.

- Короткая карта: [llms.txt](llms.txt). Полный контекст: [llms-full.txt](llms-full.txt).
- **Что реально работает:** [docs/STATUS.md](docs/STATUS.md) — источник истины.
- Рабочая память: [docs/MEMORY.md](docs/MEMORY.md).

## Главное, что нужно знать до изменений

0. **Спрашивать разрешение перед действием.** Перед эмбеддингом, импортом, удалением/откатом данных, пересборкой, деплоем и любыми долгими/платными операциями — спросить и дождаться явного «да».
1. **Каталог демонстрационный.** 100 активных товаров, 0 URL; реальных заказов нет. Не утверждайте в UI/доках, что товар можно купить.
2. **Не хардкодьте модели.** Render/vision/edit/cleanup/direction — в `app_settings` и `.env`, меняются через админку. Перед выводами проверяйте фактическую конфигурацию (`GET /api/health`, `/api/admin/settings/models`).
3. **FLUX.2 Pro не принимает `resolution`.** Отправка даёт 400. `supportsResolution()` — Seedream и FLUX 3 Image/Klein. У FLUX возможна content moderation на спальнях.
4. **Промт — два слоя:** код (`src/openrouter.js`, `src/roomtypes.js`) и правила (`src/promptconfig.js` + `app_settings.prompt.rules.v1`). **Известный баг:** `furnitureOff`, `catalogOn`, `styling` не доходят до генерации; не «чините» их вслепую — см. docs/redesign.
5. **Design-first.** Базовый кадр получает исходник + один art ref и текстовые материалы, без product refs. Следствие: `render_items` у новых базовых рендеров **пуст**. Товарная правка использует один product ref и обязательный vision QA; при отказе версия отклоняется, кредит возвращается.
6. **Очередь.** Claim — `FOR UPDATE SKIP LOCKED` + lease + `claimed_by`; завершение/heartbeat проверяют владельца. Не добавляйте второй claim-механизм и не делайте blanket-requeue. `WORKER_CONCURRENCY` (1–8) — параллелизм; image-вызовы сериализуются глобальным advisory-слотом (`src/imageslot.js`).
7. **Direction кэшируется.** `src/designeragent.js` + `src/generationcache.js`; 3 варианта, TTL 30 дней. Не вызывайте direction дважды при пустом `prompt_en`.
8. **Секреты не коммитить.** `.env`, `ADMIN_KEY`, ключи OpenRouter/Robokassa/ЮKassa/Resend, пароль прокси — только на сервере/локально.

## Команды

Все команды — из корня репозитория (`app/`), если не указано иное.

```bash
# Backend
npm install
npm test                                      # unit, Postgres не нужен
npm run test:integration                      # HTTP/БД, отдельная <db>_test, Postgres нужен
node --test test/prompt.test.js               # один файл
npm start                                     # Node 20.19+, .env через node --env-file
npm run dev                                   # watch-режим

# Frontend
cd web
npm install
npm run lint
npm run build                                 # tsc -b + vite build → web/dist
npm run dev                                   # Vite

# БД и документация
docker compose up -d db                       # Postgres 127.0.0.1:5434
npm run docs:llms                             # пересобрать llms-full.txt
cd catalog-service && pytest -q               # catalog-service (нужен pytest)
```

Проверка синтаксиса backend:

```bash
node --check src/server.js
node --check src/jobs.js
node --check src/openrouter.js
```

## CI и деплой

- Push/PR → `.github/workflows/ci.yml`: backend unit + integration (Postgres service), web lint/build, catalog pytest.
- Push в `main` → `deploy.yml`: job `test` → SSH на VPS → `git pull` + `docker compose up -d --build` + smoke.
- Деплой не стартует без зелёного `test`.
- Миграции накатываются при старте контейнера (`migrations/*.sql`, append-only, учёт в `_migrations`).
- `.env` на VPS деплоем не перезаписывается.
- После изменений обновляйте `docs/HISTORY.md` и relevant docs; `docs/STATUS.md` — при изменении состояния.

## Где что менять

| Задача | Файлы |
|---|---|
| Промт, стиль, light/cleanup/Pinterest | `src/promptconfig.js`, `src/openrouter.js` |
| Размеры, кровать, радиаторы | `src/promptconfig.js`, `src/openrouter.js`, `src/scaleplan.js` |
| Правила комнат, слоты | `src/roomtypes.js` |
| Direction и кэш | `src/designeragent.js`, `src/generationcache.js`, `src/directionprompt.js` |
| Очередь, lease, claim | `src/db.js`, `src/jobs.js`, `src/workerknobs.js` |
| Глобальный image-слот | `src/imageslot.js`, `src/openrouter.js` |
| Генерация/стадии | `src/jobs.js`, `src/openrouter.js` |
| Анализ, RAL, подсказки | `src/analysis.js`, `src/architect.js`, `src/openrouter.js` |
| API, auth, admin, share | `src/server.js`, `src/auth.js`, `src/oauth.js` |
| SQL/данные | `src/db.js`, `migrations/` |
| Подбор товаров (текущий) | `src/visionagent.js`, `src/catalogclient.js`, `catalog-service/` |
| Legacy procurement (не подключён) | `src/procurement*.js` — не развивать, на удаление |
| Search Lab | `src/search*.js`, `web/src/components/Search*.tsx` |
| Статьи | `src/articles.js` |
| Платежи | `src/payments.js`, `src/robokassa.js` |
| Каталог | `catalog/seed.json`, `src/productimport.js`, `src/remoteimage.js` |
| Админка UI | `web/src/pages/Admin.tsx` |
| Генератор UI | `web/src/components/GenerationPanel.tsx` |
| Кабинет / шаринг | `web/src/pages/Cabinet.tsx`, `Share.tsx`, `ShareDialog.tsx` |
| Тестовая инфраструктура | `test/support/` |

## Стиль кода

### Backend (ESM, JavaScript)

- ESM, Node 20.19+, без TypeScript. В относительных импортах — `.js`.
- 2 пробела, одинарные кавычки, точка с запятой. Не переформатируйте чужие файлы целиком.
- Порядок импортов: `node:*` → внешние → локальные `./*.js`.
- Имена файлов — одним словом в нижнем регистре; функции/переменные — `camelCase`, константы — `UPPER_SNAKE_CASE`, SQL — `snake_case`.
- Async-роуты — в `h()`; ошибки — `Error` с `e.status`; клиенту `{ error: 'русский текст' }`.
- SQL — только параметризованный (`$1`); транзакции — `withTransaction`.
- Миграции — только новые файлы; применённые не редактировать.
- Внешние картинки — только `fetchRemoteImage`.
- Комментарии — на русском, про неочевидные причины/ограничения.

### Frontend (TypeScript, React 19)

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; `any` не добавлять.
- 2 пробела, одинарные кавычки, без точки с запятой; `ui/*` — сгенерированный shadcn, стиль сохранять.
- Импорты: React → внешние → `@/...` → относительные.
- Страницы — default export, компоненты — `export function X`.
- Tailwind + токены из `index.css`; условные классы — `cn()`.
- **Mobile-first:** 390×844, без горизонтального скролла; длинный текст — `min-w-0`/`break-words`.
- UI-примитивы — из `web/src/components/ui/`, иконки — `lucide-react`.
- `fetch` — в `try/catch`, проверять `r.ok`; ошибки на русском.

### Тесты

- `node:test` + `node:assert/strict`; описания — короткие английские фразы.
- Env — до динамического `import(...)`; `db.js` напрямую не импортировать в unit-тестах.
- Для конфигов — тестовые хелперы (`setPromptConfigForTests` и т.п.).
- Интеграционные тесты — `test/integration/*.test.js`, отдельная `<db>_test`, без S3.

## Тесты и проверка

- `npm test` — unit: промт, размеры/кровать/радиаторы/scale plan, edit-промт, RAL, каталог, импорт, model caps, подписи Robokassa, procurement templates, типы комнат, direction, workerknobs.
- `npm run test:integration` — кредиты/refund, очередь/lease/fencing, auth, комнаты, шаринг, платежи, файлы, image-слот, direction-кэш.
- `cd web && npm run lint && npm run build`.
- `cd catalog-service && pytest -q`.
- Живой smoke — на VPS/canary, не на прод-пользователях.

## Известные ограничения (2026-11-11)

- Нет реального каталога с URL → нет заказов; смета новых рендеров пуста.
- Legacy procurement (Yandex) не подключён; текущий подбор — MCP/catalog-service (бесплатно, один проход).
- Style-ref/hero-референсы выключены по умолчанию (`text`).
- Очистка комнаты выключена по умолчанию.
- `furnitureOff`/`catalogOn`/`styling` не доходят до промта.
- Нет inpainting люстр/розеток.
- Один провайдер (OpenRouter).
- Бэкап/restore-скрипты есть, но расписание/off-site/алерты не настроены; диск прода 91%.
- Возвраты выключены, чеки вручную.
- `/app` — 301; старый редактор — fallback.

## Definition of done

1. `npm test` зелёный.
2. `npm run test:integration` зелёный.
3. `cd web && npm run lint && npm run build` проходит.
4. `catalog-service pytest` зелёный (если менялся сервис).
5. Обновлён `docs/HISTORY.md`; при изменении состояния — `docs/STATUS.md`.
6. Обновлены relevant docs; `npm run docs:llms` при изменении документации.
7. Нет секретов в diff.
8. Деплой прошёл, smoke зелёный (после явного разрешения).
