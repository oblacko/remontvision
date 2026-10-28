# API

Базовый URL: `https://www.remontvision.ru`.  
Auth: cookie `rv_sid` (httpOnly).  
Admin: заголовок `X-Admin-Key`.

Ошибки — JSON `{ "error": "..." }` с HTTP-статусом.

## Публичные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health` | статус, `mock`, `payments_enabled`, `refunds_enabled` |
| GET | `/api/models` | image-модели OpenRouter |
| GET | `/api/legal` | версии и ссылки юридических документов |
| GET | `/api/styles` | активные стили |
| GET | `/api/room-types` | 12 типов комнат |
| GET | `/api/packs` | пакеты кредитов |
| GET/POST | `/api/payments/robokassa/result` | ResultURL Robokassa: проверка `Password#2`, ответ `OK{InvId}` |
| GET/POST | `/api/payments/robokassa/success` | fallback-редирект в кабинет; SuccessURL указывается на `/cabinet/paid` |
| GET/POST | `/api/payments/robokassa/fail` | fallback-редирект в кабинет; FailURL указывается на `/cabinet/fail` |
| POST | `/api/auth/request-code` | `{email}` → OTP |
| POST | `/api/auth/verify` | `{email, code}` → cookie |
| POST | `/api/auth/logout` | выход |
| GET | `/go/:id?r=renderId` | 302 на товар/поиск, лог клика |
| GET | `/s/:token` | SPA публичного шаринга |
| GET | `/s/:token/image` | публичная картинка дизайна |
| GET | `/api/share/:token` | данные шаринга: стиль, комната, лайки, комментарии |
| POST | `/api/share/:token/like` | toggle лайк |
| POST | `/api/share/:token/comments` | `{name?, text}` |

## Авторизованные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/me` | email, баланс |
| GET | `/api/my/rooms` | комнаты пользователя |
| GET | `/api/my/generations` | все рендеры пользователя |
| GET | `/api/credits` | баланс/ledger |
| POST | `/api/payments/create` | `{pack_id}` → `{confirmation_url, payment_id, provider}` |
| POST | `/api/payments/sync` | синхронизация последнего pending-платежа |
| POST | `/api/rooms` | multipart: фото, стиль/ref, комната, tier, флаги |
| GET | `/api/rooms/:id` | комната + последний/выбранный render |
| POST | `/api/rooms/:id/iterate` | правка: multipart `text`, `target`, `product_id`, `ref`, `ref_url`, `parent_id` |
| DELETE | `/api/rooms/:id` | удалить комнату и файлы (owner) |
| POST | `/api/renders/:id/share` | создать/вернуть share token (owner) |

### `POST /api/rooms`

`multipart/form-data`:

| Поле | Обяз. | Значение |
|---|---|---|
| `photo` | да | JPG/PNG/WebP ≤ 15 МБ |
| `room_type` | нет | один из 12, иначе `Другое` |
| `style` | нет* | название стиля |
| `style_ref` | нет* | файл референса |
| `style_ref_url` | нет* | URL референса |
| `price_tier` | нет | `start|comfort|premium|atelier` |
| `keep_furniture` | нет | `1/0`, default `1` |
| `use_catalog` | нет | `1/0`, default `1` |
| `palette`, `accent` | нет | цветовая схема/акцент |

\* Нужен стиль или референс. Если есть только референс — стиль `Референс пользователя`.

### `GET /api/rooms/:id`

Возвращает:

```json
{
  "id": "...",
  "style": "...",
  "room_type": "Спальня",
  "price_tier": "comfort",
  "keep_furniture": true,
  "use_catalog": true,
  "status": "done",
  "photo_url": "/files/...",
  "render": {"id": "...", "image": "/renders/...", "analysis": {...}},
  "notice": null,
  "items": [{"id": 1, "name": "...", "category": "sofa", "price": 0, "presentation_status": "curated", "target": "sofa", "can_bind": true, "url": "/go/1?r=...", "direct_url": false, "link_label": "Найти похожие"}],
  "total": 0
}
```

### `POST /api/rooms/:id/iterate`

- `text` (обяз.) — что изменить.
- `target` — `light`, `floor`, `wall`, `backsplash`, `tile`, `cabinet`, `countertop`, `faucet`, `sink`, `toilet`, `shower`, `bathtub`, `appliance`, `outlets`, `textile`, `skirting`, `bed`, `sofa`, ….
- `product_id` — товар-референс.
- `ref` — файл; `ref_url` — URL.
- `parent_id` — версия для правки (по умолчанию последняя).

Для `product_id` нужны активный товар, его изображение и совместимый `target`. При `keep_furniture=true` замена крупной мебели запрещена. После товарной правки vision сравнивает родителя, результат и карточку. Принятая версия получает `status=done`, а позиция — `presentation_status=verified`. При провале или недоступности QA дочерняя версия получает `status=rejected`, кредит возвращается, родитель остаётся активным, причина приходит в `GET /api/rooms/:id` → `notice`. В mock-режиме QA пропускается и товар остаётся `curated`. Безопасный результат проверки доступен в `render.product_qa`.

## Админ (`X-Admin-Key`)

### Каталог

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/products` | все товары + clicks |
| POST | `/api/admin/products/import` | `{url}` → preview |
| POST | `/api/admin/products` | JSON/multipart, создать товар |
| PUT | `/api/admin/products/:id` | обновить |
| DELETE | `/api/admin/products/:id` | удалить |

### Пользователи/кредиты

| Метод | Путь |
|---|---|
| GET | `/api/admin/users` |
| GET | `/api/admin/users/:id` |
| POST | `/api/admin/users/:id/credits` `{delta, reason, note}` |

### Пакеты

| Метод | Путь |
|---|---|
| GET/POST | `/api/admin/packs` |
| PUT/DELETE | `/api/admin/packs/:id` |

### Стили и референсы

| Метод | Путь |
|---|---|
| GET/POST | `/api/admin/styles` |
| GET/PUT/DELETE | `/api/admin/styles/:id` |
| POST | `/api/admin/styles/:id/references` (multipart `images`) |
| PATCH/DELETE | `/api/admin/styles/:id/references/:refId` |
| POST/DELETE | `/api/admin/styles/:id/products`, `/:productId` |
| POST | `/api/admin/styles/:id/products/bulk` `{product_ids, room_type}` |
| POST | `/api/admin/styles/:id/kit` `{room_type, price_tier}` |

### Настройки

| Метод | Путь | Описание |
|---|---|---|
| GET/PUT | `/api/admin/settings/models` | render/vision/resolution/aspect |
| GET/PUT | `/api/admin/settings/prompt` | правила промта |
| POST | `/api/admin/settings/prompt/reset` | сброс |
| GET/PUT | `/api/admin/settings/proxy` | прокси |
| POST | `/api/admin/settings/proxy/test` | health-check |

### Логи/платежи

| Метод | Путь |
|---|---|
| GET | `/api/admin/renders` |
| GET | `/api/admin/renders/:file` |
| GET | `/api/admin/payments` |
| GET | `/api/admin/refunds/quote` |
| POST | `/api/admin/refunds` |

## Коды

- `401` — нет авторизации.
- `402` — нет кредитов.
- `403` — нет админ-доступа.
- `404` — не найдено.
- `409` — комната ещё генерируется.
- `400` — неверные данные/модель.
- `500` — внутренняя ошибка.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [CATALOG.md](CATALOG.md)
- [ADMIN.md](ADMIN.md)
