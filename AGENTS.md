# AGENTS.md

Инструкции для LLM-агентов и разработчиков, которые меняют этот репозиторий.

## Что это за проект

`ремонтвижн` — AI-редизайн интерьера по фото. Пользователь загружает фото, выбирает комнату/стиль/класс материалов, получает визуализацию, затем может запустить платный подбор реальных товаров по рендеру. Есть кабинет, публичный шаринг, админка, импорт товаров, кредиты и платежи.

Короткая карта: [llms.txt](llms.txt). Полный контекст: [llms-full.txt](llms-full.txt).

## Главное, что нужно знать до изменений

1. **Сейчас каталог демонстрационный.** 100 активных товаров, у всех `url = NULL`, реальных заказов нет. Не утверждайте в UI/доках, что товары можно купить, пока не импортированы URL.
2. **Текущая модель генерации** — `black-forest-labs/flux-3-image`, очистка — `black-forest-labs/flux-3-image-klein`, vision — `google/gemini-3-flash-preview`, 1K, aspect auto. Модели хранятся в `app_settings` и меняются через админку; проверяйте фактическое значение перед выводами.
3. **FLUX.2 Pro не принимает `resolution`.** Отправка resolution даёт 400. `supportsResolution()` true для Seedream и FLUX 3 Image/Klein; FLUX 2 Pro resolution не принимает. У FLUX возможна блокировка content moderation на спальнях/кроватях — проверяйте.
4. **Промт состоит из двух слоёв:**
   - код: `src/openrouter.js`, `src/roomtypes.js`;
   - редактируемые правила: `src/promptconfig.js` + `app_settings.prompt.rules.v1` + админка «Промт».
   Не дублируйте правила в разных местах: меняйте defaults в `promptconfig.js` и/или через админку.
5. **Design-first и смета:** базовый рендер получает только исходник + один art ref и текстовые материалы, без product refs. Curated-товары — подборка, не обещание точного совпадения. Товарная правка использует один product ref и обязательное vision QA; при отказе версия отклоняется, кредит возвращается.
6. **Секреты не коммитить.** `.env`, `ADMIN_KEY`, ключи OpenRouter/Robokassa/ЮKassa/Resend, пароль прокси — только на сервере/локально.

## Команды

```bash
# Backend
npm install
npm test                    # node:test, 37 тестов
npm start                   # Node 20.6+, .env через node --env-file

# Frontend
cd web
npm install
npm run build               # tsc -b + vite build → web/dist

# Локальная БД
docker compose up -d db     # Postgres 127.0.0.1:5434
```

Проверка синтаксиса:

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
| Правила комнат, слоты, запреты | `src/roomtypes.js` |
| Подбор товаров (старый каталог) | `src/curate.js` |
| Подбор товаров по рендеру | `src/procurement.js`, `src/procurementjobs.js`, `src/procurementtemplates.js`, `src/yandexsearch.js` |
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

## Конвенции

- Backend — ESM, Node 20, без TypeScript.
- SQL-миграции только добавлять новыми файлами; не редактировать уже применённые.
- `db.js` при импорте без `RV_DATABASE_URL` делает `process.exit(1)`. В unit-тестах не импортируйте `db.js` напрямую; в `modelconfig.js`/`promptconfig.js` используйте динамический импорт.
- Промт-правила по умолчанию — в `promptconfig.js`; `buildPrompt` берёт их из `getPromptConfig()`.
- Для асинхронных route-обработчиков использовать `h()`.
- Внешние изображения по URL — только через `fetchRemoteImage` (SSRF-защита).
- Секреты/URL прокси маскировать в API (`maskProxy`).
- Не запускать долгоживущий локальный сервер в фоне; для проверок — `timeout`/`curl`/скрипт.

## Тесты и проверка

- `npm test` — 37 тестов: промт, edit-промт, RAL, каталог, JSON-LD/OG импорт, размеры, model caps, подписи Robokassa, Yandex Search XML, procurement templates.
- `cd web && npm run build` — TypeScript + Vite.
- Живой smoke лучше делать на VPS/canary, не на прод-пользователях.
- При изменении модели проверяйте `/api/admin/settings/models` и `GET /api/health`.

## Известные ограничения (на 2026-10-28)

- Нет реального каталога с URL → нет заказов из старой сметы.
- Подбор товаров использует Yandex Search API и allowlist магазинов; Яндекс Маркет отдаёт серверу SmartCaptcha, поэтому он не используется как основной магазин.
- Смета по площади и количествам пока не считается: только список товаров.
- Покрытие подбора неполное: hero-предметы, свет, ковры, пол и часть текстиля находятся; стены/потолок/плинтус и часть магазинов пока дают fallback-ссылку. Расширять через новые адаптеры и category-page extraction.
- Очистка комнаты по умолчанию выключена: design pass идёт по исходному фото, чтобы сохранить планировку. GPT Image 2 — основная модель; после генерации работает architecture QA и один retry при изменении геометрии.
- Очистка «пустой каркас → дизайн» работает только при `keep_furniture=false`; биллинг пока 1 кредит за 2 вызова.
- Нет inpainting для люстр/розеток; позиции могут плавать.
- Нет автоматического обновления цен/наличия и фидов.
- Нет автоматических бэкапов, метрик и алертов.
- Старый редактор `/app` не переделан в новый стиль.
- Возвраты выключены (`REFUNDS_ENABLED=false`), чеки — вручную.

## Definition of done

1. `npm test` зелёный.
2. `web` собирается.
3. Обновлён `docs/HISTORY.md`.
4. Обновлены relevant docs и, если менялась архитектура/статус, `llms.txt`/`llms-full.txt`.
5. Нет секретов в diff.
6. `npm run docs:llms` при изменении документации.
7. Деплой прошёл, smoke зелёный.
