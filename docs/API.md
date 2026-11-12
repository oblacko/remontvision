# API

Базовый URL: `https://www.remontvision.ru`.  
Auth: cookie `rv_sid` (httpOnly).  
Admin: заголовок `X-Admin-Key`.
Ошибки — JSON `{ "error": "..." }` с HTTP-статусом.

## Публичные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health` | статус, `mock`, `payments_enabled`, `refunds_enabled` |
| GET | `/api/models` | активные render-модели из `render_models` (не каталог OpenRouter) |
| GET | `/api/legal` | версии и ссылки юридических документов |
| GET | `/api/styles` | активные стили |
| GET | `/api/design` | стили и концепции (хардкод `designdata`) |
| GET | `/api/room-types` | активные типы комнат |
| GET | `/api/packs` | пакеты кредитов |
| GET | `/api/referral/context` | `{invited}` по HttpOnly-куке `rv_ref`; rate limit, no-store |
| POST | `/api/auth/request-code` | `{email}` → OTP |
| POST | `/api/auth/verify` | `{email, code, consents}` → cookie |
| POST | `/api/auth/logout` | выход |
| GET/POST | `/api/payments/robokassa/result` | ResultURL: проверка подписи, `OK{InvId}` |
| GET/POST | `/api/payments/robokassa/success` / `fail` | fallback-редиректы |
| GET | `/s/:token` | SPA публичного шаринга |
| GET | `/s/:token/image` | публичная картинка дизайна |
| GET | `/api/share/:token` | стиль, комната, лайки, комментарии |
| POST | `/api/share/:token/like` | toggle лайк |
| POST | `/api/share/:token/comments` | `{name?, text}` |
| GET | `/articles/:slug`, `/sitemap.xml` | статьи и sitemap |
| GET | `/go/:id?r=renderId` | 302 на товар/поиск, лог клика |

## Авторизованные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/me` | email, баланс (или `null`) |
| GET | `/api/referral` | код, ссылка, приглашённые |
| GET | `/api/my/rooms`, `/api/my/generations` | комнаты/рендеры |
| GET | `/api/credits` | баланс и ledger |
| GET | `/api/credits/refunds?after=<id>` | свежие `iterate_refund` для тоста (только свои) |
| POST | `/api/payments/create` | `{pack_id}` → `{confirmation_url, payment_id, provider}` |
| POST | `/api/payments/sync` | синхронизация pending-платежа |
| POST | `/api/cleanup` | очистка комнаты по фото → data URL |
| POST | `/api/estimate-room` | vision-оценка размеров (фронтенд сейчас не использует) |
| POST | `/api/rooms` | multipart: фото, `items` (1–8 пар), тип, tier, флаги |
| GET | `/api/rooms/:id` | комната + последний done-рендер |
| GET | `/api/rooms/:id/versions` | все версии; `edits_used` для цены правки/переноса |
| DELETE | `/api/rooms/:id` | удалить комнату (owner) |
| POST | `/api/rooms/:id/retry` | повтор упавшего базового рендера |
| POST | `/api/rooms/:id/iterate` | правка: `text`, `target`, `product_id`, `refs`/`ref_meta`, `ref`, `ref_url`, `parent_id`, `move` |
| POST | `/api/rooms/:id/roadmap/items` | прогресс роадмапа |
| POST | `/api/renders/:id/final-review` | итоговый разбор |
| POST | `/api/renders/:id/breakdown` | разбор интерьера |
| POST | `/api/renders/:id/roadmap` | план ремонта (после покупки) |
| POST | `/api/renders/:id/product-search` | MCP-подбор товаров (бесплатно) |
| POST | `/api/renders/:id/share` | создать/вернуть share token |

### `POST /api/rooms`

`multipart/form-data`. При `keep_furniture=false` и включённой очистке сервер асинхронно запускает очистку комнаты; рендер ждёт shell ≤3 мин.

