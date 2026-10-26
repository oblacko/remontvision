# ремонтвижн

AI-рендер ремонта по фото комнаты + список реальных материалов с ценами.
Монолит: Node 20 + Express + **Postgres** (pg), генерация через OpenRouter.

## Быстрый старт

### Локально
```bash
cp .env.example .env   # вставьте OPENROUTER_API_KEY
docker compose up -d db   # Postgres (локально проброшен на 127.0.0.1:5434)
npm install
npm start              # http://localhost:3000
```
`.env` подхватывается автоматически (`node --env-file`, требуется Node ≥ 20.6).
При старте накатываются миграции из `migrations/*.sql`, затем приложение сверяет
`RENDER_MODEL` со списком image-моделей OpenRouter и не стартует с понятной ошибкой, если slug устарел.
Без ключа приложение стартует в **демо-режиме**: рендер заменяется демо-картинкой, расходов нет (бейдж «демо-режим» в интерфейсе).

### Docker
```bash
cp .env.example .env   # заполнить OPENROUTER_API_KEY
docker compose up -d --build
```

## Аутентификация

Вход по одноразовому коду на e-mail (passwordless), сессия в httpOnly-куке `rv_sid`.
Архитектура с заделкой под OAuth: юзер — в `users`, способы входа — строки в `auth_identities`
(`provider`: email|yandex|vk|mailru), склейка аккаунтов по e-mail.
Без `SMTP_URL` код пишется в json-лог сервера (dev-режим); с `SMTP_URL` — отправляется письмом.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/request-code` | `{email}` → код на почту (одинаковый ответ независимо от существования ящика) |
| POST | `/api/auth/verify` | `{email, code}` → сессия в куке |
| POST | `/api/auth/logout` | завершить сессию |
| GET | `/api/me` | `{email, balance}` (кредиты; 401 без логина) |
| GET | `/api/my/rooms` | мои комнаты (история в UI; 401 без логина) |

Лимиты OTP: повторная отправка не чаще 60 с, не более 10 кодов/сутки на ящик
(`OTP_RESEND_SECONDS`, `OTP_DAILY_LIMIT`), код живёт 10 мин, 5 попыток ввода.

## Как работает

1. `POST /api/rooms` (multipart: photo, style, budget) → создаёт комнату (при логине — привязывает к юзеру) и задачу на рендер.
   На `POST /api/rooms` и `/iterate` действует rate limit (in-memory, 5 задач/час/IP, настраивается в `.env`).
2. Воркер (`src/jobs.js`, поллинг Postgres, 2 параллельных слота, атомарный claim):
   - **отбор товаров ДО генерации** (`src/curate.js`): бюджет × стиль → по кандидату из каждой
     категории (пол/стены/столешница/смеситель/свет/розетки/фасады) в доле бюджета категории;
   - фото отобранных товаров (до `MAX_REFERENCES=4`) уходят в генерацию как `input_references` —
     рендер рисуем ИЗ товаров каталога, а не подгоняем каталог под рендер;
   - пропорции рендера = реальные пропорции фото (без зависимостей); вызовы с таймаутом 120 с,
     бэкофф, при падении основной модели — ретрай на `RENDER_MODEL_FALLBACK`;
   - **смета = отобранные товары**; итерации наследуют смету родителя. Каталог пуст — фолбэк
     на vision-разбор + словесный матчинг (старая схема).
   - полная себестоимость (`cost_image_usd` + `cost_vision_usd`) пишется в json-лог и в `renders`.
3. Фронт поллит `GET /api/rooms/:id` каждые 1,5 с, пока `status=done`.
4. Создание комнаты `POST /api/rooms` и итерации `POST /api/rooms/:id/iterate` — только для авторизованных и стоят 1 кредит каждая (402 без кредитов).

## Каталог (админ)

Заголовок `X-Admin-Key` (env `ADMIN_KEY`).

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/products` | список товаров |
| POST | `/api/admin/products` | multipart: `category, name, price`, опц. `brand, unit, qty, keywords, style_tags, url, image_url, attrs(json)`, файл `image` (локальное фото) |
| PUT | `/api/admin/products/:id` | частичное обновление |
| DELETE | `/api/admin/products/:id` | удалить |

Товар с `image`/`image_url` попадает в референсы генерации; `style_tags` («современный,сканди…»)
участвуют в отборе под стиль комнаты; `price_date`/`source`/`url` уходят в смету.

