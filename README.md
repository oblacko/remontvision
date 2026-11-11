# ремонтвижн

AI-сервис редизайна интерьера по фото: визуализация комнаты, разбор материалов, правки, план ремонта и подбор реальных товаров.

**Прод:** https://www.remontvision.ru · **Репозиторий:** private · **Документация для LLM:** [llms.txt](llms.txt) · [llms-full.txt](llms-full.txt) · [AGENTS.md](AGENTS.md)

---

## Статус на 2026-11-11

| Блок | Состояние |
|---|---|
| Генерация по фото | Работает: FLUX 3 Image 1K (модель из админки/`.env`) |
| Мульти-стиль | До 8 пар «стиль × концепция» на комнату, каждая — отдельный рендер и кредит |
| Vision-разбор | Работает: Gemini 3.1 Pro (код-дефолт), модель из админки |
| Стили и комнаты | 10 стилей × 10 концепций, 12 типов комнат; редактируются в админке |
| Очередь | Lease + `claimed_by` + `FOR UPDATE SKIP LOCKED`; `WORKER_CONCURRENCY`; глобальный image-слот |
| Direction | Кэш на 3 варианта, TTL 30 дней; без двойного вызова модели |
| Правки | Точечные; первые 3 бесплатны, 4-я и далее — 1 кредит; товарный QA |
| Очистка комнаты | Работает при `keep_furniture=false`; **выключена по умолчанию** |
| Подбор товаров | MCP/catalog-service: до 20 предметов, бесплатно, один проход |
| Разбор / роадмап / move | Работают (вкладки комнаты) |
| Шаринг | `/s/:token`, лайки, комментарии |
| Платежи | Robokassa (по умолчанию), ЮKassa; возвраты выключены |
| Пакеты | 10/20/60 кредитов — 399/599/1499 ₽ |
| Админка | 15 вкладок: пользователи, пакеты, комнаты, стили, промт, архитектор, логи, модели, очистка, генерация, статьи, поиск, поиск-лаб, прокси, каталог |
| Контент | Статьи (SEO) — есть; Search Lab — внутренний R&D-стенд |
| Каталог | **Демо:** 100 товаров, 0 реальных URL; заказы невозможны |
| Тесты | Unit + интеграционные (HTTP/БД) + pytest catalog-service; CI-гейт перед деплоем |

Подробно, что именно работает и что нет: [docs/STATUS.md](docs/STATUS.md).

---

## Что работает

1. Пользователь загружает фото, выбирает тип комнаты, до 8 пар «стиль × концепция», класс материалов.
2. Базовый дизайн — design-first: исходник + один art reference (свет/палитра/материалы), без товарных референсов.
3. Размеры комнаты оценивает vision; планировщик подбирает масштаб мебели и проходы.
4. Vision-разбор достаёт материалы, поверхности, электрику и подсказки для правок.
5. Точечные правки: текст, файл, URL или товар-референс; товарная правка проходит vision QA.
6. Результат можно скачать, открыть в кабинете, поделиться публичной ссылкой, разобрать по шагам и собрать план ремонта.
7. Подбор товаров по рендеру — через MCP/catalog-service (Yandex-путь legacy, см. PROCUREMENT.md).

## Что не работает / ограничения

- **Реальные заказы:** в демо-каталоге нет URL; кнопка ведёт в поиск, а не на товар.
- **Смета для новых рендеров пустая:** `render_items` заполняется только у старых рендеров и правок; «Оценка материалов» у нового дизайна = 0.
- **Старый procurement (Yandex) недостижим из API** — код и таблицы ещё лежат в репозитории, будут удалены отдельным срезом.
- **`/app` — 301 на `/`**; старый редактор остался только как fallback-файл `public/app.html`.
- **`POST /api/estimate-room`** существует, но фронтенд его не вызывает; размеры приходят из vision-прохода.
- **Style-ref и hero-референсы** выключены по умолчанию (режим `text`); включаются в админке.
- **Часть правил админки «Промт» не доходит до генерации** (`furnitureOff`, `catalogOn`, `styling`) — известная проблема, зафиксирована в docs/redesign.
- **Возвраты выключены**, чеки — вручную; в проде сейчас **диск 91%** и **бэкап старше 26 ч без `db_dump`** (см. OPERATIONS.md).
- **Inpainting люстр/розеток** отсутствует; позиции могут плавать.
- **Один основной провайдер** — OpenRouter.

---

## Быстрый старт

Нужен Node.js ≥ 20.19 и Docker (для Postgres).

```bash
cp .env.example .env          # OPENROUTER_API_KEY и ADMIN_KEY
docker compose up -d db       # Postgres на 127.0.0.1:5434
npm install
npm start                     # http://localhost:3000
```