| Поле | Обяз. | Значение |
|---|---|---|
| `photo` | да | JPG/PNG/WebP/HEIC ≤ 15 МБ |
| `items` | да* | JSON-массив до 8 `{style, concept}` |
| `style` | legacy | один стиль, если нет `items` |
| `concept` | нет | id концепции |
| `variants` | legacy | 1–8 копий стиля |
| `room_type` | нет | активный тип, иначе `Другое` |
| `price_tier` | нет | `start|comfort|premium|atelier` |
| `keep_furniture` | нет | `1/0`, default `1` |
| `use_catalog` | нет | `1/0`, default `1` (на базовый промт не влияет) |
| `room_width_m`, `room_length_m`, `room_height_m` | нет | либо все три, либо ни одного |
| `bed_length_m` | нет | спальня/детская, default 2.0 |
| `dimension_orientation` | нет | что считается шириной/длиной |
| `palette`, `accent` | нет | цветовая схема/акцент |
| `resolution` | нет | разрешение из списка модели |
| `model` | нет | key активной render-модели |
| `private` | нет | приватный рендер (после покупки) |

\* Нужен `items` или legacy `style`.

### `GET /api/rooms/:id`

Возвращает комнату, последний done-рендер, `items`, `total`, `roadmap`, `notice`, `render.design_direction`, `render.layout_plan`, `render.repair_scope` и др. Для нового базового рендера `items` пуст, `total = 0`.

### `POST /api/rooms/:id/iterate`

- `text` — инструкция (≤ 500 символов); обязательна, если нет референса.
- `refs` — до 4 файлов; `ref_meta` — JSON-массив `{description, url?}`.
- `target` — `light`, `floor`, `wall`, `backsplash`, `tile`, `cabinet`, `countertop`, `faucet`, `sink`, `toilet`, `shower`, `bathtub`, `appliance`, `outlets`, `textile`, `skirting`, `bed`, `sofa`, …
- `product_id` — товар-референс; проверяется совместимость с `target`.
- `ref`/`ref_url` — один референс (legacy).
- `parent_id` — версия для правки (по умолчанию последняя).
- `move` — JSON `{bbox, dx, dy, label}` для переноса объекта.

Первые 3 правки бесплатны, 4-я и далее — 1 кредит. Цена видна в UI до подтверждения (`edits_used` в `/versions`). Товарная правка проходит vision QA: при отказе `rejected`, родитель активен, кредит возвращается, причина — в `notice`.

## Админ (`X-Admin-Key`)

| Группа | Маршруты |
|---|---|
| Пользователи | `GET /api/admin/users`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/credits` |
| Пакеты | `GET/POST /api/admin/packs`, `PUT/DELETE /api/admin/packs/:id` |
| Комнаты | `GET/POST /api/admin/rooms`, `PUT/DELETE /api/admin/rooms/:id` |
| Стили | CRUD `/api/admin/styles`, референсы, товары стиля, kit |
| Промт | `GET/PUT /api/admin/settings/prompt`, `POST .../prompt/reset` |
| Архитектор | `GET/POST /api/admin/architect-prompts`, активация, reset |
| Логи | `GET /api/admin/renders`, `GET /api/admin/renders/:file` |
| Модели | `GET/PUT /api/admin/settings/models`, `POST .../models/refresh`, `POST .../models/test` |
| Очистка | `GET/PUT /api/admin/settings/cleanup`, reset |
| Генерация | `GET/PUT /api/admin/settings/render`, reset |
| Статьи | `GET/POST /api/admin/articles`, `POST .../generate`, публикация/удаление |
| Поиск | `GET/PUT /api/admin/settings/procurement`, reset |
| Search Lab | `GET /api/admin/search/*`, промты, jobs, vision/grid/crops/objects |
| Прокси | `GET/PUT /api/admin/settings/proxy`, `POST .../proxy/test` |
| Каталог | `GET /api/admin/products`, импорт по URL/списку, CRUD |
| Платежи | `GET /api/admin/payments`, `GET /api/admin/refunds/quote`, `POST /api/admin/refunds` |

## Коды

- `400` — неверные данные/модель/стиль.
- `401` — нет авторизации.
- `402` — нет кредитов.
- `403` — нет админ-доступа.
- `404` — не найдено.
- `409` — комната ещё генерируется / повтор недоступен.
- `413` — файл больше 15 МБ.
- `429` — rate limit / слишком много кодов.
- `500` — внутренняя ошибка.
- `503` — сервис/функция выключены.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [PROCUREMENT.md](PROCUREMENT.md)
- [ADMIN.md](ADMIN.md)
- [STATUS.md](STATUS.md)