## Оплата (ЮKassa) и кредиты

Кредиты — ledger (`credit_txn`), баланс = SUM(delta), списание атомарно (блокировка строки юзера).
Пакеты: `2×99₽ / 5×229₽ / 15×599₽` (конфиг в `src/payments.js`).
Начисление за оплату идемпотентно: `payments.provider_payment_id` UNIQUE, кредиты выдаются однократно
при переходе в `succeeded`; webhook не доверяет телу — переспрашивает статус у ЮKassa.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/packs` | пакеты кредитов |
| POST | `/api/payments/create` | `{pack_id}` (auth) → `{confirmation_url}` — редирект на ЮKassa |
| POST | `/api/payments/webhook` | webhook ЮKassa (payment.succeeded → начисление) |

Без `YUKASSA_SHOP_ID`/`YUKASSA_SECRET_KEY` — 503. Для боевых ссылок нужен `APP_URL` (return/webhook).
Регистрация даёт 2 кредита (`signup_bonus`), этого хватает на 2 генерации.

## Настройка (`.env`)

Slug'и моделей OpenRouter меняются. Проверить актуальные:
```bash
curl https://openrouter.ai/api/v1/images/models -H "Authorization: Bearer $OPENROUTER_API_KEY"
```
или открыть `GET /api/models` у запущенного приложения — вернёт список с флагом поддержки `input_references`.

Значения по умолчанию актуальны на октябрь 2026, **проверьте перед продакшеном**.

Дополнительные переменные:
- `RV_DATABASE_URL` — Postgres. Имя своё, **не** `DATABASE_URL`: стандартная переменная может
  быть глобально экспортирована в окружении (на машине разработки её экспортирует в `~/.bashrc`
  другой проект, а `node --env-file` существующие переменные не перебивает);
- `RENDER_MODEL_FALLBACK` — модель для одного ретрая при падении основной (пусто = без ретрая);
- `OPENROUTER_TIMEOUT_MS` — таймаут вызовов (по умолчанию 120000);
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` — лимит задач на IP (по умолчанию 5 в час);
- `RESEND_API_KEY`, `RESEND_TEMPLATE_ID`, `MAIL_FROM` — отправка кодов (фолбэк: `SMTP_URL` или dev-лог).

## API

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health` | статус, флаг mock-режима |
| GET | `/api/models` | image-модели OpenRouter |
| POST | `/api/rooms` | multipart: `photo`, `style`, `budget` → `{id}` |
| GET | `/api/rooms/:id` | статус, фото, рендер (`id`, `image`, `cost_usd`, `model`), позиции сметы, итог |
| POST | `/api/rooms/:id/iterate` | JSON `{text}` → правка текущего рендера |

Файлы: `/files/<name>` (загрузки), `/renders/<file>`. Данные (SQLite `app.db` старой версии)
не переносятся — новая БД начинается с демо-каталога.

## Что дальше (не входит в этот пакет)

- Экран покупки кредитов в UI (API `/api/packs` + `/api/payments/create` + webhook готовы).
- Вотермарка на бесплатных рендерах (sharp).
- Импорт каталога с сайтов поставщиков (таблица `suppliers` готова) + LLM-нормализация + фильтр по сайтам в матчинге.
- Оценка размеров комнаты (metric depth — отдельный сервис, на OpenRouter нет).
- PDF-смета: фото до/после + таблица позиций с ценами и источниками.
- Переключатель версий рендера в UI (в БД `parent_render_id` уже пишется).
- Удаление старых файлов из `data/` по TTL (крон-чистка).

## Структура

```
migrations/        — SQL-миграции (накатываются при старте, учёт в _migrations)
src/server.js      — HTTP API, статика, rate limit, bootstrap: миграции → валидация конфига
src/db.js          — пул pg, раннер миграций, запросы q.*
src/auth.js        — e-mail OTP, сессии, заделка под OAuth (yandex/vk/mailru)
src/openrouter.js  — клиент: рендер, vision-разбор, матчинг, retry/backoff, snapAspect
src/jobs.js        — воркер очереди (атомарный claim)
src/imagesize.js   — чтение размеров PNG/JPEG/WebP без зависимостей + detectImageExt
src/ratelimit.js   — in-memory rate limit (окно на IP)
public/index.html  — мобильный интерфейс (3 экрана)
assets/            — демо-изображения для mock-режима
```