Без `OPENROUTER_API_KEY` приложение стартует в **mock-режиме**: рендер — демо-картинка, расходов нет.

Фронтенд:

```bash
cd web
npm install
npm run dev                   # Vite
npm run build                 # web/dist → раздаётся Express
```

## Тесты и проверка

```bash
npm test                      # unit, без Postgres
npm run test:integration      # HTTP/БД, отдельная <db>_test, нужен Postgres
cd web && npm run lint && npm run build
cd catalog-service && pytest -q
```

CI (`.github/workflows/ci.yml`) гоняет всё это на push/PR; деплой (`deploy.yml`) зависит от зелёного job `test`.

---

## Архитектура

```text
Браузер → Nginx → Express API → Postgres
                       ├→ воркер (в процессе API): renders → OpenRouter (image/vision)
                       ├→ Storage: диск / S3
                       ├→ Resend/SMTP: OTP и письма
                       └→ Robokassa / ЮKassa
catalog-service (Python/FastAPI + pgvector) ← MCP-подбор товаров
```

Подробно: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура

```text
app/
  src/
    server.js          HTTP API, auth, admin, share, статика
    jobs.js            воркер: claim/lease, processRender, stages
    openrouter.js      image/vision-провайдер, промт, image-слот
    db.js              pg pool, миграции, SQL-запросы
    designeragent.js   direction-агент + кэш вариантов
    generationcache.js кэш AI-шагов с TTL
    imageslot.js       глобальный advisory-слот image-вызовов
    workerknobs.js     WORKER_CONCURRENCY
    payments.js        кредиты, Robokassa/ЮKassa, refund
    procurement*.js    legacy procurement (не подключён, на удаление)
    search*.js         Search Lab
    articles.js        контент-движок
  web/src/             React 19 + Vite + TS
  catalog-service/     FastAPI + pgvector + MCP
  migrations/          SQL 001–053 (файла 048 нет — исторически)
  test/                unit + integration
  docs/                документация
```

## Стек

| Слой | Технологии |
|---|---|
| Backend | Node 20.19+, Express, pg, multer, sharp |
| Frontend | React 19, Vite, TypeScript, Tailwind |
| БД | PostgreSQL 16 |
| Очередь | Postgres + воркер (`jobs.js`), lease/`claimed_by` |
| Файлы | диск или S3 (`storage.js`) |
| AI | OpenRouter: FLUX 3 Image, FLUX 3 Klein (cleanup), Gemini 3.1 Pro (vision), DeepSeek Flash (direction) |
| Почта | Resend / SMTP |
| Платежи | Robokassa / ЮKassa |
| Инфраструктура | Docker Compose, Nginx, Let's Encrypt, GitHub Actions |

---

## Карта документации

| Документ | О чём |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | **Что сделано / что работает / что нет** — единый источник истины |
| [docs/kit.html](docs/kit.html) | Живой UI-кит: токены, кнопки, поля, карточки, иконки (собирается `npm run kit:build`) |
| [AGENTS.md](AGENTS.md) | Правила для агентов и разработчиков, команды, подводные камни |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Компоненты, данные, деплой |
| [docs/GENERATION.md](docs/GENERATION.md) | Путь генерации, промт, очередь, кэш, правки |
| [docs/GENERATION-FLOW.md](docs/GENERATION-FLOW.md) | Полная схема данных и себестоимости |
| [docs/GENERATION-QUEUE.md](docs/GENERATION-QUEUE.md) | Ёмкость и инварианты очереди |
| [docs/API.md](docs/API.md) | HTTP API |
| [docs/PROCUREMENT.md](docs/PROCUREMENT.md) | Подбор товаров: текущий MCP-путь и legacy |
| [docs/CATALOG.md](docs/CATALOG.md) | Каталог и catalog-service |
| [docs/ADMIN.md](docs/ADMIN.md) | Админка |
| [docs/PROMPT-RULES.md](docs/PROMPT-RULES.md) | Правила промта |
| [docs/AI-INTEGRATION.md](docs/AI-INTEGRATION.md) | Модели и AI-интеграция |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Эксплуатация, деплой, мониторинг |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Планы и запуск |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Ключевые решения |
| [docs/MEMORY.md](docs/MEMORY.md) | Рабочая память |
| [docs/HISTORY.md](docs/HISTORY.md) | Хронология изменений |

---

## Лицензия и данные

Репозиторий private. Секреты (`.env`, ключи OpenRouter/Robokassa/ЮKassa/Resend, `ADMIN_KEY`, пароль прокси) не коммитятся.
